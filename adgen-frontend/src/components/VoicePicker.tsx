"use client";

// One voice picker for the whole app. Free-tier honest: ElevenLabs blocks
// LIBRARY voices via API on the free plan, so we default to premade voices
// ("plan-safe") and keep a toggle for the rest once the paid plan is active.
// Facets: gender chips; every voice has an inline ▶ preview.

import { useMemo, useState } from "react";
import { api, Voice } from "@/lib/api";

export default function VoicePicker({
  voices,
  value,
  onChange,
  language = "en",
  onPreviewingChange,
}: {
  voices: Voice[];
  value: string;
  onChange: (id: string) => void;
  language?: string;
  onPreviewingChange?: (playing: boolean) => void;
}) {
  const [gender, setGender] = useState<"all" | "female" | "male">("all");
  const [showLibrary, setShowLibrary] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  const list = useMemo(() => {
    let l = voices;
    if (!showLibrary) {
      const premade = voices.filter((v) => v.category === "premade");
      if (premade.length > 0) l = premade;
    }
    if (gender !== "all") {
      l = l.filter((v) => (v.labels?.gender ?? "").toLowerCase() === gender);
    }
    return l;
  }, [voices, gender, showLibrary]);

  const preview = async (id: string) => {
    if (playing) return;
    setPlaying(id);
    onPreviewingChange?.(true);
    const stop = () => {
      setPlaying(null);
      onPreviewingChange?.(false);
    };
    try {
      const blob = await api.voicePreviewBlob(id, language);
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = stop;
      audio.onerror = stop;
      await audio.play();
    } catch {
      stop();
    }
  };

  if (voices.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {(["all", "female", "male"] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGender(g)}
            className={`rounded-btn px-2.5 py-1 text-[11px] capitalize ${gender === g ? "seg-on" : "seg"}`}
          >
            {g === "all" ? "All" : g}
          </button>
        ))}
        <button
          onClick={() => setShowLibrary((s) => !s)}
          title="Library voices need the paid ElevenLabs plan — premade voices always work"
          className={`ml-auto rounded-btn px-2.5 py-1 text-[10px] ${showLibrary ? "seg-on" : "seg"}`}
        >
          {showLibrary ? "showing all voices" : "plan-safe voices"}
        </button>
      </div>

      <div className="flex max-h-28 flex-wrap content-start gap-1.5 overflow-y-auto pr-1">
        <button
          onClick={() => onChange("")}
          className={`rounded-full px-3 py-1.5 text-[11px] ${value === "" ? "seg-on" : "seg"}`}
        >
          Default
        </button>
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
          <p className="p-1 text-[11px] text-text-muted">no voices match this filter</p>
        )}
      </div>
    </div>
  );
}
