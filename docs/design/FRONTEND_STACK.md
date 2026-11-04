# Frontend stack for apps/web (decided 4 Nov 2026)

The mockup (`mockup/studio-ui`) is a Vite single-page build so it can be bundled into one HTML file. The product
app is Next.js; it reuses the mockup's tokens, components and GSAP patterns. This plan maps the stack the owner
shared (the "Notch" reference stack) onto what SocialAdz actually needs, and drops what it does not.

## Kept from the mockup (already proven)

| Piece | Version in mockup | Notes |
| --- | --- | --- |
| React | 19.2 | Same in Next.js 16. |
| TypeScript | 5.8, `strict` | `noUncheckedIndexedAccess` recommended for apps/web. |
| Tailwind CSS | v4.1 via `@tailwindcss/vite` | In Next.js use `@tailwindcss/postcss`. Tokens in `:root` + `@theme inline`; base rules in `@layer base`. |
| GSAP + @gsap/react | 3.13 / 2.1.2 | ScrollTrigger, SplitText, Flip, quickTo, matchMedia. All GSAP plugins are free since 3.13. Client components only (`'use client'`). |
| Lenis | 1.3 | Landing only; driven by `gsap.ticker`; off for touch and reduced motion. |
| Radix | Dialog 1.1 | Add Radix Popover, Tooltip, Tabs, Switch as needed; no full UI kit. |
| lucide-react | 0.511 | Icons; always `aria-hidden` next to text. |
| Fontsource | Bodoni Moda Variable, Tiro Devanagari Hindi, Schibsted Grotesk, Mukta | In Next.js either keep fontsource imports or switch to `next/font/google` with the same four faces and `display: swap`; subset Devanagari + Latin only. |
| ESLint 9 | typescript-eslint strict, jsx-a11y, react-hooks | Add `@next/eslint-plugin-next`. `--max-warnings 0`. |

## Added for the product (from the reference stack, filtered)

| Need | Choice | Why |
| --- | --- | --- |
| App framework | **Next.js 16** (App Router), pnpm workspace `apps/web` | Server components for the landing, client islands for the studio. |
| Forms and contracts | **Zod 4** schemas in `packages/contracts`, shared with the API | One schema for the brief, hooks, beats, job events. |
| Server state | TanStack Query 5 + an SSE hook for `GET /ads/:id/events` | Live job state without polling. |
| Drag and drop | **dnd-kit** | Director's Cut: shot boundaries, takes, beat order. |
| Command menu | **cmdk** | Advanced only: jump to shot, change model, re-voice beat. |
| Background removal | **@imgly/background-removal** (in the browser) | Product photos cut out before upload; nothing leaves the phone that does not have to. Check its licence (AGPL for some builds) before Phase 2; fallback is server-side rembg in the worker. |
| Brand colours from a logo | **node-vibrant** | Brand kit suggests end-card colours from the uploaded logo. |
| PWA | Web manifest + **share target** | A shop owner shares a product photo from the gallery straight into a new ad. |
| Unit and component tests | **Vitest** + Testing Library (jsdom) | Skills `vitest`, `vercel-react-best-practices`. |
| Browser tests | **Playwright** | Skills `playwright-best-practices`, `webapp-testing`. Screenshots at 1366 / 768 / 390, both modes; the no-money DOM search runs here. |
| View transitions | React `<ViewTransition>` where supported | Skill `vercel-react-view-transitions`; GSAP stays for anything choreographed. |

## Dropped from the reference stack

- Vue, Nuxt, Pinia, UnoCSS, VitePress, Nitro: a different framework family. Their skills are not bundled.
- React Native: no native app in scope.
- Any analytics, payments or pricing component: payments are Phase 4 and the website never displays money.
- Vercel deploy tooling: hosting is Phase 4, after G3; the hosting CLIs are denied in `.claude/settings.json`.

## Porting the mockup (Phase 1, task 1.7)

1. Copy `src/styles.css` tokens and classes into `apps/web/app/globals.css` unchanged.
2. Port `ui/*` first (Reel, Pickers, Seg, Sheet, Meter, Mark) as client components; keep their props.
3. Landing as a server component page with client islands (hero reel, strip, sticky card, try-it rows).
4. Studio routes: `/studio/new`, `/studio/ads`, `/studio/moments`, `/studio/brand`. `data.ts` becomes API calls.
5. Remove `estimate()`'s mock data; Advanced reads the time-only estimate from the API (models, seconds). The
   API never sends money fields to the web app.
6. Gate: the same screenshots as the mockup at three widths, lint clean, Playwright click-through brief → ad in
   both modes, no-money search green.
