"use client";

// Proposals as a pitch deck: the director presents ONE approach at a time —
// flip through A/B/C, then greenlight the winner. Replaces the card grid.

import { useCallback, useEffect, useState } from "react";
import { PlanApproach } from "@/lib/api";

const PIPELINE_EMOJI: Record<string, string> = {
  product: "🧴",
  lipsync: "🗣",
  overlay: "🎬",
  cinematic: "🎥",
  multitalk: "👥",
};

export default function PitchDeck({
  approaches,
  onAdopt,
}: {
  approaches: PlanApproach[];
  onAdopt: (a: PlanApproach) => void;
}) {
  const [i, setI] = useState(0);
  const a = approaches[Math.min(i, approaches.length - 1)];

  const flip = useCallback(
    (dir: -1 | 1) =>
      setI((cur) => Math.min(approaches.length - 1, Math.max(0, cur + dir))),
    [approaches.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Never steal arrow keys from form fields elsewhere on the page.
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
        return;
      }
      if (e.key === "ArrowLeft") flip(-1);
      if (e.key === "ArrowRight") flip(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip]);

  if (!a) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="label-cap">
          The pitch · {i + 1} of {approaches.length}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => flip(-1)}
            disabled={i === 0}
            aria-label="Previous approach"
            className="seg rounded-btn px-3 py-1.5 text-xs disabled:opacity-30"
          >
            ‹
          </button>
          {approaches.map((_, d) => (
            <button
              key={d}
              onClick={() => setI(d)}
              aria-label={`Approach ${d + 1}`}
              className={`size-1.5 rounded-full transition-colors ${
                d === i ? "bg-accent" : "bg-white/20 hover:bg-white/40"
              }`}
            />
          ))}
          <button
            onClick={() => flip(1)}
            disabled={i === approaches.length - 1}
            aria-label="Next approach"
            className="seg rounded-btn px-3 py-1.5 text-xs disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      <div key={i} className={`deck-in card-raised flex flex-col gap-3 rounded-card p-6 ${a.available ? "" : "opacity-60"}`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{PIPELINE_EMOJI[a.pipeline] ?? "🎞"}</span>
          <span className="label-cap rounded-full bg-white/8 px-2.5 py-1">{a.pipeline}</span>
          {!a.available && (
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-text-muted">
              coming soon
            </span>
          )}
        </div>
        <h3 className="text-xl font-semibold leading-snug font-display">{a.title}</h3>
        <p className="text-sm leading-relaxed text-text-secondary">{a.why}</p>
        {a.narration_script && (
          <p className="input-well rounded-btn p-3 text-sm italic leading-relaxed text-text-secondary">
            “{a.narration_script.length > 200 ? a.narration_script.slice(0, 200) + "…" : a.narration_script}”
          </p>
        )}
        <p className="text-xs text-text-muted">
          {a.shots?.length || 1} shot{(a.shots?.length || 1) > 1 ? "s" : ""} · {a.audio_strategy}
        </p>
        {a.needs_from_user?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {a.needs_from_user.map((n) => (
              <span key={n} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-text-muted">
                needs: {n}
              </span>
            ))}
          </div>
        )}
        <button
          onClick={() => onAdopt(a)}
          disabled={!a.available}
          className="hero-glow mt-1 self-start rounded-btn px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          🎬 Greenlight this one
        </button>
      </div>
    </div>
  );
}
