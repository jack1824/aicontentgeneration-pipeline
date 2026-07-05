"use client";

// Dialogue ads — TWO speakers, shot/reverse-shot, the classic problem→solution
// format. Each speaker has their own face + voice; every turn renders as one
// Wan-S2V take (~14s) and the cuts alternate between them. Runs on the proven
// sequence engine with per-segment voices — no new models, no long waits.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  api,
  ASPECTS,
  AspectKey,
  AvatarProfile,
  Job,
  PRESETS,
  PresetKey,
  Voice,
} from "@/lib/api";
import Dropzone, { Uploaded } from "@/components/Dropzone";
import VoicePicker from "@/components/VoicePicker";
import { usePersistentState } from "@/lib/usePersistentState";

type Speaker = {
  name: string;
  image: Uploaded | null;
  avatarId: string; // saved avatar profile — face + voice in one tap (Phase 3)
  voiceId: string;
  scene: string; // how this speaker looks/acts — reused for all their turns
  genderHint?: string; // the brain's voice suggestion ("female"/"male")
};

type Turn = { speaker: 0 | 1; text: string };

const SPEAKER_TINT = ["text-accent", "text-sky-400"];
const SPEAKER_RING = ["ring-accent/40", "ring-sky-400/40"];

const emptySpeaker = (name: string): Speaker => ({
  name,
  image: null,
  avatarId: "",
  voiceId: "",
  scene: "",
});

export default function DialoguePage() {
  // Everything typed here survives navigating away and back (sessionStorage).
  const [speakers, setSpeakers] = usePersistentState<[Speaker, Speaker]>("adgen-dlg-speakers", [
    emptySpeaker("Speaker A"),
    emptySpeaker("Speaker B"),
  ]);
  const [turns, setTurns] = usePersistentState<Turn[]>("adgen-dlg-turns", [
    { speaker: 0, text: "" },
    { speaker: 1, text: "" },
  ]);
  const [language, setLanguage] = usePersistentState("adgen-dlg-lang", "en");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [avatars, setAvatars] = useState<AvatarProfile[]>([]);
  const [music, setMusic] = usePersistentState<Uploaded | null>("adgen-dlg-music", null);
  const [preset, setPreset] = usePersistentState<PresetKey>("adgen-dlg-preset", "preview");
  const [aspect, setAspect] = usePersistentState<AspectKey>("adgen-dlg-aspect", "9:16");
  const [name, setName] = usePersistentState("adgen-dlg-name", "");

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- The brain: idea -> both speakers + all turns (faces/voices stay yours) ----
  const [idea, setIdea] = usePersistentState("adgen-dlg-idea", "");
  const [planTurns, setPlanTurns] = usePersistentState("adgen-dlg-planturns", 2);
  const [thinking, setThinking] = useState(false);
  const [planned, setPlanned] = useState(false);

  const runPlan = async (regenerate = false) => {
    if (idea.trim().length < 3 || thinking) return;
    setThinking(true);
    setError(null);
    try {
      const p = await api.planDialogue({
        idea: idea.trim(),
        language,
        turns: planTurns,
        regenerate,
      });
      setSpeakers((sp) => [
        {
          ...sp[0],
          name: p.speakers[0]?.name || sp[0].name,
          scene: p.speakers[0]?.scene ?? sp[0].scene,
          genderHint: p.speakers[0]?.gender,
        },
        {
          ...sp[1],
          name: p.speakers[1]?.name || sp[1].name,
          scene: p.speakers[1]?.scene ?? sp[1].scene,
          genderHint: p.speakers[1]?.gender,
        },
      ] as [Speaker, Speaker]);
      setTurns(p.turns.map((t) => ({ speaker: (t.speaker === "b" ? 1 : 0) as 0 | 1, text: t.text })));
      if (p.title && !name) {
        setName(p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40));
      }
      setPlanned(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setThinking(false);
    }
  };

  useEffect(() => {
    api.voices().then((d) => setVoices(d.voices)).catch(() => {});
    api.avatars().then((d) => setAvatars(d.avatars)).catch(() => {});
  }, []);

  // Dialogue renders are long — survive navigation like Create/Sequence do.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem("adgen-active-dlg-job");
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
      sessionStorage.setItem("adgen-active-dlg-job", JSON.stringify({ jobId, job }));
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
        // 404 = job vanished (backend restart) — recover, don't freeze.
        if (String(e).includes("404")) {
          if (pollRef.current) clearInterval(pollRef.current);
          try {
            sessionStorage.removeItem("adgen-active-dlg-job");
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

  const patchSpeaker = (i: 0 | 1, p: Partial<Speaker>) =>
    setSpeakers((sp) => {
      const next = [...sp] as [Speaker, Speaker];
      next[i] = { ...next[i], ...p };
      return next;
    });

  const patchTurn = (i: number, p: Partial<Turn>) =>
    setTurns((ts) => ts.map((t, j) => (j === i ? { ...t, ...p } : t)));

  const usedSpeakers = new Set(turns.map((t) => t.speaker));
  const totalSeconds = turns.length * 14.4;

  const blocker = (): string | null => {
    if (turns.length < 2) return "a dialogue needs at least two turns";
    for (let i = 0; i < turns.length; i++) {
      if (!turns[i].text.trim()) return `turn ${i + 1} needs its line`;
    }
    for (const idx of usedSpeakers) {
      const sp = speakers[idx];
      if (!sp.image && !sp.avatarId) return `${sp.name} needs a face — pick an avatar or upload`;
      if (!sp.scene.trim()) return `${sp.name} needs a scene description`;
    }
    if (
      usedSpeakers.size === 2 &&
      speakers[0].avatarId &&
      speakers[0].avatarId === speakers[1].avatarId
    )
      return "both speakers are the same avatar — pick two different people";
    if (
      usedSpeakers.size === 2 &&
      speakers[0].voiceId &&
      speakers[0].voiceId === speakers[1].voiceId
    )
      return "give the speakers two different voices";
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
        segments: turns.map((t) => {
          const sp = speakers[t.speaker];
          return {
            pipeline: "lipsync" as const,
            prompt: sp.scene.trim(),
            script: t.text.trim(),
            // Saved avatar wins: the backend resolves its locked face + voice.
            ...(sp.avatarId ? { avatar_id: sp.avatarId } : { image: sp.image!.path }),
            ...(sp.voiceId ? { voice_id: sp.voiceId } : {}),
          };
        }),
        language,
        quality: p.quality,
        ...("steps" in p ? { steps: p.steps } : {}),
        postprocess: p.postprocess,
        ...ASPECTS[aspect],
        name: name || `dialogue-${Date.now().toString(36)}`,
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
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight font-display">Dialogue</h1>
        <p className="text-sm text-text-muted">
          two speakers, cut for cut — the classic problem → solution ad
        </p>
      </header>

      {/* ---- The Brain: one idea in, both sides of the conversation out ---- */}
      <section className="card-raised flex flex-col gap-3 rounded-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="hero-glow flex size-7 items-center justify-center rounded-lg text-xs text-white">✦</span>
          <h2 className="text-lg font-semibold font-display">The Brain</h2>
          <span className="text-xs text-text-muted">
            one idea in — names, scenes and every line out. Faces &amp; voices stay yours.
          </span>
        </div>
        <div className="hero-frame">
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Describe the ad — e.g. “cloud kitchen owner can't get orders, her friend shows her our video ad platform”"
            rows={2}
            className="input-well w-full rounded-xl p-4 text-[15px] leading-relaxed placeholder:text-text-muted"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="label-cap mr-1">Turns</span>
            {[2, 3, 4].map((t) => (
              <button
                key={t}
                onClick={() => setPlanTurns(t)}
                className={`rounded-btn px-3 py-1.5 text-xs ${planTurns === t ? "seg-on" : "seg"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {planned && (
              <button
                onClick={() => runPlan(true)}
                disabled={thinking}
                className="seg rounded-btn px-3 py-2 text-xs disabled:opacity-40"
                title="Same idea, a different take"
              >
                ↻ fresh take
              </button>
            )}
            <button
              onClick={() => runPlan(false)}
              disabled={thinking || idea.trim().length < 3}
              className="hero-glow rounded-btn px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 disabled:shadow-none"
            >
              {thinking ? "Writing…" : "✦ Write the dialogue"}
            </button>
          </div>
        </div>
        {thinking && (
          <p className="shimmer text-sm font-medium">Gemini is writing both sides of the conversation…</p>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <section className="card-raised flex flex-col gap-5 rounded-card p-4 sm:p-6">
          {/* ---- The two speakers ---- */}
          <div className="grid gap-4 md:grid-cols-2">
            {([0, 1] as const).map((i) => {
              const sp = speakers[i];
              return (
                <div
                  key={i}
                  className={`flex flex-col gap-2.5 rounded-btn bg-black/25 p-4 ring-1 ${SPEAKER_RING[i]}`}
                >
                  <input
                    value={sp.name}
                    onChange={(e) => patchSpeaker(i, { name: e.target.value || `Speaker ${i ? "B" : "A"}` })}
                    className={`bg-transparent text-sm font-semibold outline-none ${SPEAKER_TINT[i]}`}
                  />
                  {avatars.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {avatars.map((a) => (
                        <button
                          key={a.id}
                          onClick={() =>
                            sp.avatarId === a.id
                              ? patchSpeaker(i, { avatarId: "" })
                              : patchSpeaker(i, {
                                  avatarId: a.id,
                                  image: null,
                                  voiceId: a.voice_id,
                                  name: sp.name.startsWith("Speaker") ? a.name : sp.name,
                                })
                          }
                          title={`use ${a.name}'s face + voice`}
                          className={`flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[11px] ${
                            sp.avatarId === a.id ? "seg-on" : "seg"
                          }`}
                        >
                          {a.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element -- backend-proxied thumb
                            <img
                              src={api.assetUrl(a.image_url)}
                              alt={a.name}
                              className="size-5 rounded-full object-cover"
                            />
                          )}
                          {a.name}
                        </button>
                      ))}
                      <Link href="/avatars" className="text-[10px] text-text-muted hover:text-text-primary">
                        manage →
                      </Link>
                    </div>
                  )}
                  <Dropzone
                    label={sp.avatarId ? "Face image · using saved avatar" : "Face image · required"}
                    accept="image/png,image/jpeg,image/webp"
                    kind="image"
                    value={sp.image}
                    onChange={(v) => patchSpeaker(i, { image: v, ...(v ? { avatarId: "" } : {}) })}
                  />
                  <textarea
                    value={sp.scene}
                    onChange={(e) => patchSpeaker(i, { scene: e.target.value })}
                    placeholder="Scene + look — e.g. “young woman in a bright kitchen, morning light, speaking warmly to camera”"
                    rows={2}
                    className="input-well w-full rounded-btn p-2.5 text-xs placeholder:text-text-muted"
                  />
                  <VoicePicker
                    voices={voices}
                    value={sp.voiceId}
                    onChange={(v) => patchSpeaker(i, { voiceId: v })}
                    language={language}
                  />
                  {sp.genderHint && !sp.voiceId && (
                    <p className="text-[10px] text-text-muted">
                      the brain suggests a {sp.genderHint} voice for {sp.name}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ---- Turns ---- */}
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="label-cap">The conversation</span>
              <span className="text-[11px] text-text-muted">
                ≈{Math.round(totalSeconds)}s total · each turn is one ~14s take
              </span>
            </div>
            {turns.map((t, i) => {
              const sp = speakers[t.speaker];
              const words = t.text.trim() ? t.text.trim().split(/\s+/).length : 0;
              const est = Math.ceil(words / 3);
              const over = est > 14;
              return (
                <div key={i} className="flex flex-col gap-1.5 rounded-btn bg-black/25 p-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => patchTurn(i, { speaker: t.speaker === 0 ? 1 : 0 })}
                      title="Switch speaker"
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${SPEAKER_TINT[t.speaker]} bg-white/5`}
                    >
                      {sp.name} ⇄
                    </button>
                    <span className="text-[10px] text-text-muted">turn {i + 1}</span>
                    <div className="ml-auto flex items-center gap-1">
                      {turns.length > 2 && (
                        <button
                          onClick={() => setTurns(turns.filter((_, j) => j !== i))}
                          className="seg rounded-btn px-2 py-1 text-xs"
                          aria-label="Remove turn"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={t.text}
                    onChange={(e) => patchTurn(i, { text: e.target.value })}
                    placeholder={
                      t.speaker === 0
                        ? "e.g. “Yaar, my orders just aren't growing… what am I missing?”"
                        : "e.g. “You're missing video. One photo — I'll show you.”"
                    }
                    rows={2}
                    className="input-well w-full rounded-btn p-2.5 text-sm placeholder:text-text-muted"
                  />
                  {t.text.trim() && (
                    <p className={`text-[11px] ${over ? "text-accent" : "text-text-muted"}`}>
                      ≈{est}s of speech / ~14s take{over && " — too long, it will be cut off"}
                    </p>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  setTurns([
                    ...turns,
                    // next turn defaults to the OTHER speaker — natural back-and-forth
                    { speaker: turns.length ? (turns[turns.length - 1].speaker === 0 ? 1 : 0) : 0, text: "" },
                  ])
                }
                className="seg rounded-btn px-4 py-2.5 text-xs"
              >
                + Add turn <span className="text-text-muted">(≈+14s)</span>
              </button>
            </div>
            {turns.length > 4 && (
              <p className="text-[11px] text-accent">
                {turns.length} turns ≈ {Math.round(totalSeconds)}s — long for a social ad; 2–4
                turns lands the punch faster.
              </p>
            )}
          </div>
        </section>

        {/* ---- Render rail ---- */}
        <aside className="card-raised flex flex-col gap-4 rounded-card p-4 sm:p-5 lg:sticky lg:top-6">
          <div className="flex flex-col gap-2">
            <span className="label-cap">Language</span>
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
          </div>

          <Dropzone
            label="Music bed · optional (under the whole ad)"
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
            <p className="text-[11px] text-text-muted">
              ≈6 min per turn on preview — a 2-turn dialogue is ~12 min
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
            {running ? "Rendering dialogue…" : `Generate ${Math.round(totalSeconds)}s dialogue`}
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
                  onClick={() => api.cancel(jobId).catch((e) => setError(String(e)))}
                  className="seg self-start rounded-btn px-3 py-1.5 text-xs"
                >
                  Cancel render
                </button>
              )}
              {job.status === "error" && <p className="text-xs text-accent">{job.error}</p>}
              {job.status === "done" && jobId && (
                <>
                  <video controls autoPlay className="w-full rounded-xl" src={api.jobVideoUrl(jobId)} />
                  <a
                    href={api.jobVideoUrl(jobId)}
                    download
                    className="text-center text-xs text-accent hover:underline"
                  >
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
