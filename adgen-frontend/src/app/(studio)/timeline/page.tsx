"use client";

// Timeline editor MVP (client problem #3): trim/reorder a final's clips on a
// px-per-second track, nudge the voice, preview in-browser, export via
// frame-accurate FFmpeg — never re-rendering video. Opens from any Library
// video ("Open in Timeline") via ?video=, or builds from the raw clip pool.
// The ⌖ center-cut button implements the cinematic trim default: keep each
// clip's middle ~2.2s (the premium-commercial cut rhythm).

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, Job, OutputItem } from "@/lib/api";

const PPS = 44; // track scale: pixels per second

type TAlternate = { path: string; url: string; name: string; duration: number; take: number };

type TClip = {
  path: string;
  url: string;
  name: string;
  duration: number;
  voice_lock: boolean;
  in_s: number;
  out_s: number; // exclusive end of the used window
  scene?: number | null; // "Scene N" display label from the seg/clip convention
  take?: number; // which QC take this file is
  alternates?: TAlternate[]; // other QC takes of this same shot — swappable
};

// "Scene 3 · take 2" — the human name for a clip block.
const clipLabel = (c: TClip) =>
  `${c.scene ? `Scene ${c.scene}` : c.name.replace(/\.mp4$/, "")}${
    c.take ? ` · take ${c.take}` : ""
  }`;

type TAudio = { path: string; url: string; name: string };

const usedSeconds = (c: TClip) => Math.max(0.1, c.out_s - c.in_s);

function Waveform({ url, width, height = 44 }: { url: string; width: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const buf = await fetch(url).then((r) => r.arrayBuffer());
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(buf);
        ctx.close();
        if (dead || !ref.current) return;
        const data = audio.getChannelData(0);
        const c = ref.current.getContext("2d");
        if (!c) return;
        c.clearRect(0, 0, width, height);
        c.fillStyle = "rgba(94, 234, 212, 0.75)"; // teal — matches the reference's audio lane
        const step = Math.max(1, Math.floor(data.length / width));
        for (let x = 0; x < width; x++) {
          let min = 1, max = -1;
          for (let i = x * step; i < (x + 1) * step && i < data.length; i += 24) {
            const v = data[i];
            if (v < min) min = v;
            if (v > max) max = v;
          }
          const mid = height / 2;
          c.fillRect(x, mid + min * mid, 1, Math.max(1, (max - min) * mid));
        }
      } catch {
        /* waveform is decorative — failures stay silent */
      }
    })();
    return () => {
      dead = true;
    };
  }, [url, width, height]);
  return <canvas ref={ref} width={width} height={height} className="rounded" />;
}

function TimelineStudio() {
  const params = useSearchParams();
  const sourceVideo = params.get("video");

  const [clips, setClips] = useState<TClip[]>([]);
  const [pool, setPool] = useState<OutputItem[]>([]);
  const [audioAssets, setAudioAssets] = useState<TAudio[]>([]);
  const [narrationPath, setNarrationPath] = useState<string>("");
  const [offsetMs, setOffsetMs] = useState(0);
  const [gain, setGain] = useState(1.0);
  const [name, setName] = useState("");
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Preview machinery: one <video> hopping between blocks + one offset <audio>.
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const previewIdx = useRef(0);

  useEffect(() => {
    api.outputs().then((d) => setPool(d.outputs.filter((o) => o.kind === "clip"))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sourceVideo) return;
    api
      .renderAssets(sourceVideo)
      .then((d) => {
        setClips(
          d.clips.map((c) => ({ ...c, in_s: 0, out_s: c.duration })),
        );
        setAudioAssets(d.audio);
        setLoadedFrom(sourceVideo.split("/").pop() ?? sourceVideo);
      })
      .catch((e) => setError(String(e)));
  }, [sourceVideo]);

  const total = useMemo(() => clips.reduce((s, c) => s + usedSeconds(c), 0), [clips]);

  const patch = (i: number, p: Partial<TClip>) =>
    setClips((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const move = (i: number, dir: -1 | 1) =>
    setClips((cs) => {
      const j = i + dir;
      if (j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // ⌖ the cinematic center-cut: keep the middle ~2.2s of the clip.
  const centerCut = (i: number) => {
    const c = clips[i];
    const keep = Math.min(2.2, c.duration);
    const start = Math.max(0, (c.duration - keep) / 2);
    patch(i, { in_s: +start.toFixed(2), out_s: +(start + keep).toFixed(2) });
  };

  // Swap a shot to one of its kept QC takes (the previous choice joins the
  // alternates, so switching is always reversible).
  const useTake = (i: number, alt: TAlternate) => {
    const c = clips[i];
    const currentAsAlt: TAlternate = {
      path: c.path, url: c.url, name: c.name, duration: c.duration, take: c.take ?? 0,
    };
    patch(i, {
      path: alt.path,
      url: alt.url,
      name: alt.name,
      duration: alt.duration,
      take: alt.take,
      in_s: 0,
      out_s: alt.duration,
      alternates: [
        ...(c.alternates ?? []).filter((a) => a.path !== alt.path),
        currentAsAlt,
      ].sort((a, b) => a.take - b.take),
    });
  };

  const addFromPool = (o: OutputItem) =>
    setClips((cs) => [
      ...cs,
      {
        path: o.path,
        url: o.url,
        name: o.name,
        duration: o.duration ?? 5,
        voice_lock: !!o.voice_lock,
        in_s: 0,
        out_s: o.duration ?? 5,
      },
    ]);

  const startPreview = () => {
    if (!clips.length || !videoRef.current) return;
    previewIdx.current = 0;
    const v = videoRef.current;
    const playBlock = (idx: number) => {
      const c = clips[idx];
      v.src = api.fileUrl({ url: c.url } as OutputItem);
      v.currentTime = c.in_s;
      v.muted = !!narrationPath; // narration lane owns sound when chosen
      v.play().catch(() => {});
    };
    const onTime = () => {
      const c = clips[previewIdx.current];
      if (!c) return;
      if (v.currentTime >= c.out_s - 0.03) {
        previewIdx.current += 1;
        if (previewIdx.current >= clips.length) {
          stopPreview();
          return;
        }
        playBlock(previewIdx.current);
      }
    };
    v.addEventListener("timeupdate", onTime);
    (v as HTMLVideoElement & { _tl?: () => void })._tl = () =>
      v.removeEventListener("timeupdate", onTime);
    setPreviewing(true);
    playBlock(0);
    if (narrationPath && audioRef.current) {
      const a = audioRef.current;
      a.currentTime = 0;
      setTimeout(() => a.play().catch(() => {}), offsetMs);
    }
  };

  const stopPreview = () => {
    const v = videoRef.current as (HTMLVideoElement & { _tl?: () => void }) | null;
    v?._tl?.();
    v?.pause();
    audioRef.current?.pause();
    setPreviewing(false);
  };

  const exportTimeline = async () => {
    setError(null);
    stopPreview();
    try {
      const { job_id } = await api.timelineExport({
        clips: clips.map((c) => ({ path: c.path, in_s: c.in_s, out_s: c.out_s })),
        ...(narrationPath
          ? { narration: { path: narrationPath, offset_ms: offsetMs, gain } }
          : {}),
        ...(name ? { name } : {}),
      });
      setJobId(job_id);
      setJob({ status: "queued", progress: 0, detail: "", video_path: null, error: null });
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    if (!jobId) return;
    const t = setInterval(async () => {
      try {
        const j = await api.job(jobId);
        setJob(j);
        if (["done", "error", "cancelled"].includes(j.status)) clearInterval(t);
      } catch {
        /* transient */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [jobId]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6 flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight font-display">Timeline</h1>
        <p className="text-sm text-text-muted">
          trim · reorder · nudge the voice · export — no re-rendering
          {loadedFrom ? ` — editing ${loadedFrom}` : ""}
        </p>
      </header>

      {/* ---- Video track ---- */}
      <section className="card-raised flex flex-col gap-3 rounded-card p-4 sm:p-5">
        <div className="flex items-baseline justify-between">
          <span className="label-cap">Video track</span>
          <span className="text-[11px] text-text-muted">≈{total.toFixed(1)}s output</span>
        </div>
        {clips.length === 0 && (
          <p className="text-sm text-text-muted">
            Open a video from the Library (⋯ → 🎬 Open in Timeline) or add raw clips below.
          </p>
        )}
        <div className="overflow-x-auto pb-2">
          <div className="flex items-stretch gap-1" style={{ minWidth: Math.max(320, total * PPS) }}>
            {clips.map((c, i) => (
              <div
                key={`${c.path}-${i}`}
                className="group relative flex shrink-0 flex-col rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/10 p-1.5"
                style={{ width: Math.max(120, usedSeconds(c) * PPS) }}
              >
                <video
                  src={api.fileUrl({ url: c.url } as OutputItem)}
                  muted
                  preload="metadata"
                  className="h-16 w-full rounded object-cover"
                />
                <p className="mt-1 truncate text-[10px] text-text-primary" title={c.name}>
                  {i + 1}. {clipLabel(c)} {c.voice_lock ? "🔒" : ""}
                </p>
                <div className="mt-1 flex items-center gap-1 text-[10px]">
                  <span className="text-text-muted">
                    {c.in_s.toFixed(1)}–{c.out_s.toFixed(1)}s / {c.duration.toFixed(1)}s
                  </span>
                </div>
                {/* trim window: two ranges (in / out) */}
                <input
                  type="range" min={0} max={c.duration - 0.5} step={0.1} value={c.in_s}
                  onChange={(e) => patch(i, { in_s: Math.min(+e.target.value, c.out_s - 0.5) })}
                  className="mt-1 w-full accent-(--accent-grad-from)"
                  aria-label="Trim start"
                />
                <input
                  type="range" min={0.5} max={c.duration} step={0.1} value={c.out_s}
                  onChange={(e) => patch(i, { out_s: Math.max(+e.target.value, c.in_s + 0.5) })}
                  className="w-full accent-(--accent-grad-to)"
                  aria-label="Trim end"
                />
                {/* Take switcher — the kept QC takes of this shot (keep-all-takes) */}
                {!!c.alternates?.length && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="text-[9px] text-text-muted">takes:</span>
                    <span className="rounded bg-fuchsia-500/30 px-1.5 py-0.5 text-[9px]">
                      ✓ {c.take ? `take ${c.take}` : "current"}
                    </span>
                    {c.alternates.map((a) => (
                      <button
                        key={a.path}
                        onClick={() => useTake(i, a)}
                        title={a.name}
                        className="seg rounded px-1.5 py-0.5 text-[9px]"
                      >
                        {a.take > 0 ? `take ${a.take}` : "shipped"}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-1 flex items-center justify-between">
                  <div className="flex gap-1">
                    <button onClick={() => move(i, -1)} className="seg rounded px-1.5 py-0.5 text-[10px]" aria-label="Move left">←</button>
                    <button onClick={() => move(i, 1)} className="seg rounded px-1.5 py-0.5 text-[10px]" aria-label="Move right">→</button>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => centerCut(i)}
                      title="Center-cut: keep the middle ~2.2s (cinematic rhythm)"
                      className="seg rounded px-1.5 py-0.5 text-[10px]"
                    >
                      ⌖ 2.2s
                    </button>
                    <button
                      onClick={() => setClips((cs) => cs.filter((_, j) => j !== i))}
                      className="seg rounded px-1.5 py-0.5 text-[10px]"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Audio track ---- */}
      <section className="card-raised flex flex-col gap-3 rounded-card p-4 sm:p-5">
        <span className="label-cap">Voice track</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={narrationPath}
            onChange={(e) => setNarrationPath(e.target.value)}
            className="input-well rounded-btn p-2.5 text-sm"
          >
            <option value="">— keep the clips&apos; own audio —</option>
            {audioAssets.map((a) => (
              <option key={a.path} value={a.path}>
                🎙 {a.name}
              </option>
            ))}
          </select>
          {narrationPath && (
            <>
              <label className="flex items-center gap-2 text-xs text-text-muted">
                offset
                <input
                  type="range" min={0} max={3000} step={50} value={offsetMs}
                  onChange={(e) => setOffsetMs(+e.target.value)}
                  className="accent-(--accent-grad-from)"
                />
                <span className="w-14">{offsetMs}ms</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-text-muted">
                gain
                <input
                  type="range" min={0.4} max={2} step={0.1} value={gain}
                  onChange={(e) => setGain(+e.target.value)}
                  className="accent-(--accent-grad-from)"
                />
                <span className="w-8">{gain.toFixed(1)}x</span>
              </label>
            </>
          )}
        </div>
        {narrationPath && (
          <div style={{ paddingLeft: (offsetMs / 1000) * PPS }}>
            <Waveform
              url={api.fileUrl({ url: audioAssets.find((a) => a.path === narrationPath)?.url ?? "" } as OutputItem)}
              width={Math.max(280, Math.round(total * PPS))}
            />
          </div>
        )}
      </section>

      {/* ---- Preview + export ---- */}
      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card-raised rounded-card p-4">
          <video ref={videoRef} className="mx-auto max-h-[52vh] rounded-xl bg-black" playsInline />
          {narrationPath && (
            <audio ref={audioRef} src={api.fileUrl({ url: audioAssets.find((a) => a.path === narrationPath)?.url ?? "" } as OutputItem)} />
          )}
        </div>
        <aside className="card-raised flex flex-col gap-3 rounded-card p-4">
          <button
            onClick={previewing ? stopPreview : startPreview}
            disabled={!clips.length}
            className="seg rounded-btn px-4 py-2.5 text-sm disabled:opacity-40"
          >
            {previewing ? "⏹ Stop preview" : "▶ Preview in browser"}
          </button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))}
            placeholder="export name (optional)"
            className="input-well rounded-btn p-2.5 text-sm"
          />
          <button
            onClick={exportTimeline}
            disabled={!clips.length || (!!job && !["done", "error", "cancelled"].includes(job.status))}
            className="hero-glow rounded-btn px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Export {total ? `${total.toFixed(1)}s` : ""} cut
          </button>
          {job && (
            <p className="text-xs text-text-muted">
              {job.status} {job.progress ? `· ${job.progress}%` : ""} {job.detail}
              {job.error ? ` — ${job.error}` : ""}
            </p>
          )}
          {job?.status === "done" && job.video_path && (
            <video controls className="w-full rounded-xl bg-black" src={api.fileUrl({ url: `/files/${job.video_path.replace(/^outputs\//, "")}` } as OutputItem)} />
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </aside>
      </section>

      {/* ---- Raw clip pool ---- */}
      <section className="card-raised flex flex-col gap-3 rounded-card p-4 sm:p-5">
        <span className="label-cap">Add raw clips</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {pool.slice(0, 24).map((o) => (
            <button
              key={o.path}
              onClick={() => addFromPool(o)}
              className="seg flex flex-col items-start gap-1 rounded-lg p-2 text-left"
            >
              <span className="w-full truncate text-[11px]">{o.name}</span>
              <span className="text-[10px] text-text-muted">
                {o.duration ? `${o.duration.toFixed(1)}s` : ""} {o.voice_lock ? "🔒" : ""}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function TimelineKeyed() {
  const params = useSearchParams();
  return <TimelineStudio key={params.get("video") ?? "blank"} />;
}

export default function TimelinePage() {
  return (
    <Suspense fallback={null}>
      <TimelineKeyed />
    </Suspense>
  );
}
