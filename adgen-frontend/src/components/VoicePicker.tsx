"use client";

// One voice picker for the whole app. On the paid ElevenLabs plan every voice
// is reachable (premade + professional/library), so we show them ALL and let
// the user filter by language and gender. The language facet defaults to the
// surface's own language (a Hindi ad opens on the Hindi voices). Every voice
// has an inline ▶ preview.

import { useMemo, useRef, useState } from "react";
import { api, Voice } from "@/lib/api";

const LANG_LABEL: Record<string, string> = { hi: "हिन्दी", en: "English" };

export default function VoicePicker({
  voices,
  value,
  onChange,
  language = "en",
  onPreviewingChange,
  sampleText,
}: {
  voices: Voice[];
  value: string;
  onChange: (id: string) => void;
  language?: string;
  onPreviewingChange?: (playing: boolean) => void;
  // Audition the voice reading THIS line (the character's real copy) instead of a
  // canned sample — "hear the actual delivery before you lock it in".
  sampleText?: string;
}) {
  const [gender, setGender] = useState<"all" | "female" | "male">("all");
  // playing holds the voice_id currently auditioning ("" = the Default chip).
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Monotonic request token: switching voices mid-fetch invalidates the older
  // fetch so two clips can't end up playing at once (rapid auditioning is the norm).
  const reqRef = useRef(0);

  // Languages actually present in the roster (so we never show a dead filter).
  const langs = useMemo(() => {
    const s = new Set<string>();
    for (const v of voices) {
      const l = (v.labels?.language ?? "").slice(0, 2);
      if (l) s.add(l);
    }
    return [...s];
  }, [voices]);

  // Default the language filter to this surface's language if that language has
  // voices — otherwise show all (never strand the user on an empty list).
  const wanted = (language || "").slice(0, 2);
  const [lang, setLang] = useState<string>(langs.includes(wanted) ? wanted : "all");

  const list = useMemo(() => {
    let l = voices;
    if (lang !== "all") l = l.filter((v) => (v.labels?.language ?? "").slice(0, 2) === lang);
    if (gender !== "all") l = l.filter((v) => (v.labels?.gender ?? "").toLowerCase() === gender);
    return l;
  }, [voices, gender, lang]);

  const stopAudio = () => {
    reqRef.current++; // invalidate any in-flight preview fetch
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlaying(null);
    onPreviewingChange?.(false);
  };

  // Click the one that's playing → stop it; click another (or while one plays) →
  // switch to it. No more "wait until the clip finishes" lock.
  const preview = async (id: string) => {
    if (playing === id) {
      stopAudio();
      return;
    }
    stopAudio();
    const token = reqRef.current; // stopAudio just bumped — this is the live generation
    setPlaying(id);
    onPreviewingChange?.(true);
    try {
      const blob = await api.voicePreviewBlob(id, language, sampleText);
      if (token !== reqRef.current) return; // a newer click/stop superseded this fetch
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = stopAudio;
      audio.onerror = stopAudio;
      await audio.play();
    } catch {
      if (token === reqRef.current) stopAudio();
    }
  };

  // Never render NOTHING: an empty roster (e.g. an API key without the
  // `voices_read` permission) used to remove this control entirely, which left
  // voice_id empty and silently disabled the Save button with no explanation.
  if (voices.length === 0) {
    return (
      <p className="text-[11px] leading-relaxed text-amber-300/80">
        Voice list unavailable — the server&apos;s default voice will be used. (Enable the
        <span className="mx-1 font-mono text-[10px]">voices_read</span>
        permission on the ElevenLabs API key to choose a different one.)
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", "female", "male"] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGender(g)}
            className={`rounded-btn px-2.5 py-1 text-[11px] capitalize ${gender === g ? "seg-on" : "seg"}`}
          >
            {g === "all" ? "All" : g}
          </button>
        ))}
        {langs.length > 1 && (
          <span className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setLang("all")}
              className={`rounded-btn px-2.5 py-1 text-[10px] ${lang === "all" ? "seg-on" : "seg"}`}
            >
              All langs
            </button>
            {langs.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-btn px-2.5 py-1 text-[10px] ${lang === l ? "seg-on" : "seg"}`}
              >
                {LANG_LABEL[l] ?? l.toUpperCase()}
              </button>
            ))}
          </span>
        )}
      </div>

      <div className="flex max-h-28 flex-wrap content-start gap-1.5 overflow-y-auto pr-1">
        <span className={`flex items-center rounded-full ${value === "" ? "seg-on" : "seg"}`}>
          <button
            onClick={() => onChange("")}
            title="Use the voice configured on the server"
            className="py-1.5 pl-3 text-[11px]"
          >
            Default voice
          </button>
          <button
            onClick={() => preview("")}
            aria-label="Preview the default voice"
            className="py-1.5 pl-1.5 pr-2.5 text-[11px] text-text-muted transition-colors hover:text-text-primary"
          >
            {playing === "" ? "🔊" : "▶"}
          </button>
        </span>
        {list.map((v) => (
          <span
            key={v.voice_id}
            className={`flex items-center rounded-full ${value === v.voice_id ? "seg-on" : "seg"}`}
          >
            <button onClick={() => onChange(v.voice_id)} className="py-1.5 pl-3 text-[11px]">
              {v.name}
              {v.labels?.accent && (
                <span className="text-text-muted"> · {v.labels.accent}</span>
              )}
            </button>
            <button
              onClick={() => preview(v.voice_id)}
              aria-label={`Preview voice ${v.name}`}
              className="py-1.5 pl-1.5 pr-2.5 text-[11px] text-text-muted transition-colors hover:text-text-primary"
            >
              {playing === v.voice_id ? "🔊" : "▶"}
            </button>
          </span>
        ))}
        {list.length === 0 && (
          <p className="p-1 text-[11px] text-text-muted">
            no voices match this filter — clear it, or keep{" "}
            <span className="text-text-secondary">Default voice</span> (that saves fine)
          </p>
        )}
      </div>
    </div>
  );
}
