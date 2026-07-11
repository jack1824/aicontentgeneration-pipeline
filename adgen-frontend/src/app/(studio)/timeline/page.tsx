"use client";

// Timeline — NLE-style editor (client problem #3). Time is spatial: clip width =
// duration × zoom, trims are edge-drags, the voice block slides in its own lane.
// Layout: top bar / (media bin | monitor) / timeline lanes. Everything stays
// FFmpeg-only on export — trimming mutates in/out, never the source.
// Opens from any Library video ("Open in Timeline") via ?video=, or builds from
// the media bin. ⌖ keeps the cinematic center-cut default (~2.2s middle).

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, Job, OutputItem } from "@/lib/api";

const MIN_PPS = 20;
const MAX_PPS = 200;
const DEFAULT_PPS = 44;
const MIN_CLIP_S = 0.2;
const GUTTER = 96; // fixed lane-header gutter (V1 / A1), sticky while tracks scroll
const V1_H = 128;
const A1_H = 72;
const RULER_H = 28;

const fUrl = (url: string) => api.fileUrl({ url } as OutputItem);

type TAlternate = { path: string; url: string; name: string; duration: number; take: number };

type TClip = {
  id: string;
  path: string;
  url: string;
  name: string;
  src: number; // source duration — trims clamp to this, never mutate it
  in_s: number;
  out_s: number; // exclusive end of the used window
  voice_lock: boolean;
  scene?: number | null; // "Scene N" label from the seg/clip naming convention
  take?: number; // which QC take this file is
  alternates?: TAlternate[]; // other kept QC takes of the same shot — swappable
};

type TAudio = { path: string; url: string; name: string };

type Selection = { type: "clip"; id: string } | { type: "voice" } | null;

let idSeq = 0;
const newId = () => `c${++idSeq}-${Math.floor(performance.now())}`;

const used = (c: TClip) => Math.max(MIN_CLIP_S, c.out_s - c.in_s);

// "Scene 3 · take 2" — the human name for a clip block.
const clipLabel = (c: TClip) =>
  `${c.scene ? `Scene ${c.scene}` : c.name.replace(/\.mp4$/, "")}${
    c.take ? ` · take ${c.take}` : ""
  }`;

const fmt = (t: number) => {
  const v = Math.max(0, t);
  const m = Math.floor(v / 60);
  return `${String(m).padStart(2, "0")}:${(v - m * 60).toFixed(1).padStart(4, "0")}`;
};

/* ---------- filmstrip frame cache (module-level, shared across zooms) ---------- */

const frameCache = new Map<string, HTMLCanvasElement>();
const frameQueue = new Map<string, Promise<void>>(); // per-url chain: one seeking video per source
const frameVideos = new Map<string, HTMLVideoElement>();

function extractFrame(url: string, t: number): Promise<HTMLCanvasElement | null> {
  const key = `${url}|${t.toFixed(2)}`;
  const hit = frameCache.get(key);
  if (hit) return Promise.resolve(hit);
  const prev = frameQueue.get(url) ?? Promise.resolve();
  const job = prev.then(
    () =>
      new Promise<void>((resolve) => {
        if (frameCache.has(key)) return resolve();
        let v = frameVideos.get(url);
        if (v && v.error) {
          frameVideos.delete(url); // broken element — retry with a fresh one
          v = undefined;
        }
        if (!v) {
          if (frameVideos.size >= 8) {
            const first = frameVideos.entries().next().value as [string, HTMLVideoElement];
            first[1].removeAttribute("src");
            first[1].load();
            frameVideos.delete(first[0]);
          }
          v = document.createElement("video");
          v.muted = true;
          v.preload = "auto";
          v.src = url;
          frameVideos.set(url, v);
        }
        const done = () => {
          v!.removeEventListener("seeked", onSeeked);
          v!.removeEventListener("error", onErr);
          clearTimeout(timer);
          resolve();
        };
        const onSeeked = () => {
          try {
            const c = document.createElement("canvas");
            const w = Math.max(2, v!.videoWidth), h = Math.max(2, v!.videoHeight);
            const scale = 96 / h;
            c.width = Math.round(w * scale);
            c.height = 96;
            c.getContext("2d")?.drawImage(v!, 0, 0, c.width, c.height);
            frameCache.set(key, c);
            if (frameCache.size > 400) {
              frameCache.delete(frameCache.keys().next().value as string);
            }
          } catch {
            /* tainted/decode failure — block keeps its flat tint */
          }
          done();
        };
        const onErr = () => {
          frameVideos.delete(url); // don't let every later frame burn the timeout
          done();
        };
        const timer = setTimeout(done, 4000);
        v.addEventListener("seeked", onSeeked);
        v.addEventListener("error", onErr);
        const go = () => {
          try {
            v!.currentTime = Math.max(0.05, t);
          } catch {
            done();
          }
        };
        if (v.readyState >= 1) go();
        else v.addEventListener("loadedmetadata", go, { once: true });
      }),
  );
  frameQueue.set(url, job);
  return job.then(() => frameCache.get(key) ?? null);
}

// Clip-block background: a strip of frames from the USED window, darkened so the
// labels stay readable. Frame times are quantized so the cache survives trims/zoom.
function Filmstrip({
  url, in_s, out_s, width, height,
}: { url: string; in_s: number; out_s: number; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const qIn = Math.round(in_s * 4) / 4;
  const qOut = Math.round(out_s * 4) / 4;
  const qW = Math.max(48, Math.round(width / 40) * 40);
  useEffect(() => {
    let dead = false;
    const cv = ref.current;
    if (!cv) return;
    cv.width = qW;
    cv.height = height;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "rgba(20,20,22,1)";
    ctx.fillRect(0, 0, qW, height);
    const n = Math.max(1, Math.min(10, Math.round(qW / 72)));
    const tileW = qW / n;
    const span = Math.max(0.01, qOut - qIn);
    (async () => {
      for (let i = 0; i < n; i++) {
        const t = Math.round((qIn + ((i + 0.5) / n) * span) * 4) / 4;
        const frame = await extractFrame(url, t);
        if (dead) break; // component gone — stop queueing seeks for it
        if (!frame) continue;
        const s = Math.max(tileW / frame.width, height / frame.height);
        const dw = frame.width * s, dh = frame.height * s;
        ctx.save();
        ctx.beginPath();
        ctx.rect(i * tileW, 0, tileW, height);
        ctx.clip();
        ctx.drawImage(frame, i * tileW + (tileW - dw) / 2, (height - dh) / 2, dw, dh);
        ctx.restore();
      }
      if (!dead) {
        ctx.fillStyle = "rgba(10,10,11,0.42)"; // darken so labels read
        ctx.fillRect(0, 0, qW, height);
      }
    })();
    return () => {
      dead = true;
    };
  }, [url, qIn, qOut, qW, height]);
  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 h-full w-full rounded-[7px]"
    />
  );
}

/* ---------- waveform (decoded once per url, redrawn per zoom) ---------- */

const audioCache = new Map<string, Promise<{ data: Float32Array; duration: number }>>();

function loadAudio(url: string) {
  let p = audioCache.get(url);
  if (!p) {
    p = (async () => {
      const buf = await fetch(url).then((r) => r.arrayBuffer());
      const ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(buf);
      ctx.close();
      return { data: audio.getChannelData(0), duration: audio.duration };
    })();
    p.catch(() => audioCache.delete(url)); // transient failure — allow retry
    if (audioCache.size >= 6) audioCache.delete(audioCache.keys().next().value as string);
    audioCache.set(url, p);
  }
  return p;
}

function Waveform({
  url, width, height, onDuration,
}: { url: string; width: number; height: number; onDuration?: (d: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { data, duration } = await loadAudio(url);
        if (dead || !ref.current) return;
        onDuration?.(duration);
        const c = ref.current.getContext("2d");
        if (!c) return;
        ref.current.width = width;
        ref.current.height = height;
        c.clearRect(0, 0, width, height);
        c.fillStyle = "rgba(94, 234, 212, 0.75)"; // teal — the audio lane's color
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, width, height]);
  return <canvas ref={ref} className="h-full w-full" />;
}

/* ================================ the editor ================================ */

function TimelineStudio() {
  const params = useSearchParams();
  const sourceVideo = params.get("video");

  const [clips, setClips] = useState<TClip[]>([]);
  const [pool, setPool] = useState<OutputItem[]>([]);
  const [poolFilter, setPoolFilter] = useState("");
  const [audioAssets, setAudioAssets] = useState<TAudio[]>([]);
  const [narrationPath, setNarrationPath] = useState("");
  const [voiceOffset, setVoiceOffset] = useState(0); // seconds
  const [voiceDur, setVoiceDur] = useState<number | null>(null);
  const [gain, setGain] = useState(1.0);
  const [gainStr, setGainStr] = useState("1.0"); // draft — clamp on commit, not per keystroke
  const [name, setName] = useState("");
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const [binOpen, setBinOpen] = useState(false); // narrow-viewport drawer
  const [wide, setWide] = useState(true); // ≥1101px column vs drawer — one mount, never both
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1101px)");
    const f = () => setWide(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);

  const [selection, setSelection] = useState<Selection>(null);
  const [pps, setPps] = useState(DEFAULT_PPS);
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResult, _setShowResult] = useState(false);
  const showResultRef = useRef(false);
  const setShowResult = (v: boolean) => {
    showResultRef.current = v; // eagerly — keyboard/play() read it in the same tick
    _setShowResult(v);
  };

  const [dragInsert, setDragInsert] = useState<number | null>(null);
  const [dragClipId, setDragClipId] = useState<string | null>(null);
  const [dragDx, setDragDx] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);

  /* ----- derived time geometry ----- */
  const starts = useMemo(() => {
    const a: number[] = [];
    let s = 0;
    for (const c of clips) {
      a.push(s);
      s += used(c);
    }
    return a;
  }, [clips]);
  const total = useMemo(() => clips.reduce((s, c) => s + used(c), 0), [clips]);
  const maxT = Math.max(total + 2, 12);
  const contentW = Math.ceil(maxT * pps);

  /* ----- refs mirrored for the playback loop ----- */
  const clipsRef = useRef(clips);
  const startsRef = useRef(starts);
  const totalRef = useRef(total);
  const playTRef = useRef(playT);
  const playingRef = useRef(playing);
  const narrationRef = useRef(narrationPath);
  const offsetRef = useRef(voiceOffset);
  const voiceDurRef = useRef(voiceDur);
  useEffect(() => {
    clipsRef.current = clips;
    startsRef.current = starts;
    totalRef.current = total;
    narrationRef.current = narrationPath;
    offsetRef.current = voiceOffset;
    voiceDurRef.current = voiceDur;
  }, [clips, starts, total, narrationPath, voiceOffset, voiceDur]);

  const activeIdRef = useRef<string | null>(null); // by id — indexes go stale when clips mutate
  const srcRef = useRef<string | null>(null);
  const pendingRef = useRef<{ local: number; play: boolean } | null>(null);
  const rafRef = useRef(0);

  /* ----- data loading ----- */
  useEffect(() => {
    api.outputs().then((d) => setPool(d.outputs.filter((o) => o.kind === "clip"))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sourceVideo) return;
    api
      .renderAssets(sourceVideo)
      .then((d) => {
        setClips(
          d.clips.map((c) => ({
            id: newId(),
            path: c.path,
            url: c.url,
            name: c.name,
            src: c.duration,
            in_s: 0,
            out_s: c.duration,
            voice_lock: c.voice_lock,
            scene: c.scene,
            take: c.take,
            alternates: c.alternates,
          })),
        );
        setAudioAssets(d.audio);
        setLoadedFrom(sourceVideo.split("/").pop() ?? sourceVideo);
      })
      .catch((e) => setError(String(e)));
  }, [sourceVideo]);

  /* ----- playback engine: one <video> hopping clips + one offset <audio> ----- */

  const locateIn = (
    cs: TClip[], st: number[], t: number,
  ): { idx: number; local: number } | null => {
    if (!cs.length) return null;
    for (let i = 0; i < cs.length; i++) {
      if (t < st[i] + used(cs[i]) - 1e-6) return { idx: i, local: Math.max(0, t - st[i]) };
    }
    return { idx: cs.length - 1, local: used(cs[cs.length - 1]) };
  };
  const locate = (t: number) => locateIn(clipsRef.current, startsRef.current, t);

  const seekVideo = (idx: number, local: number, andPlay: boolean) => {
    const v = videoRef.current;
    const c = clipsRef.current[idx];
    if (!v || !c) return;
    activeIdRef.current = c.id;
    const srcUrl = fUrl(c.url);
    if (srcRef.current !== srcUrl) {
      srcRef.current = srcUrl;
      pendingRef.current = { local, play: andPlay };
      v.src = srcUrl;
    } else {
      pendingRef.current = null; // a same-src seek supersedes any in-flight switch
      try {
        v.currentTime = local;
      } catch {
        /* not seekable yet */
      }
      if (andPlay) v.play().catch(() => {});
    }
  };

  const onVideoMeta = () => {
    const p = pendingRef.current;
    const v = videoRef.current;
    if (!p || !v) return;
    pendingRef.current = null;
    try {
      v.currentTime = p.local;
    } catch {
      /* ignore */
    }
    if (p.play && playingRef.current) v.play().catch(() => {});
  };

  const onVideoError = () => {
    pendingRef.current = null;
    srcRef.current = null; // so a retry re-runs the src-switch path
    const cs = clipsRef.current;
    const i = cs.findIndex((c) => c.id === activeIdRef.current);
    setError(`clip failed to load${i >= 0 ? `: ${cs[i].name}` : ""}`);
    if (playingRef.current && i >= 0 && i + 1 < cs.length) {
      seekVideo(i + 1, cs[i + 1].in_s, true); // skip the broken clip
    } else {
      stopPlayback();
    }
  };

  // Boundary enforcement that survives background tabs: rAF freezes there but
  // the <video> keeps playing — timeupdate still fires and stops the overrun.
  const onVideoTime = () => {
    if (!playingRef.current || pendingRef.current) return;
    const v = videoRef.current;
    const cs = clipsRef.current;
    const i = cs.findIndex((c) => c.id === activeIdRef.current);
    if (!v || i < 0) return;
    if (v.currentTime >= cs[i].out_s - 0.03 || v.ended) {
      if (i + 1 < cs.length) seekVideo(i + 1, cs[i + 1].in_s, true);
      else {
        stopPlayback();
        playTRef.current = totalRef.current;
        setPlayT(totalRef.current);
      }
    }
  };

  const syncVoice = (t: number, forcePause = false) => {
    const a = audioRef.current;
    if (!a) return;
    if (!narrationRef.current) {
      if (!a.paused) a.pause();
      return;
    }
    const desired = t - offsetRef.current;
    const dur = voiceDurRef.current ?? Infinity;
    if (forcePause || desired < 0 || desired > dur) {
      if (!a.paused) a.pause();
      if (desired >= 0 && desired <= dur) a.currentTime = Math.max(0, desired);
      return;
    }
    if (a.paused) {
      a.currentTime = desired;
      a.play().catch(() => {});
    } else if (Math.abs(a.currentTime - desired) > 0.25) {
      a.currentTime = desired;
    }
  };

  const stopPlayback = () => {
    if (pendingRef.current) pendingRef.current.play = false; // no ghost resume on metadata
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    videoRef.current?.pause();
    audioRef.current?.pause();
  };

  const tick = () => {
    if (!playingRef.current) return;
    const v = videoRef.current;
    const cs = clipsRef.current, st = startsRef.current;
    if (!v || !cs.length) {
      stopPlayback();
      return;
    }
    if (pendingRef.current) {
      // mid src-switch: the <video> still reports the old source's time — hold
      // the playhead (and the narration, or it drifts ahead and snaps back)
      audioRef.current?.pause();
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    let i = cs.findIndex((x) => x.id === activeIdRef.current);
    if (i < 0 || fUrl(cs[i].url) !== srcRef.current) {
      // active clip deleted / reordered / take-swapped under the playhead —
      // re-anchor from the timeline position instead of trusting a stale index
      const loc = locate(playTRef.current);
      if (!loc) {
        stopPlayback();
        return;
      }
      i = loc.idx;
      seekVideo(loc.idx, cs[loc.idx].in_s + loc.local, true);
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const c = cs[i];
    let t = st[i] + (v.currentTime - c.in_s);
    if (v.currentTime >= c.out_s - 0.03 || v.ended) {
      if (i + 1 < cs.length) {
        seekVideo(i + 1, cs[i + 1].in_s, true);
        t = st[i + 1];
      } else {
        stopPlayback();
        playTRef.current = totalRef.current;
        setPlayT(totalRef.current);
        syncVoice(totalRef.current, true);
        return;
      }
    }
    t = Math.max(0, Math.min(t, totalRef.current));
    playTRef.current = t;
    setPlayT(t);
    syncVoice(t);
    followPlayhead(t);
    rafRef.current = requestAnimationFrame(tick);
  };

  const play = (fromStart = false) => {
    if (!clipsRef.current.length || showResultRef.current) return;
    let t = fromStart ? 0 : playTRef.current;
    if (t >= totalRef.current - 0.05) t = 0;
    playTRef.current = t;
    setPlayT(t);
    const loc = locate(t);
    if (!loc) return;
    playingRef.current = true;
    setPlaying(true);
    seekVideo(loc.idx, clipsRef.current[loc.idx].in_s + loc.local, true);
    syncVoice(t);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  };

  const setPlayhead = (t: number) => {
    if (playingRef.current) stopPlayback();
    const v = Math.max(0, Math.min(t, totalRef.current));
    playTRef.current = v;
    setPlayT(v);
    const loc = locate(v);
    if (loc) seekVideo(loc.idx, clipsRef.current[loc.idx].in_s + loc.local, false);
    syncVoice(v, true);
  };

  const followPlayhead = (t: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const x = GUTTER + t * ppsRef.current;
    const view = el.clientWidth;
    if (x > el.scrollLeft + view - 90) el.scrollLeft = x - view + 90;
    else if (x < el.scrollLeft + GUTTER + 20) el.scrollLeft = Math.max(0, x - GUTTER - 20);
  };
  const ppsRef = useRef(pps);
  useEffect(() => {
    ppsRef.current = pps;
  }, [pps]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // narration owns the sound when chosen (mirrors export: narration replaces audio)
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = !!narrationPath;
  }, [narrationPath]);

  // Chrome keeps detached media elements playing — pause before React drops them
  // (the narration <audio> unmounts when its source changes; both on page leave).
  useEffect(() => {
    const a = audioRef.current;
    return () => a?.pause();
  }, [narrationPath]);
  useEffect(() => {
    const v = videoRef.current;
    return () => v?.pause(); // the narration effect above handles the <audio>
  }, []);

  // clips changed under the playhead (trim/delete/reorder) — keep it in range
  useEffect(() => {
    if (playTRef.current > total) setPlayhead(total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // first clips arrival: park the monitor on frame one
  const hadClips = useRef(false);
  useEffect(() => {
    if (clips.length && !hadClips.current) {
      hadClips.current = true;
      seekVideo(0, clips[0].in_s, false);
    }
    if (!clips.length) hadClips.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips.length]);

  /* ----- edits ----- */

  const patchClip = (id: string, p: Partial<TClip>) =>
    setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));

  const removeClip = (id: string) => {
    setClips((cs) => cs.filter((c) => c.id !== id));
    setSelection((s) => (s?.type === "clip" && s.id === id ? null : s));
  };

  const moveClip = (id: string, dir: -1 | 1) =>
    setClips((cs) => {
      const i = cs.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // ⌖ the cinematic center-cut: keep the middle ~2.2s of the source.
  const centerCut = (id: string) => {
    const c = clips.find((x) => x.id === id);
    if (!c) return;
    const keep = Math.min(2.2, c.src);
    const start = Math.max(0, (c.src - keep) / 2);
    patchClip(id, { in_s: +start.toFixed(2), out_s: +(start + keep).toFixed(2) });
  };

  // Swap a shot to one of its kept QC takes (previous choice joins the
  // alternates, so switching is always reversible).
  const swapTake = (id: string, alt: TAlternate) => {
    const c = clips.find((x) => x.id === id);
    if (!c) return;
    const currentAsAlt: TAlternate = {
      path: c.path, url: c.url, name: c.name, duration: c.src, take: c.take ?? 0,
    };
    patchClip(id, {
      path: alt.path,
      url: alt.url,
      name: alt.name,
      src: alt.duration,
      take: alt.take,
      in_s: 0,
      out_s: alt.duration,
      alternates: [
        ...(c.alternates ?? []).filter((a) => a.path !== alt.path),
        currentAsAlt,
      ].sort((a, b) => a.take - b.take),
    });
  };

  // Split the clip under the playhead into two clips sharing the same source —
  // in/out set so nothing is lost (non-destructive, composable).
  const splitAtPlayhead = () => {
    const loc = locate(playTRef.current);
    if (!loc) return;
    const c = clipsRef.current[loc.idx];
    if (loc.local < MIN_CLIP_S || loc.local > used(c) - MIN_CLIP_S) return;
    const cut = c.in_s + loc.local;
    const a: TClip = { ...c, id: newId(), out_s: +cut.toFixed(3) };
    const b: TClip = { ...c, id: newId(), in_s: +cut.toFixed(3) };
    setClips((cs) => {
      const i = cs.findIndex((x) => x.id === c.id);
      if (i < 0) return cs;
      const next = [...cs];
      next.splice(i, 1, a, b);
      return next;
    });
    setSelection({ type: "clip", id: b.id });
  };

  const splittable = (() => {
    const loc = locateIn(clips, starts, playT); // render-scope values — refs lag one render
    if (!loc) return false;
    const c = clips[loc.idx];
    return !!c && loc.local >= MIN_CLIP_S && loc.local <= used(c) - MIN_CLIP_S;
  })();

  const addFromPool = (o: OutputItem, at?: number) => {
    const clip: TClip = {
      id: newId(),
      path: o.path,
      url: o.url,
      name: o.name,
      src: o.duration ?? 5,
      in_s: 0,
      out_s: o.duration ?? 5,
      voice_lock: !!o.voice_lock,
    };
    setClips((cs) => {
      const next = [...cs];
      next.splice(at ?? next.length, 0, clip);
      return next;
    });
  };

  /* ----- pointer interactions on the lane ----- */

  // Gapless mapping: block x == starts[i]·pps — identical to the ruler/playhead
  // scale, so scrub, split, and the drop marker all agree with what's on screen.
  const xToIndex = (xContent: number) => {
    const cs = clipsRef.current, st = startsRef.current;
    for (let i = 0; i < cs.length; i++) {
      if (xContent < (st[i] + used(cs[i]) / 2) * ppsRef.current) return i;
    }
    return cs.length;
  };

  // trim by dragging a clip edge
  const startTrim = (e: React.PointerEvent, id: string, edge: "in" | "out") => {
    e.stopPropagation();
    e.preventDefault();
    setSelection({ type: "clip", id });
    const c = clipsRef.current.find((x) => x.id === id);
    if (!c) return;
    const x0 = e.clientX;
    const orig = edge === "in" ? c.in_s : c.out_s;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const d = (ev.clientX - x0) / ppsRef.current;
      const cur = clipsRef.current.find((x) => x.id === id);
      if (!cur) return;
      if (edge === "in") {
        patchClip(id, { in_s: +Math.min(Math.max(0, orig + d), cur.out_s - MIN_CLIP_S).toFixed(2) });
      } else {
        patchClip(id, { out_s: +Math.max(Math.min(cur.src, orig + d), cur.in_s + MIN_CLIP_S).toFixed(2) });
      }
    };
    const end = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("lostpointercapture", end);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
  };

  // drag the clip body along the lane: insertion marker at the drop index
  const startClipDrag = (e: React.PointerEvent, id: string) => {
    if ((e.target as HTMLElement).dataset.handle) return;
    e.preventDefault();
    const x0 = e.clientX;
    let moved = false;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) > 4) {
        moved = true;
        setDragClipId(id);
        setSelection({ type: "clip", id });
      }
      if (!moved) return;
      setDragDx(dx);
      const lane = laneRef.current;
      if (!lane) return;
      const x = ev.clientX - lane.getBoundingClientRect().left;
      setDragInsert(xToIndex(x));
    };
    const finish = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("lostpointercapture", onCancel);
    };
    const onCancel = () => {
      // interrupted drag (touch pan, capture loss) — abandon without splicing
      finish();
      setDragClipId(null);
      setDragDx(0);
      setDragInsert(null);
    };
    const onUp = (ev: PointerEvent) => {
      finish();
      if (!moved) {
        setSelection({ type: "clip", id });
        return;
      }
      const lane = laneRef.current;
      let to: number | null = null;
      if (lane) to = xToIndex(ev.clientX - lane.getBoundingClientRect().left);
      setDragClipId(null);
      setDragDx(0);
      setDragInsert(null);
      if (to === null) return;
      setClips((cs) => {
        const from = cs.findIndex((c) => c.id === id);
        if (from < 0) return cs;
        let dst = to!;
        if (dst > from) dst -= 1;
        if (dst === from) return cs;
        const next = [...cs];
        const [c] = next.splice(from, 1);
        next.splice(dst, 0, c);
        return next;
      });
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("lostpointercapture", onCancel);
  };

  // ruler scrub (click or drag)
  const startScrub = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const toT = (clientX: number) =>
      Math.max(0, Math.min((clientX - el.getBoundingClientRect().left) / ppsRef.current, totalRef.current));
    setPlayhead(toT(e.clientX));
    const onMove = (ev: PointerEvent) => setPlayhead(toT(ev.clientX));
    const end = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("lostpointercapture", end);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
  };

  // voice block drag: horizontal = offset. Snap 0.1s; Shift = fine (0.01s).
  const startVoiceDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    setSelection({ type: "voice" });
    const x0 = e.clientX;
    const orig = offsetRef.current;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const raw = orig + (ev.clientX - x0) / ppsRef.current;
      const step = ev.shiftKey ? 0.01 : 0.1;
      setVoiceOffset(Math.max(0, Math.round(raw / step) * step));
    };
    const end = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("lostpointercapture", end);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
  };

  /* ----- media-bin native DnD into the lane ----- */

  const onLaneDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("text/plain")) return;
    e.preventDefault();
    const lane = laneRef.current;
    if (!lane) return;
    setDragInsert(xToIndex(e.clientX - lane.getBoundingClientRect().left));
  };
  const onLaneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const path = e.dataTransfer.getData("text/plain");
    const o = pool.find((x) => x.path === path);
    const lane = laneRef.current;
    const at = lane ? xToIndex(e.clientX - lane.getBoundingClientRect().left) : undefined;
    setDragInsert(null);
    if (o) addFromPool(o, at);
  };

  /* ----- keyboard ----- */

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const keyHandler = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (t?.tagName === "BUTTON" && e.code === "Space") return; // let Space activate focused buttons
    if (e.metaKey || e.ctrlKey) return; // never shadow browser shortcuts (Cmd+S, Cmd+arrows…)
    if (showResultRef.current) return; // export result on screen — editor transport is parked
    if (e.code === "Space") {
      e.preventDefault();
      if (playingRef.current) stopPlayback();
      else play();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      if (e.altKey && selection?.type === "clip") {
        moveClip(selection.id, dir as -1 | 1); // keyboard reorder fallback
      } else {
        setPlayhead(playTRef.current + dir * (e.shiftKey ? 1 : 0.1));
      }
    } else if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      splitAtPlayhead();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (selection?.type === "clip") removeClip(selection.id);
      else if (selection?.type === "voice") {
        setNarrationPath("");
        setSelection(null);
      }
    }
  };
  useEffect(() => {
    keyRef.current = keyHandler; // fresh closure every render, bound listener once
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* ----- export ----- */

  const exportTimeline = async () => {
    setError(null);
    stopPlayback();
    try {
      const { job_id } = await api.timelineExport({
        clips: clips.map((c) => ({ path: c.path, in_s: c.in_s, out_s: c.out_s })),
        ...(narrationPath
          ? { narration: { path: narrationPath, offset_ms: Math.round(voiceOffset * 1000), gain } }
          : {}),
        ...(name ? { name } : {}),
      });
      setJobId(job_id);
      setShowResult(false);
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
        if (j.status === "done" && j.video_path) setShowResult(true);
        if (["done", "error", "cancelled"].includes(j.status)) clearInterval(t);
      } catch {
        /* transient */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [jobId]);

  /* ----- render helpers ----- */

  const selClip = selection?.type === "clip" ? clips.find((c) => c.id === selection.id) : undefined;
  const selIdx = selClip ? clips.findIndex((c) => c.id === selClip.id) : -1;
  const narrationUrl = narrationPath
    ? fUrl(audioAssets.find((a) => a.path === narrationPath)?.url ?? "")
    : "";
  const exporting = !!job && !["done", "error", "cancelled"].includes(job.status);
  const resultUrl =
    job?.status === "done" && job.video_path
      ? fUrl(`/files/${job.video_path.replace(/^outputs\//, "")}`)
      : "";

  const tickInt = pps >= 120 ? 0.5 : pps >= 60 ? 1 : pps >= 35 ? 2 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= maxT + 1e-6; t += tickInt) ticks.push(+t.toFixed(2));

  const filteredPool = pool.filter((o) =>
    o.name.toLowerCase().includes(poolFilter.trim().toLowerCase()),
  );

  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,77,61,0.55)]";

  const binBody = (
    <>
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="label-cap">Media bin</span>
        <span className="text-[10px] text-text-muted">{filteredPool.length} clips</span>
      </div>
      <div className="px-3 pt-2">
        <input
          value={poolFilter}
          onChange={(e) => setPoolFilter(e.target.value)}
          placeholder="filter clips…"
          className={`input-well w-full rounded-btn px-2.5 py-1.5 text-xs ${focusRing}`}
          aria-label="Filter media bin"
        />
      </div>
      <div className="mt-2 flex-1 overflow-y-auto px-2 pb-3">
        {filteredPool.slice(0, 48).map((o) => (
          <button
            key={o.path}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", o.path)}
            onClick={() => addFromPool(o)}
            title={`${o.name} — click to append, drag into the lane to insert`}
            className={`seg mb-1 flex w-full items-center gap-2 rounded-lg p-1.5 text-left ${focusRing}`}
          >
            <video
              src={fUrl(o.url)}
              muted
              preload="metadata"
              className="h-8 w-14 shrink-0 rounded bg-black object-cover"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] text-text-primary">{o.name}</span>
              <span className="text-[10px] text-text-muted">
                {o.duration ? `${o.duration.toFixed(1)}s` : "—"}
              </span>
            </span>
            {(o.voice_lock || /-voiced/.test(o.name)) && (
              <span className="rounded bg-teal-500/20 px-1 py-0.5 text-[9px] text-teal-300">VO</span>
            )}
          </button>
        ))}
        {filteredPool.length > 48 && (
          <p className="px-1 py-2 text-[10px] text-text-muted">
            +{filteredPool.length - 48} more — refine the filter
          </p>
        )}
        {!filteredPool.length && (
          <p className="px-1 py-2 text-[10px] text-text-muted">no clips match</p>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-[calc(100dvh-52px)] flex-col overflow-hidden lg:h-dvh">
      {/* ================= top bar ================= */}
      <header className="bar-raised flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="font-display text-lg font-semibold tracking-tight">Timeline</h1>
          <p className="hidden truncate text-[11px] text-text-muted sm:block">
            trim · reorder · split · nudge the voice — no re-rendering
            {loadedFrom ? ` — editing ${loadedFrom}` : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!wide && (
            <button
              onClick={() => setBinOpen(true)}
              className={`seg inline-flex rounded-btn px-2.5 py-1.5 text-xs ${focusRing}`}
              aria-label="Open media bin"
            >
              🎞 bin
            </button>
          )}
          <span className="seg rounded-btn px-2.5 py-1.5 text-xs tabular-nums">
            cut {total.toFixed(1)}s · {clips.length} clip{clips.length === 1 ? "" : "s"}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))}
            placeholder="export name"
            className={`input-well w-36 rounded-btn px-2.5 py-1.5 text-xs ${focusRing}`}
            aria-label="Export name"
          />
          <button
            onClick={() => {
              if (playing) {
                stopPlayback();
                return;
              }
              setShowResult(false); // Preview always returns to the edit monitor
              play(true);
            }}
            disabled={!clips.length}
            className={`seg rounded-btn px-3 py-1.5 text-xs disabled:opacity-40 ${focusRing}`}
          >
            {playing ? "⏹ Stop" : "▶ Preview"}
          </button>
          <button
            onClick={exportTimeline}
            disabled={!clips.length || exporting}
            className={`hero-glow rounded-btn px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${focusRing}`}
          >
            Export {total ? `${total.toFixed(1)}s` : ""} cut
          </button>
        </div>
        {(job || error) && (
          <p className="w-full text-[11px] text-text-muted">
            {job && (
              <>
                {job.status === "done" ? "✓ exported" : `${job.status}`}
                {job.progress ? ` · ${job.progress}%` : ""} {job.detail}
                {job.error ? ` — ${job.error}` : ""}
              </>
            )}
            {error && <span className="text-red-400"> {error}</span>}
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ================= media bin (≥1101px column) ================= */}
        {wide && (
          <aside className="flex w-[250px] shrink-0 flex-col border-r border-white/5 bg-surface-1/60">
            {binBody}
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ================= preview monitor ================= */}
          <div className="flex min-h-0 flex-1 flex-col bg-black/40 p-3">
            <div className="relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 items-center justify-center">
              <video
                ref={videoRef}
                onLoadedMetadata={onVideoMeta}
                onTimeUpdate={onVideoTime}
                onError={onVideoError}
                playsInline
                className={`max-h-full max-w-full rounded-xl bg-black ${showResult ? "hidden" : ""}`}
              />
              {showResult && resultUrl && (
                <video src={resultUrl} controls autoPlay className="max-h-full max-w-full rounded-xl bg-black" />
              )}
              {!clips.length && !showResult && (
                <div className="placeholder-live absolute inset-0 rounded-xl text-xs text-text-muted">
                  <span>Open a video from the Library (⋯ → 🎬 Open in Timeline)</span>
                  <span>or click / drag clips from the media bin.</span>
                </div>
              )}
            </div>
            {narrationPath && <audio ref={audioRef} src={narrationUrl} />}
            {/* transport */}
            <div className="mx-auto mt-2 flex items-center gap-3">
              {showResult ? (
                <button
                  onClick={() => setShowResult(false)}
                  className={`seg rounded-btn px-3 py-1 text-xs ${focusRing}`}
                >
                  ← back to editing
                </button>
              ) : (
                <button
                  onClick={() => (playing ? stopPlayback() : play())}
                  disabled={!clips.length}
                  title="Space"
                  aria-label={playing ? "Pause" : "Play"}
                  className={`seg h-8 w-8 rounded-full text-sm disabled:opacity-40 ${focusRing}`}
                >
                  {playing ? "⏸" : "▶"}
                </button>
              )}
              <span className="text-xs tabular-nums text-text-secondary">
                {fmt(playT)} <span className="text-text-muted">/ {fmt(total)}</span>
              </span>
            </div>
          </div>

          {/* ================= timeline panel ================= */}
          <div className="shrink-0 border-t border-white/5 bg-surface-1">
            {/* toolbar */}
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5">
              <button
                onClick={splitAtPlayhead}
                disabled={!splittable}
                title="Split clip at playhead (S)"
                className={`seg rounded px-2 py-1 text-[11px] disabled:opacity-40 ${focusRing}`}
              >
                ✂ split
              </button>
              <button
                onClick={() => selClip && centerCut(selClip.id)}
                disabled={!selClip}
                title="Center-cut: keep the middle ~2.2s (cinematic rhythm)"
                className={`seg rounded px-2 py-1 text-[11px] disabled:opacity-40 ${focusRing}`}
              >
                ⌖ 2.2s
              </button>
              <button
                onClick={() => selClip && moveClip(selClip.id, -1)}
                disabled={!selClip || selIdx <= 0}
                title="Move clip left (Alt+←)"
                aria-label="Move clip left"
                className={`seg rounded px-2 py-1 text-[11px] disabled:opacity-40 ${focusRing}`}
              >
                ‹
              </button>
              <button
                onClick={() => selClip && moveClip(selClip.id, 1)}
                disabled={!selClip || selIdx < 0 || selIdx >= clips.length - 1}
                title="Move clip right (Alt+→)"
                aria-label="Move clip right"
                className={`seg rounded px-2 py-1 text-[11px] disabled:opacity-40 ${focusRing}`}
              >
                ›
              </button>
              <button
                onClick={() => {
                  if (selection?.type === "clip") removeClip(selection.id);
                  else if (selection?.type === "voice") setNarrationPath("");
                }}
                disabled={!selection}
                title="Delete selection (⌫)"
                className={`seg rounded px-2 py-1 text-[11px] disabled:opacity-40 ${focusRing}`}
              >
                ✕
              </button>

              {/* selection info + take switcher */}
              <span className="ml-2 min-w-0 truncate text-[11px] text-text-muted">
                {selClip
                  ? `${clipLabel(selClip)} · ${used(selClip).toFixed(1)}s of ${selClip.src.toFixed(1)}s${selClip.voice_lock ? " 🔒" : ""}`
                  : selection?.type === "voice"
                    ? `voice · +${voiceOffset.toFixed(1)}s · ${gain.toFixed(1)}×`
                    : "nothing selected"}
              </span>
              {selClip && !!selClip.alternates?.length && (
                <span className="flex items-center gap-1">
                  <span className="rounded bg-fuchsia-500/30 px-1.5 py-0.5 text-[10px]">
                    ✓ {selClip.take ? `take ${selClip.take}` : "current"}
                  </span>
                  {selClip.alternates.map((a) => (
                    <button
                      key={a.path}
                      onClick={() => swapTake(selClip.id, a)}
                      title={a.name}
                      className={`seg rounded px-1.5 py-0.5 text-[10px] ${focusRing}`}
                    >
                      {a.take > 0 ? `take ${a.take}` : "shipped"}
                    </button>
                  ))}
                </span>
              )}

              <span className="ml-auto flex items-center gap-1 text-[11px] text-text-muted">
                <button
                  onClick={() => setPps((p) => Math.max(MIN_PPS, Math.round(p / 1.25)))}
                  aria-label="Zoom out"
                  className={`seg rounded px-2 py-1 ${focusRing}`}
                >
                  −
                </button>
                <span className="w-14 text-center tabular-nums">{pps}px/s</span>
                <button
                  onClick={() => setPps((p) => Math.min(MAX_PPS, Math.round(p * 1.25)))}
                  aria-label="Zoom in"
                  className={`seg rounded px-2 py-1 ${focusRing}`}
                >
                  +
                </button>
              </span>
            </div>

            {/* ruler + lanes: one horizontal scroller, sticky lane-header gutter */}
            <div ref={scrollRef} className="relative overflow-x-auto overflow-y-hidden pb-2">
              <div className="relative min-w-full" style={{ width: GUTTER + contentW }}>
                {/* playhead */}
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-10"
                  style={{ left: GUTTER + playT * pps }}
                >
                  <div className="absolute -left-[5px] top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-accent" />
                  <div className="absolute bottom-0 top-0 w-px bg-accent" />
                </div>

                {/* ruler */}
                <div className="flex" style={{ height: RULER_H }}>
                  <div className="sticky left-0 z-20 flex shrink-0 items-center border-b border-r border-white/5 bg-surface-1 px-2" style={{ width: GUTTER }}>
                    <span className="text-[10px] tabular-nums text-text-muted">{fmt(playT)}</span>
                  </div>
                  <div
                    onPointerDown={startScrub}
                    className="relative cursor-col-resize touch-none border-b border-white/5"
                    style={{ width: contentW }}
                    title="Click / drag to scrub"
                  >
                    {ticks.map((t) => (
                      <span
                        key={t}
                        className="absolute bottom-0 border-l border-white/15 pl-1 text-[9px] leading-3 text-text-muted"
                        style={{ left: t * pps, height: t % (tickInt < 1 ? 1 : tickInt * 2) === 0 ? 14 : 7 }}
                      >
                        {(tickInt >= 1 ? t % (tickInt * 2) === 0 : t % 1 === 0) ? `${t}s` : ""}
                      </span>
                    ))}
                  </div>
                </div>

                {/* V1 — video lane */}
                <div className="flex" style={{ height: V1_H + 12 }}>
                  <div className="sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-1 border-b border-r border-white/5 bg-surface-1 px-2" style={{ width: GUTTER }}>
                    <span className="label-cap">V1</span>
                    <span className="text-[9px] text-text-muted">video</span>
                  </div>
                  <div
                    ref={laneRef}
                    onDragOver={onLaneDragOver}
                    onDragLeave={() => setDragInsert(null)}
                    onDrop={onLaneDrop}
                    className="relative h-full border-b border-white/5"
                    style={{ width: contentW }}
                    onPointerDown={(e) => {
                      if (e.target === e.currentTarget) setSelection(null);
                    }}
                  >
                    {clips.map((c, i) => {
                      const w = Math.max(2, used(c) * pps); // exact time width — playhead trust depends on it
                      const handleW = Math.min(8, Math.max(3, w / 4));
                      const isSel = selection?.type === "clip" && selection.id === c.id;
                      const isDragging = dragClipId === c.id;
                      return (
                        <div
                          key={c.id}
                          onPointerDown={(e) => startClipDrag(e, c.id)}
                          tabIndex={0}
                          onFocus={() => setSelection({ type: "clip", id: c.id })}
                          role="button"
                          aria-label={`${clipLabel(c)}, ${used(c).toFixed(1)} seconds`}
                          className={`absolute cursor-grab touch-none overflow-hidden rounded-lg border active:cursor-grabbing ${focusRing} ${
                            isSel
                              ? "border-[rgba(255,77,61,0.65)] shadow-[0_0_16px_rgba(255,77,61,0.18)]"
                              : "border-fuchsia-400/40"
                          } bg-fuchsia-500/10 ${isDragging ? "z-20 opacity-75" : ""}`}
                          style={{
                            left: starts[i] * pps,
                            top: 6,
                            width: w,
                            height: V1_H,
                            transform: isDragging ? `translateX(${dragDx}px)` : undefined,
                          }}
                        >
                          <Filmstrip url={fUrl(c.url)} in_s={c.in_s} out_s={c.out_s} width={w} height={V1_H} />
                          {/* labels over the strip */}
                          <span className="pointer-events-none absolute left-1.5 top-1 max-w-[calc(100%-12px)] truncate text-[10px] font-medium text-text-primary drop-shadow">
                            {clipLabel(c)} {c.voice_lock ? "🔒" : ""}
                          </span>
                          <span className="pointer-events-none absolute bottom-1 left-1.5 text-[9px] tabular-nums text-text-secondary drop-shadow">
                            {c.in_s.toFixed(1)}–{c.out_s.toFixed(1)}s · {used(c).toFixed(1)}s
                          </span>
                          {!!c.alternates?.length && (
                            <span className="pointer-events-none absolute bottom-1 right-1.5 rounded bg-fuchsia-500/40 px-1 text-[9px]">
                              {(c.alternates.length + 1)} takes
                            </span>
                          )}
                          {/* trim handles */}
                          <div
                            data-handle="in"
                            onPointerDown={(e) => startTrim(e, c.id, "in")}
                            title="Drag to trim start"
                            style={{ width: handleW }}
                            className="absolute bottom-0 left-0 top-0 cursor-ew-resize touch-none rounded-l-lg bg-white/10 hover:bg-[rgba(255,107,61,0.55)]"
                          />
                          <div
                            data-handle="out"
                            onPointerDown={(e) => startTrim(e, c.id, "out")}
                            title="Drag to trim end"
                            style={{ width: handleW }}
                            className="absolute bottom-0 right-0 top-0 cursor-ew-resize touch-none rounded-r-lg bg-white/10 hover:bg-[rgba(255,61,110,0.55)]"
                          />
                        </div>
                      );
                    })}
                    {/* insertion marker */}
                    {dragInsert !== null && (
                      <div
                        className="pointer-events-none absolute bottom-1 top-1 z-30 w-0.5 rounded bg-accent"
                        style={{
                          left: (dragInsert >= clips.length ? total : (starts[dragInsert] ?? 0)) * pps - 1,
                        }}
                      />
                    )}
                    {!clips.length && (
                      <span className="absolute inset-0 flex items-center px-3 text-[11px] text-text-muted">
                        empty lane — click or drag clips from the media bin
                      </span>
                    )}
                  </div>
                </div>

                {/* A1 — voice lane */}
                <div className="flex" style={{ height: A1_H + 12 }}>
                  <div className="sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-1 border-r border-white/5 bg-surface-1 px-2 py-1" style={{ width: GUTTER }}>
                    <span className="label-cap">A1</span>
                    <select
                      value={narrationPath}
                      onChange={(e) => {
                        setNarrationPath(e.target.value);
                        setVoiceDur(null);
                        setSelection(e.target.value ? { type: "voice" } : null);
                      }}
                      title="Voice track source"
                      aria-label="Voice track source"
                      className={`input-well w-full rounded px-1 py-0.5 text-[9px] ${focusRing}`}
                    >
                      <option value="">clips&apos; own</option>
                      {audioAssets.map((a) => (
                        <option key={a.path} value={a.path}>
                          🎙 {a.name}
                        </option>
                      ))}
                    </select>
                    {narrationPath && (
                      <label className="flex items-center gap-1 text-[9px] text-text-muted">
                        gain
                        <input
                          type="number"
                          min={0.4}
                          max={2}
                          step={0.1}
                          value={gainStr}
                          onChange={(e) => {
                            setGainStr(e.target.value);
                            const n = parseFloat(e.target.value);
                            if (Number.isFinite(n)) setGain(Math.max(0.4, Math.min(2, n)));
                          }}
                          onBlur={() => setGainStr(gain.toFixed(1))}
                          className={`input-well w-11 rounded px-1 py-0.5 text-[9px] ${focusRing}`}
                          aria-label="Voice gain"
                        />
                      </label>
                    )}
                  </div>
                  <div className="relative" style={{ width: contentW, paddingTop: 6, paddingBottom: 6 }}>
                    {narrationPath ? (
                      <div
                        onPointerDown={startVoiceDrag}
                        role="button"
                        tabIndex={0}
                        onFocus={() => setSelection({ type: "voice" })}
                        aria-label={`Voice track, offset ${voiceOffset.toFixed(1)} seconds — drag to nudge`}
                        title="Drag to nudge the voice (snap 0.1s · Shift = fine)"
                        className={`absolute cursor-grab touch-none overflow-hidden rounded-lg border active:cursor-grabbing ${focusRing} ${
                          selection?.type === "voice"
                            ? "border-[rgba(94,234,212,0.7)] shadow-[0_0_16px_rgba(94,234,212,0.15)]"
                            : "border-teal-400/40"
                        } bg-teal-500/10`}
                        style={{
                          left: voiceOffset * pps,
                          width: Math.max(40, (voiceDur ?? Math.max(total, 4)) * pps),
                          height: A1_H,
                        }}
                      >
                        <Waveform
                          url={narrationUrl}
                          width={Math.max(40, Math.round((voiceDur ?? Math.max(total, 4)) * pps))}
                          height={A1_H}
                          onDuration={(d) => setVoiceDur(d)}
                        />
                        <span className="pointer-events-none absolute left-1.5 top-1 max-w-[70%] truncate text-[9px] text-teal-200 drop-shadow">
                          🎙 {audioAssets.find((a) => a.path === narrationPath)?.name ?? "voice"}
                        </span>
                        {voiceOffset > 0.001 && (
                          <span className="pointer-events-none absolute right-1.5 top-1 rounded bg-teal-500/25 px-1 text-[9px] tabular-nums text-teal-200">
                            +{voiceOffset.toFixed(1)}s
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex h-full items-center px-3">
                        <span className="text-[10px] italic text-text-muted">
                          no voice track — using each clip&apos;s own audio
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= media bin drawer (<1100px) ================= */}
      {binOpen && !wide && (
        <div className="fixed inset-0 z-50" role="dialog" aria-label="Media bin">
          <div className="absolute inset-0 bg-black/60" onClick={() => setBinOpen(false)} />
          <aside className="card-raised absolute bottom-0 left-0 top-0 flex w-72 flex-col rounded-r-card">
            <button
              onClick={() => setBinOpen(false)}
              className={`seg absolute right-2 top-2 rounded px-2 py-1 text-xs ${focusRing}`}
              aria-label="Close media bin"
            >
              ✕
            </button>
            {binBody}
          </aside>
        </div>
      )}
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
