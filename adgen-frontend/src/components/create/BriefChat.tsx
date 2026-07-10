"use client";

// The conversational brief: the FIRST question is instant ("what are we
// selling?"), then The Brain reads the answer and asks the follow-ups a
// creative director would ask about THIS product (via /plan-questions,
// Gemini -> Groq ladder). The old fixed audience/vibe questions survive only
// as the offline fallback. Answers compose the same idea string /plan always
// received. "I'll just type it" is the escape hatch back to the textarea.

import { useState } from "react";
import { api } from "@/lib/api";

type Question = { key: string; ask: string; placeholder: string; chips: string[] };

const FIRST_QUESTION: Question = {
  key: "product",
  ask: "What are we selling today?",
  placeholder: "e.g. handmade jasmine soap · my salon · a 2BHK project…",
  chips: [],
};

// Offline fallback — used only when the brain can't be reached.
const FALLBACK_QUESTIONS: Question[] = [
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
  language = "en",
}: {
  onComplete: (idea: string) => void;
  onTypeInstead: () => void;
  language?: string;
}) {
  const [questions, setQuestions] = useState<Question[]>([FIRST_QUESTION]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  const finish = (all: Question[], finalAnswers: Record<string, string>) => {
    const product = finalAnswers.product ?? "";
    const rest = all
      .slice(1)
      .map((q) => {
        const a = (finalAnswers[q.key] ?? "").replace(/^[^\p{L}\p{N}]+/u, "");
        return a ? `${q.ask.replace(/\?$/, "")}: ${a}` : null;
      })
      .filter(Boolean)
      .join(". ");
    onComplete(rest ? `${product} — ${rest}.` : product);
  };

  const submit = async (value: string) => {
    const v = value.trim();
    if (!v || thinking) return;
    const q = questions[step];
    const next = { ...answers, [q.key]: v };
    setAnswers(next);
    setDraft("");

    if (step === 0) {
      // The Brain reads the product and writes the rest of the interview.
      setThinking(true);
      try {
        const { questions: dynamic } = await api.planQuestions(v, language);
        setQuestions([FIRST_QUESTION, ...dynamic]);
      } catch {
        setQuestions([FIRST_QUESTION, ...FALLBACK_QUESTIONS]);
      } finally {
        setThinking(false);
      }
      setStep(1);
    } else if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      finish(questions, next);
    }
  };

  const q = questions[Math.min(step, questions.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      {/* Answered turns stay visible like a chat transcript */}
      {questions.slice(0, step).map((prev) => (
        <div key={prev.key} className="flex flex-col gap-1.5">
          <p className="max-w-md rounded-2xl rounded-bl-sm bg-surface-2/70 px-4 py-2.5 text-sm text-text-secondary">
            {prev.ask}
          </p>
          <p className="max-w-md self-end rounded-2xl rounded-br-sm bg-accent/15 px-4 py-2.5 text-sm text-text-primary">
            {answers[prev.key]}
          </p>
        </div>
      ))}

      {thinking ? (
        <p className="bubble-in max-w-md animate-pulse rounded-2xl rounded-bl-sm bg-surface-2/70 px-4 py-2.5 text-sm text-text-muted">
          thinking about your product…
        </p>
      ) : (
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
      )}

      <button
        onClick={onTypeInstead}
        className="self-start text-xs text-text-muted hover:text-text-primary"
      >
        I&apos;ll just type the whole idea instead →
      </button>
    </div>
  );
}
