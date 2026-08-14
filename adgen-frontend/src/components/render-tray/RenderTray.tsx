"use client";

// A render tray docked bottom-right of the viewport. Persistent + collapsible; never
// shifts the page beneath it (position: fixed). Shows aggregate state collapsed,
// per-job detail expanded, and gets out of the way when the queue empties. Mounted in
// the studio layout so it survives navigation between shows during a ~35-min render.

import { useEffect, useId, useMemo, useState } from "react";
import RenderJobRow from "./RenderJobRow";
import { useRenderQueue } from "./useRenderQueue";

const STORAGE_KEY = "adgen.renderTray.collapsed";
const CAP = 4; // visible rows before "+N more"
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#ff4d3d]";

export default function RenderTray() {
  const { jobs, activeCount, aggregateProgress, worstNoticeLevel, dismissAll, retry, cancel } =
    useRenderQueue();

  // SSR-safe: default expanded on the server, apply the stored value in an effect so
  // hydration can't mismatch.
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Track hover and focus independently — a blur must not clear a pause the pointer
  // is still holding (and vice versa), or auto-dismiss fires while the user is reading.
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovering || focused;
  const bodyId = useId();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
      // No saved preference: default to collapsed on small screens (spec: responsive).
      else if (stored === null && window.matchMedia("(max-width: 639px)").matches) setCollapsed(true);
    } catch {
      /* storage blocked — stay expanded */
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const failedCount = jobs.filter((j) => j.status === "failed").length;
  const anyFailed = failedCount > 0;
  const allTerminal = jobs.length > 0 && activeCount === 0;
  const allDone = allTerminal && !anyFailed;

  // Auto-dismiss 5s after everything finishes cleanly; hover/focus cancels it. A
  // failure keeps the tray until the user acts.
  useEffect(() => {
    if (!allDone || paused) return;
    const t = setTimeout(dismissAll, 5000);
    return () => clearTimeout(t);
  }, [allDone, paused, dismissAll]);

  // Announce only count/status transitions (never the per-poll percent).
  const liveSummary = useMemo(() => {
    if (allDone) return `${jobs.length} render${jobs.length > 1 ? "s" : ""} finished`;
    if (anyFailed && activeCount === 0)
      return `${failedCount} render${failedCount > 1 ? "s" : ""} failed`;
    if (activeCount === 1)
      return `Rendering ${jobs.find((j) => j.status === "queued" || j.status === "running")?.label ?? ""}`;
    if (activeCount > 1) return `${activeCount} renders in progress`;
    return "";
  }, [allDone, anyFailed, activeCount, failedCount, jobs]);

  if (jobs.length === 0) return null;

  const singleActive = jobs.find((j) => j.status === "queued" || j.status === "running");
  const title = allDone
    ? `${jobs.length} render${jobs.length > 1 ? "s" : ""} finished`
    : anyFailed && activeCount === 0
      ? failedCount === 1 ? "Render failed" : `${failedCount} renders failed`
      : activeCount === 1 && singleActive
        ? `Rendering ${singleActive.label}`
        : `${activeCount} rendering`;

  const dotColor = anyFailed
    ? "#ef4444"
    : allDone
      ? "#4ade80"
      : "#f5a524"; // running / warning both amber
  const showTriangle = !anyFailed && (worstNoticeLevel === "warning" || worstNoticeLevel === "error");
  const pulse = !anyFailed && !allDone; // only pulse while actively rendering

  const visible = showAll ? jobs : jobs.slice(0, CAP);
  const moreCount = jobs.length - CAP;

  return (
    <div
      className={[
        "fixed z-50 bottom-3 left-3 right-3 sm:left-auto sm:right-5 sm:bottom-5",
        "flex flex-col overflow-hidden rounded-[12px] border border-white/[0.16] bg-[#141414]",
        "max-h-[min(420px,60vh)] max-[639px]:max-h-[50vh]",
        "transition-[width] duration-[180ms] ease motion-reduce:transition-none",
        collapsed ? "sm:w-[210px]" : "sm:w-[320px]",
      ].join(" ")}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      {/* sr-only live region: announces counts/completion, not the streaming percent */}
      <span className="sr-only" aria-live="polite">{liveSummary}</span>

      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        className={`flex w-full shrink-0 items-center gap-2 px-3 py-2.5 text-left hover:bg-[#1c1c1c] ${
          collapsed ? "" : "border-b border-white/[0.09]"
        } ${FOCUS}`}
      >
        <span
          className={`size-[7px] shrink-0 rounded-full ${pulse ? "animate-pulse motion-reduce:animate-none" : ""}`}
          style={{ backgroundColor: dotColor }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-[13px] text-[#ededed]">{title}</span>
        {activeCount > 0 && (
          <span className="shrink-0 font-mono text-[12px] text-[#a1a1a1]" aria-hidden>
            {aggregateProgress}%
          </span>
        )}
        {showTriangle && (
          <span className="shrink-0 text-[11px] text-[#f5a524]" aria-hidden title="has a warning">▲</span>
        )}
        <svg
          className={`shrink-0 text-[#a1a1a1] transition-transform duration-150 motion-reduce:transition-none ${collapsed ? "" : "rotate-180"}`}
          width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden
        >
          <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Body is always mounted (hidden when collapsed) so aria-controls always
          resolves to a real element; `hidden` gives it display:none + no size. */}
      <div id={bodyId} hidden={collapsed} className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((job, i) => (
          <div key={job.id} className={i > 0 ? "border-t border-white/[0.09]" : ""}>
            <RenderJobRow job={job} onRetry={retry} onCancel={cancel} />
          </div>
        ))}
        {!showAll && moreCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={`block w-full border-t border-white/[0.09] px-3 py-2 text-left text-[11.5px] text-[#a1a1a1] hover:bg-[#1c1c1c] ${FOCUS}`}
          >
            +{moreCount} more
          </button>
        )}
      </div>
    </div>
  );
}
