"use client";

// Timeline — NLE-style editor (client problem #3). Time is spatial: clip width =
// duration × zoom, trims are edge-drags, the voice block slides in its own lane.
// Layout: top bar / (media bin | monitor) / timeline lanes. Everything stays
// FFmpeg-only on export — trimming mutates in/out, never the source.
// Opens from any Library video ("Open in Timeline") via ?video=, or builds from
// the media bin. ⌖ keeps the cinematic center-cut default (~2.2s middle).

import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, GenerateRequest, Job, OutputItem, PlanApproach, StillItem, Voice } from "@/lib/api";

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

// ---- Projects (virtual folders) -------------------------------------------
// Each project is its own workspace: its cut, its Director conversation, and its
// media (the bin filters to the active project's tag). Nothing lives on the
// backend disk differently — a project just tags the names of everything it
// generates with its id, so the bin can show "only this project's media".
const PROJECTS_KEY = "tl.projects";
const ACTIVE_KEY = "tl.activeProject";
type Project = { id: string; name: string; created: number };

function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const l = JSON.parse(window.localStorage.getItem(PROJECTS_KEY) ?? "[]");
    return Array.isArray(l) ? (l as Project[]) : [];
  } catch {
    return [];
  }
}
function saveProjects(list: Project[]): void {
  try {
    window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
  } catch {
    /* best effort */
  }
}
function newProjectId(): string {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
// Resolve (and lazily create) the active project. On first run it adopts any
// existing un-namespaced draft/chat as "Untitled project" so a live session is
// never lost when the project system lands.
function getActivePid(): string {
  if (typeof window === "undefined") return "p0";
  try {
    let list = loadProjects();
    if (!list.length) {
      const id = newProjectId();
      list = [{ id, name: "Untitled project", created: Date.now() }];
      saveProjects(list);
      const legacyDraft = window.localStorage.getItem("tl.project");
      const legacyChat = window.localStorage.getItem("tl.chat");
      if (legacyDraft) window.localStorage.setItem(`tl.project.${id}`, legacyDraft);
      if (legacyChat) window.localStorage.setItem(`tl.chat.${id}`, legacyChat);
      window.localStorage.setItem(ACTIVE_KEY, id);
      return id;
    }
    let active = window.localStorage.getItem(ACTIVE_KEY) || "";
    if (!active || !list.some((p) => p.id === active)) {
      active = list[0].id;
      window.localStorage.setItem(ACTIVE_KEY, active);
    }
    return active;
  } catch {
    return "p0";
  }
}
const draftKeyFor = (pid: string) => `tl.project.${pid}`;
const chatKeyFor = (pid: string) => `tl.chat.${pid}`;

// The current project autosaves here (like the other studio pages) so leaving
// for Library/Create and coming back restores the cut exactly. Keyed per project.
type Draft = {
  v: 1;
  sourceVideo: string | null;
  loadedFrom: string | null;
  clips: TClip[];
  audioAssets: TAudio[];
  narrationPath: string;
  voiceOffset: number;
  voiceIn: number;
  voiceOut: number | null;
  gain: number;
  name: string;
  pps: number;
  voiceScript?: string | null; // pasted script — synthesized (TTS) at export
  voiceLang?: string;
};
function readDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const d = JSON.parse(window.localStorage.getItem(draftKeyFor(getActivePid())) ?? "null");
    return d && d.v === 1 && Array.isArray(d.clips) ? (d as Draft) : null;
  } catch {
    return null;
  }
}

// Director rail messages are TYPED — pitch cards, edit receipts and live
// progress render as real components, not prose (the console, not a chatbot).
type StillsParams =
  | { type: "variants"; portrait: string; emotions: string[]; name: string }
  | { type: "set"; scenes: string[]; character_image?: string; product_image?: string; name: string }
  | { type: "portrait"; description: string; name: string; subject?: "person" | "product" }; // from-scratch hero still (person=headshot, product=packshot)

type ChatMsg =
  | { kind: "text"; role: "user" | "assistant"; text: string }
  | { kind: "receipt"; items: string[] }
  | { kind: "treatments"; approaches: PlanApproach[]; language: string }
  | { kind: "progress"; jobId: string }
  | { kind: "stills"; jobId: string; title: string; params: StillsParams }
  | { kind: "questions" } // renders the ACTIVE intake card (state lives in `intake`)
  | { kind: "assetask"; title: string; needs: string[]; description: string; isProduct: boolean; canGenerate: boolean; subject: "person" | "product" }; // gate card: ⚡ generate (person) and/or 📎 upload (product/UI are upload-only — brand law); a mixed card offers BOTH

type Intake = {
  idea: string;
  language: string;
  format: string;
  duration_s: number;
  questions: { key: string; ask: string; placeholder: string; chips: string[] }[];
  answers: Record<string, string>;
};

type ChatJobState = {
  progress: number;
  detail: string;
  warnings: string[];
  status: string;
  video: string | null;
  images?: string[]; // keyframe jobs: preview URLs for the approval grid
  paths?: string[]; // …and their server paths (what i2v segments consume)
};

// Non-Latin titles slug to nothing and refires would overwrite the same
// -final.mp4 — always yield a non-empty, per-fire-unique name. (Module scope:
// called from event handlers only, never during render.)
// module scope: called from event handlers only, never during render
function freshSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function slugName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36);
  return `${slug || "chat-ad"}-${Date.now().toString(36).slice(-4)}`;
}

// Person vs product/object — decides whether a from-scratch still is framed as a
// human headshot or a studio packshot. "a pizza box" must never become a face.
// A person mention wins (a person holding a product is still a portrait).
const PERSON_HINT =
  /\b(man|woman|men|women|person|people|boy|girl|guy|lady|male|female|human|model|spokes\w*|shopkeeper|owner|customer|actor|founder|worker|farmer|child|kid|teen|elderly|gentleman|businessman|businesswoman|face|portrait of)\b/i;
const PRODUCT_HINT =
  /\b(pizza|box|bottle|can|cup|jar|packet|pack|package|packaging|product|food|dish|burger|drink|beverage|snack|meal|plate|bowl|carton|tube|sachet|wrapper|gadget|device|phone|shoe|bag|cosmetic|cream|tin|pouch|container|hamper|packshot)\b/i;
// Assets that can only ever be UPLOADS (generating them garbles): real branded
// product pixels, plus app UI / screen recordings / mockups the ad must show.
const UPLOAD_ONLY_NEED =
  /\bproduct|pack(age|aging)|label|logo|box\b|mockup|screen ?rec|screenshot|screen ?grab|app ui|ui\b|footage|banner\b/i;
// A need we CAN generate: a person/portrait/expression. A card may carry both a
// person need AND an upload-only need (e.g. "hero portrait" + "product photo of
// the app UI") — those aren't mutually exclusive, so the gate offers Generate
// for the person and Upload for the product, instead of hiding Generate whenever
// any product need is present.
const GEN_PERSON_NEED =
  /\b(portrait|hero|headshot|face|character|protagonist|person|people|variants?|expressions?|actor|model|spokes\w*|man|woman|owner|shopkeeper|founder|customer)\b/i;
function classifySubject(text: string): "person" | "product" {
  const t = text || "";
  if (PERSON_HINT.test(t)) return "person";
  if (PRODUCT_HINT.test(t)) return "product";
  return "person"; // portraits are the common case — default preserves behavior
}

// Hydration gate helper: true on the client after hydration, false during the
// server render AND the hydration pass — so both trees match even though the
// real state comes from localStorage drafts.
const noopSubscribe = () => () => {};

const WELCOME_MSG: ChatMsg = {
  kind: "text",
  role: "assistant",
  text: "Director here. Tell me what to change, or brief me a new ad.",
};

// ---- Session Memory -------------------------------------------------------
// What the conversation is ABOUT, as opposed to what the timeline currently holds.
// The Director used to get only editor state (clips, voice track, filenames) plus a
// list of treatment TITLES, so it could not answer "render it" without asking which
// plan, and it never learned that a product photo had been handed over. This object
// is written by the flow, read by the brain (shipped first in CONTEXT) and read by
// the render path (assets carry a ROLE, so a product photo is actually used).
// "ui" is deliberately NOT "product": a screen recording or app mockup must never
// be animated as an i2v product beat (I2V_PRESERVE on a UI screenshot produces a
// drifting screenshot, not a shot). It is an insert, and only "product" anchors i2v.
type AssetRole = "product" | "ui" | "portrait" | "reference";
type SessionAsset = {
  path: string;
  name: string;
  role: AssetRole;
  source: "upload" | "generated";
  approved: boolean;
};
type SessionMemory = {
  brief: { idea: string; language: string; format: string; duration_s: number } | null;
  approach: {
    focused: boolean;     // selected in the UI but not rendered yet — still "this"
    index: number;        // 1-based, so the brain can fire generate_approach
    title: string;
    pipeline: string;
    shots: string[];      // gists, for "one more like shot 3"
    script: string;
    anchor: string;       // shot 1's prompt VERBATIM — the frozen character/setting/look
    negative: string;     // the canonical negative block, reused by render_shot
  } | null;
  assets: SessionAsset[];
  renders: { job: string; title: string; video: string | null }[];
  voice: { voice_id: string; name: string; language: string } | null;
  cast: string[];   // saved character ids — the EXISTING inject_cast anchor system
};
const EMPTY_SESSION: SessionMemory = {
  brief: null, approach: null, assets: [], renders: [], voice: null, cast: [],
};

// Infer what an image is FOR from how it was described/named. Role drives whether a
// photo can anchor a product beat — brand law: real product pixels must be uploads.
// Classify from the FILE's own name only. An earlier version folded the plan's
// needs_from_user into this hint, so one treatment mentioning "app UI" re-labelled
// EVERY upload as a product — including faces.
function assetRole(hint: string): AssetRole {
  // screens first: "app ui mockup" also contains no product word, but "ui" used to
  // fall into the product bucket and get wired into an i2v beat
  if (/\bui\b|mockup|screen[ _-]?(shot|grab|record|cap)|app[ _-]?screen|interface|dashboard|footage/i.test(hint)) return "ui";
  if (/product|pack(age|aging)|label|logo|box\b|bottle|can\b|jar|packet|pouch|sachet|tube|carton|wrapper|packshot/i.test(hint)) return "product";
  if (/portrait|face|hero|character|person|man|woman|actor|model|selfie|headshot/i.test(hint)) return "portrait";
  return "reference";
}

// Planner drift guard, mirrored from create/page.tsx adopt(): only these four
// pipelines are valid inside a sequence segment.
function segPipeline(p: string): "overlay" | "cinematic" | "product" | "lipsync" {
  if (["overlay", "cinematic", "product", "lipsync"].includes(p)) {
    return p as "overlay" | "cinematic" | "product" | "lipsync";
  }
  return p === "longcat" ? "lipsync" : "cinematic";
}

// The Director conversation persists like the cut does — a refresh must never
// eat treatments, approvals, or a render's progress card.
type ChatPersist = {
  v: 1;
  msgs: ChatMsg[];
  jobs: Record<string, ChatJobState>;
  lastPlan: { approaches: PlanApproach[]; language: string } | null;
  approved: string[];
  session?: SessionMemory;
};
function readChat(): ChatPersist | null {
  if (typeof window === "undefined") return null;
  try {
    const d = JSON.parse(window.localStorage.getItem(chatKeyFor(getActivePid())) ?? "null");
    return d && d.v === 1 && Array.isArray(d.msgs) ? (d as ChatPersist) : null;
  } catch {
    return null;
  }
}

function readPanelW(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const saved = Number(window.localStorage.getItem(key));
  return saved >= min && saved <= max ? saved : fallback;
}

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
    if (audioCache.size >= 24) audioCache.delete(audioCache.keys().next().value as string);
    audioCache.set(url, p);
  }
  return p;
}

function Waveform({
  url, width, height, fromS, toS, onDuration,
}: {
  url: string; width: number; height: number;
  fromS?: number; toS?: number; // draw only this window of the file (trims)
  onDuration?: (d: number) => void;
}) {
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
        const f0 = Math.max(0, Math.min(fromS ?? 0, duration));
        const f1 = Math.max(f0 + 0.01, Math.min(toS ?? duration, duration));
        const i0 = Math.floor((f0 / duration) * data.length);
        const span = Math.max(1, Math.floor(((f1 - f0) / duration) * data.length));
        const step = Math.max(1, Math.floor(span / width));
        for (let x = 0; x < width; x++) {
          let min = 1, max = -1;
          for (let i = i0 + x * step; i < i0 + (x + 1) * step && i < data.length; i += 24) {
            const v = data[i];
            if (v < min) min = v;
            if (v > max) max = v;
          }
          const mid = height / 2;
          c.fillRect(x, mid + min * mid, 1, Math.max(1, (max - min) * mid));
        }
      } catch {
        /* waveform is decorative — failures stay silent (e.g. silent Wan clips) */
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, width, height, fromS, toS]);
  return <canvas ref={ref} className="h-full w-full" />;
}

/* ================================ the editor ================================ */

function TimelineStudio() {
  const params = useSearchParams();
  const router = useRouter();
  const sourceVideo = params.get("video");
  // Draft-restored state (cut totals, panel widths…) can't match the server's
  // defaults — render a bare shell for the hydration pass, real UI right after.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // restore the saved project — unless a DIFFERENT video was deep-linked
  // (this subtree renders client-side only via the Suspense/useSearchParams
  // bailout, so reading localStorage in initializers is hydration-safe)
  // Active project (virtual folder). Read once; switching persists + reloads so
  // every initializer re-reads the target project's keys with a clean slate.
  const [activePid] = useState(getActivePid);
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [showAllMedia, setShowAllMedia] = useState(false); // media bin: this project vs everything
  const [projMenuOpen, setProjMenuOpen] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [renamingPid, setRenamingPid] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const activeProject = projects.find((p) => p.id === activePid) ?? projects[0];
  const isDefaultProject = projects[0]?.id === activePid; // absorbs legacy/untagged media

  const [draft] = useState(readDraft);
  const useDraft =
    !!draft &&
    (!sourceVideo || draft.sourceVideo === sourceVideo) &&
    (draft.clips.length > 0 || !!draft.narrationPath || !!draft.name);

  const [clips, setClips] = useState<TClip[]>(() =>
    useDraft ? draft!.clips.map((c) => ({ ...c, id: newId() })) : [],
  );
  const [pool, setPool] = useState<OutputItem[]>([]);
  const [poolFilter, setPoolFilter] = useState("");
  const [audioAssets, setAudioAssets] = useState<TAudio[]>(() => (useDraft ? draft!.audioAssets : []));
  const [narrationPath, setNarrationPath] = useState(() => (useDraft ? draft!.narrationPath : ""));
  const [voiceOffset, setVoiceOffset] = useState(() => (useDraft ? draft!.voiceOffset : 0)); // seconds
  const [voiceDur, setVoiceDur] = useState<number | null>(null);
  const [voiceIn, setVoiceIn] = useState(() => (useDraft ? draft!.voiceIn : 0)); // trim window WITHIN the voice file
  const [voiceOut, setVoiceOut] = useState<number | null>(() => (useDraft ? draft!.voiceOut : null));
  const [voiceScript, setVoiceScript] = useState<string | null>(() => (useDraft ? draft!.voiceScript ?? null : null));
  const [voiceLang, setVoiceLang] = useState(() => (useDraft ? draft!.voiceLang ?? "hi" : "hi"));
  const [rangeIn, setRangeIn] = useState<number | null>(null); // I/O marks on the ruler
  const [rangeOut, setRangeOut] = useState<number | null>(null);
  const [gain, setGain] = useState(() => (useDraft ? draft!.gain : 1.0));
  const [gainStr, setGainStr] = useState(() => (useDraft ? draft!.gain.toFixed(1) : "1.0")); // draft — clamp on commit
  const [name, setName] = useState(() => (useDraft ? draft!.name : ""));
  const [loadedFrom, setLoadedFrom] = useState<string | null>(() => (useDraft ? draft!.loadedFrom : null));
  const projectVideoRef = useRef<string | null>(sourceVideo ?? (useDraft ? draft!.sourceVideo : null));
  const [binOpen, setBinOpen] = useState(false); // narrow-viewport drawer
  const [binW, setBinW] = useState(() => {
    // user-resizable media bin — remembered per browser
    if (typeof window === "undefined") return 250;
    const saved = Number(window.localStorage.getItem("tl.binW"));
    return saved >= 180 && saved <= 480 ? saved : 250;
  });
  const binWRef = useRef(binW);
  const [wide, setWide] = useState(true); // ≥1101px column vs drawer — one mount, never both
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1101px)");
    const f = () => setWide(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);

  const [selection, setSelection] = useState<Selection>(null);
  const [pps, setPps] = useState(() => (useDraft ? draft!.pps : DEFAULT_PPS));
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

  // ----- Director rail (the "talk to your editor" console) -----
  const [chatBoot] = useState(readChat); // restored conversation, if any
  const [chatOpen, setChatOpen] = useState(true);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>(() =>
    chatBoot?.msgs?.length ? chatBoot.msgs : [WELCOME_MSG],
  );
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatJobId, setChatJobId] = useState<string | null>(null);
  // 🎙 post-render narration: after a render lands, lay a voiceover over it,
  // auto-fit to the video's length (/revoice). narrateFor = the render job whose
  // composer is open; renderMetaRef remembers each render's plan script + language
  // so the box can prefill the ad's own narration.
  const [narrateFor, setNarrateFor] = useState<string | null>(null);
  const [narrateText, setNarrateText] = useState("");
  const renderMetaRef = useRef<Record<string, { script: string; language: string }>>({});
  // When a treatment is coerced into a sequence to honour a product photo, the
  // job-level script is ignored by sequence mode — stash it here and lay it on with
  // the fit-to-length revoice once the render lands, so the ad is never silent.
  const pendingNarrationRef = useRef("");
  // fit job -> the clip id it is repairing, so the trimmed file can replace the old
  // one on the timeline the moment it lands (otherwise "fix the audio" succeeds but
  // the user is still looking at the broken cut).
  const fitJobsRef = useRef<Record<string, string>>({});
  const [chatJobs, setChatJobs] = useState<Record<string, ChatJobState>>(() => chatBoot?.jobs ?? {});
  // live mirror so op handlers can check "is a render already rolling?" without
  // reading stale state captured when sendChat started (the double-render guard).
  const chatJobsRef = useRef(chatJobs);
  useEffect(() => { chatJobsRef.current = chatJobs; }, [chatJobs]);
  // 🧠 Session Memory — what this conversation is about. Ref-mirrored because op
  // handlers run inside async callbacks that captured stale state.
  const [session, setSession] = useState<SessionMemory>(() => ({ ...EMPTY_SESSION, ...(chatBoot?.session ?? {}) }));
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { chatMsgsRef.current = chatMsgs; }, [chatMsgs]);
  // Chat messages hold the (possibly EDITED) plan — op handlers must read this, not
  // lastPlanRef, or "make 2" typed in chat would render the planner's original after
  // a refresh split the two copies apart.
  const chatMsgsRef = useRef<ChatMsg[]>([]);
  const patchSession = (p: Partial<SessionMemory>) => setSession((s) => ({ ...s, ...p }));
  // Voice roster — the Director can only pick a voice by NAME if it knows the names
  // (an LLM will happily invent a 20-char ElevenLabs id, which fails at render time).
  // /voices degrades to the server default rather than erroring, so this is safe.
  const [voices, setVoices] = useState<Voice[]>([]);
  // Saved Characters carry a verbatim `anchor` the backend injects into EVERY shot
  // (inject_cast). The Create page has always used it; the Director never did — so
  // a cast the user saved simply did not reach the ad. Wire it here rather than
  // deriving a second, parallel anchor scheme.
  const [cast, setCast] = useState<{ id: string; name: string; anchor: string }[]>([]);
  useEffect(() => {
    api.voices().then((d) => setVoices(d.voices ?? [])).catch(() => setVoices([]));
    api.characters()
      .then((d) => setCast((d.characters ?? []).map((c) => ({ id: c.id, name: c.name, anchor: c.anchor }))))
      .catch(() => setCast([]));
  }, []);
  // Remember an image AND what it's for. Re-recording the same path updates its
  // role/approval instead of duplicating it.
  const rememberAsset = (a: SessionAsset) =>
    setSession((s) => {
      const rest = s.assets.filter((x) => x.path !== a.path);
      return { ...s, assets: [...rest, a].slice(-24) };
    });
  const [dirW, setDirW] = useState(() => readPanelW("tl.dirW", 320, 260, 460));
  const dirWRef = useRef(dirW);
  const [undoAvailable, setUndoAvailable] = useState(false);
  // stills-first: reference stills for keyframe ops + the approval set the
  // director brain can build shots around (paths flow into i2v segments)
  const [stills, setStills] = useState<StillItem[]>([]);
  const stillsRef = useRef<StillItem[]>([]);
  const [approvedStills, setApprovedStills] = useState<string[]>(() => chatBoot?.approved ?? []);
  const approvedRef = useRef<string[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  useEffect(() => {
    stillsRef.current = stills;
    approvedRef.current = approvedStills;
  }, [stills, approvedStills]);
  const undoRef = useRef<{
    clips: TClip[]; vPath: string; vOff: number; vIn: number; vOut: number | null; vGain: number;
    vScript: string | null; vLang: string;
  } | null>(null);
  const lastPlanRef = useRef<{ approaches: PlanApproach[]; language: string } | null>(chatBoot?.lastPlan ?? null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatBoxRef = useRef<HTMLTextAreaElement>(null);
  // auto-grow the director box so long pasted prompts stay visible (up to
  // max-h, then it scrolls) — runs for typing AND chip-filled input alike
  useEffect(() => {
    const el = chatBoxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [chatInput]);
  const [intake, setIntake] = useState<Intake | null>(null);

  // 📎 attach a photo (product / face / portrait) — lands in the stills library
  // so the brain can reference it by name in keyframes/portrait ops
  const onChatUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    postChat("assistant", `📎 uploading ${f.name}…`);
    try {
      const { path, url } = await api.uploadAsset(f);
      setStills((s) => [
        { path, url, name: f.name, kind: "face", size_bytes: f.size, modified: Date.now() / 1000 } as StillItem,
        ...s,
      ]);
      // 🧠 Record it in the session WITH A ROLE. Uploads used to land only in the
      // stills library, which the render path never reads — the reason an uploaded
      // product photo was asked for and then never used. Role is inferred from the
      // filename plus whatever the plan said it needed, and an upload counts as
      // approved immediately: real product pixels outrank generated ones (brand law).
      const role = assetRole(f.name);
      rememberAsset({ path, name: f.name, role, source: "upload", approved: true });
      postChat(
        "assistant",
        role === "product"
          ? `📎 Got ${f.name} — filed as the product photo. It'll anchor the product shot when you render.`
          : role === "ui"
            ? `📎 Got ${f.name} — filed as a screen/UI insert. Say "cut it in after scene 2" to place it (it won't be animated as a product shot).`
            : `📎 Got ${f.name}. Say how to use it — "use ${f.name} as the product photo", "make emotion variants of it", or "keyframe her holding ${f.name}".`,
      );
    } catch (err) {
      postChat("assistant", `❌ upload failed: ${String(err).slice(0, 140)}`);
    }
  };

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
  const voiceInRef = useRef(voiceIn);
  const voiceOutRef = useRef(voiceOut);
  useEffect(() => {
    clipsRef.current = clips;
    startsRef.current = starts;
    totalRef.current = total;
    narrationRef.current = narrationPath;
    offsetRef.current = voiceOffset;
    voiceDurRef.current = voiceDur;
    voiceInRef.current = voiceIn;
    voiceOutRef.current = voiceOut;
  }, [clips, starts, total, narrationPath, voiceOffset, voiceDur, voiceIn, voiceOut]);

  const activeIdRef = useRef<string | null>(null); // by id — indexes go stale when clips mutate
  const srcRef = useRef<string | null>(null);
  const pendingRef = useRef<{ local: number; play: boolean } | null>(null);
  const rafRef = useRef(0);

  /* ----- data loading ----- */
  useEffect(() => {
    // bin shows raw clips AND rendered finals (an exported cut is footage too —
    // reusable in a later timeline, e.g. as a B-roll insert or reference take).
    api.outputs().then((d) => setPool(d.outputs)).catch(() => {});
    api.stills().then((d) => setStills(d.stills)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sourceVideo) return;
    if (useDraft && draft?.sourceVideo === sourceVideo) return; // restored draft wins — keep its trims
    api
      .renderAssets(sourceVideo)
      .then((d) => {
        projectVideoRef.current = sourceVideo;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceVideo]);

  // autosave the project (debounced) — navigating to another section and back
  // restores the cut exactly; ✕ in the top bar discards it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      try {
        const d: Draft = {
          v: 1,
          sourceVideo: projectVideoRef.current,
          loadedFrom,
          clips,
          audioAssets,
          narrationPath,
          voiceOffset,
          voiceIn,
          voiceOut,
          gain,
          name,
          pps,
          voiceScript,
          voiceLang,
        };
        window.localStorage.setItem(draftKeyFor(activePid), JSON.stringify(d));
      } catch {
        /* quota / private mode — autosave is best-effort */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [clips, audioAssets, narrationPath, voiceOffset, voiceIn, voiceOut, gain, name, pps, loadedFrom, voiceScript, voiceLang]);

  // persist the Director conversation (debounced) — refresh-proof like the cut
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(chatKeyFor(activePid), JSON.stringify({
          v: 1,
          msgs: chatMsgs,
          jobs: chatJobs,
          session,
          lastPlan: lastPlanRef.current,
          approved: approvedStills,
        } satisfies ChatPersist));
      } catch {
        /* quota / private mode — best effort */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [chatMsgs, chatJobs, approvedStills, session]);

  // ✕ close project: clear the timeline + its saved draft (sources untouched).
  // Confirmation is an in-app dialog (never the browser's native alert).
  const [confirmClose, setConfirmClose] = useState(false);
  const doCloseProject = () => {
    setConfirmClose(false);
    stopPlayback();
    try {
      window.localStorage.removeItem(draftKeyFor(activePid));
    } catch {
      /* ignore */
    }
    if (sourceVideo) {
      router.replace("/timeline"); // key change remounts the editor clean
      return;
    }
    setClips([]);
    setAudioAssets([]);
    setNarrationPath("");
    setVoiceOffset(0);
    setVoiceIn(0);
    setVoiceOut(null);
    setVoiceDur(null);
    setVoiceScript(null);
    setGain(1);
    setGainStr("1.0");
    setName("");
    setLoadedFrom(null);
    setSelection(null);
    setRangeIn(null);
    setRangeOut(null);
    setPlayT(0);
    playTRef.current = 0;
    setJobId(null);
    setJob(null);
    setError(null);
    setShowResult(false);
    projectVideoRef.current = null;
    srcRef.current = null;
    activeIdRef.current = null;
    pendingRef.current = null;
    videoRef.current?.removeAttribute("src");
    // the conversation is project-scoped — close clears it too
    setChatMsgs([WELCOME_MSG]);
    setChatJobs({});
    setApprovedStills([]);
    setSession(EMPTY_SESSION); // closing the project forgets what it was about
    lastPlanRef.current = null;
    try {
      window.localStorage.removeItem(chatKeyFor(activePid));
    } catch {
      /* ignore */
    }
  };

  // Every generated/rendered name is tagged with the project id so the media bin
  // can show "only this project's media". Underscores survive the backend's
  // name->filename path, so `<pid>__<slug>-<ts>` is a stable per-project key.
  const pname = (title: string) => `${activePid}__${slugName(title)}`;

  // ---- Project switching -----------------------------------------------------
  // Flush the CURRENT project synchronously (autosave is debounced), then reload
  // so every initializer re-reads the target project's keys from scratch. A hard
  // reload is the clean way to swap a workspace this stateful.
  const saveCurrentProject = () => {
    try {
      const d: Draft = {
        v: 1, sourceVideo: projectVideoRef.current, loadedFrom, clips, audioAssets,
        narrationPath, voiceOffset, voiceIn, voiceOut, gain, name, pps, voiceScript, voiceLang,
      };
      window.localStorage.setItem(draftKeyFor(activePid), JSON.stringify(d));
      window.localStorage.setItem(chatKeyFor(activePid), JSON.stringify({
        v: 1, msgs: chatMsgs, jobs: chatJobs, lastPlan: lastPlanRef.current, approved: approvedStills, session,
      } satisfies ChatPersist));
    } catch {
      /* best effort */
    }
  };
  const switchProject = (pid: string) => {
    if (pid === activePid) { setProjMenuOpen(false); return; }
    saveCurrentProject();
    try { window.localStorage.setItem(ACTIVE_KEY, pid); } catch { /* ignore */ }
    window.location.href = "/timeline"; // clean remount into the target project
  };
  const createProject = () => {
    const nm = newProjName.trim() || "Untitled project";
    saveCurrentProject();
    const id = newProjectId();
    const next = [...projects, { id, name: nm.slice(0, 60), created: Date.now() }];
    saveProjects(next);
    try { window.localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ }
    window.location.href = "/timeline"; // new project = empty cut + fresh chat
  };
  const renameProject = (pid: string, nm: string) => {
    const next = projects.map((p) => (p.id === pid ? { ...p, name: nm.slice(0, 60) || p.name } : p));
    setProjects(next);
    saveProjects(next);
  };
  const deleteProject = (pid: string) => {
    // wipe its saved workspace; never delete the last project
    if (projects.length <= 1) return;
    try {
      window.localStorage.removeItem(draftKeyFor(pid));
      window.localStorage.removeItem(chatKeyFor(pid));
    } catch { /* ignore */ }
    const next = projects.filter((p) => p.id !== pid);
    saveProjects(next);
    if (pid === activePid) {
      try { window.localStorage.setItem(ACTIVE_KEY, next[0].id); } catch { /* ignore */ }
      window.location.href = "/timeline";
    } else {
      setProjects(next);
    }
  };

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
    // the voice block plays file window [voiceIn, voiceOut] starting at `offset`
    const vIn = voiceInRef.current;
    const vOutEff = voiceOutRef.current ?? voiceDurRef.current ?? Infinity;
    const rel = t - offsetRef.current; // seconds into the trimmed voice
    const desired = vIn + rel;
    if (forcePause || rel < 0 || desired > vOutEff) {
      if (!a.paused) a.pause();
      if (rel >= 0 && desired <= vOutEff) a.currentTime = Math.max(0, desired);
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

  // ⌖ the cinematic center-cut: keep the middle ~2.2s (chat can vary it).
  const centerCut = (id: string, keepS = 2.2) => {
    const c = clips.find((x) => x.id === id);
    if (!c) return;
    const keep = Math.max(MIN_CLIP_S, Math.min(keepS, c.src));
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

  // Cut the marked I–O range out of the film: split at both boundaries across
  // whichever clips they land in, drop everything inside. Non-destructive —
  // only in/out windows change, sources are untouched.
  const rangeCut = (aIn?: number, bIn?: number) => {
    const ra = aIn ?? rangeIn, rb = bIn ?? rangeOut;
    if (ra === null || rb === null) return;
    const A = Math.min(ra, rb), B = Math.max(ra, rb);
    if (B - A < 0.05) return;
    setClips((cs) => {
      let s = 0;
      const next: TClip[] = [];
      for (const c of cs) {
        const d = used(c), c0 = s, c1 = s + d;
        s = c1;
        const oA = Math.max(A, c0), oB = Math.min(B, c1);
        if (oB <= oA + 1e-6) {
          next.push(c);
          continue;
        }
        const leftDur = oA - c0, rightDur = c1 - oB;
        if (leftDur >= MIN_CLIP_S) next.push({ ...c, id: newId(), out_s: +(c.in_s + leftDur).toFixed(3) });
        if (rightDur >= MIN_CLIP_S) next.push({ ...c, id: newId(), in_s: +(c.out_s - rightDur).toFixed(3) });
      }
      return next;
    });
    setRangeIn(null);
    setRangeOut(null);
    setSelection(null);
    requestAnimationFrame(() => setPlayhead(Math.min(A, totalRef.current)));
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

  // voice trim: drag the block's edges to cut seconds off the voice file
  // (left edge shaves the head — the block start follows the drag, DAW-style).
  const startVoiceTrim = (e: React.PointerEvent, edge: "in" | "out") => {
    e.stopPropagation();
    e.preventDefault();
    setSelection({ type: "voice" });
    const x0 = e.clientX;
    const origIn = voiceIn;
    const origOut = voiceOut ?? voiceDur ?? 0;
    const origOff = voiceOffset;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const d = (ev.clientX - x0) / ppsRef.current;
      if (edge === "in") {
        const nIn = Math.min(Math.max(0, origIn + d), Math.max(0.2, origOut - 0.2));
        setVoiceIn(+nIn.toFixed(2));
        setVoiceOffset(Math.max(0, +(origOff + (nIn - origIn)).toFixed(2)));
      } else {
        const cap = voiceDurRef.current ?? origOut;
        setVoiceOut(+Math.max(voiceInRef.current + 0.2, Math.min(cap, origOut + d)).toFixed(2));
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

  // user-resizable media bin — now docked RIGHT, so dragging its LEFT edge
  // leftwards grows it (persisted per browser)
  const startBinResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = binW;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const w = Math.max(180, Math.min(480, Math.round(w0 - (ev.clientX - x0))));
      binWRef.current = w;
      setBinW(w);
    };
    const end = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("lostpointercapture", end);
      try {
        window.localStorage.setItem("tl.binW", String(binWRef.current));
      } catch {
        /* private mode */
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
  };

  // user-resizable director rail (left dock — drag its right edge)
  const startDirResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = dirW;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const w = Math.max(260, Math.min(460, Math.round(w0 + (ev.clientX - x0))));
      dirWRef.current = w;
      setDirW(w);
    };
    const end = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("lostpointercapture", end);
      try {
        window.localStorage.setItem("tl.dirW", String(dirWRef.current));
      } catch {
        /* private mode */
      }
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

  /* ----- Director chat: intent -> local editor ops ----- */

  const postChat = (role: "user" | "assistant", text: string) =>
    setChatMsgs((m) => [...m.slice(-60), { kind: "text", role, text }]);
  // Treatment cards are exempt from the trim: they hold the plan (and any edits to
  // it), so evicting one silently discards work the user typed.
  const pushMsg = (msg: ChatMsg) =>
    setChatMsgs((m) => {
      if (m.length < 60) return [...m, msg];
      const keep = m.slice(-60);
      const rescued = m.slice(0, -60).filter((x) => x.kind === "treatments");
      return [...rescued, ...keep, msg];
    });

  // Selecting a treatment = opening or editing it. This is what gives "make this" /
  // "render it" a referent BEFORE anything has been rendered — previously
  // session.approach was only written on fire, so the brain had no choice but to ask
  // "which one?" every time.
  const focusApproach = (ap: PlanApproach, idx: number) => {
    if (sessionRef.current.approach?.title === ap.title) return; // already the one
    patchSession({
      approach: {
        focused: true,
        index: idx + 1,
        title: ap.title,
        pipeline: ap.pipeline,
        shots: (ap.segments ?? ap.shots ?? []).map((x) => String(x.prompt ?? "").slice(0, 140)),
        script: ap.narration_script || "",
        anchor: ap.segments?.[0]?.prompt ?? ap.shots?.[0]?.prompt ?? "",
        negative: ap.shots?.[0]?.negative_prompt ?? ap.segments?.[0]?.negative_prompt ?? "",
      },
    });
  };

  // ▶ Make this, safely. The shot/narration fields are uncontrolled and commit on
  // BLUR via setChatMsgs, which is async — so a click straight after typing used to
  // fire with the approach captured in this render's closure, i.e. the text BEFORE
  // the edit. Blur the active field first, then resolve the approach out of the
  // live message state on the next frame so the edit is definitely in.
  const fireApproachFresh = (mi: number, ai: number, language: string) => {
    (document.activeElement as HTMLElement | null)?.blur();
    requestAnimationFrame(() => {
      const msg = chatMsgsRef.current[mi];
      const ap = msg && msg.kind === "treatments" ? msg.approaches[ai] : null;
      if (ap) void fireApproach(ap, language);
    });
  };

  // ✎ Edit a planned approach in place. The treatments ChatMsg is the single source
  // of truth — and because the chat persist effect already depends on chatMsgs, every
  // edit auto-saves and survives a refresh with no extra storage.
  const updateApproach = (mi: number, ai: number, patch: Partial<PlanApproach>) =>
    setChatMsgs((ms) =>
      ms.map((m, idx) =>
        idx !== mi || m.kind !== "treatments"
          ? m
          : { ...m, approaches: m.approaches.map((a, k) => (k !== ai ? a : { ...a, ...patch })) },
      ),
    );

  // One-batch undo: sendChat snapshots before state-changing ops; the latest
  // receipt card carries ↩ until the next batch replaces the snapshot.
  const undoBatch = () => {
    const u = undoRef.current;
    if (!u) return;
    setClips(u.clips.map((c) => ({ ...c })));
    if (u.vPath !== narrationPath) setVoiceDur(null);
    setNarrationPath(u.vPath);
    setVoiceOffset(u.vOff);
    setVoiceIn(u.vIn);
    setVoiceOut(u.vOut);
    setGain(u.vGain);
    setGainStr(u.vGain.toFixed(1));
    setVoiceScript(u.vScript);
    setVoiceLang(u.vLang);
    undoRef.current = null;
    setUndoAvailable(false);
    postChat("assistant", "↩ Reverted that batch.");
  };

  const STATE_OPS = new Set([
    "trim", "center_cut", "reorder", "swap_take", "delete", "split", "range_cut",
    "voice_offset", "voice_trim", "voice_gain", "set_narration", "voice_script",
  ]);
  const describeOp = (op: Record<string, unknown>): string => {
    const label = (n: unknown) => {
      const i = Number(n);
      const c = Number.isFinite(i) ? clipsRef.current[Math.round(i) - 1] : undefined;
      return c ? clipLabel(c) : `clip ${n}`;
    };
    switch (op.op) {
      case "trim": return `✂ trim ${label(op.clip)}`;
      case "center_cut": return op.clip == null ? `⌖ all clips → ${op.seconds ?? 2.2}s` : `⌖ ${label(op.clip)} → ${op.seconds ?? 2.2}s`;
      case "reorder": return `↔ move ${op.from} → ${op.to}`;
      case "swap_take": return `🔁 ${label(op.clip)} → take ${op.take}`;
      case "delete": return `✕ remove ${label(op.clip)}`;
      case "split": return `✂ split at ${op.at_s}s`;
      case "range_cut": return `✕ cut ${op.start_s}–${op.end_s}s`;
      case "voice_offset": return `🎙 voice → +${op.seconds}s`;
      case "voice_trim": return `🎙 voice ✂ ${op.in_s ?? "…"}–${op.out_s ?? "…"}s`;
      case "voice_gain": return `🎙 gain ${op.gain}×`;
      case "set_narration": return op.name ? `🎙 voice: ${op.name}` : "🎙 clips' own audio";
      case "voice_script": return `📜 script VO (${String(op.script || "").trim().split(/\s+/).length} words, TTS at export)`;
      default: return String(op.op);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatMsgs.length]);

  // The most recently COMPLETED render/export in this conversation — captions
  // burn onto this file. Checks the manual Export job first, then scans chat
  // progress cards newest-first (a chat-fired render can be more recent).
  const findLastRenderedVideo = (): string | null => {
    if (job?.status === "done" && job.video_path) return job.video_path;
    for (let i = chatMsgs.length - 1; i >= 0; i--) {
      const m = chatMsgs[i];
      if (m.kind === "progress") {
        const j = chatJobs[m.jobId];
        if (j?.status === "done" && j.video) return j.video;
      }
    }
    return null;
  };

  const buildChatContext = () => ({
    // 🧠 SESSION FIRST — this is what the conversation is about, and llm.py gives it
    // its own truncation budget so a long clip list can never push it out of view.
    // Without this the brain saw only editor state plus treatment TITLES, so it had
    // to ask "which plan?" every turn and never knew a product photo existed.
    session: {
      brief: session.brief,
      approach: session.approach
        ? {
            index: session.approach.index,
            title: session.approach.title,
            pipeline: session.approach.pipeline,
            script: session.approach.script.slice(0, 600),
            shot_list: session.approach.shots.map((g, i) => `${i + 1}. ${g}`),
          }
        : null,
      // roles are what make these usable: "product" pixels anchor the product beat
      assets: session.assets.map((a) => ({
        name: a.name, role: a.role, source: a.source, approved: a.approved,
      })),
      renders: session.renders.map((r) => ({ title: r.title, done: !!r.video })),
      voice: session.voice,
      voices: voices.slice(0, 24).map((v) => v.name),
      // saved characters whose anchors the backend pastes into every shot
      cast: cast.map((c) => c.name),
    },
    clips: clips.map((c, i) => ({
      i: i + 1,
      label: clipLabel(c),
      src_s: +c.src.toFixed(1),
      in_s: c.in_s,
      out_s: c.out_s,
      takes: [c.take ?? 1, ...(c.alternates ?? []).map((a) => a.take)].sort(),
      voice_lock: c.voice_lock,
    })),
    voice: narrationPath
      ? {
          source: audioAssets.find((a) => a.path === narrationPath)?.name ?? narrationPath,
          offset_s: voiceOffset,
          in_s: voiceIn,
          out_s: voiceOut,
          gain,
          dur_s: voiceDur,
        }
      : voiceScript
        ? {
            source: "pasted script (TTS at export)",
            words: voiceScript.trim().split(/\s+/).length,
            language: voiceLang,
            offset_s: voiceOffset,
            gain,
          }
        : null,
    narration_files: audioAssets.map((a) => a.name),
    stills: stills.map((s) => s.name),
    approved_stills: approvedStills.map((p) => p.split("/").pop()),
    total_s: +total.toFixed(1),
    playhead_s: +playT.toFixed(1),
    last_plan: lastPlanRef.current
      ? lastPlanRef.current.approaches.map((a, i) => `${i + 1}. ${a.title} (${a.pipeline})`)
      : null,
    last_render: findLastRenderedVideo() ? "a completed render exists — captions can fire" : null,
  });

  // ⚡ from-scratch hero portrait: generated ONCE, ✓-approved, and then every
  // expression/variant is an EDIT of that exact file — the person can never
  // silently change mid-session.
  const generatePortrait = async (description: string, subject: "person" | "product" = "person") => {
    try {
      const { job_id } = await api.generateFace({ description, subject });
      setChatJobs((m) => ({
        ...m,
        [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null },
      }));
      pushMsg({
        kind: "stills", jobId: job_id,
        title: subject === "product" ? "Product still — ✓ to lock it in" : "Hero portrait — ✓ to lock her in",
        params: { type: "portrait", description, name: pname(subject === "product" ? "product" : "portrait"), subject },
      });
    } catch (e) {
      postChat("assistant", `❌ portrait generation failed: ${String(e).slice(0, 140)}`);
    }
  };

  // ↻ one still, same references, fresh seed — lands as its own approval card
  const rerollStill = async (msg: Extract<ChatMsg, { kind: "stills" }>, idx: number) => {
    try {
      if (msg.params.type === "portrait") {
        // re-rolling the BASE still is the ONE place a new subject appears —
        // by design, until you ✓ one; variants never do this. Preserve the
        // person/product framing so a product re-roll stays a packshot.
        const subject = msg.params.subject ?? "person";
        const { job_id } = await api.generateFace({
          description: msg.params.description,
          subject,
          seed: freshSeed(),
        });
        setChatJobs((m) => ({ ...m, [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null } }));
        pushMsg({
          kind: "stills", jobId: job_id,
          title: subject === "product" ? "↻ new product candidate" : "↻ new portrait candidate",
          params: { type: "portrait", description: msg.params.description, name: pname(subject === "product" ? "product" : "portrait"), subject },
        });
        return;
      }
      if (msg.params.type === "variants") {
        const emotion = msg.params.emotions[idx] ?? msg.params.emotions[0] ?? "same expression";
        const nm = pname("variant");
        const { job_id } = await api.keyframeVariants({
          portrait: msg.params.portrait, name: nm, emotions: [emotion],
        });
        setChatJobs((m) => ({ ...m, [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null } }));
        pushMsg({ kind: "stills", jobId: job_id, title: `↻ ${emotion}`,
          params: { type: "variants", portrait: msg.params.portrait, emotions: [emotion], name: nm } });
      } else {
        const scene = msg.params.scenes[idx] ?? msg.params.scenes[0];
        if (!scene) return;
        const nm = pname("keyframe");
        const { job_id } = await api.generateKeyframes({
          scenes: [scene], character_image: msg.params.character_image,
          product_image: msg.params.product_image, name: nm,
        });
        setChatJobs((m) => ({ ...m, [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null } }));
        pushMsg({ kind: "stills", jobId: job_id, title: "↻ keyframe",
          params: { type: "set", scenes: [scene], character_image: msg.params.character_image, product_image: msg.params.product_image, name: nm } });
      }
    } catch (e) {
      postChat("assistant", `❌ re-roll failed: ${String(e).slice(0, 140)}`);
    }
  };

  // Run the planner and pitch the treatments (shared by the direct path and
  // the intake card's "Plan it" button).
  const runPlan = async (idea: string, language: string, format: string, duration_s: number) => {
    postChat("assistant", "📝 Briefing the planner…");
    // the brief IS the session's subject — remember it before the planner answers,
    // so even a planner failure leaves the Director knowing what we're making
    patchSession({ brief: { idea, language, format, duration_s } });
    try {
      const res = await api.plan({
        idea, language, format, duration_s,
        ...(cast.length ? { cast_ids: cast.map((c) => c.id) } : {}),
      });
      lastPlanRef.current = { approaches: res.approaches, language };
      pushMsg({ kind: "treatments", approaches: res.approaches, language });
    } catch (e) {
      postChat("assistant", `❌ planner failed: ${String(e).slice(0, 140)}`);
    }
  };

  // ▶ Make this gate: a treatment asking for real pixels (photos/portraits)
  // must not silently render without them. First press explains what to
  // attach/generate/approve; pressing again renders anyway (user's call).
  const gatedRef = useRef<Set<string>>(new Set());
  // NOTE: "have they given pixels?" is answered from session.assets, which is
  // PERSISTED. It used to be a bare in-memory counter, so a refresh forgot every
  // upload and the gate re-closed — the "I gave you the photo" loop, again.

  // Every image the session knows about, with its role. Uploads outrank generated
  // pixels for products (brand law: real labels must be real). Approved stills that
  // predate the session are folded in as "portrait" — that is what the approval grid
  // produces — so nothing that used to work stops working.
  const imagePool = (): { path: string; role: AssetRole }[] => {
    const out: { path: string; role: AssetRole }[] = sessionRef.current.assets
      .filter((a) => a.approved)
      .sort((a, b) => Number(b.source === "upload") - Number(a.source === "upload"))
      .map((a) => ({ path: a.path, role: a.role }));
    for (const p of approvedRef.current) {
      if (!out.some((x) => x.path === p)) out.push({ path: p, role: assetRole(p) === "product" ? "product" : "portrait" });
    }
    return out;
  };

  // Fire a planned approach as a real render (D1). Sequence/overlay/cinematic
  // coerce cleanly; asset-gated pipelines route the user to Create for now.
  const fireApproach = async (ap: PlanApproach, language: string) => {
    // Gate (user's rule: "if the script demands a photo, it must be given
    // first"). ANY required asset gates — the old filter only matched
    // photo/portrait words, so a need like "Screen recording or mockups of the
    // app UI" slipped through and rendered with nothing.
    // BUT once the user HAS provided pixels — approved a still or uploaded an
    // image — the gate must step aside, or they get looped: "provide pixels" ->
    // they do -> "provide pixels" again. So the gate only blocks when nothing
    // has been given yet. gatedRef still gives an explicit second-press override
    // for the zero-pixel case.
    const assetNeeds = ap.needs_from_user ?? [];
    const haveProvidedPixels =
      approvedRef.current.length > 0 || sessionRef.current.assets.length > 0;
    if (assetNeeds.length && !haveProvidedPixels && !gatedRef.current.has(ap.title)) {
      gatedRef.current.add(ap.title);
      // brand law: real product pixels AND app UI / screen recordings / mockups
      // can only be UPLOADS (generating them garbles). But a card can carry a
      // person need too — offer Generate for the portrait AND Upload for the
      // product, instead of hiding Generate whenever any product need exists.
      const needText = assetNeeds.join(" ");
      const isProduct = UPLOAD_ONLY_NEED.test(needText); // has an upload-only need
      const canGenerate = GEN_PERSON_NEED.test(needText); // has a generatable person need
      const src = ap.segments?.[0]?.prompt ?? ap.shots?.[0]?.prompt ?? "";
      const rawSrc = src ? src.split(". ").slice(0, 2).join(". ") : assetNeeds[0];
      // when there's a person need, the Generate button makes THAT portrait
      const subject: "person" | "product" = canGenerate ? "person" : classifySubject(rawSrc);
      const suffix =
        subject === "product"
          ? " — studio product photograph, clean seamless background, no people, photorealistic"
          : " — head-and-shoulders portrait, neutral expression, looking at camera, photorealistic";
      // server caps this at 800 chars — budget the source text so a rich shot
      // prompt's first two sentences plus the suffix never overrun it.
      const desc = rawSrc.slice(0, 800 - suffix.length) + suffix;
      pushMsg({ kind: "assetask", title: ap.title, needs: assetNeeds, description: desc, isProduct, canGenerate, subject });
      if (ap.pipeline === "cinematic") {
        postChat(
          "assistant",
          `Note: "${ap.title}" is CINEMATIC (t2v) — approved images anchor shots only in SEQUENCE treatments. Say "plan it as a sequence with i2v character shots" if you want the portrait to drive the video.`,
        );
      }
      return;
    }
    let req: GenerateRequest | null = null;
    if (ap.pipeline === "sequence" && ap.segments?.length) {
      // Images feed the i2v lanes BY ROLE. Two bugs lived here: the pool was
      // approvedRef only — so an UPLOADED photo (which never enters that list) was
      // silently ignored on exactly this plan shape — and stills were cycled
      // round-robin regardless of what they depicted, so a face could land on a
      // product beat. A plan asking for BOTH a packshot and a reference face
      // (needs_from_user with two entries) could not be satisfied at all.
      const pool = imagePool();
      const pickFor = (segPipe: string): string | undefined => {
        const want: AssetRole = segPipe === "product" ? "product" : "portrait";
        return (
          pool.find((x) => x.role === want && !usedImgs.has(x.path))?.path ??
          pool.find((x) => x.role === want)?.path
        );
      };
      const usedImgs = new Set<string>();
      let injected = 0;
      req = {
        mode: "sequence",
        segments: ap.segments.map((s) => {
          // product beats need a packshot; lipsync/avatar beats need the face
          const img = ["product", "lipsync"].includes(s.pipeline) ? pickFor(s.pipeline) : undefined;
          if (img) { injected++; usedImgs.add(img); }
          return {
            // same sanitation the Create page's adopt() does: Gemini sometimes
            // drifts to a non-segment pipeline — coerce talking-head types to
            // lipsync and anything unrecognised to b-roll rather than 422/misroute.
            pipeline: segPipeline(s.pipeline),
            prompt: s.prompt,
            negative_prompt: s.negative_prompt, script: s.script,
            ...(img ? { image: img } : {}),
          };
        }),
        language, quality: "quality",
        name: pname(ap.title),
      };
      if (injected) postChat("assistant", `🖼 ${injected} approved still${injected > 1 ? "s" : ""} wired into the character/product shots.`);
    } else if (ap.pipeline === "overlay" || ap.pipeline === "cinematic") {
      // A product photo CANNOT ride the overlay/cinematic lane — both are pure
      // text-to-video and the backend Shot model has no image field, which is why an
      // uploaded pack shot was silently dropped. When the session holds a product
      // image, coerce this treatment into a sequence whose beats keep the SAME engine
      // (sequence "overlay" segments run wan_t2v, "cinematic" run ltx2_av) and append
      // one real i2v product beat anchored to that image.
      const productImg = sessionRef.current.assets
        .filter((a) => a.role === "product")
        .sort((a, b) => Number(b.approved) - Number(a.approved))[0]?.path;
      const shotList = ap.shots ?? [];
      if (productImg && shotList.length) {
        req = {
          mode: "sequence",
          segments: [
            ...shotList.map((s) => ({
              pipeline: ap.pipeline as "overlay" | "cinematic",
              prompt: s.prompt,
              negative_prompt: s.negative_prompt,
            })),
            {
              // i2v beat: describe ONLY camera/light — never re-describe the product,
              // the real pixels come from the image and the backend appends I2V_PRESERVE.
              //
              // SCOPE: this animates the packshot itself — a product hero shot. It is
              // NOT the "contact beat" (a person handling the product), which doctrine
              // says needs a COMPOSITED keyframe (character still + product photo) built
              // via the keyframes op and approved first. Wiring that in here would mean
              // an approval round-trip mid-render, so contact beats stay a deliberate
              // keyframes flow; this path exists so a supplied product photo is USED
              // rather than silently dropped.
              pipeline: "product" as const,
              prompt:
                "Slow push-in on the product, shallow depth of field, soft directional key light, " +
                "subtle handheld drift, product held perfectly still and unchanged, photorealistic",
              image: productImg,
            },
          ],
          language, quality: "quality",
          name: pname(ap.title),
        };
        // sequence ignores the job-level script (each segment carries its own), so the
        // ad would ship silent — lay the narration on afterwards via the proven
        // fit-to-length revoice path instead of dropping it.
        pendingNarrationRef.current = ap.narration_script || "";
        postChat("assistant",
          `🖼 Wired your product photo into a real product shot — the other beats keep the ${ap.pipeline} look.`);
      } else {
        req = {
          mode: ap.pipeline,
          shots: shotList.map((s) => ({ prompt: s.prompt, negative_prompt: s.negative_prompt })),
          script: ap.narration_script || null,
          language, quality: "quality",
          name: pname(ap.title),
        };
      }
    }
    if (!req) {
      postChat("assistant",
        `"${ap.title}" needs assets (${(ap.needs_from_user ?? []).join(", ") || ap.pipeline}) — fire it from Create where you can attach them.`);
      return;
    }
    // Say WHICH need is unmet and why, instead of a blanket "rendering without them"
    // that fires even when the assets were supplied. Roles make this checkable.
    if (ap.needs_from_user?.length) {
      const have = new Set(imagePool().map((x) => x.role));
      const unmet = ap.needs_from_user.filter((n) => {
        const want = assetRole(n);
        return want === "reference" ? false : !have.has(want);
      });
      if (unmet.length) {
        postChat("assistant",
          `⚠ No ${unmet.map((n) => assetRole(n)).join(" or ")} image yet — rendering without: ${unmet.join("; ")}. Upload one and re-run to wire it in.`);
      } else {
        const wired = [...have].filter((r) => r !== "reference");
        postChat("assistant", `✅ Using your ${wired.join(" + ")} image${wired.length > 1 ? "s" : ""} for this render.`);
      }
    }
    // the Director's chosen voice must reach the render, not just the re-voice
    if (sessionRef.current.voice?.voice_id) req.voice_id = sessionRef.current.voice.voice_id;
    // inject_cast pastes each saved anchor verbatim into every shot, for every mode
    if (cast.length) req.character_ids = cast.map((c) => c.id);
    const { job_id } = await api.generate(req);
    // remember this render's own narration + language so the post-render "Add
    // narration" box can prefill the ad's script (user can still edit/replace).
    renderMetaRef.current[job_id] = { script: ap.narration_script || "", language };
    // 🧠 THIS is now the ad we are making. Recording it is what stops the Director
    // asking "which plan?" on every follow-up, and gives render_shot its anchors.
    const firstPrompt = ap.segments?.[0]?.prompt ?? ap.shots?.[0]?.prompt ?? "";
    patchSession({
      approach: {
        focused: false,
        index: Math.max(1, (lastPlanRef.current?.approaches ?? []).findIndex((x) => x.title === ap.title) + 1),
        title: ap.title,
        pipeline: ap.pipeline,
        shots: (ap.segments ?? ap.shots ?? []).map((s) => String(s.prompt ?? "").slice(0, 140)),
        script: ap.narration_script || "",
        anchor: firstPrompt,                       // verbatim — the frozen look
        negative: ap.shots?.[0]?.negative_prompt ?? ap.segments?.[0]?.negative_prompt ?? "",
      },
      renders: [...sessionRef.current.renders, { job: job_id, title: ap.title, video: null }].slice(-12),
    });
    setChatJobs((m) => ({
      ...m,
      [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null },
    }));
    setChatJobId(job_id);
    postChat("assistant", `🎬 Rolling "${ap.title}" at full quality — progress and QC events below.`);
    pushMsg({ kind: "progress", jobId: job_id });
  };

  // 🎙 open the narration composer for a landed render (prefill the ad's script)
  const openNarrate = (jobId: string) => {
    setNarrateText(renderMetaRef.current[jobId]?.script ?? "");
    setNarrateFor(jobId);
  };

  // 🎙 lay the typed narration over the render — /revoice TTSes it and fits it to
  // the video's length (speeds up if long, trims tail if short), replacing the
  // soundtrack. New job streams into its own progress card.
  const submitNarrate = async (videoPath: string, jobId: string) => {
    const script = narrateText.trim();
    if (script.length < 3) { postChat("assistant", "Paste the narration script first — it's spoken verbatim and fit to the video length."); return; }
    const language = renderMetaRef.current[jobId]?.language ?? "hi";
    setNarrateFor(null);
    try {
      const { job_id } = await api.revoice({
        video_path: videoPath, script, language,
        ...(sessionRef.current.voice?.voice_id ? { voice_id: sessionRef.current.voice.voice_id } : {}),
      });
      renderMetaRef.current[job_id] = { script, language };
      setChatJobs((m) => ({ ...m, [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null } }));
      pushMsg({ kind: "progress", jobId: job_id });
      postChat("assistant", "🎙 Generating the voiceover and fitting it to the video…");
    } catch (e) {
      postChat("assistant", `❌ narration failed: ${String(e).slice(0, 140)}`);
    }
  };

  // Poll EVERY unfinished chat-fired job (renders AND stills — they overlap):
  // each card updates live with progress + warnings (dead-air discipline: a
  // guard that isn't surfaced doesn't exist). Effect re-arms as the set changes.
  const activeJobKey = Object.entries(chatJobs)
    .filter(([, j]) => !["done", "error", "cancelled"].includes(j.status))
    .map(([id]) => id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!activeJobKey) return;
    const ids = activeJobKey.split(",");
    let inFlight = false; // a slow response must not double-post with the next tick
    let disposed = false;
    const t = setInterval(async () => {
      if (inFlight || disposed) return;
      inFlight = true;
      try {
        for (const id of ids) {
          const j = await api.job(id);
          if (disposed) return;
          setChatJobs((m) => ({
            ...m,
            [id]: {
              progress: j.progress ?? 0,
              detail: j.error ? `${j.error}` : j.detail || j.status,
              warnings: j.warnings ?? [],
              status: j.status,
              video: j.video_path,
              images: j.keyframes ?? (j.image_url ? [j.image_url] : m[id]?.images),
              paths:
                j.keyframe_paths ??
                (j.image_url ? [j.image_url.replace("/assets-files/", "assets/")] : m[id]?.paths),
            },
          }));
          if (["done", "error", "cancelled"].includes(j.status)) {
            if (id === chatJobId) setChatJobId(null);
            if (j.status === "done" && j.video_path) {
              const landed = j.video_path;
              postChat("assistant", `✅ Landed: ${landed.split("/").pop()} — in the Library; open it here to cut it.`);
              // the finished render/export belongs in the bin right away
              api.outputs().then((d) => setPool(d.outputs)).catch(() => {});
              // a repaired clip replaces the broken one in place, keeping its slot
              const fitClipId = fitJobsRef.current[id];
              if (fitClipId) {
                delete fitJobsRef.current[id];
                api.outputs()
                  .then((d) => {
                    const fresh = d.outputs.find((o) => o.path === landed);
                    const dur = fresh?.duration ?? null;
                    setClips((cs) =>
                      cs.map((c) =>
                        c.id !== fitClipId
                          ? c
                          : {
                              ...c,
                              path: landed,
                              url: fresh?.url ?? c.url,
                              name: fresh?.name ?? landed.split("/").pop() ?? c.name,
                              src: dur ?? c.src,
                              in_s: 0,
                              out_s: dur ?? c.out_s,
                            },
                      ),
                    );
                    postChat("assistant", "The trimmed clip is on the timeline now — press play.");
                  })
                  .catch(() => {});
              }
              // 🧠 the session remembers what actually shipped
              setSession((s) => ({
                ...s,
                renders: s.renders.map((r) => (r.job === id ? { ...r, video: landed } : r)),
              }));
              // A treatment coerced into a sequence (to honour a product photo) ignores
              // the job-level script, so lay the stashed narration on now — same
              // fit-to-length path as the manual "Add narration" button.
              const pending = pendingNarrationRef.current;
              if (pending && pending.trim().length > 2) {
                pendingNarrationRef.current = "";
                api.revoice({
                  video_path: landed,
                  script: pending,
                  language: renderMetaRef.current[id]?.language ?? voiceLang,
                  ...(sessionRef.current.voice?.voice_id ? { voice_id: sessionRef.current.voice.voice_id } : {}),
                })
                  .then(({ job_id }) => {
                    setChatJobs((m) => ({ ...m, [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null } }));
                    pushMsg({ kind: "progress", jobId: job_id });
                    postChat("assistant", "🎙 Laying the narration over it, fitted to length…");
                  })
                  .catch((e) => postChat("assistant", `❌ narration failed: ${String(e).slice(0, 120)}`));
              }
            }
          }
        }
      } catch {
        /* transient */
      } finally {
        inFlight = false;
      }
    }, 4000);
    return () => {
      disposed = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobKey]);

  const applyOps = async (ops: Record<string, unknown>[]) => {
    const notes: string[] = [];
    // Finite-or-null: the ops come from an LLM — a missing/prose field turns
    // into NaN under Number(), and NaN comparisons silently pass every guard
    // (a NaN range_cut would delete EVERY clip, then autosave the wipe).
    const num = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    // Working model: a compound sentence's later ops must see earlier ops'
    // results — React state lags a render, so all clip ops act on THIS copy
    // and commit once at the end.
    let working: TClip[] = clipsRef.current.map((c) => ({ ...c }));
    let clipsDirty = false;
    const usedW = (c: TClip) => Math.max(MIN_CLIP_S, c.out_s - c.in_s);
    const startsW = () => {
      const a: number[] = [];
      let s = 0;
      for (const c of working) { a.push(s); s += usedW(c); }
      return a;
    };
    const totalW = () => working.reduce((s, c) => s + usedW(c), 0);
    let vPath = narrationPath, vOff = voiceOffset, vIn = voiceIn, vOut = voiceOut, vGain = gain;
    let vScript = voiceScript, vLang = voiceLang;
    let voiceDirty = false;
    let playheadReq: number | null = null;
    let previewReq = false;
    let exportReq: { name: string | null } | null = null;
    const byIndex = (n: unknown): TClip | undefined => {
      const i = num(n);
      return i !== null && i >= 1 && i <= working.length ? working[Math.round(i) - 1] : undefined;
    };
    for (const op of ops) {
      const kind = op.op as string;
      try {
        if (kind === "trim") {
          const c = byIndex(op.clip);
          if (!c) { notes.push(`no clip ${op.clip}`); continue; }
          const reqIn = op.in_s == null ? null : num(op.in_s);
          const reqOut = op.out_s == null ? null : num(op.out_s);
          if (op.in_s != null && reqIn === null) { notes.push("trim: in_s isn't a number"); continue; }
          if (op.out_s != null && reqOut === null) { notes.push("trim: out_s isn't a number"); continue; }
          const nIn = reqIn === null ? c.in_s : Math.max(0, Math.min(reqIn, c.src - MIN_CLIP_S));
          const nOut = reqOut === null ? c.out_s : Math.max(nIn + MIN_CLIP_S, Math.min(reqOut, c.src));
          c.in_s = +nIn.toFixed(2);
          c.out_s = +Math.max(nIn + MIN_CLIP_S, nOut).toFixed(2);
          clipsDirty = true;
        } else if (kind === "center_cut") {
          const secs = num(op.seconds) ?? 2.2;
          const targets = op.clip == null ? working : ([byIndex(op.clip)].filter(Boolean) as TClip[]);
          if (!targets.length) { notes.push(`no clip ${op.clip}`); continue; }
          for (const c of targets) {
            const keep = Math.max(MIN_CLIP_S, Math.min(secs, c.src));
            const start = Math.max(0, (c.src - keep) / 2);
            c.in_s = +start.toFixed(2);
            c.out_s = +(start + keep).toFixed(2);
          }
          clipsDirty = true;
        } else if (kind === "reorder") {
          const from = num(op.from), to = num(op.to);
          if (from === null || to === null) { notes.push("reorder needs from and to"); continue; }
          const f = Math.round(from) - 1, t = Math.round(to) - 1;
          if (f < 0 || f >= working.length || t < 0 || t >= working.length) {
            notes.push(`reorder out of range (${working.length} clips)`);
            continue;
          }
          const [c] = working.splice(f, 1);
          working.splice(t, 0, c);
          clipsDirty = true;
        } else if (kind === "swap_take") {
          const c = byIndex(op.clip);
          const want = num(op.take);
          if (!c || want === null) { notes.push(`swap_take: bad clip/take`); continue; }
          if ((c.take ?? 1) === Math.round(want)) continue;
          const alt = (c.alternates ?? []).find((a) => a.take === Math.round(want));
          if (!alt) { notes.push(`${clipLabel(c)} has no take ${want}`); continue; }
          const currentAsAlt: TAlternate = {
            path: c.path, url: c.url, name: c.name, duration: c.src, take: c.take ?? 0,
          };
          c.alternates = [
            ...(c.alternates ?? []).filter((a) => a.path !== alt.path),
            currentAsAlt,
          ].sort((a, b) => a.take - b.take);
          c.path = alt.path; c.url = alt.url; c.name = alt.name;
          c.src = alt.duration; c.take = alt.take; c.in_s = 0; c.out_s = alt.duration;
          clipsDirty = true;
        } else if (kind === "delete") {
          const c = byIndex(op.clip);
          if (!c) { notes.push(`no clip ${op.clip}`); continue; }
          working = working.filter((x) => x.id !== c.id);
          clipsDirty = true;
        } else if (kind === "split") {
          const at = num(op.at_s);
          if (at === null) { notes.push("split needs at_s"); continue; }
          const st = startsW();
          let done = false;
          for (let i = 0; i < working.length; i++) {
            const local = at - st[i];
            if (local > MIN_CLIP_S && local < usedW(working[i]) - MIN_CLIP_S) {
              const c = working[i];
              const cut = +(c.in_s + local).toFixed(3);
              working.splice(i, 1,
                { ...c, id: newId(), out_s: cut },
                { ...c, id: newId(), in_s: cut });
              done = true;
              clipsDirty = true;
              break;
            }
          }
          if (!done) notes.push(`nothing to split at ${at.toFixed(1)}s — too close to a cut or past the end`);
        } else if (kind === "range_cut") {
          const a = num(op.start_s), b = num(op.end_s);
          if (a === null || b === null) { notes.push("range_cut needs start_s and end_s"); continue; }
          const A = Math.max(0, Math.min(a, b)), B = Math.min(Math.max(a, b), totalW());
          if (B - A < 0.05) { notes.push("range_cut span is empty"); continue; }
          let s = 0;
          const next: TClip[] = [];
          for (const c of working) {
            const d = usedW(c), c0 = s, c1 = s + d;
            s = c1;
            const oA = Math.max(A, c0), oB = Math.min(B, c1);
            if (oB <= oA + 1e-6) { next.push(c); continue; }
            const leftDur = oA - c0, rightDur = c1 - oB;
            if (leftDur >= MIN_CLIP_S) next.push({ ...c, id: newId(), out_s: +(c.in_s + leftDur).toFixed(3) });
            if (rightDur >= MIN_CLIP_S) next.push({ ...c, id: newId(), in_s: +(c.out_s - rightDur).toFixed(3) });
          }
          working = next;
          clipsDirty = true;
          playheadReq = A;
        } else if (kind === "voice_offset") {
          const s = num(op.seconds);
          if (s === null) { notes.push("voice_offset needs seconds"); continue; }
          vOff = Math.max(0, s);
          voiceDirty = true;
        } else if (kind === "voice_trim") {
          if (!vPath) { notes.push("no voice track loaded"); continue; }
          const cap = vOut ?? voiceDur ?? Infinity;
          if (op.in_s != null) {
            const i = num(op.in_s);
            if (i === null) { notes.push("voice_trim: in_s isn't a number"); continue; }
            if (i >= cap - 0.2) { notes.push(`voice_trim: ${i.toFixed(1)}s is past the voice end (${cap.toFixed(1)}s)`); continue; }
            vIn = Math.max(0, +i.toFixed(2));
          }
          if (op.out_s != null) {
            const o = num(op.out_s);
            if (o === null) { notes.push("voice_trim: out_s isn't a number"); continue; }
            vOut = +Math.max(vIn + 0.2, voiceDur !== null ? Math.min(o, voiceDur) : o).toFixed(2);
          }
          voiceDirty = true;
        } else if (kind === "voice_gain") {
          const g = num(op.gain);
          if (g === null) { notes.push("voice_gain needs gain"); continue; }
          vGain = Math.max(0.4, Math.min(2, g));
          voiceDirty = true;
        } else if (kind === "set_narration") {
          if (op.name == null || op.name === "") {
            vPath = ""; vIn = 0; vOut = null;
          } else {
            const q = String(op.name).toLowerCase();
            const hit = audioAssets.find((a) => a.name.toLowerCase().includes(q));
            if (!hit) { notes.push(`no narration file matching "${op.name}"`); continue; }
            vPath = hit.path; vIn = 0; vOut = null;
          }
          vScript = null; // a file (or clips' own) replaces any pasted script
          voiceDirty = true;
        } else if (kind === "voice_script") {
          const sc = String(op.script || "").trim();
          if (sc.length < 4) { notes.push("voice_script needs the script text"); continue; }
          vScript = sc.slice(0, 2000);
          vLang = String(op.language || vLang || "hi").toLowerCase().startsWith("en") ? "en" : "hi";
          vPath = ""; vIn = 0; vOut = null; // script VO replaces file narration
          voiceDirty = true;
        } else if (kind === "playhead") {
          const at = num(op.at_s);
          if (at === null) { notes.push("playhead needs at_s"); continue; }
          playheadReq = at;
        } else if (kind === "preview") {
          previewReq = true;
        } else if (kind === "export") {
          exportReq = {
            name: op.name ? String(op.name).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60) : null,
          };
        } else if (kind === "generate_portrait") {
          const desc = String(op.description || "").trim();
          if (desc.length < 10) { notes.push("generate_portrait needs a full description"); continue; }
          // trust the planner's subject if it set one; otherwise infer it so
          // "generate a pizza box" renders a packshot, not a human face.
          const subject: "person" | "product" =
            op.subject === "product" || op.subject === "person"
              ? op.subject
              : classifySubject(desc);
          await generatePortrait(desc, subject);
        } else if (kind === "portrait_variants") {
          const q = op.portrait ? String(op.portrait).toLowerCase() : "";
          let portrait =
            (q && stillsRef.current.find((s) => s.name.toLowerCase().includes(q))?.path) ||
            (q && approvedRef.current.find((p) => p.toLowerCase().includes(q))) ||
            null;
          // no name given: the LAST ✓-approved image IS "the portrait" — that's
          // the session's locked identity
          if (!portrait && approvedRef.current.length) portrait = approvedRef.current[approvedRef.current.length - 1];
          if (!portrait && stillsRef.current.length === 1) portrait = stillsRef.current[0].path;
          if (!portrait) { notes.push("which portrait? name one of the stills, or ✓-approve one first"); continue; }
          const emotions = Array.isArray(op.emotions) && op.emotions.length
            ? (op.emotions as unknown[]).map(String).slice(0, 8)
            : undefined;
          const nm = pname("variants");
          const { job_id } = await api.keyframeVariants({
            portrait, name: nm, ...(emotions ? { emotions } : {}),
          });
          setChatJobs((m) => ({ ...m, [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null } }));
          pushMsg({
            kind: "stills", jobId: job_id, title: "Portrait variants — ✓ to approve",
            params: {
              type: "variants", portrait,
              emotions: emotions ?? ["curious", "concentrating", "small success", "quiet pride"],
              name: nm,
            },
          });
        } else if (kind === "keyframes") {
          const scenes = Array.isArray(op.scenes)
            ? (op.scenes as unknown[]).map(String).filter(Boolean).slice(0, 12)
            : [];
          if (!scenes.length) { notes.push("keyframes needs scenes"); continue; }
          const cq = op.character ? String(op.character).toLowerCase() : "";
          const pq = op.product ? String(op.product).toLowerCase() : "";
          const character_image = cq
            ? stillsRef.current.find((s) => s.name.toLowerCase().includes(cq))?.path
            : undefined;
          const product_image = pq
            ? stillsRef.current.find((s) => s.name.toLowerCase().includes(pq))?.path
            : undefined;
          if (!character_image && !product_image) {
            notes.push("keyframes needs a character or product still — name one from the stills");
            continue;
          }
          const nm = pname("keyframes");
          const { job_id } = await api.generateKeyframes({ scenes, character_image, product_image, name: nm });
          setChatJobs((m) => ({ ...m, [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null } }));
          pushMsg({
            kind: "stills", jobId: job_id, title: "Shot keyframes — ✓ to approve",
            params: { type: "set", scenes, character_image, product_image, name: nm },
          });
        } else if (kind === "plan") {
          const raw = String(op.language || "hi").toLowerCase();
          const lang = raw.startsWith("hi") ? "hi" : raw.startsWith("en") ? "en" : raw.slice(0, 2);
          const idea = String(op.idea || "");
          const fmt = String(op.format || "9:16");
          const dur = Math.max(10, Math.min(60, num(op.duration_s) ?? 20));
          // Thin brief -> interview first (the brain's tailored questions with
          // tappable suggestions), exactly like the Create page. A detailed
          // brief (or full script) skips straight to treatments — the user
          // already answered everything by writing it.
          if (idea.trim().length < 240) {
            try {
              const qres = await api.planQuestions(idea, lang);
              setIntake({ idea, language: lang, format: fmt, duration_s: dur, questions: qres.questions, answers: {} });
              pushMsg({ kind: "questions" });
              continue;
            } catch {
              /* intake brain down — plan directly, never block the user */
            }
          }
          await runPlan(idea, lang, fmt, dur);
        } else if (kind === "generate_approach") {
          const idx = (num(op.index) ?? 0) - 1;
          // the treatments MESSAGE carries any edits the user typed; lastPlanRef is
          // only a language fallback (the two copies diverge after a refresh)
          const tm = [...chatMsgsRef.current].reverse().find(
            (x): x is Extract<ChatMsg, { kind: "treatments" }> => x.kind === "treatments",
          );
          const plan = tm
            ? { approaches: tm.approaches, language: tm.language }
            : lastPlanRef.current;
          if (!plan || !plan.approaches[idx]) { notes.push("no plan on the table — brief me first"); continue; }
          // Guard: never let a chat message silently start a SECOND render while
          // one is already rolling. This is exactly what happened when "at end to
          // market the brand" got misread as generate_approach mid-render — two
          // treatments went to the pod at once. Confirm via the card instead.
          const renderActive = Object.values(chatJobsRef.current).some(
            (j) => j.video === null && !["done", "error", "cancelled"].includes(j.status),
          );
          if (renderActive) {
            postChat("assistant", `A render is already rolling. To also start "${plan.approaches[idx].title}", press ▶ Make this on its card.`);
            continue;
          }
          await fireApproach(plan.approaches[idx], plan.language);
        } else if (kind === "captions") {
          const rawItems = Array.isArray(op.items) ? (op.items as unknown[]) : [];
          const items = rawItems
            .map((it) => {
              const o = it as Record<string, unknown>;
              const start = num(o.start), end = num(o.end);
              const text = String(o.text ?? "").trim();
              if (start === null || end === null || !text || end <= start) return null;
              const position = ["top", "bottom", "center"].includes(String(o.position))
                ? (o.position as "top" | "bottom" | "center") : "bottom";
              return { start, end, text: text.slice(0, 120), position, accent: !!o.accent };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .slice(0, 12);
          if (!items.length) { notes.push("captions needs timed {start,end,text} items"); continue; }
          const videoPath = findLastRenderedVideo();
          if (!videoPath) { notes.push("no rendered video yet — render or export first, then burn captions"); continue; }
          const { job_id } = await api.brandPass({ video_path: videoPath, captions: items });
          setChatJobs((m) => ({ ...m, [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null } }));
          pushMsg({ kind: "progress", jobId: job_id });
          postChat("assistant", `🔤 Burning ${items.length} caption${items.length > 1 ? "s" : ""} onto the last render…`);
        } else if (kind === "end_card") {
          // append a branded end card to the last render. Brand text is required
          // and comes from the user (never invented) — same law as captions.
          const brand = String(op.brand || "").trim();
          if (!brand) { notes.push("end_card needs the brand name — ask the user for it"); continue; }
          const tagline = op.tagline ? String(op.tagline).slice(0, 80) : undefined;
          const offer = op.offer ? String(op.offer).slice(0, 60) : undefined;
          const videoPath = findLastRenderedVideo();
          if (!videoPath) { notes.push("no rendered video yet — render or export first, then add the end card"); continue; }
          const { job_id } = await api.endCard({ video_path: videoPath, brand, ...(tagline ? { tagline } : {}), ...(offer ? { offer } : {}) });
          setChatJobs((m) => ({ ...m, [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null } }));
          pushMsg({ kind: "progress", jobId: job_id });
          postChat("assistant", `🎬 Adding the end card — ${brand}${tagline ? ` · “${tagline}”` : ""}…`);
        } else if (kind === "fit_audio") {
          // Re-cut the FILE so it ends just after the last spoken word. This is the
          // only op that actually fixes "the audio stops before the video does" —
          // set_narration merely picks a track and changes no pixels or samples.
          const ci = num(op.clip);
          const target =
            ci !== null && working[ci - 1]
              ? working[ci - 1].path
              : working.length === 1
                ? working[0].path
                : findLastRenderedVideo();
          if (!target) {
            notes.push("which clip? name it, or render/open one first");
            continue;
          }
          const endS = num(op.end_s);
          const { job_id } = await api.fit({
            video_path: target,
            ...(endS !== null && endS > 0.5 ? { mode: "manual" as const, end_s: endS } : { mode: "auto" as const }),
          });
          const fitClip = working.find((c) => c.path === target);
          if (fitClip) fitJobsRef.current[job_id] = fitClip.id;
          setChatJobs((m) => ({ ...m, [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null } }));
          pushMsg({ kind: "progress", jobId: job_id });
          postChat("assistant",
            endS !== null && endS > 0.5
              ? `✂ Cutting ${target.split("/").pop()} at ${endS}s…`
              : `✂ Trimming ${target.split("/").pop()} to end with the narration — the silent tail goes.`);
        } else if (kind === "set_voice") {
          // Resolve by NAME against the roster we actually fetched — an LLM will
          // confabulate a voice id, but not a name that was handed to it in CONTEXT.
          const wantName = String(op.name ?? "").trim().toLowerCase();
          const explicitId = String(op.voice_id ?? "").trim();
          const lang = ["hi", "en"].includes(String(op.language)) ? String(op.language) : undefined;
          let chosen = explicitId
            ? voices.find((v) => v.voice_id === explicitId) ?? { voice_id: explicitId, name: explicitId, category: null, labels: {} }
            : undefined;
          if (!chosen && wantName) {
            chosen = voices.find((v) => v.name.toLowerCase() === wantName)
              ?? voices.find((v) => v.name.toLowerCase().includes(wantName));
          }
          if (!chosen && !lang) {
            notes.push(voices.length
              ? `no voice named "${op.name ?? op.voice_id ?? "?"}" — try one of: ${voices.slice(0, 5).map((v) => v.name).join(", ")}`
              : "the voice list is unavailable (the API key lacks voices_read) — the default voice will be used");
            continue;
          }
          patchSession({
            voice: {
              voice_id: chosen?.voice_id ?? sessionRef.current.voice?.voice_id ?? "",
              name: chosen?.name ?? sessionRef.current.voice?.name ?? "default",
              language: lang ?? sessionRef.current.voice?.language ?? voiceLang,
            },
          });
          if (lang) setVoiceLang(lang);
          postChat("assistant",
            `🎙 Voice set to ${chosen?.name ?? "the default"}${lang ? ` (${lang})` : ""} — it'll be used for the next narration.`);
        } else if (kind === "render_shot") {
          const appr = sessionRef.current.approach;
          if (!appr) { notes.push("no ad in progress — brief me or pick a treatment first"); continue; }
          const action = String(op.action ?? "").trim();
          if (action.length < 3) { notes.push("render_shot needs to know what happens in the shot"); continue; }
          const like = num(op.like_shot);
          const likeGist = like && appr.shots[like - 1] ? appr.shots[like - 1] : "";
          // Repeat the established shot VERBATIM and name only what changes — verbatim
          // repetition is what holds the character, wardrobe and grade across clips
          // (same rule the planner follows). Never re-describe the subject here.
          const prompt =
            `${appr.anchor}\n\nSAME character, wardrobe, setting, lighting and grade as above. ` +
            `The only change: ${action}.` +
            (likeGist ? ` Frame it like this beat: ${likeGist}` : "");
          // sequence mode requires segments (a 1-shot `shots` array 422s), so render the
          // extra clip on the approach's own engine: cinematic -> LTX, everything else -> Wan.
          const mode = appr.pipeline === "cinematic" ? "cinematic" : "overlay";
          const { job_id } = await api.generate({
            mode,
            shots: [{ prompt, negative_prompt: appr.negative || undefined }],
            script: null,
            language: sessionRef.current.voice?.language ?? voiceLang,
            quality: "quality",
            name: pname(`${appr.title}-extra`),
            ...(sessionRef.current.voice?.voice_id ? { voice_id: sessionRef.current.voice.voice_id } : {}),
          } as GenerateRequest);
          setChatJobs((m) => ({ ...m, [job_id]: { progress: 0, detail: "queued", warnings: [], status: "queued", video: null } }));
          pushMsg({ kind: "progress", jobId: job_id });
          postChat("assistant", `🎬 Rolling one more shot for "${appr.title}" — same look, ${action.slice(0, 60)}.`);
        } else if (kind === "ask") {
          postChat("assistant", String(op.question || "Which one do you mean?"));
        }
      } catch (e) {
        notes.push(`${kind} failed: ${String(e).slice(0, 120)}`);
      }
    }

    // ---- commit the working model once ----
    if (clipsDirty) setClips(working);
    if (voiceDirty) {
      if (vPath !== narrationPath) {
        setNarrationPath(vPath);
        setVoiceDur(null);
      }
      setVoiceOffset(vOff);
      setVoiceIn(vIn);
      setVoiceOut(vOut);
      setGain(vGain);
      setGainStr(vGain.toFixed(1));
      setVoiceScript(vScript);
      setVoiceLang(vLang);
    }
    if (exportReq) {
      if (exportReq.name) setName(exportReq.name);
      // export the WORKING state explicitly — React state hasn't flushed yet
      await exportTimeline({
        clips: working,
        name: exportReq.name ?? (name || undefined),
        narration: vPath
          ? { path: vPath, offset: vOff, in: vIn, out: vOut, gain: vGain }
          : vScript
            ? { script: vScript, language: vLang, offset: vOff, in: 0, out: null, gain: vGain }
            : null,
      });
    } else if (previewReq || playheadReq !== null) {
      // refs sync in effects after the commit renders; rAF runs after that
      const at = playheadReq;
      requestAnimationFrame(() => {
        if (at !== null) setPlayhead(at);
        if (previewReq) {
          setShowResult(false);
          play(at === null);
        }
      });
    }
    return notes;
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatBusy) return;
    setChatInput("");
    postChat("user", msg);
    if (intake) {
      // an open brief card owns the conversation: typed text joins the brief
      setIntake((s) => (s ? { ...s, idea: s.idea + "\n" + msg } : s));
      postChat("assistant", "Noted — added to the brief. Tap 🎬 Plan it when ready.");
      return;
    }
    if (msg.length > 600) {
      // a paste this long is a brief/script, not an edit command — send it to
      // the planner VERBATIM (round-tripping it through the intent brain could
      // paraphrase the user's words, and user content is never rewritten)
      const durM = msg.match(/(\d{2})\s*(?:seconds|second|secs|sec)\b/i);
      const dur = durM ? Math.max(10, Math.min(60, +durM[1])) : 20;
      const fmt = /16:9/.test(msg) ? "16:9" : /1:1/.test(msg) ? "1:1" : "9:16";
      const lang = /hindi|[ऀ-ॿ]/i.test(msg) ? "hi" : "en";
      postChat("assistant", `Full brief received — straight to the planner, verbatim (${dur}s · ${fmt} · ${lang}).`);
      setChatBusy(true);
      try {
        await runPlan(msg, lang, fmt, dur);
      } finally {
        setChatBusy(false);
      }
      return;
    }
    setChatBusy(true);
    try {
      // History used to be text-only, so every card — the treatments, the stills
      // grid, the render results — was structurally invisible to the brain. After a
      // few cards its whole view of the conversation was empty, which is what made
      // the Director feel like it had restarted. Summarize cards into one line each
      // so they count as turns.
      const history = chatMsgs
        .slice(-24)
        .map((m): { role: "user" | "assistant"; text: string } | null => {
          if (m.kind === "text") return { role: m.role, text: m.text };
          if (m.kind === "treatments")
            return {
              role: "assistant",
              text: `[showed ${m.approaches.length} treatments: ${m.approaches
                .map((a, i) => `${i + 1}. ${a.title} (${a.pipeline})`)
                .join(" | ")}]`,
            };
          if (m.kind === "stills")
            return { role: "assistant", text: `[showed stills: ${m.title}]` };
          if (m.kind === "assetask")
            return { role: "assistant", text: `[asked for assets: ${m.needs.join(", ")}]` };
          if (m.kind === "progress") {
            const j = chatJobs[m.jobId];
            return { role: "assistant", text: `[render ${j?.status ?? "queued"}${j?.video ? ` -> ${j.video.split("/").pop()}` : ""}]` };
          }
          if (m.kind === "receipt") return { role: "assistant", text: `[applied: ${m.items.join("; ")}]` };
          return null;
        })
        .filter((h): h is { role: "user" | "assistant"; text: string } => h !== null)
        .slice(-12);
      const res = await api.directorIntent({ message: msg, context: buildChatContext(), history });
      const stateOps = (res.ops ?? []).filter((o) => STATE_OPS.has(o.op as string));
      // labels + snapshot resolve against PRE-edit state (delete shifts indexes)
      const receiptItems = stateOps.map(describeOp);
      if (stateOps.length) {
        undoRef.current = {
          clips: clipsRef.current.map((c) => ({ ...c })),
          vPath: narrationPath, vOff: voiceOffset, vIn: voiceIn, vOut: voiceOut, vGain: gain,
          vScript: voiceScript, vLang: voiceLang,
        };
      }
      const notes = await applyOps(res.ops ?? []);
      const hasAsk = (res.ops ?? []).some((o) => o.op === "ask");
      const hasPlanish = (res.ops ?? []).some((o) => o.op === "plan" || o.op === "generate_approach");
      if (res.say && !hasAsk && !hasPlanish) postChat("assistant", res.say);
      if (stateOps.length) {
        pushMsg({ kind: "receipt", items: receiptItems });
        setUndoAvailable(true);
      }
      notes.forEach((n) => postChat("assistant", `⚠ ${n}`));
    } catch (e) {
      postChat("assistant", `❌ ${String(e).slice(0, 160)}`);
    } finally {
      setChatBusy(false);
    }
  };

  /* ----- keyboard ----- */

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const keyHandler = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (t?.tagName === "BUTTON" && e.code === "Space") return; // let Space activate focused buttons
    if (lightbox) {
      if (e.key === "Escape") {
        e.preventDefault();
        setLightbox(null);
      }
      return;
    }
    if (confirmClose) {
      // dialog owns the keyboard: Esc cancels, Enter activates the focused button
      if (e.key === "Escape") {
        e.preventDefault();
        setConfirmClose(false);
      }
      return;
    }
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
    } else if (e.key === "i" || e.key === "I") {
      e.preventDefault();
      setRangeIn(playTRef.current);
    } else if (e.key === "o" || e.key === "O") {
      e.preventDefault();
      setRangeOut(playTRef.current);
    } else if (e.key === "x" || e.key === "X") {
      e.preventDefault();
      rangeCut();
    } else if (e.key === "Escape") {
      setRangeIn(null);
      setRangeOut(null);
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

  // Overrides let the Director chat export its just-applied working state —
  // React state lags a render, so "tighten everything and export" would
  // otherwise serialize the PRE-edit timeline.
  type ExportOverrides = {
    clips?: TClip[];
    name?: string;
    narration?: {
      path?: string;
      script?: string; // pasted script — the backend synthesizes it (TTS)
      language?: string;
      offset: number;
      in: number;
      out: number | null;
      gain: number;
    } | null;
  };
  const exportTimeline = async (ov?: ExportOverrides) => {
    setError(null);
    stopPlayback();
    const useClips = ov?.clips ?? clips;
    const useName = ov?.name ?? name;
    const narr =
      ov && "narration" in ov
        ? ov.narration
        : narrationPath
          ? { path: narrationPath, offset: voiceOffset, in: voiceIn, out: voiceOut, gain }
          : voiceScript
            ? { script: voiceScript, language: voiceLang, offset: voiceOffset, in: 0, out: null, gain }
            : null;
    try {
      const { job_id } = await api.timelineExport({
        clips: useClips.map((c) => ({ path: c.path, in_s: c.in_s, out_s: c.out_s })),
        ...(narr
          ? {
              narration: {
                ...(narr.path ? { path: narr.path } : {}),
                ...(narr.script ? { script: narr.script, language: narr.language ?? "hi" } : {}),
                ...(sessionRef.current.voice?.voice_id
                  ? { voice_id: sessionRef.current.voice.voice_id } : {}),
                offset_ms: Math.round(narr.offset * 1000),
                gain: narr.gain,
                ...(narr.path && narr.in > 0.05 ? { in_s: +narr.in.toFixed(2) } : {}),
                ...(narr.path && narr.out !== null ? { out_s: +narr.out.toFixed(2) } : {}),
              },
            }
          : {}),
        ...(useName ? { name: useName } : {}),
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
        if (j.status === "done" && j.video_path) {
          setShowResult(true);
          // the fresh final belongs in the bin immediately, not just after a reload
          api.outputs().then((d) => setPool(d.outputs)).catch(() => {});
        }
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
  const vOutEff = voiceOut ?? voiceDur ?? Math.max(total, 4); // effective voice end
  const vLen = Math.max(0.2, vOutEff - voiceIn); // trimmed voice length on the lane
  const exporting = !!job && !["done", "error", "cancelled"].includes(job.status);
  const resultUrl =
    job?.status === "done" && job.video_path
      ? fUrl(`/files/${job.video_path.replace(/^outputs\//, "")}`)
      : "";

  const tickInt = pps >= 120 ? 0.5 : pps >= 60 ? 1 : pps >= 35 ? 2 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= maxT + 1e-6; t += tickInt) ticks.push(+t.toFixed(2));

  // Media bin shows only THIS project's media (tagged by `<pid>__`). The first
  // project also adopts any untagged/legacy media so nothing pre-projects is
  // orphaned. The "All" toggle lifts the filter entirely.
  const projPrefixes = projects.map((p) => p.id + "__");
  const ownedByActive = (nm: string) => {
    if (nm.startsWith(activePid + "__")) return true;
    if (isDefaultProject && !projPrefixes.some((pre) => nm.startsWith(pre))) return true;
    return false;
  };
  const filteredPool = pool
    .filter((o) => showAllMedia || ownedByActive(o.name))
    .filter((o) => o.name.toLowerCase().includes(poolFilter.trim().toLowerCase()));

  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,77,61,0.55)]";

  const lastReceiptIdx = (() => {
    let idx = -1;
    chatMsgs.forEach((m, i) => {
      if (m.kind === "receipt") idx = i;
    });
    return idx;
  })();

  const binBody = (
    <>
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="label-cap">Media bin</span>
        <span className="flex items-center gap-1.5">
          <button
            onClick={() => setShowAllMedia((v) => !v)}
            title={showAllMedia ? "Showing every project's media — click for this project only" : "Showing this project's media — click to see all"}
            className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${showAllMedia ? "bg-[rgba(255,77,61,0.15)] text-[rgba(255,140,130,1)]" : "seg text-text-muted"} ${focusRing}`}
          >
            {showAllMedia ? "all projects" : "this project"}
          </button>
          <span className="text-[10px] text-text-muted">{filteredPool.length}</span>
        </span>
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

  if (!hydrated) {
    return <div className="flex h-[calc(100dvh-52px)] flex-col overflow-hidden lg:h-dvh" />;
  }

  return (
    <div className="flex h-[calc(100dvh-52px)] flex-col overflow-hidden lg:h-dvh">
      {/* ================= top bar ================= */}
      {/* lg:pl-16 clears the sidebar's floating ☰ pill (fixed left-3) when the rail is collapsed */}
      <header className="bar-raised flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 lg:pl-16">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="font-display text-lg font-semibold tracking-tight">Timeline</h1>
          <p className="hidden truncate text-[11px] text-text-muted sm:block">
            trim · reorder · split · nudge the voice — no re-rendering
            {loadedFrom ? ` — editing ${loadedFrom}` : ""}
          </p>
        </div>

        {/* ===== project switcher (virtual folders) ===== */}
        <div className="relative">
          <button
            onClick={() => setProjMenuOpen((v) => !v)}
            title="Switch, create, rename or delete a project"
            className={`inline-flex items-center gap-1.5 rounded-btn border border-white/10 bg-surface-2 px-2.5 py-1.5 text-xs text-text-primary hover:border-white/20 ${focusRing}`}
          >
            <span className="text-[rgba(255,140,130,1)]">📁</span>
            <span className="max-w-40 truncate">{activeProject?.name ?? "Project"}</span>
            <span className="text-text-muted">▾</span>
          </button>
          {projMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setProjMenuOpen(false); setRenamingPid(null); }} />
              <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-white/10 bg-surface-1 p-2 shadow-2xl">
                <div className="label-cap px-1.5 pb-1">Projects</div>
                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                  {projects.map((p) => (
                    <div key={p.id} className="group flex items-center gap-1">
                      {renamingPid === p.id ? (
                        <input
                          autoFocus
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { renameProject(p.id, renameText); setRenamingPid(null); }
                            if (e.key === "Escape") setRenamingPid(null);
                          }}
                          onBlur={() => { renameProject(p.id, renameText); setRenamingPid(null); }}
                          className={`input-well min-w-0 flex-1 rounded px-2 py-1 text-[11px] ${focusRing}`}
                        />
                      ) : (
                        <button
                          onClick={() => switchProject(p.id)}
                          className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-[11px] ${p.id === activePid ? "bg-[rgba(255,77,61,0.12)] text-text-primary" : "text-text-secondary hover:bg-white/5"} ${focusRing}`}
                        >
                          {p.id === activePid ? "● " : ""}{p.name}
                        </button>
                      )}
                      <button
                        onClick={() => { setRenamingPid(p.id); setRenameText(p.name); }}
                        title="Rename"
                        className="rounded px-1 py-1 text-[10px] text-text-muted opacity-0 hover:text-text-primary group-hover:opacity-100"
                      >
                        ✎
                      </button>
                      {projects.length > 1 && (
                        <button
                          onClick={() => deleteProject(p.id)}
                          title="Delete project (wipes its cut + chat; media stays in the Library)"
                          className="rounded px-1 py-1 text-[10px] text-text-muted opacity-0 hover:text-red-400 group-hover:opacity-100"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex gap-1 border-t border-white/5 pt-1.5">
                  <input
                    value={newProjName}
                    onChange={(e) => setNewProjName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createProject(); }}
                    placeholder="New project name…"
                    className={`input-well min-w-0 flex-1 rounded px-2 py-1 text-[11px] ${focusRing}`}
                  />
                  <button
                    onClick={createProject}
                    className={`rounded-btn border border-[rgba(255,77,61,0.5)] bg-[rgba(255,77,61,0.12)] px-2.5 py-1 text-[11px] font-semibold text-text-primary hover:bg-[rgba(255,77,61,0.22)] ${focusRing}`}
                  >
                    ＋ New
                  </button>
                </div>
              </div>
            </>
          )}
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
          {!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              className={`seg inline-flex rounded-btn px-2.5 py-1.5 text-xs ${focusRing}`}
              aria-label="Open director chat"
            >
              🎬 director
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
            onClick={() => exportTimeline()}
            disabled={!clips.length || exporting}
            className={`hero-glow rounded-btn px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${focusRing}`}
          >
            Export {total ? `${total.toFixed(1)}s` : ""} cut
          </button>
          <button
            onClick={() => setConfirmClose(true)}
            disabled={!clips.length && !narrationPath && !name}
            title="Close project — clear the timeline and its saved draft"
            aria-label="Close project"
            className={`seg rounded-btn px-2.5 py-1.5 text-xs disabled:opacity-40 ${focusRing}`}
          >
            ✕
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
        {/* assembly warnings (dead air, narration under-runs…) — these were
            always on the job; hiding them is how silent tails ship to clients */}
        {!!job?.warnings?.length && (
          <ul className="w-full space-y-0.5 text-[11px] text-amber-400/90">
            {job.warnings.map((w, i) => (
              <li key={i}>⚠ {w}</li>
            ))}
          </ul>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ================= media bin (≥1101px column) ================= */}
        {/* ================= director rail (left dock — the console) ================= */}
        {chatOpen && (
          <aside
            suppressHydrationWarning
            className="relative hidden shrink-0 flex-col border-r border-white/5 bg-surface-1/60 sm:flex"
            style={{ width: dirW }}
          >
            <div className="flex items-center justify-between px-3 pt-3">
              <span className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    activeJobKey ? "rec-dot bg-red-400" : chatBusy ? "render-breathe bg-accent" : "bg-white/20"
                  }`}
                />
                <span className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">Director</span>
                <span className="text-[9px] text-text-muted">
                  {activeJobKey ? "· rolling" : chatBusy ? "· thinking" : "· standing by"}
                </span>
              </span>
              <button
                onClick={() => setChatOpen(false)}
                className={`seg rounded px-1.5 py-0.5 text-[10px] ${focusRing}`}
                aria-label="Close director"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 flex-1 space-y-2.5 overflow-y-auto px-3.5 pb-2">
              {chatMsgs.map((m, i) => {
                if (m.kind === "assetask") {
                  return (
                    <div key={i} className="deck-in">
                      <div className="rounded-xl border border-white/6 bg-surface-2/50 p-3.5 font-display">
                        <p className="text-[11px] font-semibold text-text-primary">
                          &quot;{m.title}&quot; needs real pixels first
                        </p>
                        <ul className="mt-1.5 space-y-0.5 text-[11px] text-text-muted">
                          {m.needs.map((n, k) => (
                            <li key={k}>• {n}</li>
                          ))}
                        </ul>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {m.canGenerate && (
                            <button
                              onClick={() => generatePortrait(m.description, m.subject)}
                              className={`rounded-btn border border-[rgba(255,77,61,0.5)] bg-[rgba(255,77,61,0.12)] px-3 py-1.5 text-[11px] font-semibold text-text-primary hover:bg-[rgba(255,77,61,0.22)] ${focusRing}`}
                            >
                              {m.subject === "product" ? "⚡ Generate the product still" : "⚡ Generate the portrait"}
                            </button>
                          )}
                          <button
                            onClick={() => fileRef.current?.click()}
                            className={`seg rounded-btn px-3 py-1.5 text-[11px] ${focusRing}`}
                          >
                            📎 Upload your own
                          </button>
                        </div>
                        <p className="mt-2 text-[11px] text-text-muted">
                          {m.canGenerate && m.isProduct
                            ? "Generate the portrait here; the product / app-UI shots must be uploaded (generated labels & UI text garble)."
                            : m.isProduct
                              ? "Product / app-UI photos must always be uploads — generated text garbles."
                              : "✓-approve what you like in the grid, then press ▶ Make this again."}
                        </p>
                      </div>
                    </div>
                  );
                }
                if (m.kind === "questions") {
                  if (!intake) {
                    return (
                      <div key={i} className="rounded-lg border border-white/5 bg-surface-2/60 px-2.5 py-1.5 text-[10px] text-text-muted">
                        ✓ brief taken
                      </div>
                    );
                  }
                  const answered = Object.values(intake.answers).filter(Boolean).length;
                  return (
                    <div key={i} className="deck-in">
                      <div className="rounded-xl border border-white/6 bg-surface-2/50 p-3.5 font-display">
                        <p className="text-[11px] font-semibold text-text-primary">
                          Quick brief — tap what fits, skip what doesn&apos;t
                        </p>
                        <div className="mt-2 space-y-2.5">
                          {intake.questions.map((q) => (
                            <div key={q.key}>
                              <p className="text-[10px] text-text-secondary">{q.ask}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {q.chips.map((c) => {
                                  const on = intake.answers[q.key] === c;
                                  return (
                                    <button
                                      key={c}
                                      onClick={() =>
                                        setIntake((s) =>
                                          s
                                            ? {
                                                ...s,
                                                answers: { ...s.answers, [q.key]: on ? "" : c },
                                              }
                                            : s,
                                        )
                                      }
                                      className={`rounded-full px-2 py-0.5 text-[9px] ${on ? "seg-on" : "seg"} ${focusRing}`}
                                    >
                                      {c}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => {
                              const enriched =
                                intake.idea +
                                "\n" +
                                intake.questions
                                  .filter((q) => intake.answers[q.key])
                                  .map((q) => `${q.ask} -> ${intake.answers[q.key]}`)
                                  .join("\n");
                              const { language, format, duration_s } = intake;
                              setIntake(null);
                              runPlan(enriched, language, format, duration_s);
                            }}
                            className={`rounded-btn border border-[rgba(255,77,61,0.5)] bg-[rgba(255,77,61,0.12)] px-3 py-1.5 text-[11px] font-semibold text-text-primary hover:bg-[rgba(255,77,61,0.22)] ${focusRing}`}
                          >
                            🎬 Plan it{answered ? ` (${answered} answered)` : ""}
                          </button>
                          <button
                            onClick={() => {
                              const { idea, language, format, duration_s } = intake;
                              setIntake(null);
                              runPlan(idea, language, format, duration_s);
                            }}
                            className={`seg rounded-btn px-3 py-1.5 text-[11px] ${focusRing}`}
                          >
                            Skip
                          </button>
                        </div>
                        <p className="mt-2 text-[11px] text-text-muted">
                          …or add detail in the box below and send — it joins the brief.
                        </p>
                      </div>
                    </div>
                  );
                }
                if (m.kind === "treatments") {
                  return (
                    <div key={i} className="space-y-2">
                      {m.approaches.map((a, k) => {
                        const isFocused = session.approach?.title === a.title;
                        return (
                        <div key={k} className="deck-in">
                          <div
                            onFocusCapture={() => focusApproach(a, k)}
                            className={`rounded-xl border bg-surface-2/50 p-3.5 font-display ${
                              isFocused ? "border-[rgba(255,77,61,0.45)]" : "border-white/6"
                            }`}
                          >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[12px] font-semibold leading-snug text-text-primary">
                              {k + 1}. {a.title}
                            </p>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {isFocused && (
                                <span className="rounded px-1.5 py-0.5 text-[9px] text-[rgba(255,140,130,1)]">
                                  ● this one
                                </span>
                              )}
                              <span className="seg rounded px-1.5 py-0.5 text-[9px]">{a.pipeline}</span>
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{a.why}</p>
                          {!!a.needs_from_user?.length && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {a.needs_from_user.map((n) => (
                                <span key={n} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-300">
                                  needs: {n}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* fidelity check: the actual shots that will render —
                              inspect BEFORE firing, catch paraphrased anchors */}
                          {(!!a.segments?.length || !!a.shots?.length) && (
                            <details className="mt-1.5" onToggle={(e) => {
                              if ((e.currentTarget as HTMLDetailsElement).open) focusApproach(a, k);
                            }}>
                              <summary className={`cursor-pointer text-[10px] text-text-muted hover:text-text-secondary ${focusRing}`}>
                                🎞 view the {a.segments?.length || a.shots?.length} shots
                              </summary>
                              <ol className="mt-1.5 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                                {(a.segments?.length
                                  ? a.segments.map((s) => ({
                                      tag: s.pipeline, prompt: s.prompt, script: s.script,
                                    }))
                                  : (a.shots ?? []).map((s) => ({
                                      tag: a.pipeline, prompt: s.prompt, script: undefined as string | undefined,
                                    }))
                                ).map((s, si) => (
                                  <li key={si} className="border-l border-white/10 pl-2">
                                    <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-text-muted">
                                      {si + 1} · {s.tag}
                                    </span>
                                    {/* editable: uncontrolled + onBlur so typing doesn't
                                        re-render the whole rail or fight the debounced save */}
                                    <textarea
                                      defaultValue={s.prompt}
                                      rows={2}
                                      onBlur={(e) => {
                                        const v = e.target.value.trim();
                                        if (!v || v === s.prompt) return;
                                        if (a.segments?.length) {
                                          updateApproach(i, k, {
                                            segments: a.segments.map((x, xi) => (xi === si ? { ...x, prompt: v } : x)),
                                          });
                                        } else {
                                          updateApproach(i, k, {
                                            shots: (a.shots ?? []).map((x, xi) => (xi === si ? { ...x, prompt: v } : x)),
                                          });
                                        }
                                      }}
                                      className={`w-full resize-y rounded border border-white/6 bg-black/20 px-1.5 py-1 text-[10px] leading-relaxed text-text-secondary ${focusRing}`}
                                    />
                                    {s.script !== undefined && (
                                      <textarea
                                        defaultValue={s.script ?? ""}
                                        rows={1}
                                        placeholder="spoken line for this beat"
                                        onBlur={(e) => {
                                          const v = e.target.value;
                                          if (v === (s.script ?? "") || !a.segments?.length) return;
                                          updateApproach(i, k, {
                                            segments: a.segments.map((x, xi) => (xi === si ? { ...x, script: v } : x)),
                                          });
                                        }}
                                        className={`mt-1 w-full resize-y rounded border border-white/6 bg-black/20 px-1.5 py-1 text-[10px] leading-relaxed text-teal-300/80 ${focusRing}`}
                                      />
                                    )}
                                  </li>
                                ))}
                              </ol>
                              {/* the narration script was never shown at all — it is the
                                  thing users most want to fix before spending a render */}
                              {!a.segments?.length && (
                                <div className="mt-2">
                                  <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-text-muted">
                                    narration
                                  </span>
                                  <textarea
                                    defaultValue={a.narration_script ?? ""}
                                    rows={3}
                                    placeholder="spoken verbatim — edit before you render"
                                    onBlur={(e) => {
                                      const v = e.target.value;
                                      if (v !== (a.narration_script ?? "")) updateApproach(i, k, { narration_script: v });
                                    }}
                                    className={`w-full resize-y rounded border border-white/6 bg-black/20 px-1.5 py-1 text-[10px] leading-relaxed text-text-secondary ${focusRing}`}
                                  />
                                </div>
                              )}
                            </details>
                          )}
                          <button
                            onClick={() => fireApproachFresh(i, k, m.language)}
                            disabled={a.available === false || !!chatJobId}
                            className={`mt-2 rounded-btn border border-[rgba(255,77,61,0.5)] bg-[rgba(255,77,61,0.12)] px-3 py-1.5 text-[11px] font-semibold text-text-primary hover:bg-[rgba(255,77,61,0.22)] disabled:opacity-40 ${focusRing}`}
                          >
                            ▶ Make this
                          </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  );
                }
                if (m.kind === "receipt") {
                  return (
                    <div key={i} className="border-l border-white/10 py-0.5 pl-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <ul className="space-y-0.5 text-[10px] text-text-muted">
                          {m.items.map((it, k) => (
                            <li key={k}>{it}</li>
                          ))}
                        </ul>
                        {i === lastReceiptIdx && undoAvailable && (
                          <button
                            onClick={undoBatch}
                            title="Undo this batch"
                            className={`seg shrink-0 rounded px-1.5 py-0.5 text-[10px] ${focusRing}`}
                          >
                            ↩
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
                if (m.kind === "stills") {
                  const pj = chatJobs[m.jobId];
                  const imgs = pj?.images ?? [];
                  const paths = pj?.paths ?? [];
                  const labels =
                    m.params.type === "variants"
                      ? m.params.emotions
                      : m.params.type === "set"
                        ? m.params.scenes
                        : ["portrait"];
                  return (
                    <div key={i} className={`card-raised rounded-xl p-3 ${imgs.length ? "glow-burst" : ""}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                          🖼 {m.title}
                        </span>
                        <span className="text-[10px] tabular-nums text-text-muted">
                          {pj?.status === "done" ? "" : pj?.status === "error" ? "❌" : `${pj?.progress ?? 0}%`}
                        </span>
                      </div>
                      {pj?.status === "error" && (
                        <p className="mt-1 text-[10px] leading-snug text-red-400">{pj.detail}</p>
                      )}
                      {!imgs.length && pj?.status !== "error" && (
                        <>
                          <div className="mt-1.5 h-1 overflow-hidden rounded bg-white/5">
                            <div className="brand-tile h-full" style={{ width: `${pj?.progress ?? 0}%` }} />
                          </div>
                          <p className="mt-1 text-[10px] text-text-muted">{pj?.detail}</p>
                        </>
                      )}
                      {!!imgs.length && (
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          {imgs.map((u, k) => {
                            const p = paths[k];
                            const approved = !!p && approvedStills.includes(p);
                            return (
                              <div
                                key={k}
                                className={`relative overflow-hidden rounded-lg border ${
                                  approved
                                    ? "border-[rgba(255,77,61,0.7)] shadow-[0_0_12px_rgba(255,77,61,0.25)]"
                                    : "border-white/10"
                                }`}
                              >
                                <button
                                  onClick={() => setLightbox(api.assetUrl(u))}
                                  className="block w-full"
                                  title="View large"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={api.assetUrl(u)}
                                    alt={String(labels[k] ?? `still ${k + 1}`)}
                                    className="aspect-square w-full object-cover"
                                  />
                                </button>
                                <span className="pointer-events-none absolute left-1 top-1 max-w-[85%] truncate rounded bg-black/60 px-1 py-0.5 text-[8px] text-text-primary">
                                  {String(labels[k] ?? k + 1).slice(0, 26)}
                                </span>
                                <div className="absolute bottom-1 right-1 flex gap-1">
                                  <button
                                    onClick={() => {
                                      if (!p) return;
                                      const nowApproved = !approvedStills.includes(p);
                                      setApprovedStills((s) =>
                                        s.includes(p) ? s.filter((x) => x !== p) : [...s, p],
                                      );
                                      // mirror into the session so the brain and the
                                      // render path both see approved pixels + their role
                                      rememberAsset({
                                        path: p,
                                        name: p.split("/").pop() ?? p,
                                        role: assetRole(`${m.title} ${p}`),
                                        source: "generated",
                                        approved: nowApproved,
                                      });
                                    }}
                                    title={approved ? "Unapprove" : "Approve — usable as a shot's start image"}
                                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                                      approved
                                        ? "bg-[rgba(255,77,61,0.85)] text-white"
                                        : "bg-black/60 text-text-primary hover:bg-black/80"
                                    } ${focusRing}`}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => rerollStill(m, k)}
                                    title="Re-roll this still (new seed, same references)"
                                    className={`rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-text-primary hover:bg-black/80 ${focusRing}`}
                                  >
                                    ↻
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }
                if (m.kind === "progress") {
                  const pj = chatJobs[m.jobId];
                  return (
                    <div key={i} className={`rounded-xl border border-white/6 bg-surface-2/50 p-3.5 font-display ${pj?.status === "done" ? "glow-burst" : ""}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                          {pj?.status === "done" ? (
                            "delivered"
                          ) : pj?.status === "error" ? (
                            "failed"
                          ) : (
                            <>
                              <span className="rec-dot text-red-400">●</span> rendering
                            </>
                          )}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] tabular-nums text-text-muted">{pj?.progress ?? 0}%</span>
                          {pj && !["done", "error", "cancelled"].includes(pj.status) && (
                            <button
                              onClick={() => api.cancel(m.jobId).catch(() => {})}
                              title="Cancel this render"
                              className={`seg rounded px-1.5 py-0.5 text-[10px] ${focusRing}`}
                            >
                              ✕
                            </button>
                          )}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded bg-white/5">
                        <div className="brand-tile h-full" style={{ width: `${pj?.progress ?? 0}%` }} />
                      </div>
                      <p className="mt-1.5 text-[10px] leading-snug text-text-muted">{pj?.detail}</p>
                      {!!pj?.warnings?.length && (
                        <ul className="mt-1.5 list-disc space-y-0.5 pl-3.5 text-[11px] text-amber-300/70 marker:text-amber-300/50">
                          {pj.warnings.slice(-4).map((w, k) => (
                            <li key={k}>{w}</li>
                          ))}
                          {pj.warnings.length > 4 && (
                            <li className="text-text-muted">+{pj.warnings.length - 4} earlier</li>
                          )}
                        </ul>
                      )}
                      {pj?.status === "done" && pj.video && (
                        <>
                          <p className="mt-1.5 truncate text-[11px] text-text-muted">→ {pj.video.split("/").pop()}</p>
                          {narrateFor === m.jobId ? (
                            <div className="mt-2 space-y-1.5">
                              <textarea
                                value={narrateText}
                                onChange={(e) => setNarrateText(e.target.value)}
                                rows={3}
                                placeholder="Paste the narration script — spoken verbatim, auto-fit to the video length."
                                className={`w-full resize-y rounded-lg border border-white/10 bg-surface-2 px-2 py-1.5 text-[11px] leading-relaxed text-text-primary ${focusRing}`}
                              />
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => submitNarrate(pj.video as string, m.jobId)}
                                  className={`rounded-btn border border-[rgba(255,77,61,0.5)] bg-[rgba(255,77,61,0.12)] px-3 py-1 text-[11px] font-semibold text-text-primary hover:bg-[rgba(255,77,61,0.22)] ${focusRing}`}
                                >
                                  🎙 Narrate over this
                                </button>
                                <button
                                  onClick={() => setNarrateFor(null)}
                                  className={`seg rounded-btn px-3 py-1 text-[11px] ${focusRing}`}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => openNarrate(m.jobId)}
                              className={`mt-2 rounded-btn border border-white/10 bg-surface-2 px-3 py-1 text-[11px] text-text-secondary hover:text-text-primary ${focusRing}`}
                            >
                              🎙 Add narration
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                }
                return (
                  <div
                    key={i}
                    className={`bubble-in whitespace-pre-wrap text-[11.5px] leading-[1.6] ${
                      m.role === "user"
                        ? "ml-auto max-w-[88%] rounded-2xl bg-[rgba(255,77,61,0.10)] px-3 py-2 text-text-primary"
                        : m.text.startsWith("⚠")
                          ? "max-w-[94%] px-0.5 font-display text-[11px] text-amber-400/90"
                          : "max-w-[94%] px-0.5 font-display text-text-secondary"
                    }`}
                  >
                    {m.role === "assistant"
                      ? m.text.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2049}\u{203C}]+\s*/u, "")
                      : m.text}
                  </div>
                );
              })}
              {chatBusy && <div className="shimmer text-[11px]">directing…</div>}
              <div ref={chatEndRef} />
            </div>
            {/* quick actions — contextual; they fill the input so you can edit first */}
            <div className="flex flex-wrap gap-1 px-2.5 pb-1">
              {(clips.length
                ? [
                    "tighten all to 2.2s",
                    "preview",
                    ...(clips.some((c) => c.alternates?.length) ? ["which scenes have takes?"] : []),
                    "export it",
                  ]
                : ["make me a 20s ad in Hindi for "]
              ).map((c) => (
                <button
                  key={c}
                  onClick={() => setChatInput(c)}
                  className={`rounded-full bg-white/4 px-2.5 py-1 text-[10px] text-text-muted hover:text-text-primary ${focusRing}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChat();
              }}
              className="flex gap-1.5 border-t border-white/5 p-2.5"
            >
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onChatUpload} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Attach a photo — product, face, or portrait reference"
                aria-label="Attach a photo"
                className={`seg rounded-btn px-2.5 py-2 text-xs ${focusRing}`}
              >
                📎
              </button>
              <textarea
                ref={chatBoxRef}
                value={chatInput}
                rows={1}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChat();
                  }
                }}
                placeholder='"cut the first 2s of the voice" — Shift+Enter for a new line'
                className={`input-well max-h-40 min-w-0 flex-1 resize-none overflow-y-auto rounded-btn px-2.5 py-2 text-xs leading-relaxed ${focusRing}`}
                aria-label="Director instruction"
              />
              <button
                type="submit"
                disabled={chatBusy || !chatInput.trim()}
                className={`rounded-btn px-3 py-2 text-xs disabled:opacity-40 ${
                  chatInput.trim() && !chatBusy ? "brand-tile font-semibold text-white" : "seg"
                } ${focusRing}`}
                aria-label="Send"
              >
                ↑
              </button>
            </form>
            <div
              onPointerDown={startDirResize}
              title="Drag to resize the director rail"
              className="absolute -right-1 bottom-0 top-0 z-10 w-2 cursor-col-resize touch-none hover:bg-[rgba(255,77,61,0.25)]"
            />
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
                onClick={() => rangeCut()}
                disabled={rangeIn === null || rangeOut === null || Math.abs((rangeOut ?? 0) - (rangeIn ?? 0)) < 0.05}
                title="Cut the marked range out of the film (X). Mark start with I, end with O at the playhead; Esc clears."
                className={`seg rounded px-2 py-1 text-[11px] disabled:opacity-40 ${focusRing}`}
              >
                ✕ I–O
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
                    ? `voice · +${voiceOffset.toFixed(1)}s${
                        voiceIn > 0.05 || voiceOut !== null
                          ? ` · ✂ ${voiceIn.toFixed(1)}–${vOutEff.toFixed(1)}s`
                          : ""
                      } · ${gain.toFixed(1)}×`
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

              {rangeIn !== null && (
                <span className="text-[10px] tabular-nums text-accent/80">
                  range {Math.min(rangeIn, rangeOut ?? rangeIn).toFixed(1)}–
                  {rangeOut !== null ? Math.max(rangeIn, rangeOut).toFixed(1) : "…"}s
                </span>
              )}
              <span className="ml-auto hidden items-center text-[10px] text-text-muted min-[1350px]:flex">
                S split · I/O mark · X cut range · ⌫ delete
              </span>
              <span className="ml-2 flex items-center gap-1 text-[11px] text-text-muted">
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
                  <div className="absolute -left-1.25 top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-accent" />
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
                    {/* I/O range marks — the span X will cut */}
                    {rangeIn !== null && rangeOut !== null ? (
                      <div
                        className="pointer-events-none absolute bottom-0 top-0 border-x border-accent/70 bg-accent/15"
                        style={{
                          left: Math.min(rangeIn, rangeOut) * pps,
                          width: Math.max(1, Math.abs(rangeOut - rangeIn) * pps),
                        }}
                      />
                    ) : rangeIn !== null ? (
                      <div
                        className="pointer-events-none absolute bottom-0 top-0 w-px bg-accent/70"
                        style={{ left: rangeIn * pps }}
                      />
                    ) : null}
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
                        setVoiceIn(0);
                        setVoiceOut(null);
                        setVoiceScript(null); // picking a file replaces a pasted script
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
                          width: Math.max(24, vLen * pps),
                          height: A1_H,
                        }}
                      >
                        <Waveform
                          url={narrationUrl}
                          width={Math.max(24, Math.round(vLen * pps))}
                          height={A1_H}
                          fromS={voiceIn}
                          toS={vOutEff}
                          onDuration={(d) => setVoiceDur(d)}
                        />
                        <span className="pointer-events-none absolute left-3 top-1 max-w-[60%] truncate text-[9px] text-teal-200 drop-shadow">
                          🎙 {audioAssets.find((a) => a.path === narrationPath)?.name ?? "voice"}
                        </span>
                        <span className="pointer-events-none absolute right-3 top-1 flex gap-1 text-[9px] tabular-nums text-teal-200">
                          {(voiceIn > 0.05 || voiceOut !== null) && (
                            <span className="rounded bg-teal-500/25 px-1">
                              ✂ {voiceIn.toFixed(1)}–{vOutEff.toFixed(1)}s
                            </span>
                          )}
                          {voiceOffset > 0.001 && (
                            <span className="rounded bg-teal-500/25 px-1">+{voiceOffset.toFixed(1)}s</span>
                          )}
                        </span>
                        {/* voice trim handles: cut seconds off the head / tail of the VO */}
                        <div
                          data-handle="in"
                          onPointerDown={(e) => startVoiceTrim(e, "in")}
                          title="Drag to cut the start of the voice"
                          className="absolute bottom-0 left-0 top-0 w-2 cursor-ew-resize touch-none rounded-l-lg bg-white/10 hover:bg-[rgba(94,234,212,0.5)]"
                        />
                        <div
                          data-handle="out"
                          onPointerDown={(e) => startVoiceTrim(e, "out")}
                          title="Drag to cut the end of the voice"
                          className="absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize touch-none rounded-r-lg bg-white/10 hover:bg-[rgba(94,234,212,0.5)]"
                        />
                      </div>
                    ) : voiceScript ? (
                      // pasted script VO — no waveform to draw until export TTS
                      <div
                        className="absolute flex items-center gap-2 overflow-hidden rounded-lg border border-dashed border-teal-400/40 bg-teal-500/5 px-2.5"
                        style={{ left: voiceOffset * pps, width: Math.max(160, Math.min(total, 30) * pps), height: A1_H, top: 6 }}
                        title={voiceScript}
                      >
                        <span className="text-[10px] text-teal-200">📜 script VO</span>
                        <span className="truncate text-[9px] italic text-text-muted">
                          {voiceScript.trim().split(/\s+/).length} words · {voiceLang} · synthesized at export
                        </span>
                      </div>
                    ) : clips.length ? (
                      // clips' own audio, mirrored under each video block so the
                      // sound is visible and trims with the video (one file)
                      clips.map((c, i) => (
                        <div
                          key={c.id}
                          onPointerDown={() => setSelection({ type: "clip", id: c.id })}
                          title={`${clipLabel(c)} — its own audio; trim the video block to cut it`}
                          className={`absolute overflow-hidden rounded border ${
                            selection?.type === "clip" && selection.id === c.id
                              ? "border-teal-400/60"
                              : "border-teal-400/20"
                          } bg-teal-500/5`}
                          style={{ left: starts[i] * pps, top: 8, width: Math.max(2, used(c) * pps), height: A1_H - 4 }}
                        >
                          <Waveform
                            url={fUrl(c.url)}
                            width={Math.max(2, Math.round(used(c) * pps))}
                            height={A1_H - 4}
                            fromS={c.in_s}
                            toS={c.out_s}
                          />
                        </div>
                      ))
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

        {/* ================= media bin (right dock) ================= */}
        {wide && (
          <aside
            suppressHydrationWarning
            className="relative flex shrink-0 flex-col border-l border-white/5 bg-surface-1/60"
            style={{ width: binW }}
          >
            {binBody}
            <div
              onPointerDown={startBinResize}
              title="Drag to resize the media bin"
              className="absolute -left-1 bottom-0 top-0 z-10 w-2 cursor-col-resize touch-none hover:bg-[rgba(255,77,61,0.25)]"
            />
          </aside>
        )}
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

      {/* ================= still lightbox (click any approval-grid image) ================= */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          role="dialog"
          aria-label="Still preview"
          onClick={() => setLightbox(null)}
        >
          <div className="absolute inset-0 bg-black/85" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Keyframe preview" className="relative max-h-full max-w-full rounded-xl" />
        </div>
      )}

      {/* ================= close-project confirm (in-app, on-token) ================= */}
      {confirmClose && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-label="Close this project?"
        >
          <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmClose(false)} />
          <div className="hero-frame relative w-full max-w-sm">
            <div className="card-raised rounded-xl p-5">
              <div className="flex items-start gap-3">
                <span className="brand-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-btn text-sm">
                  ✕
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">Close this project?</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">
                    The cut{loadedFrom ? ` (${loadedFrom})` : ""} and its saved draft will be
                    cleared. Source clips and finished exports stay in your Library.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  autoFocus
                  onClick={() => setConfirmClose(false)}
                  className={`seg rounded-btn px-4 py-2 text-xs ${focusRing}`}
                >
                  Keep editing
                </button>
                <button
                  onClick={doCloseProject}
                  className={`rounded-btn border border-[rgba(255,77,61,0.5)] bg-[rgba(255,77,61,0.12)] px-4 py-2 text-xs font-semibold text-text-primary hover:bg-[rgba(255,77,61,0.22)] ${focusRing}`}
                >
                  Close project
                </button>
              </div>
            </div>
          </div>
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
