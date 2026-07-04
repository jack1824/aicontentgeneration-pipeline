"use client";

// Remix — the scene-level adjustment panel (file 15): pick existing clips, reorder
// them, lay a new narration (voice / volume / start-offset) and music bed on top,
// and re-export through FFmpeg. No pod needed — this is pure assembly.

import { useEffect, useMemo, useRef, useState } from "react";
import { api, Job, OutputItem, PIPELINE_LABELS, Voice } from "@/lib/api";
import Dropzone, { Uploaded } from "@/components/Dropzone";
import VoicePicker from "@/components/VoicePicker";

export default function RemixPage() {
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [picked, setPicked] = useState<OutputItem[]>([]);
  const [filter, setFilter] = useState("all");

  const [script, setScript] = useState("");
  const [language, setLanguage] = useState("en");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [music, setMusic] = useState<Uploaded | null>(null);
  const [musicVol, setMusicVol] = useState(15); // % -> gain/100
  const [narrVol, setNarrVol] = useState(100);
  const [delayMs, setDelayMs] = useState(300);
  const [name, setName] = useState("");

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.outputs().then((d) => setOutputs(d.outputs)).catch(() => {});
    api.voices().then((d) => setVoices(d.voices)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const j = await api.job(jobId);
        setJob(j);
        if (["done", "error", "cancelled"].includes(j.status) && pollRef.current)
          clearInterval(pollRef.current);
      } catch (e) {
        if (String(e).includes("404")) {
          // Job vanished (backend restart) — stop polling, unblock the button.
          if (pollRef.current) clearInterval(pollRef.current);
          setJob({
            status: "error",
            progress: 0,
            detail: "",
            video_path: null,
            error: "re-export lost — the backend restarted mid-job. Fire it again.",
          });
        }
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  const pool = useMemo(
    () => outputs.filter((o) => filter === "all" || o.pipeline === filter),
    [outputs, filter],
  );
  const pickedPaths = useMemo(() => new Set(picked.map((p) => p.path)), [picked]);

  const move = (i: number, dir: -1 | 1) =>
    setPicked((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const fire = async () => {
    setError(null);
    setJob(null);
    setJobId(null);
    try {
      const { job_id } = await api.reassemble({
        clips: picked.map((p) => p.path),
        ...(script.trim() ? { script: script.trim() } : {}),
        ...(voiceId ? { voice_id: voiceId } : {}),
        language,
        ...(music ? { music: music.path } : {}),
        narration_delay_ms: delayMs,
        narration_gain: narrVol / 100,
        music_gain: musicVol / 100,
        ...(name ? { name } : {}),
      });
      setJobId(job_id);
      setJob({ status: "queued", progress: 0, detail: "", video_path: null, error: null });
    } catch (e) {
      setError(String(e));
    }
  };

  const running = job && !["done", "error", "cancelled"].includes(job.status);
  // Lip-synced avatar scenes carry their voice IN the video — a new narration
  // would wipe it and desync the mouth (backend 422s this too).
  const lockedPicked = picked.some((p) => p.voice_lock || p.pipeline === "wans2v");
  const narrationBlocked = !!script.trim() && lockedPicked;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6 xl:px-12 flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight font-display">Remix</h1>
        <p className="text-sm text-text-muted">
          reorder scenes, swap the narration, tune the mix — re-export without re-rendering
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        {/* ---- Clip pool ---- */}
        <section className="card-raised flex flex-col gap-4 rounded-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="label-cap">Pick scenes (click to add)</span>
            <div className="flex gap-1">
              {[
                { key: "all", label: "All" },
                { key: "wani2v", label: "🧴" },
                { key: "wans2v", label: "🗣" },
                { key: "want2v", label: "🎬" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-btn px-2.5 py-1.5 text-xs ${filter === f.key ? "seg-on" : "seg"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid max-h-130 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
            {pool.map((o) => {
              const added = pickedPaths.has(o.path);
              return (
                <button
                  key={o.path}
                  onClick={() =>
                    added
                      ? setPicked(picked.filter((p) => p.path !== o.path))
                      : setPicked([...picked, o])
                  }
                  className={`group relative overflow-hidden rounded-xl border text-left transition-colors ${
                    added ? "border-accent/60 ring-1 ring-accent/40" : "border-white/5 hover:border-white/20"
                  }`}
                >
                  <video
                    src={api.fileUrl(o)}
                    muted
                    playsInline
                    preload="metadata"
                    className="aspect-9/16 w-full bg-black object-cover opacity-80"
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-[9px] text-text-secondary">
                    {added ? "✓ " : ""}
                    {o.name}
                  </span>
                </button>
              );
            })}
            {pool.length === 0 && (
              <p className="col-span-full p-6 text-center text-xs text-text-muted">
                no clips match this filter
              </p>
            )}
          </div>
        </section>

        {/* ---- Timeline + mix rail (sticky only beside the pool) ---- */}
        <aside className="card-raised flex flex-col gap-4 rounded-card p-4 sm:p-5 lg:sticky lg:top-6">
          <span className="label-cap">Timeline · {picked.length} scene{picked.length === 1 ? "" : "s"}</span>
          {picked.length === 0 ? (
            <p className="rounded-btn border border-dashed border-white/10 p-5 text-center text-xs text-text-muted">
              click scenes on the left to build the cut
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {picked.map((p, i) => (
                <div key={p.path} className="flex items-center gap-2 rounded-btn bg-black/25 px-2.5 py-2">
                  <span className="text-[10px] text-text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                    {p.name}
                    <span className="ml-1 text-[9px] text-text-muted">
                      {PIPELINE_LABELS[p.pipeline] ?? p.pipeline}
                    </span>
                  </span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-xs text-text-muted hover:text-text-primary disabled:opacity-30" aria-label="Move up">↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === picked.length - 1} className="text-xs text-text-muted hover:text-text-primary disabled:opacity-30" aria-label="Move down">↓</button>
                  <button onClick={() => setPicked(picked.filter((_, j) => j !== i))} className="text-xs text-text-muted hover:text-accent" aria-label="Remove">✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="label-cap">New narration · optional</span>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Empty = keep each scene's own audio"
              rows={2}
              className="input-well w-full rounded-btn p-2.5 text-xs placeholder:text-text-muted"
            />
            {script.trim() && (
              <>
                <div className="flex gap-1">
                  {[
                    { v: "en", l: "EN" },
                    { v: "hi", l: "हिन्दी" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setLanguage(o.v)}
                      className={`rounded-btn px-2.5 py-1.5 text-[11px] ${language === o.v ? "seg-on" : "seg"}`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
                <VoicePicker voices={voices} value={voiceId} onChange={setVoiceId} language={language} />
              </>
            )}
          </div>

          <Dropzone
            label="Music bed · optional"
            accept="audio/mpeg,audio/wav"
            kind="audio"
            value={music}
            onChange={setMusic}
          />

          {/* Mix knobs (docs: two global sliders + offset nudge) */}
          <div className="flex flex-col gap-3">
            {script.trim() && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="flex justify-between text-[11px] text-text-secondary">
                    <span className="label-cap">Narration volume</span> {narrVol}%
                  </span>
                  <input type="range" min={50} max={200} step={5} value={narrVol}
                    onChange={(e) => setNarrVol(Number(e.target.value))} className="accent-[#ff4d3d]" />
                </label>
                <div className="flex items-center justify-between">
                  <span className="label-cap">Narration starts at</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setDelayMs(Math.max(0, delayMs - 500))} className="seg rounded-btn px-2 py-1 text-xs">−0.5s</button>
                    <span className="w-12 text-center text-xs text-text-secondary">{(delayMs / 1000).toFixed(1)}s</span>
                    <button onClick={() => setDelayMs(Math.min(5000, delayMs + 500))} className="seg rounded-btn px-2 py-1 text-xs">+0.5s</button>
                  </div>
                </div>
              </>
            )}
            {music && (
              <label className="flex flex-col gap-1.5">
                <span className="flex justify-between text-[11px] text-text-secondary">
                  <span className="label-cap">Music volume</span> {musicVol}%
                </span>
                <input type="range" min={0} max={50} step={5} value={musicVol}
                  onChange={(e) => setMusicVol(Number(e.target.value))} className="accent-[#ff4d3d]" />
              </label>
            )}
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))}
            placeholder="remix name (optional)"
            className="input-well w-full rounded-btn p-2.5 text-xs placeholder:text-text-muted"
          />

          {narrationBlocked && (
            <p className="rounded-btn bg-surface-2/50 p-3 text-xs leading-relaxed text-text-muted">
              🎙 This cut contains lip-synced avatar scenes — a new narration would wipe
              their voices and desync the mouths. Remove those scenes or clear the
              narration to re-export.
            </p>
          )}
          <button
            onClick={fire}
            disabled={picked.length === 0 || !!running || narrationBlocked}
            className="hero-glow rounded-btn px-6 py-3 text-sm font-semibold text-white disabled:opacity-40 disabled:shadow-none"
          >
            {running ? "Re-exporting…" : "Re-export cut"}
          </button>
          {error && <p className="text-xs text-accent">{error}</p>}

          {job && (
            <div className={`flex flex-col gap-2.5 rounded-btn bg-black/25 p-4 ${running ? "render-breathe" : ""}`}>
              <p className="text-xs text-text-secondary">
                {job.status}
                {job.detail && ` — ${job.detail}`}
              </p>
              {job.status === "error" && <p className="text-xs text-accent">{job.error}</p>}
              {job.status === "done" && jobId && (
                <>
                  <video controls autoPlay className="w-full rounded-xl" src={api.jobVideoUrl(jobId)} />
                  <a href={api.jobVideoUrl(jobId)} download className="text-center text-xs text-accent hover:underline">
                    ↓ Download mp4 (saved to Library)
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
