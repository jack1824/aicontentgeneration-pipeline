"use client";

// Library: every render, filterable, hover-to-preview. Click opens a lightbox with
// the full player, download, and one-click Enhance (the /postprocess chain).

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, Job, OutputItem, PIPELINE_LABELS, Voice } from "@/lib/api";
import VideoCard from "@/components/VideoCard";

const PIPELINE_FILTERS = [
  { key: "all", label: "All" },
  { key: "wani2v", label: "🧴 Product" },
  { key: "wans2v", label: "🗣 Avatar" },
  { key: "want2v", label: "🎬 B-roll" },
  { key: "sequence", label: "🎞 Sequence" },
  { key: "remix", label: "✂ Remix" },
];
const KIND_FILTERS = [
  { key: "finals", label: "Finals" },
  { key: "final-post", label: "✨ Enhanced" },
  { key: "clip", label: "Raw clips" },
  { key: "all", label: "Everything" },
];

function Lightbox({
  item,
  voices,
  onClose,
  onEnhanced,
  onJobStart,
}: {
  item: OutputItem;
  voices: Voice[];
  onClose: () => void;
  onEnhanced: () => void;
  onJobStart: (path: string, jobId: string) => void;
}) {
  const [enhanceJobId, setEnhanceJobId] = useState<string | null>(null);
  const [enhanceJob, setEnhanceJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Edit voice (revoice): new narration replaces the whole soundtrack ----
  // Voice-locked = lips synced to the baked-in speech (avatar renders, and
  // sequence/remix finals that contain avatar scenes).
  const isAvatar = item.voice_lock || item.pipeline === "wans2v";
  const [revoiceOpen, setRevoiceOpen] = useState(false);
  const [rvScript, setRvScript] = useState("");
  const [rvVoice, setRvVoice] = useState("");
  const [rvLang, setRvLang] = useState("en");
  const [rvJobId, setRvJobId] = useState<string | null>(null);
  const [rvJob, setRvJob] = useState<Job | null>(null);
  const rvPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!rvJobId) return;
    rvPollRef.current = setInterval(async () => {
      try {
        const j = await api.job(rvJobId);
        setRvJob(j);
        if (["done", "error"].includes(j.status)) {
          if (rvPollRef.current) clearInterval(rvPollRef.current);
          if (j.status === "done") onEnhanced();
        }
      } catch {
        /* keep polling */
      }
    }, 4000);
    return () => {
      if (rvPollRef.current) clearInterval(rvPollRef.current);
    };
  }, [rvJobId, onEnhanced]);

  const revoice = async () => {
    setError(null);
    try {
      const { job_id } = await api.revoice({
        video_path: item.path,
        script: rvScript.trim(),
        ...(rvVoice ? { voice_id: rvVoice } : {}),
        language: rvLang,
      });
      setRvJobId(job_id);
      onJobStart(item.path, job_id);
      setRvJob({ status: "queued", progress: 0, detail: "", video_path: null, error: null });
    } catch (e) {
      setError(String(e));
    }
  };

  const revoicing = rvJob && !["done", "error"].includes(rvJob.status);

  useEffect(() => {
    if (!enhanceJobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const j = await api.job(enhanceJobId);
        setEnhanceJob(j);
        if (["done", "error"].includes(j.status)) {
          if (pollRef.current) clearInterval(pollRef.current);
          if (j.status === "done") onEnhanced();
        }
      } catch {
        /* keep polling */
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [enhanceJobId, onEnhanced]);

  const enhance = async () => {
    setError(null);
    try {
      // Product renders have no faces — skip CodeFormer for them.
      const { job_id } = await api.postprocess(item.path, item.pipeline !== "wani2v");
      setEnhanceJobId(job_id);
      onJobStart(item.path, job_id);
      setEnhanceJob({ status: "queued", progress: 0, detail: "", video_path: null, error: null });
    } catch (e) {
      setError(String(e));
    }
  };

  const enhancing = enhanceJob && !["done", "error"].includes(enhanceJob.status);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-card border border-white/10 bg-surface-1 p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{item.name}</p>
            <p className="mt-0.5 text-xs text-text-muted">
              {PIPELINE_LABELS[item.pipeline] ?? item.pipeline} · {item.kind} ·{" "}
              {(item.size_bytes / 1e6).toFixed(1)}MB
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-btn px-2.5 py-1.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        <video controls autoPlay className="max-h-[60vh] w-full rounded-xl bg-black" src={api.fileUrl(item)} />

        <div className="flex items-center gap-2">
          <a
            href={api.fileUrl(item)}
            download={item.name}
            className="flex-1 rounded-btn bg-surface-2 px-4 py-2.5 text-center text-xs font-medium text-text-primary hover:bg-surface-2/70"
          >
            ↓ Download
          </a>
          {item.kind !== "final-post" && !enhanceJobId && (
            <button
              onClick={enhance}
              className="hero-glow flex-1 rounded-btn px-4 py-2.5 text-xs font-semibold text-white"
            >
              ✨ Enhance (~10 min)
            </button>
          )}
        </div>

        {enhanceJob && (
          <div className={`flex flex-col gap-2 rounded-btn bg-surface-2/50 p-3 ${enhancing ? "render-breathe" : ""}`}>
            <p className="text-xs text-text-secondary">
              {enhanceJob.status === "done"
                ? "✨ Enhanced version saved to the library"
                : `enhancing — ${enhanceJob.detail || "CodeFormer → SeedVR2 → RIFE"}`}
            </p>
            {enhanceJob.status === "error" && (
              <p className="text-xs text-accent">{enhanceJob.error}</p>
            )}
          </div>
        )}

        {/* ---- Edit voice ---- */}
        {isAvatar ? (
          <p className="rounded-btn bg-surface-2/50 p-3 text-xs leading-relaxed text-text-muted">
            🎙 This avatar&apos;s lips are synced to its original voice — a new voice would
            drift out of sync.{" "}
            <Link href="/create?mode=lipsync" className="text-accent hover:underline">
              Re-render with a new voice →
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {!revoiceOpen ? (
              <button
                onClick={() => setRevoiceOpen(true)}
                className="seg rounded-btn px-4 py-2.5 text-xs font-medium"
              >
                🎙 Edit voice (new narration replaces the soundtrack)
              </button>
            ) : (
              <div className="flex flex-col gap-2.5 rounded-btn bg-surface-2/50 p-3">
                <span className="label-cap">New narration</span>
                <textarea
                  value={rvScript}
                  onChange={(e) => setRvScript(e.target.value)}
                  placeholder="The new script this video should speak…"
                  rows={2}
                  className="input-well w-full rounded-btn p-2.5 text-xs placeholder:text-text-muted"
                />
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[
                      { v: "en", l: "EN" },
                      { v: "hi", l: "हिन्दी" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        onClick={() => setRvLang(o.v)}
                        className={`rounded-btn px-2.5 py-1.5 text-[11px] ${rvLang === o.v ? "seg-on" : "seg"}`}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                  {voices.length > 0 && (
                    <select
                      value={rvVoice}
                      onChange={(e) => setRvVoice(e.target.value)}
                      className="input-well min-w-0 flex-1 rounded-btn p-2 text-[11px]"
                    >
                      <option value="">Default voice</option>
                      {voices.map((v) => (
                        <option key={v.voice_id} value={v.voice_id}>
                          {v.name}
                          {v.labels?.language ? ` · ${v.labels.language}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <button
                  onClick={revoice}
                  disabled={rvScript.trim().length < 3 || !!revoicing}
                  className="hero-glow rounded-btn px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 disabled:shadow-none"
                >
                  {revoicing ? "Replacing voice…" : "Replace voice"}
                </button>
              </div>
            )}
            {rvJob && (
              <div className={`rounded-btn bg-surface-2/50 p-3 ${revoicing ? "render-breathe" : ""}`}>
                <p className="text-xs text-text-secondary">
                  {rvJob.status === "done"
                    ? "🎙 Revoiced version saved to the library"
                    : rvJob.status === "error"
                      ? ""
                      : `revoicing — ${rvJob.detail || rvJob.status}`}
                </p>
                {rvJob.status === "error" && <p className="text-xs text-accent">{rvJob.error}</p>}
              </div>
            )}
          </div>
        )}
        {error && <p className="text-xs text-accent">{error}</p>}
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [pipeline, setPipeline] = useState("all");
  const [kind, setKind] = useState("finals");
  const [open, setOpen] = useState<OutputItem | null>(null);
  // Enhance/revoice jobs by source path — tracked HERE so closing the lightbox
  // mid-job still refreshes the grid on completion (and cards show a busy badge).
  const [activeJobs, setActiveJobs] = useState<Record<string, string>>({});

  // Stable identity matters: unstable refresh restarted the Lightbox poll effect
  // on every render and looped refreshes after a job finished.
  const refresh = useCallback(
    () => api.outputs().then((d) => setOutputs(d.outputs)).catch(() => {}),
    [],
  );
  useEffect(() => {
    refresh();
    api.voices().then((d) => setVoices(d.voices)).catch(() => {});
  }, [refresh]);

  const trackJob = useCallback((path: string, jobId: string) => {
    setActiveJobs((m) => ({ ...m, [path]: jobId }));
  }, []);

  useEffect(() => {
    const ids = Object.entries(activeJobs);
    if (ids.length === 0) return;
    const t = setInterval(async () => {
      for (const [path, jobId] of ids) {
        try {
          const j = await api.job(jobId);
          if (["done", "error", "cancelled"].includes(j.status)) {
            setActiveJobs((m) => {
              const next = { ...m };
              delete next[path];
              return next;
            });
            if (j.status === "done") refresh();
          }
        } catch {
          /* transient */
        }
      }
    }, 5000);
    return () => clearInterval(t);
  }, [activeJobs, refresh]);

  const filtered = useMemo(
    () =>
      outputs.filter((o) => {
        if (pipeline !== "all" && o.pipeline !== pipeline) return false;
        if (kind === "finals") return o.kind !== "clip";
        if (kind !== "all" && o.kind !== kind) return false;
        return true;
      }),
    [outputs, pipeline, kind],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10 flex flex-col gap-6">
      <header className="flex items-baseline gap-3">
        <h1 className="text-3xl font-semibold tracking-tight font-display">Library</h1>
        <p className="text-sm text-text-muted">
          {filtered.length} video{filtered.length === 1 ? "" : "s"}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {PIPELINE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setPipeline(f.key)}
              className={`rounded-btn px-3 py-1.5 text-xs ${
                pipeline === f.key
                  ? "bg-surface-2 ring-1 ring-accent"
                  : "bg-surface-1 text-text-secondary hover:text-text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="h-4 w-px bg-white/10" />
        <div className="flex gap-1">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setKind(f.key)}
              className={`rounded-btn px-3 py-1.5 text-xs ${
                kind === f.key
                  ? "bg-surface-2 ring-1 ring-accent"
                  : "bg-surface-1 text-text-secondary hover:text-text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((o) => (
            <VideoCard key={o.path} item={o} busy={!!activeJobs[o.path]} onOpen={setOpen} />
          ))}
        </div>
      ) : (
        <p className="rounded-card border border-dashed border-white/10 p-12 text-center text-sm text-text-muted">
          nothing matches these filters
        </p>
      )}

      {open && (
        <Lightbox
          item={open}
          voices={voices}
          onClose={() => setOpen(null)}
          onEnhanced={refresh}
          onJobStart={trackJob}
        />
      )}
    </div>
  );
}
