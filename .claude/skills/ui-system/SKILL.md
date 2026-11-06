---
name: ui-system
description: The SocialAdz v5 design system and UI rules (editorial plum palette, Bodoni + Tiro + Schibsted + Mukta, landing composition, studio framed sheet, Simple/Advanced split, GSAP patterns, copy) and the strict rule that no money is ever shown on the website. Load first before building or changing any screen in apps/web or mockup/studio-ui.
---
# UI system (v5, approved 4 Nov 2026)

The authority is `docs/design/DESIGN_SYSTEM.md`; the pixels are `mockup/studio-ui` (source) and
`mockup/socialadz-studio.html`. Read DESIGN_SYSTEM.md once per UI task. This skill is the short version.

## Rule zero: no money, anywhere
Never display a cost, price, pricing, fee, subscription amount or monetary value of anything on the website: not
in Simple, not in Advanced, not in a tooltip, toast, modal, footer, CTA, sample ad, placeholder or generated text.
No price field in the brief. No pricing section. No "free", "cheap" or "nothing is charged" lines. The API never
sends money fields to the web app. Every screen passes the no-money check before it is done: this regex over rendered text and the
`title` / `aria-label` / `placeholder` attributes, every route, both modes: `/₹|\bRs\.?\s?\d|\bINR\b|\$\s?\d|\b(price|prices|pricing|priced|cost|costs|credit|credits|fee|fees|subscription|subscriptions|paid)\b/i`.

## Palette roles (tokens in `src/styles.css`, `.lp` scope for the landing)
- Foundation: deep plum `#18121C` and charcoal `#151113`; surfaces `#241B29` / `#241A1E`.
- Type: bone `#F1EDE4`, warm off-white `#F3EDE5`; muted plum `#8B7B94` (small text uses `#A495AD`).
- Electric orange `#FF5A36` = interactive accents only (primary CTA, focus ring, active link). Hover `#E8461F`.
- Wine `#8F3047` = selective emphasis (Try-it block, closing band) and the studio's accent.
- Champagne `#C6A87D` = subtle detail (hairlines, figure captions, the reel's offer card).
- Studio working sheet: frame `#EEF0F3`, sheet `#FFFFFF`, well `#F4F6F8`, ink `#0B0C0E`, accent wine.
- No decorative gradients, glow or shadow stacks. Grain only on the hero. The reel reads `--reel-*` variables.

## Type
Bodoni Moda Variable (display, roman and italic), Tiro Devanagari Hindi (Devanagari display), Schibsted Grotesk
(Latin UI/body), Mukta (Devanagari UI/body). Bundled with Fontsource or `next/font`. Sentence case; no all-caps
eyebrows; no mono labels except a model slug in Advanced; no "→" appended to button text. `text-wrap` rules live in
`@layer base`.

## Landing (`src/landing/Landing.tsx`)
Nav over the hero → hero ("रुको।" glyph, h1 "Hindi video ads / for your shop.", "What do you sell?" input, orange
"Make your first ad", reel at −4° with shutter reveal, Fig. 1) → scroll-linked hook strip → How it works (sticky
card, four steps) → Try it (underline rows, reel at +3° on wine, Fig. 2) → Studio index (sliding previews, Fig. 3)
→ Questions → wine closing band → charcoal footer with the cropped italic wordmark. Never add pricing, testimonials,
logo walls, stat tiles or example galleries.

## Studio (`src/studio/*`)
Framed sheet; top bar with step trail and the Simple/Advanced switch (remembered in `localStorage` key `sa-mode`,
wrapped in try/catch); rail that becomes a bottom bar under 768px. Builder: Brief → Openings → Making → Your ad,
one primary button each.
- **Simple:** product, offer (free text), photos, **voice picker** (six Hindi voices, silent word-lit sample,
  record your own), **video model picker** (Auto default; Wan 3.0, Kling 3.0 Pro, Kling O3, Kling 4.0, Seedance
  2.5, Cinema Studio 4.0 with maker, good-for line, speed and detail meters), length, language, captions, CTA,
  festival, one coarse time line.
  Model readiness (owner rule, 6 Nov 2026, CLAUDE.md): the picker lists only models with `status: ready` in
  `config/router.yaml`; an unproven model stays hidden and Auto never routes to it. All seven stay in the product.
- **Advanced adds (time and model detail only):** quality preset, presenter, Production table (step, model,
  time), per-model resolution / shot length / per-shot time / slug, voice settings, hook scores, per-shot QC,
  Director's Cut (playhead synced to the reel, model override per shot, takes, re-shoot with a note, voice by beat)
  and "How it was made".
- Voice change re-voices only; model change re-shoots. The toast says which.

## Motion (GSAP 3.13, `@gsap/react`; load the `gsap-*` skills)
`useGSAP` with a scope everywhere; plugins registered in `src/lib/gsap.ts`; `reduced()` checks
prefers-reduced-motion and skips tweens (the reel becomes `StillReel`). One orchestrated entrance per screen.
SplitText after `document.fonts.ready` with a `live` guard. `quickTo('rotation')` for pointer tilt (not `rotate`).
Lenis on the landing only, driven by `gsap.ticker`. Flip for list filters. Never `transition: all`.

## Copy
Plain sentence case, the shop owner's words. Buttons name the result ("Make your first ad", "Send to WhatsApp").
Errors say what happened and what to do next. Every label has a Hindi string.

## Done checklist
1. Screenshots at 1366, 768 and 390px in both modes (Playwright, `deviceScaleFactor: 1` for your own checks).
2. `pnpm typecheck && pnpm lint` clean (`--max-warnings 0`).
3. Taste: `node .claude/skills/design-taste-frontend/scripts/lint.mjs <files>`; `inspect.mjs <url>` (landing) and
   `inspect.mjs <url> --app` (studio). Deliberate exceptions carry `taste-skill-ignore` with a reason; the known
   ones are listed in `docs/design/DESIGN_HISTORY.md`.
4. `web-design-guidelines` review; fix focus, labels, touch targets, reduced motion.
5. No-money DOM search green on every route and both modes.
6. No horizontal scroll at 390px. Orange is the brightest thing on each screen.
7. Rebuild the mockup bundle with `mockup/studio-ui/build.sh` when the mockup changes (the mockup is its own pnpm
   project through `mockup/studio-ui/pnpm-workspace.yaml`; see CLAUDE.md, Commands).
