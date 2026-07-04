"use client";

// The phone stage: a live phone-frame preview that is ALSO the render theater.
// Idle: your script plays as cycling captions on the ad surface. Rendering: each
// stage becomes a scene (voice booth → film slate + REC → cutting → polish).
// Done: the finished ad plays inside the phone with a one-shot glow burst.

import { useEffect, useRef, useState } from "react";
import { AspectKey, Job } from "@/lib/api";

const SCREEN_ASPECTS: Record<AspectKey, string> = {
  "9:16": "9/16",
  "1:1": "1/1",
  "16:9": "16/9",
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  return reduced;
}

function splitLines(script: string): string[] {
  return script
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

// Cycles a highlight through the script lines (voice-booth + idle captions).
function CaptionCycle({ script, label }: { script: string; label?: string }) {
  const lines = splitLines(script);
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || lines.length < 2) return;
    const t = setInterval(() => setActive((a) => (a + 1) % lines.length), 1400);
    return () => clearInterval(t);
  }, [reduced, lines.length]);

  return (
    <div className="flex w-full flex-col items-center gap-2 px-4">
      {label && <span className="label-cap">{label}</span>}
      <div className="flex w-full flex-col gap-1.5">
        {lines.map((l, i) => (
          <p
            key={i}
            className={`text-center text-[11px] leading-snug transition-colors duration-500 ${
              !reduced && i === active ? "text-text-primary" : "text-text-muted"
            }`}
          >
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

function Slate({ take }: { take: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-28">
        <div
          className="slate-top h-3.5 rounded-t-sm"
          style={{
            background:
              "repeating-linear-gradient(135deg, #f5f5f4 0 8px, #0a0a0b 8px 16px)",
          }}
        />
        <div className="flex h-14 flex-col justify-center gap-1 rounded-b-sm bg-surface-2 px-2.5">
          <p className="text-[8px] tracking-widest text-text-muted">SOCIALADZGEN</p>
          <p className="text-[10px] font-semibold text-text-primary">TAKE {take}</p>
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-text-secondary">
        <span className="rec-dot size-2 rounded-full bg-accent" /> REC · camera rolling
      </p>
    </div>
  );
}

function Theater({ job, script, take }: { job: Job; script: string; take: number }) {
  const s = job.status;
  if (s === "tts") {
    return script ? (
      <CaptionCycle script={script} label="🎙 recording the voice" />
    ) : (
      <p className="label-cap">🎙 recording the voice</p>
    );
  }
  if (s === "uploading") return <p className="label-cap">📦 sending to the studio…</p>;
  if (s === "generating") return <Slate take={take} />;
  if (s === "assembling") return <p className="label-cap">✂ cutting the film…</p>;
  if (s === "post" || s === "postprocess") return <p className="label-cap">✨ polishing every frame…</p>;
  return <p className="label-cap">🎬 taking your brief…</p>;
}

export default function PhoneStage({
  aspect,
  script,
  job,
  running,
  videoUrl,
  take,
  voicePreviewing,
}: {
  aspect: AspectKey;
  script: string;
  job: Job | null;
  running: boolean;
  videoUrl: string | null;
  take: number;
  voicePreviewing: boolean;
}) {
  // One-shot burst the first time a video lands.
  const [burst, setBurst] = useState(false);
  const hadVideo = useRef(false);
  useEffect(() => {
    if (videoUrl && !hadVideo.current) {
      hadVideo.current = true;
      setBurst(true);
      const t = setTimeout(() => setBurst(false), 1600);
      return () => clearTimeout(t);
    }
    if (!videoUrl) hadVideo.current = false;
  }, [videoUrl]);

  return (
    <div className={`mx-auto w-full max-w-60 rounded-[2.2rem] border border-white/10 bg-black p-2 ${burst ? "glow-burst" : ""}`}>
      {/* notch */}
      <div className="mx-auto mb-1.5 h-1.5 w-16 rounded-full bg-white/10" />
      <div className="flex min-h-90 items-center justify-center overflow-hidden rounded-[1.7rem] bg-[#0e0e10]">
        {/* the ad surface morphs to the chosen aspect inside the phone */}
        <div
          className="relative flex w-full items-center justify-center overflow-hidden bg-black transition-all duration-500"
          style={{ aspectRatio: SCREEN_ASPECTS[aspect] }}
        >
          {videoUrl ? (
            <video
              key={videoUrl}
              controls
              autoPlay
              playsInline
              className="size-full object-contain"
              src={videoUrl}
            />
          ) : job && (running || job.status === "queued") ? (
            <Theater job={job} script={script} take={take} />
          ) : (
            <div className="placeholder-live size-full flex-col gap-2 border-0">
              {script.trim() ? (
                <CaptionCycle script={script} label="your captions" />
              ) : (
                <span className="label-cap">your ad plays here</span>
              )}
              {voicePreviewing && (
                <span className="render-breathe rounded-full bg-accent/20 px-2.5 py-1 text-[10px] text-accent">
                  🔊 voice playing
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
