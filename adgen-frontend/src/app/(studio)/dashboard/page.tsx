"use client";

// Dashboard: the front door. One idea bar that feeds the Gemini brain, a
// template gallery previewing REAL renders from the library (OpenArt pattern:
// users pick by OUTCOME, not by pipeline name), and the recent wall.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, OutputItem } from "@/lib/api";
import VideoCard from "@/components/VideoCard";
import { USECASE_LIST, UseCase, usecaseHref } from "@/lib/usecases";

function TemplateCard({
  u,
  preview,
}: {
  u: UseCase;
  preview: OutputItem | undefined;
}) {
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
      className="lift card-raised group relative flex min-h-52 flex-col justify-end overflow-hidden rounded-card p-4 hover:border-accent/40"
    >
      {preview && (
        <>
          <video
            ref={ref}
            src={api.fileUrl(preview)}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 size-full object-cover opacity-25 transition-opacity duration-300 group-hover:opacity-60"
          />
          <div className="absolute inset-0 bg-linear-to-t from-base via-base/60 to-transparent" />
        </>
      )}
      <div className="relative flex flex-col gap-1.5">
        <span className="text-xl">{u.emoji}</span>
        <h3 className="text-base font-semibold font-display">{u.title}</h3>
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

export default function Dashboard() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [outputs, setOutputs] = useState<OutputItem[]>([]);

  useEffect(() => {
    api.outputs().then((d) => setOutputs(d.outputs)).catch(() => {});
  }, []);

  // Latest FINAL render per pipeline = the card's living background.
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

  const heroVideo = finals[0];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-12 flex flex-col gap-8 lg:gap-10">
      {/* ---- Hero: the idea goes straight to the Gemini brain ---- */}
      <section className="grid items-center gap-8 pt-2 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <div className="flex flex-col items-start gap-5">
          <span className="rounded-full border border-white/10 bg-surface-1 px-3 py-1 text-[11px] tracking-widest text-text-secondary uppercase">
            AI ad studio · English + हिन्दी
          </span>
          <h1 className="max-w-2xl text-4xl sm:text-5xl font-semibold leading-[1.05] tracking-tight font-display">
            Make ads that <span className="text-grad">sell</span>, not slides that scroll.
          </h1>
          <p className="max-w-xl text-[15px] text-text-secondary">
            Describe your product. Gemini plans the ad — pipeline, shots, script. Wan 2.2 renders
            it. You approve every frame.
          </p>
          <div className="hero-frame w-full max-w-2xl">
            {/* Stacks on phones (input row, then buttons); one row from sm up. */}
            <div className="input-well flex flex-col gap-2 rounded-xl p-2 sm:flex-row sm:items-center">
              <input
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && go()}
                placeholder="e.g. 15s Instagram ad for my handmade jasmine soap, festive Diwali vibe…"
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-text-muted"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={surprise}
                  disabled={!idea.trim()}
                  title="Surprise me — one bold, unexpected direction"
                  aria-label="Surprise me"
                  className="seg shrink-0 rounded-lg px-3 py-2.5 text-sm disabled:opacity-40"
                >
                  🎲
                </button>
                <button
                  onClick={go}
                  className="hero-glow flex-1 shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold text-white sm:flex-none"
                >
                  ✦ Plan my ad
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* The product IS video — the newest render plays beside the pitch. */}
        <div className="mx-auto hidden w-full max-w-70 lg:block">
          {heroVideo ? (
            <figure className="flex flex-col gap-2.5">
              <div className="hero-frame" style={{ boxShadow: "0 0 56px rgba(255,77,61,0.18)" }}>
                <video
                  src={api.fileUrl(heroVideo)}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="aspect-9/16 w-full rounded-xl bg-black object-cover"
                />
              </div>
              <figcaption className="flex items-center justify-between px-1 text-[11px] text-text-muted">
                <span className="truncate">latest render · {heroVideo.name.replace(/\.mp4$/, "")}</span>
                <Link href="/library" className="shrink-0 text-accent hover:underline">
                  Library →
                </Link>
              </figcaption>
            </figure>
          ) : (
            <div className="placeholder-live aspect-9/16 rounded-card">
              <span className="label-cap">your first render lands here</span>
            </div>
          )}
        </div>
      </section>

      {/* ---- Template gallery (living previews from real renders) ---- */}
      <section className="flex flex-col gap-5 border-t border-white/5 pt-8">
        <h2 className="text-sm font-medium tracking-widest text-text-muted uppercase">
          Start from a template
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {USECASE_LIST.map((u) => (
            <TemplateCard key={u.slug} u={u} preview={previews[u.pipeline]} />
          ))}
        </div>
      </section>

      {/* ---- Recent wall ---- */}
      <section className="flex flex-col gap-6 border-t border-white/5 pt-8 pb-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium tracking-widest text-text-muted uppercase">
            Recent creations
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
    </div>
  );
}
