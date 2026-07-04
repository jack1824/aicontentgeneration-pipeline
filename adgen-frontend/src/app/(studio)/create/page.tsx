"use client";

// The Create studio — where the Gemini brain lives.
// Flow: idea -> POST /plan -> proposal cards -> "Use this plan" prefills the editor
// -> tweak shots/script/assets -> Generate -> live render panel -> player.

import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  api,
  ASPECTS,
  AspectKey,
  GenerateRequest,
  Job,
  PlanApproach,
  PRESET_HINTS,
  PRESETS,
  PresetKey,
  Shot,
  Voice,
} from "@/lib/api";
import Dropzone, { Uploaded } from "@/components/Dropzone";
import { USECASES } from "@/lib/usecases";
import BriefChat from "@/components/create/BriefChat";
import PitchDeck from "@/components/create/PitchDeck";
import PhoneStage from "@/components/create/PhoneStage";
import VoicePicker from "@/components/VoicePicker";

type Mode = "product" | "lipsync" | "overlay" | "cinematic";
const MODES: { key: Mode; label: string }[] = [
  { key: "product", label: "🧴 Product" },
  { key: "lipsync", label: "🗣 Avatar" },
  { key: "overlay", label: "🎬 B-roll" },
  { key: "cinematic", label: "🎥 Cinematic" },
];

const SURPRISE_TWIST =
  "\n\nSurprise me: propose ONE bold, unexpected creative direction for this — something I wouldn't think of myself.";
const TIME_HINTS: Record<Mode, Record<PresetKey, string>> = {
  product: { preview: "≈2 min/shot", moderate: "≈2 min/shot + ~10 min polish", master: "long render + polish" },
  lipsync: { preview: "≈6 min", moderate: "≈6 min + ~10 min polish", master: "≈35 min + polish" },
  overlay: { preview: "≈2 min/shot", moderate: "≈2 min/shot + ~10 min polish", master: "long render + polish" },
  cinematic: { preview: "new — timing TBD", moderate: "new + ~10 min polish", master: "new + polish" },
};

const emptyShot = (): Shot => ({ prompt: "", negative_prompt: "" });

function GeminiPanel({
  initialIdea,
  autoPlan,
  surprise,
  language,
  setLanguage,
  aspect,
  onAdopt,
  onPlanned,
}: {
  initialIdea: string;
  autoPlan: boolean; // true only for dashboard idea-bar handoffs — usecase prefills wait for the user
  surprise: boolean; // dashboard dice: append the twist to the REQUEST only, never the visible idea
  language: string;
  setLanguage: (l: string) => void;
  aspect: AspectKey;
  onAdopt: (a: PlanApproach) => void;
  onPlanned: () => void;
}) {
  const [idea, setIdea] = useState(initialIdea);
  // Conversational brief by default; prefilled ideas (dashboard/usecase) open in type mode.
  const [briefMode, setBriefMode] = useState<"chat" | "type">(initialIdea ? "type" : "chat");
  const [duration, setDuration] = useState(15);
  const [thinking, setThinking] = useState(false);
  const [approaches, setApproaches] = useState<PlanApproach[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef(false);

  const runPlan = useCallback(
    async (ideaText: string, dur: number, lang: string, avoid?: string[]) => {
      if (ideaText.trim().length < 3) return;
      setThinking(true);
      setError(null);
      setApproaches(null);
      try {
        const res = await api.plan({
          idea: ideaText.trim(),
          language: lang,
          format: aspect,
          duration_s: dur,
          ...(avoid?.length ? { avoid } : {}),
        });
        setApproaches(res.approaches);
        onPlanned();
      } catch (e) {
        setError(String(e));
        // Chat unmounts while thinking — fall back to type mode so the composed
        // idea stays visible and retryable instead of restarting the 3 questions.
        setBriefMode("type");
      } finally {
        setThinking(false);
      }
    },
    [aspect, onPlanned],
  );

  // Idea arrived from the dashboard bar -> Gemini starts thinking immediately.
  useEffect(() => {
    if (initialIdea && autoPlan && !autoRan.current) {
      autoRan.current = true;
      runPlan(initialIdea + (surprise ? SURPRISE_TWIST : ""), 15, language);
    }
  }, [initialIdea, autoPlan, surprise, language, runPlan]);

  return (
    <section className="card-raised rounded-card p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="hero-glow flex size-7 items-center justify-center rounded-lg text-xs text-white">✦</span>
        <h2 className="text-lg font-semibold font-display">The Brain</h2>
        <span className="text-xs text-text-muted">Gemini plans · you direct · Wan renders</span>
      </div>

      {!approaches && (
        <div className="flex flex-col gap-3">
          {briefMode === "chat" && !thinking ? (
            <BriefChat
              onComplete={(composed) => {
                setIdea(composed);
                runPlan(composed, duration, language);
              }}
              onTypeInstead={() => setBriefMode("type")}
            />
          ) : (
            <>
              {/* The star of the page: the idea box gets a faint gradient frame + real presence. */}
              <div className="hero-frame">
                <textarea
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="Describe the ad — product, audience, mood. e.g. “15s reel for my Ayurvedic hair oil, calm morning ritual, women 25–40”"
                  rows={3}
                  className="input-well w-full rounded-xl p-4 text-[15px] leading-relaxed placeholder:text-text-muted"
                />
              </div>
              {briefMode === "type" && !thinking && (
                <button
                  onClick={() => setBriefMode("chat")}
                  className="self-start text-xs text-text-muted hover:text-text-primary"
                >
                  ← guided brief instead
                </button>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {[
                { v: "en", l: "English" },
                { v: "hi", l: "हिन्दी" },
              ].map((o) => (
                <button
                  key={o.v}
                  onClick={() => setLanguage(o.v)}
                  className={`rounded-btn px-3 py-1.5 text-xs ${language === o.v ? "seg-on" : "seg"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {[10, 15, 30, 60].map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`rounded-btn px-3 py-1.5 text-xs ${duration === d ? "seg-on" : "seg"}`}
                >
                  {d}s
                </button>
              ))}
            </div>
            {briefMode === "type" && (
              <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                <button
                  onClick={() => runPlan(idea.trim() + SURPRISE_TWIST, duration, language)}
                  disabled={thinking || idea.trim().length < 3}
                  title="Surprise me — one bold, unexpected direction"
                  className="seg shrink-0 rounded-btn px-3 py-2 text-sm disabled:opacity-40"
                  aria-label="Surprise me"
                >
                  🎲
                </button>
                <button
                  onClick={() => runPlan(idea, duration, language)}
                  disabled={thinking || idea.trim().length < 3}
                  className="hero-glow flex-1 rounded-btn px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 disabled:shadow-none sm:flex-none"
                >
                  {thinking ? "Thinking…" : "✦ Generate ad plan"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {thinking && (
        <p className="shimmer text-sm font-medium">
          Gemini is directing your ad — pipelines, shots, script…
        </p>
      )}
      {error && <p className="text-sm text-accent">{error}</p>}

      {approaches && (
        <div className="flex flex-col gap-2">
          <PitchDeck approaches={approaches} onAdopt={onAdopt} />
          <div className="flex flex-wrap items-center gap-3">
            {/* Didn't like any of them? New batch, explicitly steering away from these. */}
            <button
              onClick={() => runPlan(idea, duration, language, approaches.map((a) => a.title))}
              disabled={thinking}
              className="seg rounded-btn px-4 py-2 text-xs font-medium disabled:opacity-40"
            >
              ↻ 3 new directions
            </button>
            <button
              onClick={() => setApproaches(null)}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              ↺ brief again
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

const STEPS = ["idea", "plan", "render", "done"];

function CreateStudio() {
  const params = useSearchParams();
  const ideaParam = params.get("idea") ?? "";
  const urlMode = params.get("mode");
  // quickStart (landing Director cards): prefill pipeline + fill-in-the-blank idea,
  // then WAIT — the user adds their product before Gemini plans anything.
  const usecase = params.get("usecase");
  const uc = usecase ? USECASES[usecase] : undefined;
  const initialIdea = ideaParam || uc?.ideaHint || "";

  // ---- Editor state ----
  const [mode, setMode] = useState<Mode>(
    urlMode === "lipsync" || urlMode === "overlay" || urlMode === "product" || urlMode === "cinematic"
      ? urlMode
      : uc?.mode ?? "product",
  );
  const [shots, setShots] = useState<Shot[]>([emptyShot()]);
  const [script, setScript] = useState("");
  const [language, setLanguage] = useState("en");
  const [image, setImage] = useState<Uploaded | null>(null);
  const [music, setMusic] = useState<Uploaded | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [previewingVoice, setPreviewingVoice] = useState(false);
  const [preset, setPreset] = useState<PresetKey>("preview");
  const [aspect, setAspect] = useState<AspectKey>("9:16");
  const [name, setName] = useState("");
  const [planned, setPlanned] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // ---- Job state ----
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Seed history: each re-roll fires the same request with a fresh seed ("take N").
  // `done` is tracked per take so earlier takes stay watchable while a new one renders.
  const [takes, setTakes] = useState<
    { jobId: string; label: string; done: boolean; failed?: boolean }[]
  >([]);
  const [viewTakeId, setViewTakeId] = useState<string | null>(null);
  const lastReqRef = useRef<GenerateRequest | null>(null);
  // Stage chips are frozen from the FIRED request — editing the form mid-render
  // must not reshape them.
  const [stages, setStages] = useState<{ key: string[]; label: string }[]>([]);

  useEffect(() => {
    api.voices().then((d) => setVoices(d.voices)).catch(() => {});
  }, []);

  // A running render must SURVIVE navigation: the job lives on the backend, so the
  // page state (job, takes, stages) persists per-tab and re-attaches on return.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem("adgen-active-job");
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s?.jobId) return;
      if (s.req) lastReqRef.current = s.req;
      setStages(s.stages ?? []);
      setTakes(s.takes ?? []);
      setJob(s.job ?? { status: "queued", progress: 0, detail: "", video_path: null, error: null });
      setJobId(s.jobId);
    } catch {
      /* corrupt snapshot — start clean */
    }
  }, []);

  useEffect(() => {
    if (!jobId) return;
    try {
      sessionStorage.setItem(
        "adgen-active-job",
        JSON.stringify({ jobId, job, takes, stages, req: lastReqRef.current }),
      );
    } catch {
      /* storage full/blocked — nonfatal */
    }
  }, [jobId, job, takes, stages]);

  useEffect(() => {
    if (!jobId) return;
    const tick = async () => {
      try {
        const j = await api.job(jobId);
        setJob(j);
        if (j.status === "done") {
          setTakes((ts) => ts.map((t) => (t.jobId === jobId ? { ...t, done: true } : t)));
        }
        if (["error", "cancelled"].includes(j.status)) {
          setTakes((ts) => ts.map((t) => (t.jobId === jobId ? { ...t, failed: true } : t)));
        }
        if (["done", "error", "cancelled"].includes(j.status) && pollRef.current) {
          clearInterval(pollRef.current);
        }
      } catch (e) {
        // 404 = the job VANISHED (jobs are in-memory; the backend restarted).
        // Anything else is a transient blip — keep polling. Without this, a dead
        // job froze the page at "Rendering…" forever and the sessionStorage
        // snapshot resurrected the freeze on every reload.
        if (String(e).includes("404")) {
          if (pollRef.current) clearInterval(pollRef.current);
          try {
            sessionStorage.removeItem("adgen-active-job");
          } catch {
            /* nonfatal */
          }
          setTakes((ts) => ts.map((t) => (t.jobId === jobId ? { ...t, failed: true } : t)));
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
    tick(); // immediate refresh (matters when re-attaching after navigation)
    pollRef.current = setInterval(tick, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId]);

  const adopt = (a: PlanApproach) => {
    if (a.pipeline === "product" || a.pipeline === "lipsync" || a.pipeline === "overlay" || a.pipeline === "cinematic") {
      if (a.pipeline !== mode) {
        // Mirror the manual mode buttons: an image uploaded for ANOTHER pipeline
        // must not silently become this one's avatar face / product photo.
        setImage(null);
      }
      if (a.pipeline === "lipsync") setMusic(null); // no music UI in avatar mode
      setMode(a.pipeline);
    }
    const planShots = (a.shots?.length ? a.shots : [emptyShot()]).map((s) => ({
      prompt: s.prompt ?? "",
      negative_prompt: s.negative_prompt ?? "",
    }));
    setShots(a.pipeline === "lipsync" ? planShots.slice(0, 1) : planShots);
    setScript(a.narration_script ?? "");
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const blocker = (): string | null => {
    if (!shots[0]?.prompt.trim()) return "write the first shot's prompt";
    if (mode === "lipsync" && !script.trim()) return "avatar mode needs a narration script";
    if (mode === "lipsync" && !image) return "upload the avatar's face image";
    if (mode === "product" && !image) return "upload the product photo";
    return null;
  };

  const fire = async () => {
    setError(null);
    setJob(null);
    setJobId(null);
    const p = PRESETS[preset];
    const req: GenerateRequest = {
      mode,
      shots: shots.map((s) => ({
        prompt: s.prompt.trim(),
        ...(s.negative_prompt?.trim() ? { negative_prompt: s.negative_prompt.trim() } : {}),
      })),
      script: script.trim() || null,
      language,
      quality: p.quality,
      ...("steps" in p ? { steps: p.steps } : {}),
      postprocess: p.postprocess,
      ...ASPECTS[aspect],
      ...(name ? { name } : {}),
      ...(mode === "lipsync" && image ? { avatar_image: image.path } : {}),
      ...(mode === "product" && image ? { product_image: image.path } : {}),
      ...(mode !== "lipsync" && music ? { music: music.path } : {}),
      ...(voiceId ? { voice_id: voiceId } : {}),
    };
    try {
      const { job_id } = await api.generate(req);
      lastReqRef.current = req;
      setStages(stagesFor(req));
      setTakes([{ jobId: job_id, label: "take 1", done: false }]);
      setViewTakeId(null);
      setJobId(job_id);
      setJob({ status: "queued", progress: 0, detail: "", video_path: null, error: null });
    } catch (e) {
      setError(String(e));
    }
  };

  const reroll = async () => {
    const base = lastReqRef.current;
    if (!base) return;
    setError(null);
    const n = takes.length + 1;
    try {
      const req = {
        ...base,
        seed: Math.floor(Math.random() * 900000) + 1,
        ...(base.name ? { name: `${base.name}-t${n}` } : {}),
      };
      const { job_id } = await api.generate(req);
      setStages(stagesFor(req));
      setTakes((t) => [...t, { jobId: job_id, label: `take ${n}`, done: false }]);
      setViewTakeId(null);
      setJobId(job_id);
      setJob({ status: "queued", progress: 0, detail: "", video_path: null, error: null });
    } catch (e) {
      setError(String(e));
    }
  };

  const running = job && !["done", "error", "cancelled"].includes(job.status);
  const blocked = blocker();
  const step = job?.status === "done" ? 3 : running ? 2 : planned ? 1 : 0;
  const markPlanned = useCallback(() => setPlanned(true), []);

  // Stage chips this REQUEST will actually hit (frozen at fire time).
  const stagesFor = (req: GenerateRequest): { key: string[]; label: string }[] => [
    ...(req.script ? [{ key: ["tts"], label: "Voice" }] : []),
    // Only image-fed pipelines upload an asset to the pod first.
    ...(["lipsync", "product"].includes(req.mode) ? [{ key: ["uploading"], label: "Upload" }] : []),
    { key: ["generating"], label: "Render" },
    { key: ["assembling"], label: "Assemble" },
    ...(req.postprocess ? [{ key: ["post", "postprocess"], label: "Enhance" }] : []),
  ];
  const activeStage = job ? stages.findIndex((s) => s.key.includes(job.status)) : -1;

  // The player is decoupled from the CURRENT job: earlier finished takes stay
  // watchable while a re-roll renders (or after it errors). The PHONE however
  // must show the theater while rendering — only an explicit take click wins.
  const doneTakes = takes.filter((t) => t.done);
  const lastDoneId = doneTakes[doneTakes.length - 1]?.jobId ?? null;
  const showId = viewTakeId ?? lastDoneId;
  const phoneId = viewTakeId ?? (running ? null : lastDoneId);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6 flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight font-display">Create</h1>
        {/* Journey indicator — progress renders in coral. */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && (
                <span className={`h-px w-6 ${i <= step ? "bg-accent/50" : "bg-white/10"}`} />
              )}
              <span
                className={`label-cap ${
                  i === step ? "text-accent!" : i < step ? "text-accent/60!" : ""
                }`}
              >
                {s}
              </span>
            </span>
          ))}
        </div>
      </header>

      <GeminiPanel
        initialIdea={initialIdea}
        autoPlan={!!ideaParam}
        surprise={params.get("surprise") === "1"}
        language={language}
        setLanguage={setLanguage}
        aspect={aspect}
        onAdopt={adopt}
        onPlanned={markPlanned}
      />

      {/* ---- Editor + render panel ---- */}
      <div ref={editorRef} className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <section className="card-raised flex flex-col gap-5 rounded-card p-4 sm:p-6">
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => {
                  if (m.key === mode) return; // re-click must not wipe the upload
                  setMode(m.key);
                  setImage(null);
                  if (m.key === "lipsync") {
                    setShots((s) => s.slice(0, 1));
                    setMusic(null); // its dropzone is hidden in avatar mode — don't send it invisibly
                  }
                }}
                className={`rounded-full px-4 py-2 text-sm ${mode === m.key ? "seg-on" : "seg"}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Shots */}
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="label-cap">
                {mode === "lipsync" ? "Scene · one continuous take" : "Shots"}
              </span>
              <span className="text-[11px] text-text-muted">
                {mode === "lipsync" ? "~14s fixed take" : `≈${shots.length * 5}s total`}
              </span>
            </div>
            {shots.map((s, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-btn bg-black/25 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-text-muted">
                    {mode === "lipsync" ? "scene + action" : `shot ${i + 1} · ~5s`}
                  </span>
                  {mode !== "lipsync" && shots.length > 1 && (
                    <button
                      onClick={() => setShots(shots.filter((_, j) => j !== i))}
                      className="text-xs text-text-muted hover:text-accent"
                    >
                      remove
                    </button>
                  )}
                </div>
                <textarea
                  value={s.prompt}
                  onChange={(e) =>
                    setShots(shots.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))
                  }
                  placeholder="Positive prompt — subject, camera move, lighting, documentary detail…"
                  rows={3}
                  className="input-well w-full rounded-btn p-3 text-sm placeholder:text-text-muted"
                />
                <input
                  value={s.negative_prompt ?? ""}
                  onChange={(e) =>
                    setShots(
                      shots.map((x, j) => (j === i ? { ...x, negative_prompt: e.target.value } : x)),
                    )
                  }
                  placeholder="Negative prompt — cartoon, 3D render, CGI…"
                  className="input-well w-full rounded-btn p-2.5 text-xs placeholder:text-text-muted"
                />
              </div>
            ))}
            {mode !== "lipsync" && (
              <button
                onClick={() => setShots([...shots, emptyShot()])}
                className="self-start rounded-btn border border-dashed border-white/15 px-4 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
              >
                + Add shot (≈+5s)
              </button>
            )}
          </div>

          {/* Script + voice */}
          <div className="flex flex-col gap-2">
            <span className="label-cap">
              Narration script{" "}
              <span className="normal-case tracking-normal">
                {mode === "lipsync" ? "· drives the avatar's mouth" : "· empty = silent"}
              </span>
            </span>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={
                language === "hi"
                  ? "आपकी स्क्रिप्ट यहाँ… (~3 शब्द/सेकंड)"
                  : "Your ad copy here… (~3 words/second)"
              }
              rows={2}
              className="input-well w-full rounded-btn p-3 text-sm placeholder:text-text-muted"
            />
            {/* Language stays reachable after a plan is adopted (the Brain's toggle
                unmounts once approaches exist). */}
            <div className="flex gap-1">
              {[
                { v: "en", l: "English" },
                { v: "hi", l: "हिन्दी" },
              ].map((o) => (
                <button
                  key={o.v}
                  onClick={() => setLanguage(o.v)}
                  className={`rounded-btn px-3 py-1.5 text-xs ${language === o.v ? "seg-on" : "seg"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            {(script.trim() || mode === "lipsync") && (
              <VoicePicker
                voices={voices}
                value={voiceId}
                onChange={setVoiceId}
                language={language}
                onPreviewingChange={setPreviewingVoice}
              />
            )}
          </div>

          {/* Assets (cinematic + b-roll are pure text-to-video — no image) */}
          {mode !== "overlay" && mode !== "cinematic" && (
            <Dropzone
              label={mode === "lipsync" ? "Avatar face image · required" : "Product photo · required"}
              hint="png / jpg / webp"
              accept="image/png,image/jpeg,image/webp"
              kind="image"
              value={image}
              onChange={setImage}
            />
          )}
          {mode !== "lipsync" && (
            <Dropzone
              label="Music bed · optional"
              hint="mp3 / wav — ducks under the narration"
              accept="audio/mpeg,audio/wav"
              kind="audio"
              value={music}
              onChange={setMusic}
            />
          )}
        </section>

        {/* ---- Render panel (sticky only when it sits beside the editor) ---- */}
        <aside className="card-raised flex flex-col gap-4 rounded-card p-4 sm:p-5 lg:sticky lg:top-6">
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
            <p className="text-[11px] text-text-muted">
              {PRESET_HINTS[preset]} · {TIME_HINTS[mode][preset]}
            </p>
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
                  {a === "9:16" ? "9:16 reel" : a === "1:1" ? "1:1 feed" : "16:9 wide"}
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
            {running ? "Rendering…" : "Generate ad"}
          </button>
          {blocked && !running && <p className="text-[11px] text-text-muted">→ {blocked}</p>}
          {error && <p className="text-xs text-accent">{error}</p>}

          {/* The stage: phone-frame preview, render theater, and the finished ad */}
          <PhoneStage
            aspect={aspect}
            script={script}
            job={job}
            running={!!running}
            videoUrl={phoneId ? api.jobVideoUrl(phoneId) : null}
            take={takes.length || 1}
            voicePreviewing={previewingVoice}
          />
          {job && (
            <div className={`flex flex-col gap-3 rounded-btn bg-black/25 p-4 ${running ? "render-breathe" : ""}`}>
              <div className="flex flex-wrap gap-1.5">
                {stages.map((s, i) => (
                  <span
                    key={s.label}
                    className={`rounded-full px-2.5 py-1 text-[10px] ${
                      i === activeStage
                        ? "bg-accent text-white"
                        : job.status === "done" || (activeStage > -1 && i < activeStage)
                          ? "bg-white/10 text-text-secondary"
                          : "bg-white/5 text-text-muted"
                    }`}
                  >
                    {s.label}
                  </span>
                ))}
              </div>
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
                <div
                  className="hero-glow h-1.5 rounded transition-all"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              {running && jobId && (
                <button
                  onClick={() => api.cancel(jobId).catch((e) => setError(String(e)))}
                  className="seg self-start rounded-btn px-3 py-1.5 text-xs"
                >
                  Cancel render
                </button>
              )}
              {job.status === "error" && <p className="text-xs text-accent">{job.error}</p>}
              {takes.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {takes.map((t) => {
                    const active = showId === t.jobId;
                    return t.done ? (
                      <button
                        key={t.jobId}
                        onClick={() => setViewTakeId(t.jobId)}
                        className={`rounded-full px-2.5 py-1 text-[10px] ${
                          active ? "bg-accent text-white" : "seg"
                        }`}
                      >
                        {t.label}
                      </button>
                    ) : t.failed ? (
                      <span
                        key={t.jobId}
                        className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-text-muted"
                      >
                        ✕ {t.label} failed
                      </span>
                    ) : (
                      <span
                        key={t.jobId}
                        className="render-breathe rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-text-muted"
                      >
                        {t.label} · rendering…
                      </span>
                    );
                  })}
                </div>
              )}
              {showId && (
                <div className="flex items-center gap-2">
                  <a
                    href={api.jobVideoUrl(showId)}
                    download
                    className="flex-1 text-center text-xs text-accent hover:underline"
                  >
                    ↓ Download mp4
                  </a>
                  <button
                    onClick={reroll}
                    disabled={!!running}
                    className="seg rounded-btn px-3 py-1.5 text-xs disabled:opacity-40"
                    title="Same everything, new seed — a different take"
                  >
                    🎲 Re-roll
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// Key the studio on its prefill params so same-route navigations (e.g. sidebar
// "Create" after landing on /create?usecase=…) reset the seeded idea/mode state.
function CreateStudioKeyed() {
  const params = useSearchParams();
  const key = `${params.get("usecase") ?? ""}|${params.get("idea") ?? ""}|${params.get("mode") ?? ""}|${params.get("surprise") ?? ""}`;
  return <CreateStudio key={key} />;
}

export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreateStudioKeyed />
    </Suspense>
  );
}
