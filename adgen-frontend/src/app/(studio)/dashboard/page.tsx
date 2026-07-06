"use client";

// Dashboard v2 — the OpenArt-style hub. A centered question, one floating
// glass prompt pill feeding the Gemini brain, mode pills for people who
// already know what they want, a cinematic template carousel, the recent
// wall, pipeline banners, and prompt-book teasers. Every preview is a REAL
// render from the library — proof, not decoration.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, OutputItem } from "@/lib/api";
import VideoCard from "@/components/VideoCard";
import { USECASE_LIST, UseCase, usecaseHref } from "@/lib/usecases";

// "I know what I want" shortcuts — straight into Create with the mode set.
const MODE_PILLS: { emoji: string; label: string; href: string }[] = [
  { emoji: "🎥", label: "Cinematic", href: "/create?mode=cinematic" },
  { emoji: "🧩", label: "Brand Lock", href: "/create?mode=ingredients" },
  { emoji: "🧑‍🎤", label: "Avatar", href: "/create?mode=lipsync" },
  { emoji: "📦", label: "Product", href: "/create?mode=product" },
  { emoji: "🎬", label: "B-roll", href: "/create?mode=overlay" },
  { emoji: "💬", label: "Dialogue", href: "/dialogue" },
];

// Category badge per template card (the carousel's floating labels).
const BADGES: Record<string, string> = {
  "product-ads": "Product",
  "brand-lock": "Brand film",
  "ugc-ads": "Social content",
  "dialogue-ads": "Micro drama",
  "cinematic-story": "Short film",
  "festive-ads": "Seasonal",
  "branding-ads": "Brand film",
  "explainer-ads": "Explainer",
  "long-take": "Spokesperson",
  "social-reels": "Social content",
};

// The three flagship pipelines get large cinematic banners.
const ENGINES: {
  title: string;
  tag: string;
  desc: string;
  href: string;
  pipeline: string;
}[] = [
  {
    title: "Cinematic",
    tag: "sound baked in",
    desc: "Story shots that generate their own ambience, voices and SFX in one pass.",
    href: "/create?mode=cinematic",
    pipeline: "ltx2",
  },
  {
    title: "Brand Lock",
    tag: "identity held",
    desc: "Your mascot, pack and store — pixel-identical across every shot of the ad.",
    href: "/create?mode=ingredients",
    pipeline: "ingredients",
  },
  {
    title: "Long Avatar",
    tag: "premium take",
    desc: "One rock-steady spokesperson take, lips synced to your script.",
    href: "/create?mode=longcat",
    pipeline: "longcat",
  },
];

// Prompt-book teasers: the trick in one line, the book one click away.
const INSPIRATIONS: { title: string; line: string }[] = [
  {
    title: "Emotion is written as light",
    line: "You never type feelings — 'desaturated cold blue-grey' IS the sadness, 'warm golden light floods the room' IS the hope.",
  },
  {
    title: "Characters can speak",
    line: "Put the line in quotes inside the shot — the model generates the voice AND the lips. Two people can talk in one shot.",
  },
  {
    title: "Your text belongs on the end card",
    line: "AI video garbles writing — ban 'readable text' in every negative and put the brand, tagline and offer on a crisp end card.",
  },
];

function TemplateCard({ u, preview }: { u: UseCase; preview: OutputItem | undefined }) {
  const ref = useRef<HTMLVideoElement>(null);
  return (
    <Link
      href={usecaseHref(u)}
      onMouseEnter={() => ref.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = ref.current;
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      }}
      className="lift card-raised group relative flex h-72 w-52 shrink-0 snap-start flex-col justify-end overflow-hidden rounded-card p-4 hover:border-accent/40 sm:w-56"
    >
      {preview ? (
        <>
          <video
            ref={ref}
            src={api.fileUrl(preview)}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 size-full object-cover opacity-30 transition-opacity duration-300 group-hover:opacity-70"
          />
          <div className="absolute inset-0 bg-linear-to-t from-base via-base/55 to-transparent" />
        </>
      ) : (
        <div className="placeholder-live absolute inset-0" />
      )}
      <span className="seg absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider">
        {BADGES[u.slug] ?? "Template"}
      </span>
      <div className="relative flex flex-col gap-1.5">
        <span className="text-xl">{u.emoji}</span>
        <h3 className="text-[15px] font-semibold font-display">{u.title}</h3>
        <p className="text-xs leading-relaxed text-text-secondary">{u.desc}</p>
        <p className="mt-0.5 flex items-center justify-between text-[11px] text-text-muted">
          {u.time}
          <span className="text-accent opacity-0 transition-opacity group-hover:opacity-100">
            Start →
          </span>
        </p>
      </div>
    </Link>
  );
}

function CarouselArrow({ dir, onClick }: { dir: "left" | "right"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === "left" ? "Scroll templates left" : "Scroll templates right"}
      className="card-raised hidden size-10 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary md:flex"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4.5">
        {dir === "left" ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
      </svg>
    </button>
  );
}

function EngineBanner({
  e,
  preview,
}: {
  e: (typeof ENGINES)[number];
  preview: OutputItem | undefined;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  return (
    <Link
      href={e.href}
      onMouseEnter={() => ref.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = ref.current;
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      }}
      className="lift card-raised group relative flex h-56 flex-col justify-end overflow-hidden rounded-card p-5 hover:border-accent/40"
    >
      {preview ? (
        <>
          <video
            ref={ref}
            src={api.fileUrl(preview)}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 size-full object-cover opacity-35 transition-opacity duration-300 group-hover:opacity-75"
          />
          <div className="absolute inset-0 bg-linear-to-t from-base via-base/45 to-transparent" />
        </>
      ) : (
        <div className="placeholder-live absolute inset-0" />
      )}
      <div className="relative flex flex-col gap-1">
        <span className="label-cap text-accent">{e.tag}</span>
        <h3 className="text-2xl font-semibold tracking-tight font-display">{e.title}</h3>
        <p className="max-w-xs text-xs leading-relaxed text-text-secondary">{e.desc}</p>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.outputs().then((d) => setOutputs(d.outputs)).catch(() => {});
  }, []);

  // Latest FINAL render per pipeline = each card's living background.
  const previews = useMemo(() => {
    const by: Record<string, OutputItem> = {};
    for (const o of outputs) {
      if (o.kind === "clip") continue;
      if (!by[o.pipeline]) by[o.pipeline] = o; // outputs come newest-first
    }
    return by;
  }, [outputs]);

  const finals = useMemo(() => outputs.filter((o) => o.kind !== "clip").slice(0, 8), [outputs]);

  const go = () => {
    router.push(idea.trim() ? `/create?idea=${encodeURIComponent(idea.trim())}` : "/create");
  };

  // Surprise-me dice: same product, one bold direction Gemini picks. The twist
  // is a flag, not idea text — the studio keeps the visible idea clean.
  const surprise = () => {
    if (!idea.trim()) return;
    router.push(`/create?idea=${encodeURIComponent(idea.trim())}&surprise=1`);
  };

  const scrollRail = (dx: number) =>
    railRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 py-8 sm:px-6 lg:px-8 lg:py-12 xl:px-12">
      {/* ---- Hero: the question, then the pill that answers it ---- */}
      <section className="rise-in flex flex-col items-center gap-6 pt-4 text-center lg:pt-10">
        <span className="rounded-full border border-white/10 bg-surface-1 px-3 py-1 text-[11px] tracking-widest text-text-secondary uppercase">
          AI ad studio · English + हिन्दी
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight font-display sm:text-5xl">
          What would you like to <span className="text-grad">create</span> today?
        </h1>
        <p className="max-w-xl text-[15px] text-text-secondary">
          Describe your product — Gemini plans the pipeline, shots and script. You approve
          every frame.
        </p>

        <div className="glass-pill flex w-full max-w-2xl items-center gap-2 rounded-full p-2 pl-5">
          <input
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="e.g. 15s Instagram ad for my handmade jasmine soap, festive Diwali vibe…"
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-text-muted"
          />
          <button
            onClick={surprise}
            disabled={!idea.trim()}
            title="Surprise me — one bold, unexpected direction"
            aria-label="Surprise me"
            className="seg shrink-0 rounded-full p-2.5 text-sm disabled:opacity-40"
          >
            🎲
          </button>
          <button
            onClick={go}
            aria-label="Plan my ad"
            className="hero-glow flex shrink-0 items-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold text-white sm:px-5"
          >
            <span className="text-base leading-none">✦</span>
            <span className="hidden sm:inline">Plan my ad</span>
          </button>
        </div>

        {/* Mode pills — for people who already know the shape of their ad. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {MODE_PILLS.map((m) => (
            <Link
              key={m.label}
              href={m.href}
              className="seg flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] transition-transform hover:-translate-y-0.5"
            >
              <span>{m.emoji}</span>
              {m.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ---- Template carousel (living previews from real renders) ---- */}
      <section className="rise-in-2 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium tracking-widest text-text-muted uppercase">
            Start from a template
          </h2>
          <div className="flex items-center gap-2">
            <CarouselArrow dir="left" onClick={() => scrollRail(-560)} />
            <CarouselArrow dir="right" onClick={() => scrollRail(560)} />
          </div>
        </div>
        <div
          ref={railRef}
          className="edge-fade -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2"
        >
          {USECASE_LIST.map((u) => (
            <TemplateCard key={u.slug} u={u} preview={previews[u.pipeline]} />
          ))}
        </div>
      </section>

      {/* ---- What's new: the recent wall ---- */}
      <section className="rise-in-3 flex flex-col gap-5 border-t border-white/5 pt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight font-display">
            What&apos;s <span className="text-grad">new</span>
          </h2>
          <Link href="/library" className="text-sm text-accent hover:underline">
            Open library →
          </Link>
        </div>
        {finals.length > 0 ? (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {finals.map((o) => (
              <VideoCard key={o.path} item={o} onOpen={() => router.push("/library")} />
            ))}
          </div>
        ) : (
          <p className="rounded-card border border-dashed border-white/10 p-10 text-center text-sm text-text-muted">
            Nothing here yet — your first ad is one idea away.
          </p>
        )}
      </section>

      {/* ---- The engines: flagship pipelines as cinematic banners ---- */}
      <section className="flex flex-col gap-5 border-t border-white/5 pt-10">
        <h2 className="text-2xl font-semibold tracking-tight font-display">
          The <span className="text-grad">engines</span>
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {ENGINES.map((e) => (
            <EngineBanner key={e.title} e={e} preview={previews[e.pipeline]} />
          ))}
        </div>
      </section>

      {/* ---- Inspirations: prompt-book teasers ---- */}
      <section className="flex flex-col gap-5 border-t border-white/5 pt-10 pb-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight font-display">
            <span className="text-grad">Inspirations</span>
          </h2>
          <Link href="/#prompts" className="text-sm text-accent hover:underline">
            Open the prompt book →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {INSPIRATIONS.map((t) => (
            <Link
              key={t.title}
              href="/#prompts"
              className="lift card-raised flex flex-col gap-2 rounded-card p-5 hover:border-accent/40"
            >
              <h3 className="text-[15px] font-semibold font-display">{t.title}</h3>
              <p className="text-xs leading-relaxed text-text-secondary">{t.line}</p>
              <span className="mt-auto pt-2 text-[11px] text-accent">Learn the trick →</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
