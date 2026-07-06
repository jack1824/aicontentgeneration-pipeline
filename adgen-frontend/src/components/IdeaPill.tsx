"use client";

// The floating glass prompt pill — shared by the landing hero and the studio
// hub so the whole product has ONE front door. Ships the fun: a typewriter
// placeholder cycling real ad ideas (teaching by example), optional one-tap
// "Try:" chips that fill the input, the 🎲 surprise die, and a glowing submit.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const DEFAULT_EXAMPLES = [
  "15s Instagram ad for my handmade jasmine soap, festive Diwali vibe…",
  "मेरे sweet shop का Diwali ad — gift boxes, warm lights…",
  "story ad for my dental clinic — empty waiting room turns full…",
  "perfume ad with slow cinematic camera moves…",
  "two friends talking about my café over chai…",
];

export type IdeaChip = { label: string; idea: string };

export default function IdeaPill({
  submitLabel = "Plan my ad",
  dice = false,
  chips,
  examples = DEFAULT_EXAMPLES,
}: {
  submitLabel?: string;
  dice?: boolean;
  chips?: IdeaChip[];
  examples?: string[];
}) {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [ph, setPh] = useState(examples[0]);

  // Typewriter placeholder: type → linger → erase → next idea. Pure timeouts,
  // no motion library; reduced-motion users get a static example instead.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    let pos = 0;
    let deleting = false;
    let t: number;
    const tick = () => {
      const full = examples[i];
      pos += deleting ? -2 : 1;
      if (!deleting && pos >= full.length + 16) deleting = true; // overshoot = linger
      if (deleting && pos <= 0) {
        deleting = false;
        i = (i + 1) % examples.length;
      }
      setPh(examples[i].slice(0, Math.max(0, Math.min(examples[i].length, pos))));
      t = window.setTimeout(tick, deleting ? 16 : pos > full.length ? 90 : 36);
    };
    t = window.setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, [examples]);

  const go = () =>
    router.push(idea.trim() ? `/create?idea=${encodeURIComponent(idea.trim())}` : "/create");
  const surprise = () => {
    if (!idea.trim()) return;
    router.push(`/create?idea=${encodeURIComponent(idea.trim())}&surprise=1`);
  };

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-3">
      <div className="glass-pill flex w-full items-center gap-2 rounded-full p-2 pl-5">
        <input
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder={ph}
          aria-label="Describe the ad you want"
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-text-muted"
        />
        {dice && (
          <button
            onClick={surprise}
            disabled={!idea.trim()}
            title="Surprise me — one bold, unexpected direction"
            aria-label="Surprise me"
            className="seg dice-spin shrink-0 rounded-full p-2.5 text-sm active:scale-90 disabled:opacity-40"
          >
            🎲
          </button>
        )}
        <button
          onClick={go}
          aria-label={submitLabel}
          className="hero-glow flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-transform active:scale-95 sm:px-5"
        >
          <span className="text-base leading-none">✦</span>
          <span className="hidden sm:inline">{submitLabel}</span>
        </button>
      </div>
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-[12px]">
          <span className="text-text-muted">Try:</span>
          {chips.map((c) => (
            <button
              key={c.label}
              onClick={() => setIdea(c.idea)}
              className="seg rounded-full px-3 py-1.5 transition-transform hover:-translate-y-0.5 active:scale-95"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
