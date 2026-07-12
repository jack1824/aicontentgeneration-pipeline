"use client";

// The studio shell chrome. Desktop (lg+): persistent left rail — brand, New Ad
// CTA, nav, recent renders, live status. Small screens: a slim top bar with a
// hamburger that opens a slide-in drawer holding the same nav, so the content
// column keeps the full viewport width.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, AvatarProfile, OutputItem, PIPELINE_LABELS } from "@/lib/api";
import BrandMark from "@/components/BrandMark";

type NavItem = { href: string; label: string; icon: React.ReactNode };

// Grouped nav (OpenArt pattern): uppercase section labels, monochrome icons,
// coral-outline active state. Home sits alone above the groups.
const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      {
        href: "/dashboard",
        label: "Home",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4.5">
            <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Create",
    items: [
      {
        href: "/create",
        label: "Single ad",
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
        href: "/timeline",
        label: "Director",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4.5">
            <rect x="3" y="5" width="18" height="5" rx="1.5" />
            <rect x="3" y="14" width="12" height="5" rx="1.5" />
            <path d="M17 14v5" strokeLinecap="round" />
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
    ],
  },
  {
    label: "Assets",
    items: [
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
      {
        href: "/avatars",
        label: "Avatars",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4.5">
            <circle cx="12" cy="8.5" r="3.5" />
            <path d="M5 19.5c1.4-3 4-4.5 7-4.5s5.6 1.5 7 4.5" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Inspire",
    items: [
      {
        href: "/#prompts",
        label: "Prompt book",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4.5">
            <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" strokeLinejoin="round" />
            <path d="M5 16.5A2.5 2.5 0 0 1 7.5 14H19" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        href: "/#playbook",
        label: "Playbook",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4.5">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 9h18M8 4v5" strokeLinecap="round" />
            <path d="m11 13 4 2.5-4 2.5v-5z" strokeLinejoin="round" />
          </svg>
        ),
      },
    ],
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
    <nav className="flex flex-col gap-4">
      {NAV_GROUPS.map((g) => (
        <div key={g.label ?? "home"} className="flex flex-col gap-1">
          {g.label && <span className="label-cap px-3 pb-0.5">{g.label}</span>}
          {g.items.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`group flex items-center gap-3 rounded-btn border border-transparent px-3 py-2 text-sm transition-colors ${
                  active
                    ? "nav-active"
                    : "text-text-secondary hover:border-white/10 hover:bg-surface-2 hover:text-text-primary"
                }`}
              >
                <span className={`transition-transform group-hover:translate-x-0.5 ${active ? "text-accent" : ""}`}>{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function AvatarStrip({ avatars }: { avatars: AvatarProfile[] }) {
  // Saved avatars, one click from use: tapping a face opens Create in Avatar
  // mode with that profile pre-selected (its locked face + tied voice).
  if (avatars.length === 0) return null;
  return (
    <div className="mt-6 flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-3">
        <span className="label-cap">Avatars</span>
        <Link href="/avatars" className="text-[10px] text-text-muted hover:text-text-primary">
          manage
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-3">
        {avatars.map((a) => (
          <Link
            key={a.id}
            href={`/create?mode=lipsync&avatar=${a.id}`}
            title={`${a.name} — new avatar ad`}
          >
            {a.image_url && (
              // eslint-disable-next-line @next/next/no-img-element -- backend-proxied thumb
              <img
                src={api.assetUrl(a.image_url)}
                alt={a.name}
                className="size-8 rounded-full object-cover ring-1 ring-white/10 transition-shadow hover:ring-accent/60"
              />
            )}
          </Link>
        ))}
        <Link
          href="/avatars"
          aria-label="New avatar"
          className="flex size-8 items-center justify-center rounded-full border border-dashed border-white/20 text-xs text-text-muted transition-colors hover:border-accent/50 hover:text-text-primary"
        >
          ＋
        </Link>
      </div>
    </div>
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
  const [avatars, setAvatars] = useState<AvatarProfile[]>([]);
  const [podJobs, setPodJobs] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop rail collapse — remembered across visits (starts open on the server
  // render; localStorage applies after mount to avoid a hydration mismatch).
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("adgen-rail") === "closed");
    } catch {
      /* storage blocked — stay open */
    }
  }, []);
  const setRail = (closed: boolean) => {
    setCollapsed(closed);
    try {
      localStorage.setItem("adgen-rail", closed ? "closed" : "open");
    } catch {
      /* nonfatal */
    }
  };

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

  // Refetch on navigation: an avatar saved on /avatars must appear in the rail
  // the moment the user moves on (the Sidebar itself never remounts).
  useEffect(() => {
    api.avatars().then((d) => setAvatars(d.avatars.slice(0, 8))).catch(() => {});
  }, [pathname]);

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
      {collapsed && (
        <button
          onClick={() => setRail(false)}
          aria-label="Open sidebar"
          className="card-raised fixed left-3 top-3 z-40 hidden rounded-btn p-2 text-text-secondary hover:text-text-primary lg:flex"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      )}
      <aside
        className={`rail-raised sticky top-0 h-screen w-56 shrink-0 flex-col px-4 py-6 ${
          collapsed ? "hidden" : "hidden lg:flex"
        }`}
      >
        {/* Logo routes to the landing page at "/"; the Dashboard nav item covers /dashboard */}
        <div className="flex items-center justify-between">
          <Brand />
          <button
            onClick={() => setRail(true)}
            aria-label="Collapse sidebar"
            title="Hide sidebar"
            className="rounded-btn p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 6l-6 6 6 6" />
            </svg>
          </button>
        </div>
        <Link
          href="/create"
          className="hero-glow mt-7 flex items-center justify-center gap-2 rounded-btn px-4 py-2.5 text-sm font-semibold text-white"
        >
          <span className="text-base leading-none">✦</span> New ad
        </Link>
        <div className="mt-7">
          <NavLinks pathname={pathname} />
        </div>
        <AvatarStrip avatars={avatars} />
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
            <AvatarStrip avatars={avatars} />
            <RecentRenders recent={recent} />
            <StatusBlock backendUp={backendUp} podJobs={podJobs} />
          </div>
        </div>
      )}
    </>
  );
}
