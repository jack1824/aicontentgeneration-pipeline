"use client";

import Link from "next/link";
import { RenderJob } from "./useRenderQueue";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#ff4d3d]";

export default function RenderJobRow({
  job,
  onRetry,
  onCancel,
}: {
  job: RenderJob;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const failed = job.status === "failed";
  const active = job.status === "queued" || job.status === "running";
  const pct = Math.round(job.progress);

  const body = (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {failed && <span className="size-[7px] shrink-0 rounded-full bg-[#ef4444]" aria-hidden />}
        {/* never wrap the filename */}
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#ededed]" title={job.label}>
          {job.label}
        </span>
        {!failed && (
          <span className="shrink-0 font-mono text-[11.5px] text-[#a1a1a1]" aria-hidden>
            {pct}%
          </span>
        )}
        {active && (
          <button
            type="button"
            aria-label={`Cancel ${job.label}`}
            title="Cancel this render"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onCancel(job.id);
            }}
            className={`shrink-0 rounded-[5px] px-1 text-[13px] leading-none text-[#6f6f6f] hover:text-[#ededed] ${FOCUS}`}
          >
            ✕
          </button>
        )}
      </div>

      {!failed && (
        <div
          className="h-[3px] w-full overflow-hidden rounded-[2px] bg-white/[0.08]"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${job.label} render progress`}
        >
          {/* keep the bar transition even under reduced motion (spec) */}
          <div
            className="h-full rounded-[2px] bg-[#4ade80] transition-[width] duration-[400ms] ease"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
      )}

      {!failed && job.stage && <p className="text-[11.5px] text-[#6f6f6f]">{job.stage}</p>}

      {job.notice && (
        <p
          className={`text-[11.5px] leading-[1.45] ${
            job.notice.level === "error" ? "text-[#ef4444]" : "text-[#f5a524]"
          }`}
        >
          {job.notice.message}
        </p>
      )}

      {failed && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRetry(job.id);
          }}
          className={`self-start rounded-[6px] border border-white/[0.16] px-2 py-1 text-[11.5px] text-[#ededed] hover:bg-[#1c1c1c] ${FOCUS}`}
        >
          Retry
        </button>
      )}
    </div>
  );

  // A row deep-links to its episode when we have one — kept separate from the header
  // toggle so clicking a row never collapses the tray.
  if (job.href && !failed) {
    return (
      <Link href={job.href} className={`block hover:bg-[#1c1c1c] ${FOCUS}`}>
        {body}
      </Link>
    );
  }
  return body;
}
