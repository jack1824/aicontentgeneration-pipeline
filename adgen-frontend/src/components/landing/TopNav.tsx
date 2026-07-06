"use client";

// Sticky landing nav (OpenArt pattern, our restraint): brand, two dropdowns,
// two anchors, ONE glowing CTA. Mobile collapses to a flat panel.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { USECASE_LIST, usecaseHref } from "@/lib/usecases";
import BrandMark from "@/components/BrandMark";

const TOOLS = [
  { label: "Product Spotlight", desc: "Animate a product photo", href: "/create?mode=product" },
  { label: "Talking Avatar", desc: "A spokesperson reads your script", href: "/create?mode=lipsync" },
  { label: "Cinematic B-roll", desc: "Scenes + voiceover", href: "/create?mode=overlay" },
];

function Dropdown({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Hover-open only on devices that actually hover — on touch, a tap would fire
  // mouseenter (open) then click (toggle closed) and the panel would flash away.
  const [canHover, setCanHover] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCanHover(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  // Dismiss on tap/click outside while open (WCAG 1.4.13 dismissibility).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={canHover ? () => setOpen(true) : undefined}
      onMouseLeave={canHover ? () => setOpen(false) : undefined}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          btnRef.current?.focus();
        }
      }}
    >
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={id}
        className="flex items-center gap-1 rounded-btn px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        {label}
        <svg viewBox="0 0 12 12" className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div id={id} className="card-raised absolute left-0 top-full z-50 mt-1 w-64 rounded-card p-2">
          {children}
        </div>
      )}
    </div>
  );
}

export default function TopNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 border-b border-white/5 bg-base/75 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-6 py-3.5 md:px-12">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <BrandMark className="size-8 shrink-0" />
          <span className="text-[12px] font-bold uppercase tracking-wider font-display">
            SOCIALADZGEN <span className="text-grad">STUDIO</span>
          </span>
        </Link>

        {/* Desktop items */}
        <div className="ml-6 hidden items-center gap-1 lg:flex">
          <Dropdown id="nav-tools" label="AI Tools">
            {TOOLS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="flex flex-col gap-0.5 rounded-btn px-3 py-2.5 transition-colors hover:bg-surface-2"
              >
                <span className="text-sm text-text-primary">{t.label}</span>
                <span className="text-xs text-text-muted">{t.desc}</span>
              </Link>
            ))}
          </Dropdown>
          <Dropdown id="nav-usecases" label="Use cases">
            {USECASE_LIST.map((u) => (
              <Link
                key={u.slug}
                href={usecaseHref(u)}
                className="flex flex-col gap-0.5 rounded-btn px-3 py-2.5 transition-colors hover:bg-surface-2"
              >
                <span className="text-sm text-text-primary">{u.title}</span>
                <span className="text-xs text-text-muted">{u.desc}</span>
              </Link>
            ))}
          </Dropdown>
          <a
            href="#how"
            className="rounded-btn px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            How it works
          </a>
          <Link
            href="/library"
            className="rounded-btn px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            Library
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/create"
            className="hero-glow hidden rounded-btn px-5 py-2 text-sm font-semibold text-white sm:inline-block"
          >
            Start creating →
          </Link>
          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="rounded-btn p-2 text-text-secondary lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              {mobileOpen ? <path d="M5 5l14 14M19 5 5 19" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile panel: flat lists, same links */}
      {mobileOpen && (
        <div className="max-h-[calc(100dvh-3.75rem)] overflow-y-auto border-t border-white/5 bg-base/95 px-6 pb-6 pt-3 backdrop-blur-md lg:hidden">
          <p className="label-cap px-1 pb-1 pt-2">AI Tools</p>
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href} className="block rounded-btn px-3 py-2 text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary">
              {t.label}
            </Link>
          ))}
          <p className="label-cap px-1 pb-1 pt-4">Use cases</p>
          {USECASE_LIST.map((u) => (
            <Link key={u.slug} href={usecaseHref(u)} className="block rounded-btn px-3 py-2 text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary">
              {u.title}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-2">
            <a href="#how" onClick={() => setMobileOpen(false)} className="rounded-btn px-3 py-2 text-sm text-text-secondary hover:text-text-primary">
              How it works
            </a>
            <Link href="/library" className="rounded-btn px-3 py-2 text-sm text-text-secondary hover:text-text-primary">
              Library
            </Link>
            <Link href="/create" className="hero-glow rounded-btn px-5 py-2.5 text-center text-sm font-semibold text-white">
              Start creating →
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
