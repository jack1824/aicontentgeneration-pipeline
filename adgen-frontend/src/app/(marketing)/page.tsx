"use client";

// Public homepage — OpenArt-style hub in the SOCIALADZGEN identity.
// Structure: sticky nav → full-width hero (crossfading backdrop + one CTA) →
// category marquee → problem → Director use-case grid (quickStart prefills Create) →
// how it works → feature spotlights → pipeline showcase → proof grid → benefits →
// agency strip → FAQ → final CTA → big footer.
//
// Rules: outcome copy only (no model names), ONE repeated CTA action (/create),
// videos/posters are the stars, glow on CTAs + hovers only, reduced-motion kills
// every loop, zero video bandwidth without intent or viewport entry.

import Link from "next/link";
import dynamic from "next/dynamic";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { USECASE_LIST, UseCase, usecaseHref } from "@/lib/usecases";
import { api, OutputItem, PIPELINE_LABELS } from "@/lib/api";
import BrandMark from "@/components/BrandMark";
import IdeaPill from "@/components/IdeaPill";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const HeroBlob = dynamic(() => import("@/components/landing/HeroBlob"), { ssr: false });
import TopNav from "@/components/landing/TopNav";

const HEADLINE = "Ad videos in minutes. No crew, no camera, no agency fees.";

const BACKDROPS = [
  "/demo/poster-product.svg",
  "/demo/poster-avatar.svg",
  "/demo/poster-festive.svg",
];

const CATEGORIES = [
  "Kirana & retail",
  "D2C brands",
  "Salons & spas",
  "Restaurants",
  "Real estate",
  "Coaching & edtech",
  "Jewellery",
  "Clinics & pharmacies",
  "Boutiques",
  "Gyms & fitness",
];

const PROBLEMS = [
  "An agency quote starts at ₹50,000 — per ad.",
  "Template tools make your brand look like everyone else's.",
  "And one version is never enough — you need ten to find the winner.",
];

function StrokeIcon({ d, className = "size-5" }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

// The playbook: every recipe the studio supports, click by click — the landing
// page IS the manual. Grouped the way users think: make it, cast it, finish it.
// The prompt book: REAL prompts from renders we shipped — users copy these
// patterns instead of guessing. Every entry shows box-by-box what to type:
// positive, negative, narration, voice — and what the studio fills in for you.
const STD_NEG =
  "cartoon, 3D render, CGI, plastic skin, deformed face, extra fingers, readable text, subtitles, captions, watermark, jerky motion, blurry, low quality";

const PROMPTBOOK: {
  title: string;
  badge: string;
  trick: string;
  boxes: { label: string; text: string }[];
}[] = [
  {
    title: "The emotional hook — emotion written as light",
    badge: "🎥 Cinematic + voiceover",
    trick:
      "You never type feelings — you type what the camera sees. 'Desaturated cold blue-grey' IS the sadness. Paste the character description word-for-word into every shot — that's what keeps the same actor across cuts.",
    boxes: [
      {
        label: "Shot prompt (positive)",
        text: "Realistic documentary footage: an Indian dentist in his late thirties with short black hair and tired kind eyes, wearing a white doctor's coat over a light blue shirt, sits alone in the empty waiting room of a small modern dental clinic with mint-green walls and a glass door, rows of vacant chairs around him, a wall clock above. Slow creeping zoom toward his still face, desaturated cold blue-grey tones, heavy silence. The audio is a ticking wall clock and faint room hum.",
      },
      { label: "Negative prompt", text: STD_NEG },
      {
        label: "Narration script — one script rides over ALL shots",
        text: "Aaj aapke clinic mein... kitne naye patients aaye? Ek? Do?... Ya phir aaj bhi... zero. … Aapka competitor abhi bhi ads chala raha hai. Aap kab shuru karenge? Link mein jaao. Abhi.",
      },
      { label: "Voice", text: "any हिन्दी/English voice — the studio times the VO across the whole video" },
    ],
  },
  {
    title: "A character who SPEAKS on screen",
    badge: "🎥 Cinematic",
    trick:
      "Put the spoken line inside the shot, in quotes, and ask for the lips. The model generates the voice AND the lip-sync. Keep lines to ~8–10 words per 5-second shot.",
    boxes: [
      {
        label: "Shot prompt (positive)",
        text: "Realistic documentary footage, tracking shot moving alongside a middle-aged Indian farmer in his forties with a weathered sun-tanned face, a thick black moustache, wearing a beige cotton turban and a brown Nehru vest over a cream kurta, walking briskly along a raised brick canal embankment beside lush green sugarcane fields. As he walks he looks ahead and says warmly in Hindi: \"अपने खेत की कहानी अब पूरी दुनिया देखेगी।\" His lips move naturally with the words. Golden afternoon sunlight. The audio is his warm Hindi voice over faint birdsong and footsteps.",
      },
      { label: "Negative prompt", text: STD_NEG },
      { label: "Narration script", text: "(leave EMPTY — the spoken line lives inside the shot prompt)" },
    ],
  },
  {
    title: "Two people talking in ONE shot",
    badge: "🎥 Cinematic · two voices",
    trick:
      "Write both lines in sequence — the model gives each person their own voice and animates both faces. The most natural conversation money can't usually buy.",
    boxes: [
      {
        label: "Shot prompt (positive)",
        text: "Realistic documentary footage: a middle-aged Indian farmer with a thick black moustache in a beige turban and a middle-aged Indian woman with dark hair in a neat bun wearing a green cotton saree stand together at the edge of lush green sugarcane fields. He turns to her and asks in Hindi: \"इस बार की फ़सल देखी?\" She smiles and replies in Hindi: \"सबसे अच्छी!\" Both faces animated, lips matching their words. Static camera, medium two-shot. The audio is their two distinct Hindi voices, his deep, hers bright, with soft field ambience.",
      },
      { label: "Negative prompt", text: STD_NEG },
      { label: "Narration script", text: "(leave EMPTY)" },
    ],
  },
  {
    title: "The moving-background tracking shot",
    badge: "🎬 B-roll / Cinematic",
    trick:
      "Three load-bearing phrases make the background move: 'tracking shot moving alongside', 'camera tracks smoothly parallel at walking pace', 'background moving naturally with parallax' — and the negative kills the classic walk fails.",
    boxes: [
      {
        label: "Shot prompt (positive)",
        text: "Realistic documentary footage, tracking shot moving alongside a middle-aged Indian farmer in his forties walking briskly along a raised brick canal embankment. He gestures with his right arm outstretched as he walks, mid-conversation, expressive face. Behind him, lush green sugarcane fields stretch to the horizon under a clear pale-blue sky, a calm canal of water on the right. Camera tracks smoothly parallel to him at walking pace, keeping him centered, background moving naturally with parallax. Golden afternoon sunlight, candid, unposed, photojournalism, realistic skin texture, natural fabric movement.",
      },
      {
        label: "Negative prompt (motion edition)",
        text: "static camera, frozen background, stiff walk, sliding feet, cartoon, 3D render, CGI, plastic skin, distorted face, deformed hands, extra limbs, warping, morphing, jerky motion, readable text, subtitles, captions, watermark, blurry, low quality",
      },
    ],
  },
  {
    title: "A full 30-second ad — the shot math",
    badge: "🎬 Full ads · any mode",
    trick:
      "One shot ≈ 5 seconds, one Hindi narration word ≈ ⅔ second — so budget ~8 words of script per shot and add a shot for every 5 seconds. Order the beats: hook → pain → break → solution → result → CTA. Paste the same character + location anchors into every shot.",
    boxes: [
      {
        label: "Anchors — paste verbatim into EVERY shot",
        text: "an Indian dentist in his late thirties with short black hair and tired kind eyes, wearing a white doctor's coat over a light blue shirt … a small modern dental clinic with mint-green walls and a glass door",
      },
      {
        label: "Narration script (whole ad, one box)",
        text: "Aaj aapke clinic mein... kitne naye patients aaye? … Social Adz mein sirf teen steps. Apna clinic type karo. Area set karo. Budget decide karo. … Link mein jaao. Abhi.",
      },
      { label: "Negative prompt (same in every shot)", text: STD_NEG },
    ],
  },
  {
    title: "Brand Lock — same product in every shot",
    badge: "🧩 Brand Lock",
    trick:
      "Describe the brand's elements once — the studio renders a reference sheet, then every shot is generated AGAINST that sheet, so the mug, emblem and café stay identical across cuts. Text is banned from the sheet automatically (it hurts identity carry-over).",
    boxes: [
      {
        label: "Sheet description (✨ Generate)",
        text: "a stoneware coffee mug in deep forest green with a small carved mountain emblem, shown from front and side angles; a brown paper coffee bag with the same mountain emblem, front and back; a cozy cafe interior with warm wooden counters, brass fixtures and hanging filament bulbs",
      },
      {
        label: "Shot prompt (positive) — just the action",
        text: "Slow cinematic push-in on the deep green stoneware mug with the mountain emblem, steaming on the warm wooden cafe counter. Soft morning light through the window catches the steam; the brass fixtures glow in the blurred background. The camera settles close on the emblem. The audio is gentle cafe ambience with a low espresso-machine hiss.",
      },
      { label: "Negative prompt", text: STD_NEG },
    ],
  },
  {
    title: "An avatar face — describe the person, nothing else",
    badge: "🧑‍🎤 Avatars · photo",
    trick:
      "Type only WHO they are — age, face, hair, clothes. The studio appends the studio-headshot camera, lighting and its own negative automatically, and renders at full quality. This face becomes the identity for every future avatar ad.",
    boxes: [
      {
        label: "Face description (all you type)",
        text: "an Indian dentist in his late thirties with short black hair and tired kind eyes, wearing a white doctor's coat over a light blue shirt",
      },
      {
        label: "Added for you (auto)",
        text: "Professional studio headshot photograph, 85mm portrait lens, front-facing, gentle natural smile, realistic skin texture, soft diffused key light, neutral background… + a portrait-tuned negative",
      },
    ],
  },
  {
    title: "Re-dub — change the words, keep the video",
    badge: "🎤 Library · Re-dub",
    trick:
      "Pick any finished render in the Library, give it a new script and voice — only the lips are re-rendered, the scene stays identical. This is also how you fix voice drift between clips.",
    boxes: [
      { label: "New script", text: "अपने खेत की कहानी अब पूरी दुनिया देखेगी। Social Adz ke saath." },
      {
        label: "Scene description (what's on screen)",
        text: "a middle-aged Indian farmer in a beige turban and brown Nehru vest walking along a canal embankment beside green sugarcane fields, golden afternoon light",
      },
      { label: "Voice + language", text: "any ElevenLabs voice · हिन्दी or English" },
    ],
  },
  {
    title: "The end card — where your text belongs",
    badge: "🪧 End card · any video",
    trick:
      "AI video garbles writing — that's why 'readable text' sits in every negative. Your brand name, tagline and offer go on the end card instead: crisp, real text, appended to any Library video.",
    boxes: [
      { label: "Brand", text: "Social Adz" },
      { label: "Tagline", text: "Reach More. Grow More." },
      { label: "Offer / CTA", text: "Link mein jaao — Abhi" },
    ],
  },
  {
    title: "The one negative prompt you always paste",
    badge: "every shot, every mode",
    trick:
      "Identical in every shot card — consistency helps the model. 'Readable text' is in there because AI video garbles writing; your brand text belongs on the end card instead.",
    boxes: [
      {
        label: "Negative prompt (universal)",
        text: "static camera, frozen background, stiff walk, sliding feet, cartoon, 3D render, CGI, plastic skin, distorted face, deformed hands, extra limbs, warping, morphing, jerky motion, readable text, subtitles, captions, watermark, blurry, low quality",
      },
    ],
  },
];

const PLAYBOOK: {
  group: string;
  recipes: { emoji: string; title: string; where: string; steps: string[]; note?: string }[];
}[] = [
  {
    group: "Make it",
    recipes: [
      {
        emoji: "💡",
        title: "One idea → a full ad plan",
        where: "Dashboard",
        steps: [
          "Type your idea in the bar — product, audience, mood",
          "The Brain proposes 3 directions with shots and script",
          "Pick one → everything prefills → Generate",
        ],
        note: "every shot and line stays editable before you render",
      },
      {
        emoji: "🎥",
        title: "Cinematic shots with real sound",
        where: "Create · Cinematic",
        steps: [
          "Describe the shot — subject, camera move, light",
          "Add narration + a हिन्दी/English voice — or leave it silent for pure ambience",
          "Generate — ≈2 min per shot, soundtrack included",
        ],
      },
      {
        emoji: "🗣",
        title: "Make a character SPEAK on screen",
        where: "Create · Cinematic",
        steps: [
          "Leave the narration box empty",
          "Put the spoken line inside the shot itself, in quotes — “she says warmly: ‘…’”",
          "Generate — voice and lips come out with the scene",
        ],
      },
      {
        emoji: "🧩",
        title: "Brand Lock — same product in every shot",
        where: "Create · Brand Lock",
        steps: [
          "Describe your brand's elements — mascot, pack, store",
          "✨ Generate the reference sheet (or upload your own)",
          "Write shots — every one keeps your brand identical",
        ],
        note: "sheets are reusable: one brand, many ads",
      },
      {
        emoji: "🎬",
        title: "Full 30-second ads",
        where: "Create · any mode",
        steps: [
          "+ Add shot for every 5 seconds — or let the Brain plan the timeline",
          "One narration carries across all shots",
          "Generate once — shots render, stitch and mix automatically",
        ],
      },
    ],
  },
  {
    group: "The people in it",
    recipes: [
      {
        emoji: "🧑",
        title: "Generate a spokesperson",
        where: "Avatars",
        steps: [
          "✨ Generate → describe them — age, look, vibe",
          "Re-roll until you love the face",
          "Name + voice → Save — reusable forever with one tap",
        ],
      },
      {
        emoji: "🎤",
        title: "Talking avatar ads",
        where: "Create · Avatar",
        steps: [
          "Tap a saved avatar chip — face and voice fill in",
          "Write the script — it drives the lips",
          "Generate — a ~14s spokesperson take",
        ],
      },
      {
        emoji: "💬",
        title: "Two-person dialogue ads",
        where: "Dialogue",
        steps: [
          "Type the idea → ✦ Write the dialogue — both sides written for you",
          "Tap one avatar chip per speaker",
          "Generate — the classic problem → solution ad, cut for cut",
        ],
      },
    ],
  },
  {
    group: "Finish it",
    recipes: [
      {
        emoji: "🎙",
        title: "Re-dub any clip — any language",
        where: "Library · your video",
        steps: [
          "Open the video → 🎤 Re-dub",
          "Type the new line, pick any voice, हिन्दी or English",
          "The lips re-render to match — everything else stays",
        ],
        note: "clips up to ~12s with a visible speaker",
      },
      {
        emoji: "✨",
        title: "Polish — only when you want it",
        where: "presets · Library",
        steps: [
          "⚡ Preview never polishes — what you wrote is what renders",
          "Pick ✨ Polished at render time, or Enhance any video later",
          "Face restore + 2× upscale + smoother motion",
        ],
      },
      {
        emoji: "🏷",
        title: "Brand end card",
        where: "Library · your video",
        steps: [
          "Open the video → End card",
          "Brand name, tagline, offer",
          "A clean closing card is stitched on — the one place text belongs",
        ],
      },
    ],
  },
];

const STEPS: { icon: ReactNode; title: string; body: ReactNode }[] = [
  {
    icon: <StrokeIcon d="M4 5.5h16v10.5H9l-5 4.5z" />,
    title: "Describe it",
    body: (
      <>
        Type what you sell and who it&apos;s for — in plain English or{" "}
        <span lang="hi">हिन्दी</span>.
      </>
    ),
  },
  {
    icon: <StrokeIcon d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />,
    title: "Pick the approach",
    body: "We propose two or three ad directions with script and shots. You choose.",
  },
  {
    icon: <StrokeIcon d="M3 9h18v10H3zM3 9l2-5h14l2 5M8.5 4 6.5 9m7.5-5-2 5m7-5-2 5" />,
    title: "Get your ad",
    body: "A finished video with voice-over, sized for reels — ready to post.",
  },
];

// Placeholder tiles — used only until real Library finals load (test phase shows
// live renders; final marketing videos replace these later).
const PROOF: { poster?: string; src: string; badge: string }[] = [
  { poster: "/demo/poster-avatar.svg", src: "/demo/sample-avatar-1.mp4", badge: "Talking avatar" },
  { poster: "/demo/poster-product.svg", src: "/demo/sample-product-1.mp4", badge: "Product showcase" },
  { poster: "/demo/poster-broll.svg", src: "/demo/sample-broll-1.mp4", badge: "B-roll reel" },
  { poster: "/demo/poster-product.svg", src: "/demo/sample-product-2.mp4", badge: "Product showcase" },
  { poster: "/demo/poster-avatar.svg", src: "/demo/sample-avatar-2.mp4", badge: "Talking avatar" },
  { poster: "/demo/poster-broll.svg", src: "/demo/sample-broll-2.mp4", badge: "B-roll reel" },
];

// Landing card mode -> backend pipeline folder (for matching real videos).
const MODE_TO_PIPELINE: Record<string, string> = {
  product: "wani2v",
  lipsync: "wans2v",
  overlay: "want2v",
};

const BENEFITS: { icon: ReactNode; title: string; body: ReactNode }[] = [
  {
    icon: <StrokeIcon d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />,
    title: "Bilingual by default",
    body: (
      <>
        Every ad can speak English and <span lang="hi">हिन्दी</span> — reach the
        customers your competitors miss.
      </>
    ),
  },
  {
    icon: <StrokeIcon d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" />,
    title: "Your product, not a template",
    body: "Ads are built around your photos and your words, so the result looks like your brand.",
  },
  {
    icon: <StrokeIcon d="M17 2l4 4-4 4M21 6H7a4 4 0 0 0-4 4v1M7 22l-4-4 4-4M3 18h14a4 4 0 0 0 4-4v-1" />,
    title: "Ten versions, not one",
    body: "Change the script, the voice, the style — and render again. Keep testing until one wins.",
  },
  {
    icon: <StrokeIcon d="M13 2 3 14h7l-1 8 10-12h-7z" />,
    title: "Minutes, not weeks",
    body: "From idea to finished ad in one sitting. Post today, not next quarter.",
  },
];

const PIPELINES = [
  {
    title: "Product Spotlight",
    desc: "One product photo in — cinematic camera moves out. Your product's exact look, locked.",
    poster: "/demo/poster-product.svg",
    href: "/create?mode=product",
  },
  {
    title: "Talking Avatar",
    desc: "A spokesperson reads your script, lips synced to the voice you pick.",
    poster: "/demo/poster-avatar.svg",
    href: "/create?mode=lipsync",
  },
  {
    title: "Cinematic B-roll",
    desc: "Story scenes with your voiceover on top — lifestyle and brand ads.",
    poster: "/demo/poster-broll.svg",
    href: "/create?mode=overlay",
  },
];

const FAQS = [
  {
    q: "What do I need to start?",
    a: "Just an idea. A product photo makes product ads stronger; avatar ads need one face image and your script. That's it.",
  },
  {
    q: "Which languages can my ad speak?",
    a: "English and हिन्दी today, with natural-sounding voices you can preview before rendering.",
  },
  {
    q: "How long does one video take?",
    a: "A preview draft lands in minutes. Polished, delivery-grade masters take longer — you choose per render.",
  },
  {
    q: "What formats do I get?",
    a: "Vertical 9:16 for reels, square 1:1 for feed, wide 16:9 — downloadable mp4, ready to post.",
  },
  {
    q: "Can I redo a version I don't love?",
    a: "Yes — edit the script, swap the voice, change the style and render again. Testing many versions is the whole point.",
  },
  {
    q: "Do you work with agencies?",
    a: "Yes. Produce client ads at volume and deliver under your own brand — get in touch.",
  },
];

function CtaButton({ big = false, children = "Create your first ad" }: { big?: boolean; children?: ReactNode }) {
  return (
    <Link
      href="/create"
      data-magnetic
      className={`hero-glow inline-block rounded-xl font-semibold text-white ${
        big ? "px-8 py-4 text-base" : "px-7 py-3.5 text-sm"
      }`}
    >
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}

function UseCaseCard({ u, videoUrl }: { u: UseCase; videoUrl?: string }) {
  return (
    <Link
      href={usecaseHref(u)}
      data-dir
      className="lift group relative flex h-72 w-60 shrink-0 snap-start flex-col justify-end overflow-hidden rounded-card border border-white/5 bg-surface-1 p-5 hover:border-accent/50 hover:ring-1 hover:ring-accent/40 sm:w-64"
    >
      {videoUrl ? (
        <CardVideo src={videoUrl} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- decorative poster bg
        <img
          src={u.poster}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-30 transition-opacity duration-300 group-hover:opacity-45"
        />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-base via-base/50 to-transparent" />
      <div className="relative flex flex-col gap-1.5">
        <h3 className="text-lg font-semibold font-display">{u.title}</h3>
        <p className="text-sm leading-relaxed text-text-secondary">{u.desc}</p>
        <p className="mt-1 text-xs text-accent opacity-0 transition-opacity group-hover:opacity-100">
          Direct this ad →
        </p>
      </div>
    </Link>
  );
}

// Hover-play video inside a card link (use-case + pipeline showcases).
function CardVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      preload="metadata"
      onMouseEnter={() => ref.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = ref.current;
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      }}
      className="absolute inset-0 size-full object-cover opacity-30 transition-opacity duration-300 group-hover:opacity-45"
    />
  );
}

function ProofTile({ item }: { item: (typeof PROOF)[number] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useRef(false);
  // Sample mp4s are dropped in later — until then the tile is poster-only, no
  // play affordance that silently no-ops.
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([e]) => {
        const vid = ref.current;
        if (!e.isIntersecting && vid && !vid.paused) {
          vid.pause();
          vid.currentTime = 0;
        }
      },
      { threshold: 0.1 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => setBroken(true));
    else v.pause();
  };

  return (
    <figure
      data-proof
      onMouseEnter={() => {
        if (!reduced.current) ref.current?.play().catch(() => setBroken(true));
      }}
      onMouseLeave={() => {
        if (reduced.current) return;
        const v = ref.current;
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      }}
      className="lift group relative overflow-hidden rounded-card border border-white/5 bg-surface-1"
    >
      <div className="relative aspect-9/16 w-full bg-black">
        <video
          ref={ref}
          src={item.src}
          {...(item.poster ? { poster: item.poster } : {})}
          muted
          loop
          playsInline
          preload={item.poster ? "none" : "metadata"}
          className="absolute inset-0 size-full object-cover"
        />
      </div>
      <figcaption className="pointer-events-none absolute left-2.5 top-2.5 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium tracking-wide text-text-secondary backdrop-blur-sm">
        {item.badge}
      </figcaption>
      {!broken && (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Play sample: ${item.badge}`}
          className="absolute inset-0 z-10 cursor-pointer rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      )}
    </figure>
  );
}

// Pure-CSS spotlight visuals — honest mockups of the real UI, no screenshots.
function PlanMock() {
  return (
    <div className="card-raised flex flex-col gap-3 rounded-card p-5" aria-hidden="true">
      <div className="input-well rounded-btn px-3 py-2.5 text-xs text-text-muted">
        15s reel for my jasmine soap, festive vibe…
      </div>
      <div className="flex flex-col gap-2">
        {["Festive product showcase", "Creator recommendation", "Lifestyle story"].map((t) => (
          <div key={t} className="flex items-center justify-between rounded-btn bg-surface-2/60 px-3 py-2 text-xs text-text-secondary">
            {t}
            <span className="text-accent">→</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PresetMock() {
  return (
    <div className="card-raised flex flex-col gap-3 rounded-card p-5" aria-hidden="true">
      <div className="flex gap-2">
        {["⚡ Preview", "✨ Enhanced", "👑 Master"].map((p, i) => (
          <span
            key={p}
            className={`flex-1 rounded-btn px-2 py-2 text-center text-xs ${
              i === 2 ? "seg-on" : "seg"
            }`}
          >
            {p}
          </span>
        ))}
      </div>
      <p className="text-xs text-text-muted">
        Draft fast. When one wins, render the master.
      </p>
      <div className="h-1.5 w-full rounded bg-surface-2">
        <div className="hero-glow h-1.5 w-2/3 rounded" />
      </div>
    </div>
  );
}

function PolishMock() {
  return (
    <div className="card-raised grid grid-cols-2 gap-2 rounded-card p-5" aria-hidden="true">
      <div className="flex aspect-9/16 items-end justify-center rounded-lg bg-surface-2 pb-3">
        <span className="text-[10px] uppercase tracking-widest text-text-muted">raw</span>
      </div>
      <div
        className="flex aspect-9/16 items-end justify-center rounded-lg pb-3"
        style={{
          background:
            "linear-gradient(160deg, rgba(255,107,61,0.25), rgba(255,61,110,0.12) 60%, #1c1c1f)",
        }}
      >
        <span className="text-[10px] uppercase tracking-widest text-text-primary">polished</span>
      </div>
    </div>
  );
}

const SPOTLIGHTS: { title: string; body: string; visual: ReactNode }[] = [
  {
    title: "Describe it, get a plan",
    body: "Type your idea in one line. Get back two or three complete ad directions — script, shots, voice strategy — and pick the one that feels like you.",
    visual: <PlanMock />,
  },
  {
    title: "Preview in minutes, master when it matters",
    body: "Iterate on fast drafts until the message lands. Then one click renders the polished, delivery-grade master.",
    visual: <PresetMock />,
  },
  {
    title: "Polish to broadcast quality",
    body: "Faces restored, detail sharpened, motion smoothed — an enhancement pass that makes every final feel professionally finished.",
    visual: <PolishMock />,
  },
];

export default function Landing() {
  const dirRailRef = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [blobOn, setBlobOn] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  // Test phase: the landing shows REAL Library renders (via the backend proxy);
  // placeholder posters remain the fallback when the backend is unreachable.
  const [finals, setFinals] = useState<OutputItem[]>([]);

  useEffect(() => {
    api
      .outputs()
      .then((d) => setFinals(d.outputs.filter((o) => o.kind !== "clip")))
      .catch(() => {});
  }, []);

  // ONE global allocation: every slot on the page gets a DISTINCT video.
  // (The old newest-per-pipeline lookup repeated the same clip across the
  // director grid, the engine showcase and the proof wall.)
  const allocation = useMemo(() => {
    const used = new Set<string>();
    const take = (pipelines?: string[]): OutputItem | undefined => {
      const hit = finals.find(
        (o) => !used.has(o.path) && (!pipelines || pipelines.includes(o.pipeline)),
      );
      if (hit) used.add(hit.path);
      return hit;
    };
    const poolFor = (mode: string): string[] => {
      const main = MODE_TO_PIPELINE[mode];
      // B-roll-ish slots may draw from the LTX pool too — same kind of content.
      return mode === "overlay" || mode === "cinematic"
        ? [main, "ltx2"].filter(Boolean)
        : [main].filter(Boolean);
    };
    // Page order: director cards first (highest on the page gets the newest),
    // then the engine showcase, then the proof wall from whatever remains.
    const directors: Record<string, string | undefined> = {};
    for (const u of USECASE_LIST) {
      const hit = take(poolFor(u.mode)) ?? take();
      directors[u.slug] = hit ? api.fileUrl(hit) : undefined;
    }
    const showcase: Record<string, string | undefined> = {};
    for (const p of PIPELINES) {
      const mode = p.href.split("=")[1] ?? "";
      const hit = take(poolFor(mode)) ?? take();
      showcase[mode] = hit ? api.fileUrl(hit) : undefined;
    }
    const proof: { src: string; badge: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const hit = take();
      if (!hit) break;
      proof.push({ src: api.fileUrl(hit), badge: PIPELINE_LABELS[hit.pipeline] ?? hit.pipeline });
    }
    return { directors, showcase, proof };
  }, [finals]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ok =
      window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches &&
      !mq.matches &&
      !(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const onChange = () => {
      if (mq.matches) setBlobOn(false);
    };
    mq.addEventListener("change", onChange);
    if (ok) {
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      };
      if (w.requestIdleCallback) w.requestIdleCallback(() => setBlobOn(true), { timeout: 2500 });
      else setTimeout(() => setBlobOn(true), 1200);
    }
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Late hydration = user already reading; never yank content back.
        const fresh = performance.now() < 1500;
        if (fresh) {
          gsap.from("[data-word]", {
            yPercent: 110,
            duration: 0.7,
            stagger: 0.05,
            ease: "power3.out",
          });
          gsap.from("[data-hero-after]", {
            opacity: 0,
            y: 18,
            duration: 0.6,
            delay: 0.55,
            stagger: 0.12,
            ease: "power2.out",
          });
        }

        gsap.to("[data-parallax]", {
          y: -70,
          ease: "none",
          scrollTrigger: {
            trigger: "[data-hero]",
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });

        const belowFold = (el: Element) =>
          el.getBoundingClientRect().top > window.innerHeight * 0.88;

        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
          if (!belowFold(el)) return;
          gsap.from(el, {
            opacity: 0,
            y: 36,
            duration: 0.7,
            ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 84%" },
          });
        });

        const grids: [string, string, object][] = [
          ["[data-dir-grid]", "[data-dir]", { opacity: 0, y: 34, stagger: 0.07 }],
          ["[data-steps]", "[data-step]", { opacity: 0, y: 44, stagger: 0.16 }],
          ["[data-proof-grid]", "[data-proof]", { opacity: 0, y: 30, scale: 0.97, stagger: 0.08 }],
        ];
        grids.forEach(([wrapSel, itemSel, vars]) => {
          const wrap = document.querySelector(wrapSel);
          if (wrap && belowFold(wrap)) {
            gsap.from(itemSel, {
              ...vars,
              duration: 0.6,
              ease: "power2.out",
              scrollTrigger: { trigger: wrap, start: "top 78%" },
            });
          }
        });
      });

      mm.add("(prefers-reduced-motion: no-preference) and (pointer: fine)", () => {
        const cleanups: (() => void)[] = [];
        gsap.utils.toArray<HTMLElement>("[data-magnetic]").forEach((el) => {
          const xTo = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3" });
          const yTo = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3" });
          const move = (e: MouseEvent) => {
            const r = el.getBoundingClientRect();
            xTo((e.clientX - (r.left + r.width / 2)) * 0.18);
            yTo((e.clientY - (r.top + r.height / 2)) * 0.18);
          };
          const leave = () => {
            xTo(0);
            yTo(0);
          };
          el.addEventListener("mousemove", move);
          el.addEventListener("mouseleave", leave);
          cleanups.push(() => {
            el.removeEventListener("mousemove", move);
            el.removeEventListener("mouseleave", leave);
          });
        });
        return () => cleanups.forEach((fn) => fn());
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="overflow-x-clip">
      <TopNav />

      <main>
        {/* ---- 1 · HERO: full-width, centered, crossfading backdrop ---- */}
        <section ref={heroRef} data-hero className="relative overflow-hidden">
          <div aria-hidden="true" className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative backdrop */}
            <img
              src="/demo/poster-hero.svg"
              alt=""
              className="absolute inset-0 size-full object-cover opacity-25"
            />
            {BACKDROPS.map((b, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- decorative backdrop
              <img
                key={b}
                src={b}
                alt=""
                className="backdrop-slide absolute inset-0 size-full object-cover"
                style={{
                  animationDelay: `${i * 8}s`,
                  // No compositor work for a hero that scrolled away.
                  animationPlayState: heroVisible ? "running" : "paused",
                }}
              />
            ))}
            <div className="absolute inset-0 bg-linear-to-b from-base/70 via-base/55 to-base" />
          </div>

          <div
            data-parallax
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-130 max-w-3xl"
          >
            <div
              className="glow-breathe absolute inset-0"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(255,77,61,0.14), rgba(255,61,110,0.05) 55%, transparent 75%)",
              }}
            />
            {blobOn && heroVisible && (
              <div className="absolute inset-0">
                <HeroBlob />
              </div>
            )}
          </div>

          <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-7 px-6 py-16 text-center md:py-24">
            <h1 className="max-w-4xl text-4xl font-semibold leading-[1.06] tracking-tight font-display sm:text-[44px] md:text-6xl xl:text-7xl">
              {HEADLINE.split(" ").map((w, i) => (
                <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
                  <span data-word className="inline-block">
                    {w}&nbsp;
                  </span>
                </span>
              ))}
            </h1>
            <p data-hero-after className="max-w-xl text-[16px] leading-relaxed text-text-secondary">
              AI-made video ads for Indian businesses — in English and{" "}
              <span lang="hi">हिन्दी</span>, from nothing but your idea and a product photo.
            </p>
            <div data-hero-after className="flex w-full flex-col items-center gap-3">
              <IdeaPill submitLabel="Create my ad" />
              <a href="#use-cases" className="text-xs text-text-muted transition-colors hover:text-text-primary">
                or start from a template ↓
              </a>
            </div>
          </div>
        </section>

        {/* ---- 2 · Category marquee (who this is for) ---- */}
        <section className="overflow-hidden border-y border-white/5 py-4">
          <p className="sr-only">
            Built for kirana stores, D2C brands, salons, restaurants, real estate, coaching,
            jewellery, clinics, boutiques and gyms.
          </p>
          {/* Two identical halves, each (chips + trailing gap) — so -50% lands exactly on the seam. */}
          <div aria-hidden="true" className="marquee-track flex w-max">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex gap-3 pr-3">
                {CATEGORIES.map((c) => (
                  <span
                    key={c}
                    className="whitespace-nowrap rounded-full border border-white/10 bg-surface-1 px-4 py-1.5 text-xs text-text-secondary"
                  >
                    {c}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* ---- 3 · PROBLEM ---- */}
        <section className="mx-auto w-full max-w-7xl px-6 py-12 md:px-12">
          <div data-reveal className="flex max-w-2xl flex-col gap-5">
            <h2 className="label-cap">Why your ads aren&apos;t getting made</h2>
            {PROBLEMS.map((p) => (
              <p
                key={p}
                className="border-l border-white/10 pl-5 text-lg leading-relaxed text-text-secondary"
              >
                {p}
              </p>
            ))}
          </div>
        </section>

        {/* ---- 4 · DIRECTOR GRID (quickStart) ---- */}
        <section id="use-cases" data-dir-grid className="scroll-mt-20 mx-auto w-full max-w-7xl px-6 py-12 md:px-12">
          <div data-reveal className="mb-8 flex items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-3xl font-semibold tracking-tight font-display">
                What ad are we making today?
              </h2>
              <p className="text-sm text-text-muted">
                Pick a direction — we set the stage, you add your product.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => dirRailRef.current?.scrollBy({ left: -560, behavior: "smooth" })}
                aria-label="Scroll templates left"
                className="card-raised hidden size-10 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary md:flex"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4.5" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <button
                onClick={() => dirRailRef.current?.scrollBy({ left: 560, behavior: "smooth" })}
                aria-label="Scroll templates right"
                className="card-raised hidden size-10 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary md:flex"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4.5" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
          <div
            ref={dirRailRef}
            className="edge-fade -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2"
          >
            {USECASE_LIST.map((u) => (
              <UseCaseCard key={u.slug} u={u} videoUrl={allocation.directors[u.slug]} />
            ))}
          </div>
        </section>

        {/* ---- 5 · HOW IT WORKS ---- */}
        <section id="how" data-steps className="scroll-mt-20 mx-auto w-full max-w-7xl px-6 py-12 md:px-12">
          <h2 data-reveal className="mb-10 text-3xl font-semibold tracking-tight font-display">
            Three steps. That&apos;s the whole job.
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} data-step className="card-raised rounded-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-white/5 text-text-secondary">
                    {s.icon}
                  </span>
                  <span className="label-cap">step {i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold font-display">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- 5b · THE PLAYBOOK: every ad, click by click ---- */}
        <section id="playbook" className="scroll-mt-20 mx-auto w-full max-w-7xl px-6 py-12 md:px-12">
          <div data-reveal className="mb-10 flex flex-col gap-2">
            <h2 className="text-3xl font-semibold tracking-tight font-display">
              The <span className="text-grad">playbook</span>
            </h2>
            <p className="max-w-xl text-[15px] text-text-secondary">
              Everything the studio can make — and exactly where the buttons are. No manual, no
              tutorials: every recipe is two or three clicks.
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-3">
            {PLAYBOOK.map((group) => (
              <div key={group.group} className="flex flex-col gap-4">
                <span className="label-cap">{group.group}</span>
                {group.recipes.map((r) => (
                  <div key={r.title} data-reveal className="card-raised rounded-card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[15px] font-semibold font-display">
                        <span className="mr-1.5">{r.emoji}</span>
                        {r.title}
                      </h3>
                      <span className="seg shrink-0 rounded-full px-2.5 py-1 text-[10px] whitespace-nowrap">
                        {r.where}
                      </span>
                    </div>
                    <ol className="mt-3 flex flex-col gap-1.5">
                      {r.steps.map((s, i) => (
                        <li
                          key={i}
                          className="flex items-baseline gap-2 text-[13px] leading-relaxed text-text-secondary"
                        >
                          <span className="shrink-0 text-[11px] font-semibold text-accent">{i + 1}</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                    {r.note && <p className="mt-2.5 text-[11px] text-text-muted">{r.note}</p>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* ---- 5c · THE PROMPT BOOK: real prompts from shipped renders ---- */}
        <section id="prompts" className="scroll-mt-20 mx-auto w-full max-w-7xl px-6 py-12 md:px-12">
          <div data-reveal className="mb-4 flex flex-col gap-2">
            <h2 className="text-3xl font-semibold tracking-tight font-display">
              The <span className="text-grad">prompt book</span>
            </h2>
            <p className="max-w-2xl text-[15px] text-text-secondary">
              Real prompts from ads rendered on this platform — every card shows exactly what
              goes in each box. Copy the pattern, swap your subject. Every shot follows one
              order:
            </p>
            <p className="label-cap tracking-widest">
              style → subject → action → scene → camera → light → sound
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {PROMPTBOOK.map((p) => (
              <div key={p.title} data-reveal className="card-raised flex flex-col gap-3 rounded-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold font-display">{p.title}</h3>
                  <span className="seg shrink-0 rounded-full px-2.5 py-1 text-[10px] whitespace-nowrap">
                    {p.badge}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-text-secondary">{p.trick}</p>
                {p.boxes.map((b) => (
                  <div key={b.label} className="flex flex-col gap-1">
                    <span className="label-cap text-[10px] tracking-widest text-accent">
                      {b.label}
                    </span>
                    <pre className="max-h-36 overflow-y-auto rounded-btn bg-black/30 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-text-secondary">
                      {b.text}
                    </pre>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* ---- 6 · FEATURE SPOTLIGHTS (alternating) ---- */}
        <section className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-6 py-12 md:px-12">
          {SPOTLIGHTS.map((s, i) => (
            <div
              key={s.title}
              data-reveal
              className={`grid items-center gap-10 lg:grid-cols-2 ${
                i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div className="flex flex-col items-start gap-3">
                <h3 className="text-2xl font-semibold tracking-tight font-display">{s.title}</h3>
                <p className="max-w-md text-[15px] leading-relaxed text-text-secondary">{s.body}</p>
                <Link href="/create" className="text-sm text-accent hover:underline">
                  Start creating →
                </Link>
              </div>
              <div className="mx-auto w-full max-w-sm">{s.visual}</div>
            </div>
          ))}
        </section>

        {/* ---- 7 · PIPELINE SHOWCASE ---- */}
        <section id="tools" className="scroll-mt-20 mx-auto w-full max-w-7xl px-6 py-12 md:px-12">
          <h2 data-reveal className="mb-10 text-3xl font-semibold tracking-tight font-display">
            Three engines. One studio.
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {PIPELINES.map((p) => (
              <Link
                key={p.title}
                href={p.href}
                data-reveal
                className="lift group relative flex min-h-64 flex-col justify-end overflow-hidden rounded-card border border-white/5 bg-surface-1 p-5 hover:border-accent/50 hover:ring-1 hover:ring-accent/40"
              >
                {allocation.showcase[p.href.split("=")[1] ?? ""] ? (
                  <CardVideo src={allocation.showcase[p.href.split("=")[1] ?? ""]!} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- decorative poster bg
                  <img
                    src={p.poster}
                    alt=""
                    className="absolute inset-0 size-full object-cover opacity-25 transition-opacity duration-300 group-hover:opacity-40"
                  />
                )}
                <div className="absolute inset-0 bg-linear-to-t from-base via-base/55 to-transparent" />
                <div className="relative flex flex-col gap-1.5">
                  <h3 className="text-lg font-semibold font-display">{p.title}</h3>
                  <p className="text-sm leading-relaxed text-text-secondary">{p.desc}</p>
                  <p className="mt-1 text-xs text-accent opacity-0 transition-opacity group-hover:opacity-100">
                    Create now →
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ---- 8 · PROOF GRID ---- */}
        <section data-proof-grid className="mx-auto w-full max-w-7xl px-6 py-12 md:px-12">
          <div data-reveal className="mb-10 flex flex-col gap-2">
            <h2 className="text-3xl font-semibold tracking-tight font-display">
              Made here, not promised here.
            </h2>
            <p className="text-sm text-text-muted">Sample ads straight out of the studio.</p>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {(allocation.proof.length >= 3 ? allocation.proof : PROOF).map((item, i) => (
              <ProofTile key={i} item={item} />
            ))}
          </div>
        </section>

        {/* ---- 9 · BENEFITS ---- */}
        <section className="mx-auto w-full max-w-7xl px-6 py-12 md:px-12">
          <div className="grid gap-4 md:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b.title} data-reveal className="card-raised rounded-card p-6">
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white/5 text-accent">
                  {b.icon}
                </span>
                <h3 className="mt-3 text-lg font-semibold font-display">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- 10 · AGENCY STRIP ---- */}
        <section className="mx-auto w-full max-w-7xl px-6 py-10 md:px-12">
          <div
            data-reveal
            className="rounded-card border border-accent/25 p-8"
            style={{
              background:
                "linear-gradient(120deg, rgba(255,107,61,0.09), rgba(255,61,110,0.05) 60%, transparent)",
            }}
          >
            <h2 className="text-2xl font-semibold tracking-tight font-display">
              Run an agency? Produce client ads at scale.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
              Ten clients, ten campaigns, one studio. Turn every brief into finished reels the
              same day, deliver under your own brand, and stop renting camera crews for
              30-second spots.
            </p>
          </div>
        </section>

        {/* ---- 11 · FAQ ---- */}
        <section id="faq" className="scroll-mt-20 mx-auto w-full max-w-4xl px-6 py-12 md:px-12">
          <h2 data-reveal className="mb-8 text-3xl font-semibold tracking-tight font-display">
            Questions, answered.
          </h2>
          <div className="flex flex-col gap-3">
            {FAQS.map((f) => (
              <details key={f.q} data-reveal className="card-raised group rounded-card px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
                  {f.q}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-lg text-text-muted transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---- 12 · FINAL CTA ---- */}
        <section className="mx-auto flex w-full max-w-7xl flex-col items-center gap-5 px-6 py-16 text-center md:px-12">
          <h2 data-reveal className="text-4xl font-semibold tracking-tight font-display">
            Ready to make your <span className="text-grad">first ad</span>?
          </h2>
          <div data-reveal>
            <CtaButton big />
          </div>
        </section>
      </main>

      {/* ---- Big footer ---- */}
      <footer className="border-t border-white/5">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-10 sm:grid-cols-2 md:px-12 lg:grid-cols-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <BrandMark className="size-8 shrink-0" />
              <span className="text-[12px] font-bold uppercase tracking-wider font-display">
                SOCIALADZGEN <span className="text-grad">STUDIO</span>
              </span>
            </div>
            <p className="text-xs leading-relaxed text-text-muted">
              AI ad videos for Indian businesses. English + <span lang="hi">हिन्दी</span>.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="label-cap pb-1">Start creating</p>
            {TOOL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm text-text-secondary hover:text-text-primary">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <p className="label-cap pb-1">Use cases</p>
            {USECASE_LIST.map((u) => (
              <Link
                key={u.slug}
                href={usecaseHref(u)}
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                {u.title}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <p className="label-cap pb-1">Studio</p>
            <Link href="/library" className="text-sm text-text-secondary hover:text-text-primary">
              Library
            </Link>
            <a href="#how" className="text-sm text-text-secondary hover:text-text-primary">
              How it works
            </a>
            <a
              href="mailto:admin@udayinnovation.com"
              className="text-sm text-text-secondary hover:text-text-primary"
            >
              Contact us
            </a>
          </div>
        </div>
        <div className="border-t border-white/5">
          <p className="mx-auto w-full max-w-7xl px-6 py-5 text-xs text-text-muted md:px-12">
            SOCIALADZGEN STUDIO — ad videos in minutes, not weeks.
          </p>
        </div>
      </footer>
    </div>
  );
}

const TOOL_LINKS = [
  { label: "Product Spotlight", href: "/create?mode=product" },
  { label: "Talking Avatar", href: "/create?mode=lipsync" },
  { label: "Cinematic B-roll", href: "/create?mode=overlay" },
  { label: "Open the studio", href: "/create" },
];
