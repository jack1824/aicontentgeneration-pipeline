"use client";

// Avatars — Phase 3 (file 07/09). Saved face + voice profiles: pick "Priya" in
// Create or Dialogue and she looks and sounds the same in every ad. The stored
// reference image IS the consistency — the backend re-injects it every render.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, AvatarProfile, Character, Voice } from "@/lib/api";
import VoicePicker from "@/components/VoicePicker";

// ---- The cast: anchor-first characters (client ask: consistency across ads).
// A character's anchor is pasted VERBATIM into every shot it's cast in; the
// optional face unlocks avatar modes, the optional sheet unlocks Brand Lock.
function CastSection({ voices }: { voices: Voice[] }) {
  const [chars, setChars] = useState<Character[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [anchor, setAnchor] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // one pod render at a time per section: charId + which asset is cooking
  const [gen, setGen] = useState<{ id: string; kind: "face" | "sheet" } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const load = () =>
    api
      .characters()
      .then((d) => setChars(d.characters))
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (name.trim().length === 0 || anchor.trim().length < 10 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.createCharacter({
        name: name.trim(),
        anchor: anchor.trim(),
        ...(voiceId ? { voice_id: voiceId } : {}),
      });
      setName("");
      setAnchor("");
      setVoiceId("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: Character) => {
    if (!window.confirm(`Delete character "${c.name}"? Rendered ads stay in the Library.`)) return;
    try {
      await api.deleteCharacter(c.id);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const generate = async (c: Character, kind: "face" | "sheet") => {
    if (gen) return;
    setGen({ id: c.id, kind });
    setError(null);
    try {
      const { job_id } =
        kind === "face"
          ? await api.generateCharacterFace(c.id)
          : await api.generateCharacterSheet(c.id);
      pollRef.current = setInterval(async () => {
        try {
          const j = await api.job(job_id);
          if (["done", "error", "cancelled"].includes(j.status)) {
            if (pollRef.current) clearInterval(pollRef.current);
            setGen(null);
            if (j.status !== "done") setError(j.error ?? `${kind} generation failed`);
            await load();
          }
        } catch (e) {
          if (String(e).includes("404")) {
            if (pollRef.current) clearInterval(pollRef.current);
            setGen(null);
            setError("render lost — the backend restarted. Try again.");
          }
        }
      }, 5000);
    } catch (e) {
      setGen(null);
      setError(String(e));
    }
  };

  return (
    <section className="flex flex-col gap-4 border-t border-white/5 pt-8">
      <header>
        <h2 className="font-display text-lg font-bold">The cast</h2>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          A character is a saved description — age, face, hair, exact clothing — pasted
          word-for-word into every shot you cast them in. Same person in every ad, every
          mode. Add a generated face for avatar takes, a sheet for Brand Lock.
        </p>
      </header>

      {error && <p className="text-xs text-accent">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
        {/* create form */}
        <div className="card-raised flex h-fit flex-col gap-4 rounded-card p-5">
          <span className="label-cap">New character</span>
          <div className="flex flex-col gap-1.5">
            <span className="label-cap">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={48}
              placeholder="Dr. Ramesh, Meera didi, …"
              className="input-well rounded-btn px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label-cap">Anchor — how every shot describes them</span>
            <textarea
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder="~20 words: “an Indian dentist in his late thirties with short black hair and tired kind eyes, wearing a white doctor's coat over a light blue shirt”"
              className="input-well w-full rounded-btn p-2.5 text-xs placeholder:text-text-muted"
            />
            <p className="text-[10px] text-text-muted">
              this exact text repeats in every shot — that repetition IS the consistency
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label-cap">Voice (optional)</span>
            <VoicePicker voices={voices} value={voiceId} onChange={setVoiceId} />
          </div>
          <button
            onClick={create}
            disabled={name.trim().length === 0 || anchor.trim().length < 10 || busy}
            className={`rounded-btn px-4 py-2.5 text-sm font-semibold text-white transition-opacity ${
              name.trim() && anchor.trim().length >= 10 && !busy
                ? "hero-glow"
                : "cursor-not-allowed bg-surface-2 opacity-50"
            }`}
          >
            {busy ? "saving…" : "Save character"}
          </button>
        </div>

        {/* saved cast */}
        <div className="flex flex-col gap-3">
          <span className="label-cap">
            Saved characters {loaded && chars.length > 0 && `· ${chars.length}`}
          </span>
          {loaded && chars.length === 0 && (
            <div className="card-raised rounded-card p-6 text-center text-sm text-text-muted">
              No characters yet. Save one on the left — then cast them in any ad with one
              tap in Create.
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {chars.map((c) => (
              <div key={c.id} className="card-raised group flex gap-3 rounded-card p-3">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- backend-proxied preview
                    <img src={api.assetUrl(c.image_url)} alt={c.name} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-2xl text-text-muted">
                      {c.name.slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <button
                      onClick={() => remove(c)}
                      aria-label={`Delete character ${c.name}`}
                      className="rounded-btn px-1.5 text-xs text-text-muted opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="line-clamp-2 text-[11px] leading-relaxed text-text-secondary">{c.anchor}</p>
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    <button
                      onClick={() => generate(c, "face")}
                      disabled={!!gen}
                      className="seg rounded-btn px-2 py-1 text-[10px] disabled:opacity-40"
                    >
                      {gen?.id === c.id && gen.kind === "face"
                        ? "rendering…"
                        : c.face_image
                          ? "↻ face"
                          : "✨ Face"}
                    </button>
                    <button
                      onClick={() => generate(c, "sheet")}
                      disabled={!!gen}
                      className="seg rounded-btn px-2 py-1 text-[10px] disabled:opacity-40"
                    >
                      {gen?.id === c.id && gen.kind === "sheet"
                        ? "rendering…"
                        : c.sheet_image
                          ? "↻ sheet"
                          : "🧩 Sheet"}
                    </button>
                    <Link
                      href={`/create?mode=cinematic&cast=${c.id}`}
                      className="seg rounded-btn px-2 py-1 text-[10px] hover:text-text-primary"
                    >
                      🎬 Cast in ad
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function VoiceChip({ voices, voiceId }: { voices: Voice[]; voiceId: string }) {
  const [playing, setPlaying] = useState(false);
  const v = voices.find((x) => x.voice_id === voiceId);
  const preview = async () => {
    if (playing) return;
    setPlaying(true);
    try {
      const blob = await api.voicePreviewBlob(voiceId);
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => setPlaying(false);
      audio.onerror = () => setPlaying(false);
      await audio.play();
    } catch {
      setPlaying(false);
    }
  };
  return (
    <button
      onClick={preview}
      className="seg flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
      title="Preview this avatar's voice"
    >
      <span>{playing ? "🔊" : "▶"}</span>
      <span className="truncate">{v?.name ?? "voice"}</span>
    </button>
  );
}

export default function AvatarsPage() {
  const [avatars, setAvatars] = useState<AvatarProfile[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loaded, setLoaded] = useState(false);

  // create-form state
  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // ✨ generated-face state (Wan renders a 1-frame photoreal still on the pod)
  const [faceSource, setFaceSource] = useState<"upload" | "generate">("upload");
  const [genDesc, setGenDesc] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genPath, setGenPath] = useState<string | null>(null); // server path for createAvatar
  const [genPreview, setGenPreview] = useState<string | null>(null);
  const genPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (genPollRef.current) clearInterval(genPollRef.current);
  }, []);

  const load = () =>
    api
      .avatars()
      .then((d) => setAvatars(d.avatars))
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));

  useEffect(() => {
    load();
    api.voices().then((d) => setVoices(d.voices)).catch(() => {});
  }, []);

  const pickFile = (f: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const generateFace = async () => {
    if (genDesc.trim().length < 3 || genBusy) return;
    setGenBusy(true);
    setError(null);
    setGenPath(null);
    setGenPreview(null);
    try {
      const { job_id } = await api.generateFace({ description: genDesc.trim() });
      genPollRef.current = setInterval(async () => {
        try {
          const j = await api.job(job_id);
          if (j.status === "done") {
            if (genPollRef.current) clearInterval(genPollRef.current);
            setGenPath(j.video_path); // face-gen jobs return the PNG path here
            setGenPreview(j.image_url ?? null);
            setGenBusy(false);
          } else if (["error", "cancelled"].includes(j.status)) {
            if (genPollRef.current) clearInterval(genPollRef.current);
            setError(j.error ?? "face generation failed");
            setGenBusy(false);
          }
        } catch (e) {
          if (String(e).includes("404")) {
            if (genPollRef.current) clearInterval(genPollRef.current);
            setError("render lost — the backend restarted. Try again.");
            setGenBusy(false);
          }
        }
      }, 5000);
    } catch (e) {
      setError(String(e));
      setGenBusy(false);
    }
  };

  const face = faceSource === "upload" ? (file ? "file" : null) : genPath ? "gen" : null;
  const canSave =
    name.trim().length > 0 &&
    voiceId !== "" &&
    face !== null &&
    (face === "file" ? consent : true) && // generated faces are synthetic — no consent needed
    !busy;

  const create = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      if (face === "file" && file) {
        await api.createAvatar({ file, name: name.trim(), voice_id: voiceId, consent });
      } else if (face === "gen" && genPath) {
        await api.createAvatar({
          imagePath: genPath,
          name: name.trim(),
          voice_id: voiceId,
          consent: false,
          type: "library",
        });
      }
      setName("");
      setVoiceId("");
      pickFile(null);
      setConsent(false);
      setGenPath(null);
      setGenPreview(null);
      setGenDesc("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: AvatarProfile) => {
    if (!window.confirm(`Delete avatar "${a.name}"? Ads already rendered with it stay in the Library.`)) return;
    try {
      await api.deleteAvatar(a.id);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <header>
        <h1 className="font-display text-xl font-bold">Avatars</h1>
        <p className="mt-1 text-sm text-text-secondary">
          A saved avatar locks a face to a voice. Pick it in Create or Dialogue and your
          spokesperson stays consistent across every ad — no re-uploading.
        </p>
      </header>

      {error && <p className="text-xs text-accent">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
        {/* ---- Create form ---- */}
        <section className="card-raised flex h-fit flex-col gap-4 rounded-card p-5">
          <span className="label-cap">New avatar</span>

          <div className="flex flex-col gap-1.5">
            <span className="label-cap">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={48}
              placeholder="Priya, Rahul, …"
              className="input-well rounded-btn px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="label-cap">Face</span>
              <div className="flex gap-1">
                {(
                  [
                    { k: "upload", l: "📤 Upload" },
                    { k: "generate", l: "✨ Generate" },
                  ] as { k: "upload" | "generate"; l: string }[]
                ).map((o) => (
                  <button
                    key={o.k}
                    onClick={() => setFaceSource(o.k)}
                    className={`rounded-btn px-2.5 py-1 text-[11px] ${faceSource === o.k ? "seg-on" : "seg"}`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            {faceSource === "generate" ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={genDesc}
                  onChange={(e) => setGenDesc(e.target.value)}
                  placeholder="Describe the spokesperson — e.g. “a young indian woman in her late 20s, warm confident smile, teal kurta”"
                  rows={2}
                  className="input-well w-full rounded-btn p-2.5 text-xs placeholder:text-text-muted"
                />
                {genPreview && !genBusy && (
                  <div className="input-well flex items-center gap-3 rounded-btn p-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- backend-proxied preview */}
                    <img
                      src={api.assetUrl(genPreview)}
                      alt="generated face"
                      className="size-16 rounded-lg object-cover"
                    />
                    <p className="min-w-0 flex-1 text-[11px] text-text-secondary">
                      this face is saved with the profile — regenerate if it&apos;s not right
                    </p>
                  </div>
                )}
                <button
                  onClick={generateFace}
                  disabled={genBusy || genDesc.trim().length < 3}
                  className="seg rounded-btn px-3 py-2 text-xs disabled:opacity-40"
                >
                  {genBusy
                    ? "rendering portrait… (~2–3 min)"
                    : genPath
                      ? "↻ generate a different face"
                      : "✨ Generate face on the pod"}
                </button>
                {genBusy && (
                  <p className="shimmer text-[11px]">Wan is painting a photoreal still…</p>
                )}
              </div>
            ) : preview ? (
              <div className="input-well flex items-center gap-3 rounded-btn p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img src={preview} alt="face preview" className="size-12 rounded-lg object-cover" />
                <p className="min-w-0 flex-1 truncate text-xs text-text-primary">{file?.name}</p>
                <button
                  onClick={() => pickFile(null)}
                  className="rounded-btn px-2.5 py-1.5 text-xs text-text-muted hover:bg-surface-1 hover:text-text-primary"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer flex-col items-center gap-1 rounded-btn border border-dashed border-accent/25 bg-black/20 px-4 py-6 text-center transition-colors hover:border-accent/50"
              >
                <span className="text-lg">🧑</span>
                <p className="text-xs text-text-secondary">drop a clear front-facing photo</p>
                <p className="text-[10px] text-text-muted">good light, one face, no sunglasses</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="label-cap">Voice</span>
            <VoicePicker voices={voices} value={voiceId} onChange={setVoiceId} />
            {voiceId === "" && (
              <p className="text-[10px] text-text-muted">pick the voice this face will always speak with</p>
            )}
          </div>

          {faceSource === "upload" && (
            <label className="flex cursor-pointer items-start gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 accent-(--color-accent,#ff4d3d)"
              />
              <span>
                I have this person&apos;s permission to use their face in generated ads (or
                it&apos;s my own face).
              </span>
            </label>
          )}

          <button
            onClick={create}
            disabled={!canSave}
            className={`rounded-btn px-4 py-2.5 text-sm font-semibold text-white transition-opacity ${
              canSave ? "hero-glow" : "cursor-not-allowed bg-surface-2 opacity-50"
            }`}
          >
            {busy ? "saving…" : "Save avatar"}
          </button>
        </section>

        {/* ---- Saved avatars ---- */}
        <section className="flex flex-col gap-3">
          <span className="label-cap">
            Saved avatars {loaded && avatars.length > 0 && `· ${avatars.length}`}
          </span>
          {loaded && avatars.length === 0 && (
            <div className="card-raised rounded-card p-6 text-center text-sm text-text-muted">
              No avatars yet. Save one on the left — then it&apos;s one click in Create
              (Avatar / Long Avatar) and Dialogue.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {avatars.map((a) => (
              <div key={a.id} className="card-raised group flex flex-col overflow-hidden rounded-card">
                <div className="relative aspect-square bg-surface-2">
                  {a.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- backend-proxied preview
                    <img
                      src={api.assetUrl(a.image_url)}
                      alt={a.name}
                      className="size-full object-cover"
                    />
                  )}
                  <button
                    onClick={() => remove(a)}
                    aria-label={`Delete avatar ${a.name}`}
                    className="absolute right-2 top-2 rounded-btn bg-black/60 px-2 py-1 text-xs text-text-muted opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  <p className="truncate text-sm font-semibold">{a.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <VoiceChip voices={voices} voiceId={a.voice_id} />
                  </div>
                  <div className="mt-1 flex gap-1.5">
                    <Link
                      href={`/create?mode=lipsync&avatar=${a.id}`}
                      className="seg rounded-btn px-2.5 py-1.5 text-[11px] hover:text-text-primary"
                    >
                      🗣 Avatar ad
                    </Link>
                    <Link
                      href={`/create?mode=longcat&avatar=${a.id}`}
                      className="seg rounded-btn px-2.5 py-1.5 text-[11px] hover:text-text-primary"
                    >
                      🧑‍🎤 Long take
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <CastSection voices={voices} />
    </div>
  );
}
