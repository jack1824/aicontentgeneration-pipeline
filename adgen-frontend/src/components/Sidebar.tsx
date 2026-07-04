"use client";

// The studio shell chrome. Desktop (lg+): persistent left rail — brand, New Ad
// CTA, nav, recent renders, live status. Small screens: a slim top bar with a
// hamburger that opens a slide-in drawer holding the same nav, so the content
// column keeps the full viewport width.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, OutputItem, PIPELINE_LABELS } from "@/lib/api";
import BrandMark from "@/components/BrandMark";

const NAV = [
  {
    href: "/dashboard",
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
    href: "/dialogue",
    label: "Dialogue",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4.5">
        <path d="M4 5h11v8H8l-4 3V5z" strokeLinejoin="round" />
        <path d="M13 10h7v6h-3l-2.5 2V16H13" strokeLinejoin="round" />
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

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <BrandMark className="size-8 shrink-0" />
      <span className="text-[12px] font-bold uppercase tracking-wider font-display leading-tight">
        SOCIALADZGEN <span className="text-grad">STUDIO</span>
      </span>
    </Link>
  );
}

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <nav className="flex flex-col gap-1">
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
  );
}

function RecentRenders({ recent }: { recent: OutputItem[] }) {
  if (recent.length === 0) return null;
  return (
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
  );
}

function StatusBlock({ backendUp, podJobs }: { backendUp: boolean | null; podJobs: number }) {
  return (
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
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [recent, setRecent] = useState<OutputItem[]>([]);
  const [podJobs, setPodJobs] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // Navigating closes the drawer; so does Escape. (Same-pathname links — e.g.
  // query-only navigations or tapping the current page — don't change `pathname`,
  // so the drawer ALSO closes on any link tap via onClickCapture below.)
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    // The page must not scroll behind the open drawer.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  return (
    <>
      {/* ---- Desktop rail (lg+) ---- */}
      <aside className="rail-raised sticky top-0 hidden h-screen w-56 shrink-0 flex-col px-4 py-6 lg:flex">
        {/* Logo routes to the landing page at "/"; the Dashboard nav item covers /dashboard */}
        <Brand />
        <Link
          href="/create"
          className="hero-glow mt-7 flex items-center justify-center gap-2 rounded-btn px-4 py-2.5 text-sm font-semibold text-white"
        >
          <span className="text-base leading-none">✦</span> New ad
        </Link>
        <div className="mt-7">
          <NavLinks pathname={pathname} />
        </div>
        {/* Latest renders fill the rail's lower half with something worth clicking. */}
        <RecentRenders recent={recent} />
        <StatusBlock backendUp={backendUp} podJobs={podJobs} />
      </aside>

      {/* ---- Mobile top bar (<lg) ---- */}
      <header className="bar-raised sticky top-0 z-40 flex items-center gap-2 px-3 py-2.5 lg:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className="rounded-btn p-2 text-text-secondary hover:text-text-primary"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Brand />
        <Link
          href="/create"
          className="hero-glow ml-auto shrink-0 rounded-btn px-3.5 py-2 text-xs font-semibold text-white"
        >
          ✦ New ad
        </Link>
      </header>

      {/* ---- Mobile drawer ---- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            className="rail-raised absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto px-4 py-5"
            onClickCapture={(e) => {
              // Any link tap closes the drawer — including same-pathname targets
              // that never trigger the pathname effect.
              if ((e.target as HTMLElement).closest("a")) setDrawerOpen(false);
            }}
          >
            <div className="flex items-center justify-between">
              <Brand />
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-btn px-2.5 py-1.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text-primary"
              >
                ✕
              </button>
            </div>
            <Link
              href="/create"
              className="hero-glow mt-5 flex items-center justify-center gap-2 rounded-btn px-4 py-2.5 text-sm font-semibold text-white"
            >
              <span className="text-base leading-none">✦</span> New ad
            </Link>
            <div className="mt-5">
              <NavLinks pathname={pathname} />
            </div>
            <RecentRenders recent={recent} />
            <StatusBlock backendUp={backendUp} podJobs={podJobs} />
          </div>
        </div>
      )}
    </>
  );
}
