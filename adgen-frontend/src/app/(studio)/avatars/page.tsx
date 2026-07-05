"use client";

// Avatars — Phase 3 (file 07/09). Saved face + voice profiles: pick "Priya" in
// Create or Dialogue and she looks and sounds the same in every ad. The stored
// reference image IS the consistency — the backend re-injects it every render.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, AvatarProfile, Voice } from "@/lib/api";
import VoicePicker from "@/components/VoicePicker";

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

  const canSave = name.trim().length > 0 && voiceId !== "" && file !== null && consent && !busy;

  const create = async () => {
    if (!canSave || !file) return;
    setBusy(true);
    setError(null);
    try {
      await api.createAvatar({ file, name: name.trim(), voice_id: voiceId, consent });
      setName("");
      setVoiceId("");
      pickFile(null);
      setConsent(false);
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
            <span className="label-cap">Face photo</span>
            {preview ? (
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

          <label className="flex cursor-pointer items-start gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 accent-[var(--color-accent,#ff4d3d)]"
            />
            <span>
              I have this person&apos;s permission to use their face in generated ads (or it&apos;s
              my own face).
            </span>
          </label>

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
    </div>
  );
}
