"use client";

// Sequence composer (file 15's headline feature): a 60s ad is NOT one generation —
// it's a TIMELINE of mixed-pipeline segments (avatar hook → product shots → b-roll
// → avatar CTA), each with its own script slice, assembled in ONE job.

import { useEffect, useRef, useState } from "react";
import {
  api,
  ASPECTS,
  AspectKey,
  Job,
  PRESETS,
  PresetKey,
  SequenceSegment,
  Voice,
} from "@/lib/api";
import Dropzone, { Uploaded } from "@/components/Dropzone";
import VoicePicker from "@/components/VoicePicker";
import { usePersistentState } from "@/lib/usePersistentState";

type SegmentDraft = {
  pipeline: SequenceSegment["pipeline"];
  prompt: string;
  negative_prompt: string;
  script: string;
  image: Uploaded | null;
  image_description?: string; // cinematic+image: what the photo shows (Brand Lock b-roll)
};

const SEGMENT_TYPES: { key: SegmentDraft["pipeline"]; label: string; time: string; hint: string }[] = [
  { key: "lipsync", label: "🗣 Avatar speaks", time: "~14s", hint: "hook / CTA — script drives the mouth" },
  { key: "product", label: "🧴 Product shot", time: "~5s", hint: "animates your product photo" },
  { key: "cinematic", label: "🎥 B-roll · LTX", time: "~5s", hint: "cinematic shot with its own sound" },
  { key: "overlay", label: "🎬 B-roll · Wan", time: "~5s", hint: "documentary-texture lifestyle shot" },
];

const emptySegment = (pipeline: SegmentDraft["pipeline"]): SegmentDraft => ({
  pipeline,
  prompt: "",
  negative_prompt: "",
  script: "",
  image: null,
});

const segSeconds = (s: SegmentDraft) => (s.pipeline === "lipsync" ? 14.4 : 5);

export default function SequencePage() {
  // The timeline a user builds here survives navigation (sessionStorage).
  const [segments, setSegments] = usePersistentState<SegmentDraft[]>("adgen-seq-segments", []);
  const [language, setLanguage] = usePersistentState("adgen-seq-lang", "en");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = usePersistentState("adgen-seq-voice", "");
  const [music, setMusic] = usePersistentState<Uploaded | null>("adgen-seq-music", null);
  const [preset, setPreset] = usePersistentState<PresetKey>("adgen-seq-preset", "preview");
  const [aspect, setAspect] = usePersistentState<AspectKey>("adgen-seq-aspect", "9:16");
  const [name, setName] = usePersistentState("adgen-seq-name", "");

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.voices().then((d) => setVoices(d.voices)).catch(() => {});
  }, []);

  // Sequence renders are long — the job must survive navigating away (per-tab).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem("adgen-active-seq-job");
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s?.jobId) return;
      setJob(s.job ?? { status: "queued", progress: 0, detail: "", video_path: null, error: null });
      setJobId(s.jobId);
    } catch {
      /* corrupt snapshot — start clean */
    }
  }, []);

  useEffect(() => {
    if (!jobId) return;
    try {
      sessionStorage.setItem("adgen-active-seq-job", JSON.stringify({ jobId, job }));
    } catch {
      /* nonfatal */
    }
  }, [jobId, job]);

  useEffect(() => {
    if (!jobId) return;
    const tick = async () => {
      try {
        const j = await api.job(jobId);
        setJob(j);
        if (["done", "error", "cancelled"].includes(j.status) && pollRef.current) {
          clearInterval(pollRef.current);
        }
      } catch (e) {
        // 404 = job vanished (backend restart) — recover instead of freezing at
        // "Rendering sequence…" forever (the snapshot would resurrect the freeze).
        if (String(e).includes("404")) {
          if (pollRef.current) clearInterval(pollRef.current);
          try {
            sessionStorage.removeItem("adgen-active-seq-job");
          } catch {
            /* nonfatal */
          }
          setJob({
            status: "error",
            progress: 0,
            detail: "",
            video_path: null,
            error: "render lost — the backend restarted mid-job. Fire it again.",
          });
        }
      }
    };
    tick();
    pollRef.current = setInterval(tick, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  const patch = (i: number, p: Partial<SegmentDraft>) =>
    setSegments((segs) => segs.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, dir: -1 | 1) =>
    setSegments((segs) => {
      const j = i + dir;
      if (j < 0 || j >= segs.length) return segs;
      const next = [...segs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const totalSeconds = segments.reduce((acc, s) => acc + segSeconds(s), 0);

  const blocker = (): string | null => {
    if (segments.length === 0) return "add at least one segment";
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (!s.prompt.trim()) return `segment ${i + 1} needs a prompt`;
      if (s.pipeline === "lipsync" && !s.script.trim())
        return `segment ${i + 1} (avatar) needs its script slice`;
      if (s.pipeline === "lipsync" && !s.image) return `segment ${i + 1} needs a face image`;
      if (s.pipeline === "product" && !s.image) return `segment ${i + 1} needs a product photo`;
    }
    return null;
  };

  const fire = async () => {
    setError(null);
    setJob(null);
    setJobId(null);
    const p = PRESETS[preset];
    try {
      const { job_id } = await api.generate({
        mode: "sequence",
        segments: segments.map((s) => ({
          pipeline: s.pipeline,
          prompt: s.prompt.trim(),
          ...(s.negative_prompt.trim() ? { negative_prompt: s.negative_prompt.trim() } : {}),
          ...(s.script.trim() ? { script: s.script.trim() } : {}),
          ...(s.image ? { image: s.image.path } : {}),
          ...(s.pipeline === "cinematic" && s.image && s.image_description?.trim()
            ? { image_description: s.image_description.trim() }
            : {}),
        })),
        language,
        quality: p.quality,
        ...("steps" in p ? { steps: p.steps } : {}),
        postprocess: p.postprocess,
        ...ASPECTS[aspect],
        ...(name ? { name } : {}),
        ...(voiceId ? { voice_id: voiceId } : {}),
        ...(music ? { music: music.path } : {}),
      });
      setJobId(job_id);
      setJob({ status: "queued", progress: 0, detail: "", video_path: null, error: null });
    } catch (e) {
      setError(String(e));
    }
  };

  const running = job && !["done", "error", "cancelled"].includes(job.status);
  const blocked = blocker();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6 xl:px-12 flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight font-display">Sequence</h1>
        <p className="text-sm text-text-muted">
          compose a long ad from mixed segments — hook, product, proof, CTA
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        {/* ---- Timeline ---- */}
        <section className="card-raised flex flex-col gap-4 rounded-card p-4 sm:p-6">
          <div className="flex items-baseline justify-between">
            <span className="label-cap">Timeline</span>
            <span className="text-[11px] text-text-muted">
              ≈{Math.round(totalSeconds)}s total{totalSeconds > 60 ? " — over 60s, trim?" : ""}
            </span>
          </div>

          {segments.length === 0 && (
            <p className="rounded-btn border border-dashed border-white/10 p-8 text-center text-sm text-text-muted">
              Build your ad below — a classic 60s shape is: Avatar hook → Product shots →
              B-roll proof → Avatar CTA → end card (a short product shot works as the end
              card; on-video taglines arrive with the text-overlay chunk).
            </p>
          )}

          {segments.map((s, i) => (
            <div key={i} className="flex flex-col gap-2.5 rounded-btn bg-black/25 p-4">
              <div className="flex items-center gap-2">
                <span className="label-cap">
                  {i + 1} · {SEGMENT_TYPES.find((t) => t.key === s.pipeline)?.label} ·{" "}
                  {s.pipeline === "lipsync" ? "~14s" : "~5s"}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="seg rounded-btn px-2 py-1 text-xs disabled:opacity-30" aria-label="Move up">↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === segments.length - 1} className="seg rounded-btn px-2 py-1 text-xs disabled:opacity-30" aria-label="Move down">↓</button>
                  <button onClick={() => setSegments(segments.filter((_, j) => j !== i))} className="seg rounded-btn px-2 py-1 text-xs" aria-label="Remove segment">✕</button>
                </div>
              </div>
              <textarea
                value={s.prompt}
                onChange={(e) => patch(i, { prompt: e.target.value })}
                placeholder="Scene prompt — subject, camera, lighting…"
                rows={2}
                className="input-well w-full rounded-btn p-3 text-sm placeholder:text-text-muted"
              />
              <input
                value={s.negative_prompt}
                onChange={(e) => patch(i, { negative_prompt: e.target.value })}
                placeholder="Negative prompt (optional)"
                className="input-well w-full rounded-btn p-2.5 text-xs placeholder:text-text-muted"
              />
              <textarea
                value={s.script}
                onChange={(e) => patch(i, { script: e.target.value })}
                placeholder={
                  s.pipeline === "lipsync"
                    ? "Script slice the avatar SPEAKS in this segment (required, ~12-14s of speech)"
                    : "Voiceover slice for this segment (optional — empty = silent under music)"
                }
                rows={2}
                className="input-well w-full rounded-btn p-2.5 text-xs placeholder:text-text-muted"
              />
              {s.script.trim() && (() => {
                // Speech-rate budget: Hindi runs ~1.5 words/sec (measured on the
                // sa01 pilot), English ~3 — slices longer than the window get cut.
                const wps = language === "hi" ? 1.5 : 3;
                const est = Math.ceil(s.script.trim().split(/\s+/).length / wps);
                const budget = s.pipeline === "lipsync" ? 14 : 5;
                const over = est > budget;
                return (
                  <p className={`text-[11px] ${over ? "text-accent" : "text-text-muted"}`}>
                    ≈{est}s of speech / ~{budget}s window
                    {over && " — too long, it will be cut off"}
                  </p>
                );
              })()}
              {s.pipeline !== "overlay" && (
                <Dropzone
                  label={
                    s.pipeline === "lipsync"
                      ? "Face image · required"
                      : s.pipeline === "cinematic"
                        ? "Product photo · optional (locks the REAL product into the scene)"
                        : "Product photo · required"
                  }
                  accept="image/png,image/jpeg,image/webp"
                  kind="image"
                  value={s.image}
                  onChange={(v) => patch(i, { image: v })}
                />
              )}
              {s.pipeline === "cinematic" && s.image && (
                <input
                  value={s.image_description ?? ""}
                  onChange={(e) => patch(i, { image_description: e.target.value })}
                  placeholder="What the photo shows — e.g. “a black whey protein jar with a red band and gold lettering”"
                  className="input-well w-full rounded-btn p-2.5 text-xs placeholder:text-text-muted"
                />
              )}
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            {SEGMENT_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setSegments([...segments, emptySegment(t.key)])}
                title={t.hint}
                className="seg rounded-btn px-4 py-2.5 text-xs"
              >
                + {t.label} <span className="text-text-muted">({t.time})</span>
              </button>
            ))}
          </div>
        </section>

        {/* ---- Render rail (sticky only beside the timeline) ---- */}
        <aside className="card-raised flex flex-col gap-4 rounded-card p-4 sm:p-5 lg:sticky lg:top-6">
          <div className="flex flex-col gap-2">
            <span className="label-cap">Voice · avatar + voiceover</span>
            <div className="flex gap-1">
              {[
                { v: "en", l: "EN" },
                { v: "hi", l: "हिन्दी" },
              ].map((o) => (
                <button
                  key={o.v}
                  onClick={() => setLanguage(o.v)}
                  className={`rounded-btn px-2.5 py-1.5 text-xs ${language === o.v ? "seg-on" : "seg"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <VoicePicker voices={voices} value={voiceId} onChange={setVoiceId} language={language} />
          </div>

          <Dropzone
            label="Music bed · optional (whole ad)"
            accept="audio/mpeg,audio/wav"
            kind="audio"
            value={music}
            onChange={setMusic}
          />

          <div className="flex flex-col gap-2">
            <span className="label-cap">Render preset</span>
            <div className="flex gap-1">
              {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setPreset(k)}
                  className={`flex-1 rounded-btn px-2 py-2 text-xs ${preset === k ? "seg-on" : "seg"}`}
                >
                  {PRESETS[k].label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="label-cap">Aspect</span>
            <div className="flex gap-1">
              {(Object.keys(ASPECTS) as AspectKey[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAspect(a)}
                  className={`flex-1 rounded-btn px-2 py-2 text-xs ${aspect === a ? "seg-on" : "seg"}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))}
            placeholder="ad name (optional)"
            className="input-well w-full rounded-btn p-2.5 text-xs placeholder:text-text-muted"
          />

          <button
            onClick={fire}
            disabled={!!blocked || !!running}
            title={blocked ?? ""}
            className="hero-glow rounded-btn px-6 py-3 text-sm font-semibold text-white disabled:opacity-40 disabled:shadow-none"
          >
            {running ? "Rendering sequence…" : `Generate ${Math.round(totalSeconds)}s ad`}
          </button>
          {blocked && !running && <p className="text-[11px] text-text-muted">→ {blocked}</p>}
          {error && <p className="text-xs text-accent">{error}</p>}

          {job && (
            <div className={`flex flex-col gap-3 rounded-btn bg-black/25 p-4 ${running ? "render-breathe" : ""}`}>
              {running && job.queue_position !== undefined && (
                <p className="text-[11px] text-text-muted">
                  {job.queue_position > 0
                    ? `⏳ ${job.queue_position} render${job.queue_position > 1 ? "s" : ""} ahead of yours on the pod`
                    : "▶ yours is the active render"}
                </p>
              )}
              <p className="text-xs text-text-secondary">
                {job.status}
                {job.detail && ` — ${job.detail}`}
              </p>
              <div className="h-1.5 w-full rounded bg-surface-2">
                <div className="hero-glow h-1.5 rounded transition-all" style={{ width: `${job.progress}%` }} />
              </div>
              {running && jobId && (
                <button
                  onClick={() => api.cancel(jobId).catch(() => {})}
                  className="seg self-start rounded-btn px-3 py-1.5 text-xs"
                >
                  Cancel render
                </button>
              )}
              {job.status === "error" && <p className="text-xs text-accent">{job.error}</p>}
              {job.status === "done" && jobId && (
                <>
                  <video controls autoPlay className="w-full rounded-xl" src={api.jobVideoUrl(jobId)} />
                  <a href={api.jobVideoUrl(jobId)} download className="text-center text-xs text-accent hover:underline">
                    ↓ Download mp4 (also saved to Library)
                  </a>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
