// QuickStart use-cases (OpenArt "Director" pattern): each card prefills the Create
// page — pipeline pre-selected, fill-in-the-blank idea hint the USER completes.
// Never auto-plans: all creative content comes from the user.

export type UseCase = {
  slug: string;
  title: string;
  desc: string;
  emoji: string;
  mode: "product" | "lipsync" | "overlay" | "cinematic" | "longcat" | "ingredients";
  href?: string; // overrides the /create?usecase= target (e.g. the Dialogue page)
  pipeline: string; // Library outputs folder — powers the living video preview
  time: string; // honest render-time hint shown on the card
  ideaHint: string;
  poster: string;
};

// Card click target: most templates prefill Create; some open their own studio page.
export const usecaseHref = (u: UseCase) => u.href ?? `/create?usecase=${u.slug}`;

export const USECASES: Record<string, UseCase> = {
  "product-ads": {
    slug: "product-ads",
    title: "Product Ads",
    desc: "Cinematic camera moves around your product photo.",
    emoji: "🧴",
    mode: "product",
    pipeline: "wani2v",
    time: "≈2 min per clip",
    ideaHint: "Product showcase ad for ___ (your product) — premium lighting, slow camera moves",
    poster: "/demo/poster-product.svg",
  },
  "brand-lock": {
    slug: "brand-lock",
    title: "Brand Lock",
    desc: "Your mascot, pack and store — identical in every shot.",
    emoji: "🧩",
    mode: "ingredients",
    pipeline: "ingredients",
    time: "≈3 min per shot · sound included",
    ideaHint: "Brand-locked ad for ___ (your brand) — same product and setting in every scene",
    poster: "/demo/poster-product.svg",
  },
  "ugc-ads": {
    slug: "ugc-ads",
    title: "UGC / Influencer Ads",
    desc: "A friendly creator recommends you, face to camera.",
    emoji: "🗣",
    mode: "lipsync",
    pipeline: "wans2v",
    time: "≈6 min per take",
    ideaHint: "A friendly creator recommends ___ (your product) to camera, casual and honest",
    poster: "/demo/poster-avatar.svg",
  },
  "dialogue-ads": {
    slug: "dialogue-ads",
    title: "Dialogue Ads",
    desc: "Two people, problem → solution — the classic ad format.",
    emoji: "💬",
    mode: "lipsync",
    href: "/dialogue",
    pipeline: "sequence",
    time: "≈6 min per turn",
    ideaHint: "",
    poster: "/demo/poster-avatar.svg",
  },
  "cinematic-story": {
    slug: "cinematic-story",
    title: "Cinematic Story",
    desc: "Atmosphere-first story shots with their own soundtrack.",
    emoji: "🎥",
    mode: "cinematic",
    pipeline: "ltx2",
    time: "≈2 min per shot · sound included",
    ideaHint: "Cinematic story ad for ___ (your business) — mood, place and sound",
    poster: "/demo/poster-branding.svg",
  },
  "festive-ads": {
    slug: "festive-ads",
    title: "Festive & Seasonal",
    desc: "Diwali, Raksha Bandhan, wedding season — ride the moment.",
    emoji: "🪔",
    mode: "product",
    pipeline: "wani2v",
    time: "≈2 min per clip",
    ideaHint: "Festive Diwali ad for ___ (your product), warm celebratory mood",
    poster: "/demo/poster-festive.svg",
  },
  "branding-ads": {
    slug: "branding-ads",
    title: "Branding Ads",
    desc: "Your story in cinematic b-roll with a voice that sells.",
    emoji: "🎬",
    mode: "overlay",
    pipeline: "ltx2",
    time: "≈2 min per shot",
    ideaHint: "Brand story ad for ___ (your business) — lifestyle scenes with voiceover",
    poster: "/demo/poster-branding.svg",
  },
  "explainer-ads": {
    slug: "explainer-ads",
    title: "Explainer Ads",
    desc: "A spokesperson walks customers through what you do.",
    emoji: "🧑‍🏫",
    mode: "lipsync",
    pipeline: "wans2v",
    time: "≈6 min per take",
    ideaHint: "A spokesperson explains how ___ (your product or service) works, simple and clear",
    poster: "/demo/poster-avatar.svg",
  },
  "long-take": {
    slug: "long-take",
    title: "Long Avatar",
    desc: "One rock-steady ~16s spokesperson take — premium tier.",
    emoji: "🧑‍🎤",
    mode: "longcat",
    pipeline: "longcat",
    time: "≈20-30 min — quality takes time",
    ideaHint: "A spokesperson delivers a ~15 second pitch for ___ (your product)",
    poster: "/demo/poster-avatar.svg",
  },
  "social-reels": {
    slug: "social-reels",
    title: "Social Reels",
    desc: "Fast, vertical, thumb-stopping — made for Instagram.",
    emoji: "⚡",
    mode: "overlay",
    pipeline: "ltx2",
    time: "≈2 min per shot",
    ideaHint: "Energetic vertical reel for ___ (your product) — fast lifestyle shots",
    poster: "/demo/poster-broll.svg",
  },
};

export const USECASE_LIST = Object.values(USECASES);
