// Typed client for the adgen orchestrator (always via the Next.js proxy — never direct).
const BASE = "/api/backend";

export type Shot = { prompt: string; negative_prompt?: string };

// One timeline entry of a sequence job (the 60s mixed-pipeline ad).
export type SequenceSegment = {
  pipeline: "overlay" | "lipsync" | "product";
  prompt: string;
  negative_prompt?: string;
  script?: string;
  image?: string;
  voice_id?: string; // per-segment voice (dialogue: speaker A vs B)
  avatar_id?: string; // saved avatar profile — backend fills image + voice_id
};

// Phase 3: a saved face + voice pair the backend re-injects on every render.
export type AvatarProfile = {
  id: string;
  name: string;
  type: "library" | "byo";
  reference_image: string; // server path (what /generate needs)
  image_url: string | null; // browser preview (via api.assetUrl)
  voice_id: string;
  default_settings: Record<string, unknown>;
  lora_path: string | null;
  consent: boolean;
  created_at: number;
};

export type GenerateRequest = {
  mode: "overlay" | "lipsync" | "product" | "cinematic" | "longcat" | "ingredients" | "sequence" | "redub";
  shots?: Shot[];
  segments?: SequenceSegment[];
  script?: string | null;
  language?: string;
  seed?: number;
  music?: string;
  quality?: "quality" | "fast";
  steps?: number;
  width?: number;
  height?: number;
  name?: string;
  avatar_image?: string;
  product_image?: string;
  voice_id?: string;
  avatar_id?: string; // saved avatar profile — backend resolves face + voice
  sheet_image?: string; // ingredients: the reference sheet image (server path)
  sheet_description?: string; // ingredients: what the sheet's panels contain
  source_video?: string; // redub: existing render whose lips to re-render
  postprocess?: boolean;
};

export type Job = {
  status: string;
  progress: number;
  detail: string;
  video_path: string | null;
  error: string | null;
  kind?: string;
  name?: string | null;
  queue_position?: number;
  image_url?: string | null; // face-gen jobs: preview URL of the rendered still
};

export type QueueItem = {
  job_id: string;
  kind: string;
  name: string | null;
  status: string;
  progress: number;
  detail: string;
};

export type RevoiceRequest = {
  video_path: string;
  script: string;
  voice_id?: string;
  language?: string;
  music?: string;
};

export type FitRequest = {
  video_path: string;
  mode?: "auto" | "manual";
  tail_s?: number;
  end_s?: number;
};

export type EndCardRequest = {
  video_path: string;
  brand: string;
  tagline?: string;
  offer?: string;
  seconds?: number;
};

export type ReassembleRequest = {
  clips: string[];
  script?: string;
  voice_id?: string;
  language?: string;
  music?: string;
  narration_delay_ms?: number;
  narration_gain?: number;
  music_gain?: number;
  name?: string;
};

// A generated still (reference sheet / avatar face) rendered on the pod.
export type StillItem = {
  path: string;
  url: string;
  name: string;
  kind: "sheet" | "face";
  size_bytes: number;
  modified: number;
};

export type OutputItem = {
  path: string;
  url: string;
  name: string;
  pipeline: string;
  kind: string;
  voice_lock?: boolean; // speech is lip-synced — revoicing would desync the mouth
  size_bytes: number;
  modified: number;
};

export type PlanRequest = {
  idea: string;
  language: string;
  format: string;
  duration_s: number;
  avoid?: string[]; // rejected approach titles — Regenerate steers away from them
};

export type PlanApproach = {
  title: string;
  pipeline: "overlay" | "lipsync" | "product" | "cinematic" | "longcat" | "multitalk";
  available: boolean;
  audio_strategy: string;
  why: string;
  narration_script: string;
  shots: Shot[];
  needs_from_user: string[];
};

export type Voice = {
  voice_id: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
};

// The Dialogue page's brain: one two-speaker script, ready to drop into the form.
export type DialoguePlan = {
  title: string;
  speakers: { role: "a" | "b"; name: string; gender: string; scene: string }[];
  turns: { speaker: "a" | "b"; text: string }[];
};

// Render presets are a UI concept — this is the locked preset -> knobs mapping (file 15).
export const PRESETS = {
  preview: { label: "⚡ Preview", quality: "fast", steps: 6, postprocess: false },
  moderate: { label: "🎚 Moderate", quality: "fast", steps: 6, postprocess: true },
  master: { label: "👑 Master", quality: "quality", postprocess: true },
} as const;
export type PresetKey = keyof typeof PRESETS;

export const PRESET_HINTS: Record<PresetKey, string> = {
  preview: "fast draft — iterate here",
  moderate: "fast draft + face restore, 2× upscale, smooth motion",
  master: "full 20-step render + enhancement — final delivery",
};

export const ASPECTS = {
  "9:16": { width: 432, height: 768 },
  "1:1": { width: 640, height: 640 },
  "16:9": { width: 768, height: 432 },
} as const;
export type AspectKey = keyof typeof ASPECTS;

// LTX renders comfortably at ~2x Wan's sizes (two-stage upscale) — B-roll on the
// LTX engine uses these so it keeps the 1280-class sharpness of the test renders.
export const LTX_ASPECTS: Record<AspectKey, { width: number; height: number }> = {
  "9:16": { width: 704, height: 1280 },
  "1:1": { width: 960, height: 960 },
  "16:9": { width: 1280, height: 704 },
};

// Ingredients (IC-LoRA) trained bucket is 768x448-class — stay near it for the
// best sheet fidelity; the reference sheet renders at the same size as output.
export const ING_ASPECTS: Record<AspectKey, { width: number; height: number }> = {
  "9:16": { width: 448, height: 768 },
  "1:1": { width: 576, height: 576 },
  "16:9": { width: 768, height: 448 },
};

// Backend pipeline folder -> what the user actually made.
export const PIPELINE_LABELS: Record<string, string> = {
  wani2v: "Product",
  wans2v: "Avatar",
  want2v: "B-roll (Wan)",
  ltx2: "LTX (B-roll/Cinematic)",
  ingredients: "Brand-locked (Ingredients)",
  longcat: "Long Avatar",
  sequence: "Sequence ad",
  remix: "Remix cut",
};

async function jsonOrThrow(r: Response) {
  if (!r.ok) {
    // FastAPI errors are {"detail": "..."} (or a Pydantic array) — surface the human
    // part, not raw JSON. Error message keeps the status FIRST so callers can match
    // on it (the job pollers check /^404/ to detect vanished jobs).
    const raw = await r.text();
    let msg = raw.slice(0, 300);
    try {
      const d = JSON.parse(raw)?.detail;
      if (typeof d === "string") msg = d;
      else if (Array.isArray(d) && d[0]?.msg) msg = d[0].msg;
    } catch {
      /* not JSON — keep the raw slice */
    }
    throw new Error(`${r.status}: ${msg}`);
  }
  return r.json();
}

export const api = {
  health: () => fetch(`${BASE}/health`).then(jsonOrThrow),
  plan: (req: PlanRequest): Promise<{ approaches: PlanApproach[] }> =>
    fetch(`${BASE}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(jsonOrThrow),
  planDialogue: (req: {
    idea: string;
    language?: string;
    turns?: number;
    regenerate?: boolean;
  }): Promise<DialoguePlan> =>
    fetch(`${BASE}/plan-dialogue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(jsonOrThrow),
  generate: (req: GenerateRequest): Promise<{ job_id: string }> =>
    fetch(`${BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(jsonOrThrow),
  job: (id: string): Promise<Job> => fetch(`${BASE}/jobs/${id}`).then(jsonOrThrow),
  jobVideoUrl: (id: string) => `${BASE}/jobs/${id}/video`,
  queue: (): Promise<{ active: QueueItem[]; pod_jobs: number }> =>
    fetch(`${BASE}/queue`).then(jsonOrThrow),
  revoice: (req: RevoiceRequest): Promise<{ job_id: string }> =>
    fetch(`${BASE}/revoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(jsonOrThrow),
  fit: (req: FitRequest): Promise<{ job_id: string }> =>
    fetch(`${BASE}/fit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(jsonOrThrow),
  endCard: (req: EndCardRequest): Promise<{ job_id: string }> =>
    fetch(`${BASE}/endcard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(jsonOrThrow),
  reassemble: (req: ReassembleRequest): Promise<{ job_id: string }> =>
    fetch(`${BASE}/reassemble`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(jsonOrThrow),
  cancel: (id: string) => fetch(`${BASE}/jobs/${id}/cancel`, { method: "POST" }).then(jsonOrThrow),
  postprocess: (video_path: string, restore_face: boolean): Promise<{ job_id: string }> =>
    fetch(`${BASE}/postprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_path, restore_face }),
    }).then(jsonOrThrow),
  uploadAsset: (file: File): Promise<{ path: string; url: string }> => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/assets`, { method: "POST", body: fd }).then(jsonOrThrow);
  },
  avatars: (): Promise<{ avatars: AvatarProfile[] }> =>
    fetch(`${BASE}/avatars`).then(jsonOrThrow),
  createAvatar: (opts: {
    file?: File;
    imagePath?: string; // server-side still from generateFace (instead of an upload)
    name: string;
    voice_id: string;
    consent: boolean;
    language?: string;
    type?: "library" | "byo";
  }): Promise<AvatarProfile> => {
    const fd = new FormData();
    if (opts.file) fd.append("file", opts.file);
    if (opts.imagePath) fd.append("image_path", opts.imagePath);
    fd.append("name", opts.name);
    fd.append("voice_id", opts.voice_id);
    fd.append("consent", String(opts.consent));
    if (opts.language) fd.append("language", opts.language);
    if (opts.type) fd.append("type", opts.type);
    return fetch(`${BASE}/avatars`, { method: "POST", body: fd }).then(jsonOrThrow);
  },
  generateFace: (req: {
    description: string;
    negative?: string;
    seed?: number;
  }): Promise<{ job_id: string }> =>
    fetch(`${BASE}/avatars/generate-face`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(jsonOrThrow),
  generateSheet: (req: {
    description: string;
    width?: number;
    height?: number;
    seed?: number;
  }): Promise<{ job_id: string }> =>
    fetch(`${BASE}/sheets/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then(jsonOrThrow),
  updateAvatar: (id: string, body: { name?: string; voice_id?: string }): Promise<AvatarProfile> =>
    fetch(`${BASE}/avatars/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(jsonOrThrow),
  deleteAvatar: (id: string): Promise<{ ok: boolean }> =>
    fetch(`${BASE}/avatars/${id}`, { method: "DELETE" }).then(jsonOrThrow),
  outputs: (): Promise<{ outputs: OutputItem[] }> => fetch(`${BASE}/outputs`).then(jsonOrThrow),
  stills: (): Promise<{ stills: StillItem[] }> => fetch(`${BASE}/stills`).then(jsonOrThrow),
  voices: (): Promise<{ voices: Voice[] }> => fetch(`${BASE}/voices`).then(jsonOrThrow),
  voicePreviewBlob: async (voice_id: string, language = "en"): Promise<Blob> => {
    const r = await fetch(`${BASE}/voice-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id, language }),
    });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.blob();
  },
  fileUrl: (item: OutputItem) => `${BASE}${item.url}`,
  assetUrl: (url: string) => `${BASE}${url}`,
};
