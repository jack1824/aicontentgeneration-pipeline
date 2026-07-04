"use client";

// Real browser upload: drag-drop or click -> POST /assets (multipart) -> server path
// comes back and is used as avatar_image / product_image / music in /generate.

import { useRef, useState } from "react";
import { api } from "@/lib/api";

export type Uploaded = { path: string; url: string; name: string };

export default function Dropzone({
  label,
  hint,
  accept,
  kind,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  accept: string; // e.g. "image/png,image/jpeg,image/webp"
  kind: "image" | "audio";
  value: Uploaded | null;
  onChange: (v: Uploaded | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.uploadAsset(file);
      onChange({ ...res, name: file.name });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-cap">{label}</span>

      {value ? (
        <div className="input-well flex items-center gap-3 rounded-btn p-2.5">
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- backend-proxied preview, unknown dims
            <img
              src={api.assetUrl(value.url)}
              alt={value.name}
              className="size-12 rounded-lg object-cover"
            />
          ) : (
            <span className="flex size-12 items-center justify-center rounded-lg bg-surface-1 text-lg">
              🎵
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-text-primary">{value.name}</p>
            <p className="text-[10px] text-text-muted">uploaded ✓</p>
          </div>
          <button
            onClick={() => onChange(null)}
            className="rounded-btn px-2.5 py-1.5 text-xs text-text-muted hover:bg-surface-1 hover:text-text-primary"
          >
            ✕
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) upload(f);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-btn border border-dashed px-4 py-6 text-center transition-[border-color,background,transform] duration-200 hover:-translate-y-0.5 ${
            dragging
              ? "border-accent bg-accent/8"
              : "border-accent/25 bg-black/20 hover:border-accent/50"
          }`}
        >
          <span className="text-lg">{busy ? "⏳" : kind === "image" ? "🖼" : "🎵"}</span>
          <p className="text-xs text-text-secondary">
            {busy ? "uploading…" : "drop a file or click to browse"}
          </p>
          {hint && <p className="text-[10px] text-text-muted">{hint}</p>}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      {error && <p className="text-xs text-accent">{error}</p>}
    </div>
  );
}
