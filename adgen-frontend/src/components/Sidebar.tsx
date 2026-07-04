"use client";

// Persistent left rail: brand, New Ad CTA, nav, recent renders, live status.
// Raised off the canvas (rail-raised) so it reads as a panel, not empty void.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, OutputItem, PIPELINE_LABELS } from "@/lib/api";
import BrandMark from "@/components/BrandMark";

const NAV = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" className="size-4.5">
        <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/create",
    label: "Create",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4.5">
        <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3.2" />
      </svg>
    ),
  },
  {
    href: "/sequence",
    label: "Sequence",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4.5">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M8 6v12M16 6v12" />
      </svg>
    ),
  },
  {
    href: "/remix",
    label: "Remix",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4.5">
        <path d="M4 7h10m0 0-3-3m3 3-3 3M20 17H10m0 0 3-3m-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/library",
    label: "Library",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4.5">
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [recent, setRecent] = useState<OutputItem[]>([]);
  const [podJobs, setPodJobs] = useState(0);

  useEffect(() => {
    const check = () => {
      api.health().then(() => setBackendUp(true)).catch(() => setBackendUp(false));
      api.queue().then((q) => setPodJobs(q.pod_jobs)).catch(() => setPodJobs(0));
    };
    check();
    const t = setInterval(check, 30000);
    api.outputs()
      .then((d) => setRecent(d.outputs.filter((o) => o.kind !== "clip").slice(0, 4)))
      .catch(() => {});
    return () => clearInterval(t);
  }, []);

  return (
    <aside className="rail-raised sticky top-0 flex h-screen w-56 shrink-0 flex-col px-4 py-6">
      {/* Logo routes to the public landing page; the Dashboard nav item covers "/" */}
      <Link href="/landing" className="flex items-center gap-2.5 px-2">
        <BrandMark className="size-8 shrink-0" />
        <span className="text-[12px] font-bold uppercase tracking-wider font-display leading-tight">
          SOCIALADZGEN <span className="text-grad">STUDIO</span>
        </span>
      </Link>

      <Link
        href="/create"
        className="hero-glow mt-7 flex items-center justify-center gap-2 rounded-btn px-4 py-2.5 text-sm font-semibold text-white"
      >
        <span className="text-base leading-none">✦</span> New ad
      </Link>

      <nav className="mt-7 flex flex-col gap-1">
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-btn px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-accent/10 text-text-primary"
                  : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
              }`}
            >
              <span className={active ? "text-accent" : ""}>{n.icon}</span>
              {n.label}
            </Link>
          );
        })}
      </nav>

      {/* Latest renders fill the rail's lower half with something worth clicking. */}
      {recent.length > 0 && (
        <div className="mt-8 flex min-h-0 flex-col gap-0.5 overflow-hidden">
          <span className="label-cap px-3 pb-1.5">Recent renders</span>
          {recent.map((o) => (
            <Link
              key={o.path}
              href="/library"
              className="group flex flex-col gap-0.5 rounded-btn px-3 py-2 transition-colors hover:bg-surface-2"
            >
              <span className="truncate text-xs text-text-secondary transition-colors group-hover:text-text-primary">
                {o.name.replace(/\.mp4$/, "")}
              </span>
              <span className="text-[10px] text-text-muted">
                {PIPELINE_LABELS[o.pipeline] ?? o.pipeline}
                {o.kind === "final-post" && " · ✨ enhanced"}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1.5 border-t border-white/5 px-3 pt-4 text-xs text-text-muted">
        <p className="flex items-center gap-2 truncate">
          <span
            className={`size-1.5 shrink-0 rounded-full ${
              backendUp === null ? "bg-text-muted" : backendUp ? "bg-green-400" : "bg-accent"
            }`}
          />
          {backendUp === null ? "checking…" : backendUp ? "orchestrator online" : "orchestrator offline"}
        </p>
        {podJobs > 0 && (
          <p className="truncate text-accent/80">
            ⏳ pod busy · {podJobs} render{podJobs > 1 ? "s" : ""} queued
          </p>
        )}
        <p className="truncate">Wan 2.2 · ElevenLabs · Gemini</p>
      </div>
    </aside>
  );
}
