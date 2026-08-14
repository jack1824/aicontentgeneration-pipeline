"use client";

// Subscribes to the backend job queue and derives the render tray's state.
// /queue returns ONLY non-terminal jobs, so a job that finishes just vanishes from
// it — we keep our own registry and, when a tracked job leaves the queue, fetch its
// terminal status once (/jobs/{id}) to classify it succeeded/failed/canceled. Failed
// and just-finished jobs linger in the registry (the tray decides when to drop them).

import { useCallback, useEffect, useRef, useState } from "react";
import { api, QueueItem } from "@/lib/api";

export type RenderNoticeLevel = "info" | "warning" | "error";

export type RenderJob = {
  id: string;
  label: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  progress: number; // 0–100
  stage?: string; // "segment 2/4 · lipsync"
  notice?: { level: RenderNoticeLevel; message: string };
  href?: string;
  retriable?: boolean;
};

const POLL_MS = 4000;
const ACTIVE = new Set<RenderJob["status"]>(["queued", "running"]);
const NOTICE_RANK: Record<RenderNoticeLevel, number> = { info: 1, warning: 2, error: 3 };

function mapStatus(s: string): RenderJob["status"] {
  if (s === "queued") return "queued";
  if (s === "done") return "succeeded";
  if (s === "error") return "failed";
  if (s === "cancelled" || s === "canceled") return "canceled";
  return "running"; // generating, assembling, tts, planning, post, uploading, keyframes…
}

// "segment 2/4 (lipsync)" -> "segment 2/4 · lipsync"; drop ⚠-prefixed details (those
// are surfaced as a notice instead, not as the stage line).
function toStage(detail?: string): string | undefined {
  if (!detail) return undefined;
  const d = detail.startsWith("⚠") ? "" : detail;
  const t = d.replace(/\s*\(([^)]+)\)\s*$/, " · $1").trim();
  return t || undefined;
}

function cleanWarn(w: string): string {
  const t = w.replace(/^⚠\s*/, "").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function noticeFor(
  status: RenderJob["status"],
  warnings: string[] | undefined,
  lastStage: string | undefined,
): RenderJob["notice"] {
  if (status === "failed") {
    return { level: "error", message: `Render failed${lastStage ? ` at ${lastStage}` : ""}` };
  }
  const w = warnings?.[warnings.length - 1];
  return w ? { level: "warning", message: cleanWarn(w) } : undefined;
}

export function useRenderQueue() {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const reg = useRef<Map<string, RenderJob>>(new Map());
  const stage = useRef<Map<string, string>>(new Map()); // last real stage per job (for failure copy)
  const polling = useRef(false); // in-flight guard: never overlap a slow poll
  const alive = useRef(true); // liveness: never setState after unmount
  const publish = useCallback(() => setJobs([...reg.current.values()]), []);

  const dismiss = useCallback((id: string) => {
    reg.current.delete(id);
    stage.current.delete(id);
    publish();
  }, [publish]);

  const dismissAll = useCallback(() => {
    for (const [, j] of reg.current) if (ACTIVE.has(j.status)) return; // never drop a live render
    reg.current.clear();
    stage.current.clear();
    publish();
  }, [publish]);

  const cancel = useCallback(async (id: string) => {
    try {
      await api.cancel(id);
    } catch {
      /* already terminal or unreachable — remove it from the tray regardless */
    }
    dismiss(id); // drop it immediately; the worker aborts at its next checkpoint
  }, [dismiss]);

  const retry = useCallback(async (id: string) => {
    const old = reg.current.get(id);
    try {
      const { job_id } = await api.retryJob(id);
      // Swap the failed row for the replacement immediately so there's no empty gap
      // until the next poll reconciles it from /queue.
      reg.current.delete(id);
      stage.current.delete(id);
      reg.current.set(job_id, {
        id: job_id, label: old?.label ?? job_id, kind: old?.kind ?? "generate",
        status: "queued", progress: 0, retriable: true,
      });
      publish();
    } catch {
      /* leave the failed row in place so the user can try again */
    }
  }, [publish]);

  const poll = useCallback(async () => {
    if (polling.current) return; // a prior poll is still resolving — skip this tick
    polling.current = true;
    try {
      let active: QueueItem[];
      try {
        active = (await api.queue()).active;
      } catch {
        return; // transient — keep the last known state
      }
      const activeIds = new Set(active.map((a) => a.job_id));

      for (const a of active) {
        const st = mapStatus(a.status);
        const s = toStage(a.detail);
        if (s) stage.current.set(a.job_id, s);
        const prev = reg.current.get(a.job_id);
        reg.current.set(a.job_id, {
          id: a.job_id,
          label: a.name || a.job_id,
          kind: a.kind,
          status: st,
          // progress never moves backwards within a live job (out-of-order polls)
          progress: Math.max(prev?.progress ?? 0, Math.min(100, a.progress || 0)),
          stage: s,
          notice: noticeFor(st, a.warnings, stage.current.get(a.job_id)),
          retriable: a.retriable,
        });
      }

      // A tracked live job that's no longer in /queue went terminal — classify once.
      const gone = [...reg.current.values()].filter((j) => ACTIVE.has(j.status) && !activeIds.has(j.id));
      await Promise.all(gone.map(async (j) => {
        try {
          const t = await api.job(j.id);
          const st = mapStatus(t.status);
          reg.current.set(j.id, {
            ...j,
            status: st,
            progress: st === "succeeded" ? 100 : j.progress,
            notice: noticeFor(st, t.warnings, stage.current.get(j.id)),
          });
        } catch (e) {
          // ONLY a genuine 404 means the job vanished (backend restart) -> finished.
          // A transient 5xx/tunnel/network error must not masquerade as success — leave
          // the job active so the next poll re-attempts classification.
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.startsWith("404")) {
            reg.current.set(j.id, { ...j, status: "succeeded", progress: 100, notice: undefined });
          }
        }
      }));

      if (alive.current) publish();
    } finally {
      polling.current = false;
    }
  }, [publish]);

  useEffect(() => {
    alive.current = true;
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { alive.current = false; clearInterval(t); };
  }, [poll]);

  const activeJobs = jobs.filter((j) => ACTIVE.has(j.status));
  const activeCount = activeJobs.length;
  const aggregateProgress = activeCount
    ? Math.round(activeJobs.reduce((s, j) => s + j.progress, 0) / activeCount)
    : 100;
  // Reduce over ALL jobs (not just active): a failed job's error notice and a
  // just-finished job's warning must still raise the aggregate level.
  const worstNoticeLevel = jobs.reduce<RenderNoticeLevel | null>((worst, j) => {
    if (!j.notice) return worst;
    if (!worst || NOTICE_RANK[j.notice.level] > NOTICE_RANK[worst]) return j.notice.level;
    return worst;
  }, null);

  return { jobs, activeCount, aggregateProgress, worstNoticeLevel, dismiss, dismissAll, retry, cancel };
}
