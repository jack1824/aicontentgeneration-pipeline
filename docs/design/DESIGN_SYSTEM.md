# Design system: v5 "editorial plum" (approved 4 Nov 2026)

This file is the authority for colour, type, layout, motion and copy on the website and in the studio. The
working reference is `mockup/studio-ui` (source) and `mockup/socialadz-studio.html` (bundle). If this file and the
mockup disagree, the mockup wins for pixels and this file wins for rules. The older taste direction sheets in this
folder are kept for history only.

## The strict content rule (owner, 4 Nov 2026, verbatim)

> Never display the cost, price, pricing, fees, subscription amounts, or monetary value of anything anywhere on
> the website. This restriction applies to every section, component, tooltip, card, modal, footer, CTA, and
> dynamically generated content. Do not introduce pricing sections or cost-related messaging.

What it means in practice:
- No rupee or dollar figure, no "credits", no balance, no plan names with amounts, no "free" or "cheap" claims, no
  "nothing is charged until…" lines. This holds in Simple **and** Advanced mode.
- Advanced mode shows **time and model detail only**: models that will run, resolution, shot length, time per shot,
  total time, QC verdicts, takes.
- The brief has **no price field**. The offer is free text ("Free delivery by Diwali", "New flavour this week").
  Sample content, hooks, placeholder ads and the reel preview carry no prices.
- Cost data still exists inside the system (`/estimate` calls, the `ledger` table, phase-gate cost checks) for the
  owner's engineering decisions. It is never rendered in the UI, never sent to the client bundle, never in an
  SSE event the web app consumes. Owner reports go to `SUMMARIES/`, not to the website.
- Whether a shop's own typed price may appear inside its exported ad video is open decision **D11** (see
  `docs/plan/00-plan.md`, Amendment A). Until the owner decides, the script brain writes no prices and the
  compositor has no price card.
- A check for this rule is part of done for every screen: run this regex over the rendered text
  (`document.body.innerText`, plus `title`, `aria-label` and `placeholder` attributes) on every route in both modes
  and fail on a hit: `/₹|\bRs\.?\s?\d|\bINR\b|\$\s?\d|\b(price|prices|pricing|priced|cost|costs|credit|credits|fee|fees|subscription|subscriptions|paid)\b/i`. Word boundaries matter: "feed" and "colours" must not match.

## Palette

Two of the owner's palettes, blended. Roles are fixed; do not invent new hues.

| Token | Hex | Role |
| --- | --- | --- |
| `--plum` | `#18121C` | Deep plum. The landing foundation (hero, sections). |
| `--char` | `#151113` | Charcoal. Second foundation: alternate sections, footer. |
| `--s-plum` | `#241B29` | Plum surface: raised areas, the giant "रुको।" glyph, reel frames. |
| `--s-char` | `#241A1E` | Charcoal surface. |
| `--bone` | `#F1EDE4` | Bone. Main type on dark; the pressed state of segmented controls. |
| `--off` | `#F3EDE5` | Warm off-white. Secondary type on dark, light sheets. |
| `--orange` | `#FF5A36` | Electric orange. **Interactive accents only**: primary CTA, focus, links on hover, the end card. Hover/pressed `--orange-deep #E8461F`. |
| `--wine` | `#8F3047` | Wine. **Selective emphasis**: the "Try it" block, the closing CTA band, the studio's accent. Strong `#74263A`. |
| `--champ` | `#C6A87D` | Champagne. **Subtle detail**: hairline rules (`.rule-champ`), figure captions, the offer card in the reel. |
| `--mplum` | `#8B7B94` | Muted plum. Secondary text, labels. Lighter step `--mplum-2 #A495AD` for small text on plum (contrast). |

Rules:
- No gradients as decoration, no glow, no drop-shadow stacks. One SVG grain layer (`.grain`, 0.07 opacity,
  soft-light) on the hero only.
- Orange is the brightest thing on any screen and appears where the user acts. Wine never competes with it.
- Reel colours come from `--reel-*` variables (`--reel-1..4`, `--reel-end`, `--reel-card`) so the reel recolours
  with its surroundings.
- The studio (app screens) uses a light framed sheet for long working sessions: frame `#EEF0F3`, sheet `#FFFFFF`,
  well `#F4F6F8`, text `#0B0C0E`, with **wine** as the accent (`--accent #8F3047`). Status pills keep their own
  positive / warning / negative tokens. When `apps/web` is built, the studio top bar and empty states may move to
  plum surfaces; the working sheet stays light.

## Type

All fonts are bundled (fontsource) so the page never depends on Google Fonts.

| Face | Use |
| --- | --- |
| **Bodoni Moda Variable** (optical size axis, roman + italic) | Display: the h1, section heads, the italic wordmark, the closing line. `.serif`, `.serif-i`. |
| **Tiro Devanagari Hindi** (400, italic) | Devanagari display: "रुको।", Hindi lines in the reel and hook strip. `.deva`. |
| **Schibsted Grotesk** (400/600/800) | Latin UI and body text. |
| **Mukta** (400/600/800, Devanagari subset) | Devanagari UI and body, paired with Schibsted. `.hi`. |

- Hero h1: `clamp(40px, 6.5vw, 112px)`, Bodoni, with a hanging indent on the second line. The h1 itself carries
  the display size (no display-size spans inside a small h1).
- Headings `text-wrap: balance`, paragraphs `text-wrap: pretty`, both inside `@layer base` (an unlayered rule beats
  Tailwind utilities in v4 and broke `whitespace-nowrap`).
- Sentence case everywhere. No all-caps eyebrows, no monospace labels (a model slug in Advanced is the one
  exception), no "→" appended to buttons, no `A · B · C` meta strings in marketing copy.
- Numerals are tabular (`.num`) in tables and timers.

## Landing composition ("controlled chaos")

Editorial, asymmetric, one bold move per section. Order:
1. **Nav** (absolute over the hero): the 9:16 frame mark, italic "SocialAdz", four links, an orange outline
   "Open the studio".
2. **Hero**: grain; the giant aria-hidden "रुको।" (Tiro, 180–520px, `--s-plum`) behind; the h1 "Hindi video ads /
   for your shop."; the underline input "What do you sell?"; the orange CTA "Make your first ad"; the live reel
   tilted −4° with a shutter reveal and a pointer tilt (`quickTo('rotation')`); caption "Fig. 1".
3. **Hook-type strip**: one line of hook types that moves with scroll and bleeds past the edge on purpose.
4. **How it works**: a sticky ad card that advances through four real steps as you scroll (numerals are allowed
   here because it is a sequence).
5. **Try it**: underline rows (product, offer, voice, model, ends with, festival, length, captions) beside the reel
   at +3° on a wine block; caption "Fig. 2".
6. **Studio index**: a list of studio screens with a sliding preview stack; "Fig. 3".
7. **Questions**: sticky italic heading, answers in a single column.
8. **Closing band** (wine): "Your first ad, before Dhanteras." with a bone "Open the studio" button (orange
   would fight the wine; bone keeps the action the brightest thing in the band). Update the festival line as the
   calendar moves.
9. **Footer** (charcoal): columns (ad rules reference, "Built on Higgsfield and ElevenLabs") and a giant cropped
   italic wordmark.

Never add: a pricing section, plan cards, testimonials (none are real yet), logo walls, stat tiles with big
numbers, example galleries (removed by the owner until real ads exist).

## Studio

- Shell: framed sheet. Top bar (wordmark, step trail, Simple/Advanced switch, account); a left rail (New ad, My ads,
  Moments, Brand kit) that becomes a bottom bar under 768px; max width about 1180px.
- Builder: Brief → Openings → Making → Your ad, one primary button per step.
- **Simple** shows: product, offer (free text), photos, the **voice picker** (six Hindi voices with a silent
  word-lit sample, or record your own), the **video model picker** (Auto by default, plus Wan 3.0, Kling 3.0 Pro,
  Kling O3, Kling 4.0, Seedance 2.5, Cinema Studio 4.0: maker, what it is good for, a speed meter and a detail
  meter), length, language, captions, call to action, festival, and one coarse time line ("about 5 min").
- **Advanced** adds: quality preset, presenter, the Production table (step, model, time), per-model resolution /
  shot length / time per shot, voice settings, hook scores, per-shot QC, and on Your ad the Director's Cut
  (timeline with a playhead synced to the reel, per-shot model override, takes with QC, re-shoot with a note,
  voice by beat) and "How it was made". No money in any of it.
- Changing the voice re-voices without re-shooting; changing the model re-shoots. The toast says which.
- My ads (empty state plus "Coming up" moments), Moments (a real-date table counted from today), Brand kit (end
  card preview).

## Components (mockup/studio-ui/src)

`ui/Reel.tsx` (the signature element: GSAP timeline, frame cross-fades on beat times, captions lit word by word,
hook card, offer card, end card; `StillReel` under reduced motion), `ui/Pickers.tsx` (VoicePicker, ModelPicker,
ModelRow, VoiceSample), `ui/Seg.tsx` (segmented control with a GSAP thumb), `ui/Sheet.tsx` (Radix Dialog),
`ui/Meter.tsx`, `ui/Mark.tsx`; CSS classes `.btn*`, `.field`, `.pick` (real border + outline when checked, no inset
shadow), `.seg`, `.lane`/`.blk`, and the landing set `.lp-btn(-orange|-line|-bone)`, `.lp-link`, `.lp-field`,
`.lp-select`, `.rule-champ`, `.grain`. Radius is small and consistent with the editorial tone: 2px on landing
buttons, 8px in the studio.

## Motion

GSAP 3.13 with `@gsap/react` (`useGSAP` with a scope, always), plugins registered once in `src/lib/gsap.ts`:
ScrollTrigger, SplitText, Flip; `quickTo` for pointer-driven values; `gsap.matchMedia` for desktop-only effects.
Lenis smooth scroll (lerp 0.12) driven by `gsap.ticker`, off for touch and reduced motion.
- One orchestrated entrance per screen. No fade-up on every section; no hover animation on every card.
- SplitText only after `document.fonts.ready`, guarded by a `live` flag so nothing runs after unmount.
- Scroll-linked motion: the hook strip, the sticky "How it works" card, the studio index preview.
- Studio motion answers actions: Flip on voice filter, the Seg thumb, the toast.
- `prefers-reduced-motion`: skip tweens, show final states, swap the reel for `StillReel`.
- Never animate `all`; animate transform and opacity.

## Copy

Plain, sentence case, the way a shop owner talks ("Change the voice", "Re-shoot with another model", "Send to
WhatsApp"). Buttons say what happens. Errors say what went wrong and what to do. Hindi strings exist for every
label. No money language at all (see the rule above).

## Done checklist for any screen

1. Screenshots at 1366, 768 and 390px, Simple and Advanced, light reading of both.
2. `pnpm typecheck && pnpm lint` clean (ESLint 9, typescript-eslint strict, jsx-a11y, react-hooks).
3. Taste skill: `node .claude/skills/design-taste-frontend/scripts/lint.mjs <files>` and `inspect.mjs <url> --app`
   for studio screens; justified exceptions carry a `taste-skill-ignore` comment with the reason.
4. `web-design-guidelines` review (Vercel Web Interface Guidelines, copy in
   `docs/research/vercel-web-interface-guidelines.md`).
5. Keyboard: every control reachable, focus visible (orange ring on dark, wine on light).
6. The no-money check passes (`node mockup/studio-ui/scripts/no-money.cjs [url]`; port it to Playwright tests in apps/web).
7. No horizontal page scroll at 390px (the hook strip clips inside its own overflow).
