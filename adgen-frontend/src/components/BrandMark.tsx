"use client";

// The SocialAdz logo mark. Loads the real logo from /brand/socialadz.png and
// falls back to the coral "S" tile until that file exists (drop the logo at
// adgen-frontend/public/brand/socialadz.png — no code change needed).

import { useState } from "react";

export default function BrandMark({ className = "size-8" }: { className?: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <span
        className={`brand-tile flex items-center justify-center rounded-lg text-sm font-bold text-white ${className}`}
      >
        S
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local brand asset, fixed size
    <img
      src="/brand/socialadz.png"
      alt="SocialAdz"
      className={`${className} rounded-lg object-cover`}
      onError={() => setMissing(true)}
    />
  );
}
