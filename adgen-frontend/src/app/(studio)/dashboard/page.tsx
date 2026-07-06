"use client";

// Dashboard v2 — the OpenArt/Higgsfield-style hub. A centered question with
// word-by-word pop, one floating glass prompt pill (typewriter placeholder +
// one-tap Try chips) feeding the Gemini brain, springy mode pills, a cinematic
// template carousel with 3D hover tilt, the recent wall, pipeline banners and
// prompt-book teasers. Every preview is a REAL render from the library —
// proof, not decoration. All motion sits behind prefers-reduced-motion.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { api, OutputItem } from "@/lib/api";
import VideoCard from "@/components/VideoCard";
import IdeaPill from "@/components/IdeaPill";
import { USECASE_LIST, UseCase, usecaseHref } from "@/lib/usecases";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const HEADLINE = "What would you like to create today?";

// "I know what I want" shortcuts — straight into Create with the mode set.
const MODE_PILLS: { emoji: string; label: string; href: string }[] = [
  { emoji: "🎥", label: "Cinematic", href: "/create?mode=cinematic" },
  { emoji: "🧩", label: "Brand Lock", href: "/create?mode=ingredients" },
  { emoji: "🧑‍🎤", label: "Avatar", href: "/create?mode=lipsync" },
  { emoji: "📦", label: "Product", href: "/create?mode=product" },
  { emoji: "🎬", label: "B-roll", href: "/create?mode=overlay" },
  { emoji: "💬", label: "Dialogue", href: "/dialogue" },
];

// One-tap starters for the pill — drawn from ads this studio actually shipped.
const TRY_CHIPS = [
  { label: "🦷 Clinic story", idea: "30s story ad for a dental clinic — empty waiting room turns full, हिन्दी voiceover" },
  { label: "🌾 Farmer pride", idea: "a farmer walks his sugarcane field telling the world about his harvest, in Hindi" },
  { label: "☕ Café launch", idea: "cozy café launch ad — two friends chatting over chai, warm morning light" },
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

// Pointer-follow 3D tilt (desktop, motion-tolerant users only). GSAP owns the
// transform, so tilted cards must NOT also carry the CSS .lift hover class.
function useTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.set(el, { transformPerspective: 700 });
    const rx = gsap.quickTo(el, "rotationX", { duration: 0.4, ease: "power2.out" });
    const ry = gsap.quickTo(el, "rotationY", { duration: 0.4, ease: "power2.out" });
    const ty = gsap.quickTo(el, "y", { duration: 0.35, ease: "power2.out" });
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      ry(px * 8);
      rx(-py * 8);
      ty(-4);
    };
    const leave = () => {
      rx(0);
      ry(0);
      ty(0);
    };
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    return () => {
      el.removeEventListener("mousemove", move);
      el.removeEventListener("mouseleave", leave);
    };
  }, []);
  return ref;
}

function TemplateCard({ u, preview }: { u: UseCase; preview: OutputItem | undefined }) {
  const video = useRef<HTMLVideoElement>(null);
  const tilt = useTilt<HTMLAnchorElement>();
  return (
    <Link
      href={usecaseHref(u)}
      ref={tilt}
      data-card
      onMouseEnter={() => video.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = video.current;
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      }}
      className="card-raised group relative flex h-72 w-52 shrink-0 snap-start flex-col justify-end overflow-hidden rounded-card transition-colors hover:border-accent/40 sm:w-56"
    >
      {preview ? (
        <video
          ref={video}
          src={api.fileUrl(preview)}
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-cover opacity-55 transition-opacity duration-300 group-hover:opacity-90"
        />
      ) : (
        <div className="placeholder-live absolute inset-0" />
      )}
      <span className="seg absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider backdrop-blur-sm">
        {BADGES[u.slug] ?? "Template"}
      </span>
      {/* Frosted info strip — the video plays on beneath the glass. */}
      <div className="relative flex flex-col gap-1.5 border-t border-white/10 bg-black/35 p-4 backdrop-blur-md">
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
      className="card-raised hidden size-10 shrink-0 items-center justify-center rounded-full text-text-secondary transition-all hover:border-accent/40 hover:text-text-primary active:scale-90 md:flex"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4.5" aria-hidden="true">
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
  const video = useRef<HTMLVideoElement>(null);
  const tilt = useTilt<HTMLAnchorElement>();
  return (
    <Link
      href={e.href}
      ref={tilt}
      onMouseEnter={() => video.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = video.current;
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      }}
      className="card-raised group relative flex h-56 flex-col justify-end overflow-hidden rounded-card transition-colors hover:border-accent/40"
    >
      {preview ? (
        <video
          ref={video}
          src={api.fileUrl(preview)}
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-cover opacity-60 transition-opacity duration-300 group-hover:opacity-95"
        />
      ) : (
        <div className="placeholder-live absolute inset-0" />
      )}
      {/* Frosted info strip — the render stays visible through the glass. */}
      <div className="relative flex flex-col gap-1 border-t border-white/10 bg-black/35 p-5 backdrop-blur-md">
        <span className="label-cap text-accent">{e.tag}</span>
        <h3 className="text-2xl font-semibold tracking-tight font-display">{e.title}</h3>
        <p className="max-w-xs text-xs leading-relaxed text-text-secondary">{e.desc}</p>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.outputs().then((d) => setOutputs(d.outputs)).catch(() => {});
  }, []);

  // Word pop on the headline, staggered hero items, springy pills, carousel
  // cards sliding in, then scroll-reveals for everything below the fold.
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from("[data-word]", {
        yPercent: 110,
        duration: 0.6,
        stagger: 0.05,
        ease: "power3.out",
      });
      gsap.from("[data-hero-item]", {
        opacity: 0,
        y: 16,
        duration: 0.5,
        delay: 0.3,
        stagger: 0.1,
        ease: "power2.out",
      });
      gsap.from("[data-pill]", {
        opacity: 0,
        scale: 0.6,
        duration: 0.45,
        delay: 0.55,
        stagger: 0.05,
        ease: "back.out(2)",
      });
      gsap.from("[data-card]", {
        opacity: 0,
        x: 60,
        duration: 0.6,
        delay: 0.45,
        stagger: 0.06,
        ease: "power2.out",
      });
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 32,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 86%" },
        });
      });
    });
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

  const scrollRail = (dx: number) =>
    railRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 py-8 sm:px-6 lg:px-8 lg:py-12 xl:px-12">
      {/* ---- Hero: the question, then the pill that answers it ---- */}
      <section className="relative flex flex-col items-center gap-6 pt-4 text-center lg:pt-10">
        {/* One ambient coral breath behind the pill — the page's hero moment. */}
        <div
          aria-hidden="true"
          className="glow-breathe pointer-events-none absolute inset-x-0 -top-10 mx-auto h-80 max-w-2xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,77,61,0.12), rgba(255,61,110,0.04) 55%, transparent 75%)",
          }}
        />
        <span
          data-hero-item
          className="relative rounded-full border border-white/10 bg-surface-1 px-3 py-1 text-[11px] tracking-widest text-text-secondary uppercase"
        >
          AI ad studio · English + हिन्दी
        </span>
        <h1 className="relative max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight font-display sm:text-5xl">
          {HEADLINE.split(" ").map((w, i) => (
            <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
              <span data-word className={`inline-block ${w === "create" ? "text-grad" : ""}`}>
                {w}&nbsp;
              </span>
            </span>
          ))}
        </h1>
        <p data-hero-item className="relative max-w-xl text-[15px] text-text-secondary">
          Describe your product — Gemini plans the pipeline, shots and script. You approve
          every frame.
        </p>

        <div data-hero-item className="relative flex w-full justify-center">
          <IdeaPill dice chips={TRY_CHIPS} />
        </div>

        {/* Mode pills — for people who already know the shape of their ad. */}
        <div className="relative flex flex-wrap items-center justify-center gap-2">
          {MODE_PILLS.map((m) => (
            <Link
              key={m.label}
              href={m.href}
              data-pill
              className="seg flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] transition-transform hover:-translate-y-0.5 active:scale-95"
            >
              <span>{m.emoji}</span>
              {m.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ---- Template carousel (living previews from real renders) ---- */}
      <section className="flex flex-col gap-4">
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
      <section data-reveal className="flex flex-col gap-5 border-t border-white/5 pt-10">
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
      <section data-reveal className="flex flex-col gap-5 border-t border-white/5 pt-10">
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
      <section data-reveal className="flex flex-col gap-5 border-t border-white/5 pt-10 pb-6">
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
