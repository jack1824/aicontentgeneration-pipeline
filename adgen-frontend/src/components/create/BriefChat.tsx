"use client";

// The conversational brief: The Brain asks three quick questions (product,
// audience, vibe) like a creative director — the answers compose the same idea
// string the /plan endpoint always received. "I'll just type it" is the escape
// hatch back to the classic textarea.

import { useState } from "react";

type Answers = { product: string; audience: string; vibe: string };

const QUESTIONS: {
  key: keyof Answers;
  ask: string;
  placeholder: string;
  chips: string[];
}[] = [
  {
    key: "product",
    ask: "What are we selling today?",
    placeholder: "e.g. handmade jasmine soap · my salon · a 2BHK project…",
    chips: [],
  },
  {
    key: "audience",
    ask: "Who should this ad reach?",
    placeholder: "e.g. women 25–40 in Pune…",
    chips: ["Young professionals", "Families", "Gen-Z", "Local customers", "Premium buyers"],
  },
  {
    key: "vibe",
    ask: "And the vibe?",
    placeholder: "your own words…",
    chips: ["✨ Festive", "👑 Premium", "😄 Fun", "❤️ Emotional", "⚡ Bold", "🌿 Calm"],
  },
];

export default function BriefChat({
  onComplete,
  onTypeInstead,
}: {
  onComplete: (idea: string) => void;
  onTypeInstead: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({ product: "", audience: "", vibe: "" });
  const [draft, setDraft] = useState("");

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const next = { ...answers, [QUESTIONS[step].key]: v };
    setAnswers(next);
    setDraft("");
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      // Unicode-aware strip: drop leading emoji/symbols but keep Devanagari etc.
      const vibe = next.vibe.replace(/^[^\p{L}\p{N}]+/u, "") || next.vibe;
      onComplete(`${next.product} — for ${next.audience}. Vibe: ${vibe}.`);
    }
  };

  const q = QUESTIONS[step];

  return (
    <div className="flex flex-col gap-3">
      {/* Answered turns stay visible like a chat transcript */}
      {QUESTIONS.slice(0, step).map((prev) => (
        <div key={prev.key} className="flex flex-col gap-1.5">
          <p className="max-w-md rounded-2xl rounded-bl-sm bg-surface-2/70 px-4 py-2.5 text-sm text-text-secondary">
            {prev.ask}
          </p>
          <p className="max-w-md self-end rounded-2xl rounded-br-sm bg-accent/15 px-4 py-2.5 text-sm text-text-primary">
            {answers[prev.key]}
          </p>
        </div>
      ))}

      <div key={q.key} className="bubble-in flex flex-col gap-2.5">
        <p className="max-w-md rounded-2xl rounded-bl-sm bg-surface-2/70 px-4 py-2.5 text-sm text-text-primary">
          {q.ask}
        </p>
        {q.chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {q.chips.map((c) => (
              <button
                key={c}
                onClick={() => submit(c)}
                className="seg rounded-full px-3.5 py-1.5 text-xs"
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // IME guard: the Enter that COMMITS a Devanagari composition must
              // not submit a half-typed answer.
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(draft);
            }}
            placeholder={q.placeholder}
            autoFocus
            className="input-well min-w-0 flex-1 rounded-btn p-3 text-sm placeholder:text-text-muted"
          />
          <button
            onClick={() => submit(draft)}
            disabled={!draft.trim()}
            className="hero-glow shrink-0 rounded-btn px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 disabled:shadow-none"
            aria-label="Answer"
          >
            →
          </button>
        </div>
      </div>

      <button
        onClick={onTypeInstead}
        className="self-start text-xs text-text-muted hover:text-text-primary"
      >
        I&apos;ll just type the whole idea instead →
      </button>
    </div>
  );
}
