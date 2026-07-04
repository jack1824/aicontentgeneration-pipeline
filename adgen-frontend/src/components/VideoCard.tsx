"use client";

// The wall-of-work tile: a real <video> that plays on hover (Higgsfield-style),
// with pipeline + kind badges. Used by the Dashboard strip and the Library grid.

import { useRef } from "react";
import { api, OutputItem, PIPELINE_LABELS } from "@/lib/api";

export default function VideoCard({
  item,
  busy = false,
  onOpen,
}: {
  item: OutputItem;
  busy?: boolean; // an enhance/revoice job is running on this video
  onOpen?: (item: OutputItem) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  return (
    <button
      onClick={() => onOpen?.(item)}
      onMouseEnter={() => ref.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = ref.current;
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      }}
      className="lift group relative block w-full overflow-hidden rounded-card border border-white/5 bg-surface-1 text-left transition-shadow hover:border-accent/50 hover:ring-1 hover:ring-accent/40"
    >
      <div className="relative aspect-3/4 w-full bg-black">
        <video
          ref={ref}
          src={api.fileUrl(item)}
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/85 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
          <p className="truncate text-xs font-medium text-text-primary">{item.name}</p>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-medium text-text-secondary transition-colors group-hover:bg-accent/25 group-hover:text-white">
              {PIPELINE_LABELS[item.pipeline] ?? item.pipeline}
            </span>
            {item.kind === "final-post" && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-accent">✨ enhanced</span>
            )}
            {item.kind === "clip" && (
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-text-muted">clip</span>
            )}
          </div>
        </div>
        {busy ? (
          <span className="render-breathe absolute right-2.5 top-2.5 rounded-full bg-accent/25 px-2 py-0.5 text-[10px] text-accent">
            ⏳ working…
          </span>
        ) : (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-text-secondary opacity-0 transition-opacity group-hover:opacity-100">
            ▶ hover to preview
          </span>
        )}
      </div>
    </button>
  );
}
