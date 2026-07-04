// QuickStart use-cases (OpenArt "Director" pattern): each card prefills the Create
// page — pipeline pre-selected, fill-in-the-blank idea hint the USER completes.
// Never auto-plans: all creative content comes from the user.

export type UseCase = {
  slug: string;
  title: string;
  desc: string;
  mode: "product" | "lipsync" | "overlay";
  ideaHint: string;
  poster: string;
};

export const USECASES: Record<string, UseCase> = {
  "product-ads": {
    slug: "product-ads",
    title: "Product Ads",
    desc: "Cinematic camera moves around your product photo.",
    mode: "product",
    ideaHint: "Product showcase ad for ___ (your product) — premium lighting, slow camera moves",
    poster: "/demo/poster-product.svg",
  },
  "ugc-ads": {
    slug: "ugc-ads",
    title: "UGC / Influencer Ads",
    desc: "A friendly creator recommends you, face to camera.",
    mode: "lipsync",
    ideaHint: "A friendly creator recommends ___ (your product) to camera, casual and honest",
    poster: "/demo/poster-avatar.svg",
  },
  "festive-ads": {
    slug: "festive-ads",
    title: "Festive & Seasonal",
    desc: "Diwali, Raksha Bandhan, wedding season — ride the moment.",
    mode: "product",
    ideaHint: "Festive Diwali ad for ___ (your product), warm celebratory mood",
    poster: "/demo/poster-festive.svg",
  },
  "branding-ads": {
    slug: "branding-ads",
    title: "Branding Ads",
    desc: "Your story in cinematic b-roll with a voice that sells.",
    mode: "overlay",
    ideaHint: "Brand story ad for ___ (your business) — lifestyle scenes with voiceover",
    poster: "/demo/poster-branding.svg",
  },
  "explainer-ads": {
    slug: "explainer-ads",
    title: "Explainer Ads",
    desc: "A spokesperson walks customers through what you do.",
    mode: "lipsync",
    ideaHint: "A spokesperson explains how ___ (your product or service) works, simple and clear",
    poster: "/demo/poster-avatar.svg",
  },
  "social-reels": {
    slug: "social-reels",
    title: "Social Reels",
    desc: "Fast, vertical, thumb-stopping — made for Instagram.",
    mode: "overlay",
    ideaHint: "Energetic vertical reel for ___ (your product) — fast lifestyle shots",
    poster: "/demo/poster-broll.svg",
  },
};

export const USECASE_LIST = Object.values(USECASES);
