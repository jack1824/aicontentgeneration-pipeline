# studio-ui: the v5 mockup source

The approved UI (owner sign-off 4 Nov 2026): the landing page and the studio, in one Vite app that builds into one
self-contained HTML file. Rules: `docs/design/DESIGN_SYSTEM.md`. Product plan for `apps/web`:
`docs/design/FRONTEND_STACK.md`.

## Commands

```bash
pnpm i            # once
pnpm dev          # http://localhost:5173 (landing; "Open the studio" switches to the studio)
pnpm typecheck    # tsc strict
pnpm lint         # ESLint 9, typescript-eslint strict, jsx-a11y, react-hooks, --max-warnings 0
./build.sh        # typecheck + lint + build, then copies dist/index.html to ../socialadz-studio.html
./build.sh --artifact   # also writes a claude.ai artifact version (no document skeleton)
node scripts/no-money.cjs   # the owner's no-money rule, every route, both modes (needs Playwright:
                            # pnpm add -D playwright && pnpm exec playwright install chromium)
```

## Stack

Vite 6 + React 19.2 + TypeScript 5.8 strict, Tailwind v4 (`@tailwindcss/vite`, tokens in `src/styles.css` under
`:root` and `@theme inline`), `vite-plugin-singlefile`, GSAP 3.13 + `@gsap/react` (ScrollTrigger, SplitText, Flip),
Lenis, Radix Dialog, lucide-react, Fontsource (Bodoni Moda Variable, Tiro Devanagari Hindi, Schibsted Grotesk,
Mukta).

## Map

| File | What it holds |
| --- | --- |
| `src/App.tsx`, `src/main.tsx` | Landing ↔ studio switch. |
| `src/styles.css` | All tokens and component classes; landing tokens under `.lp`. |
| `src/lib/gsap.ts` | Plugin registration, `reduced()`, eases. |
| `src/lib/data.ts` | Mock data: video models, voices, moments (real dates), CTAs, hook/beat/shot builders, the time-only `estimate()`. No prices. |
| `src/landing/Landing.tsx`, `useSmoothScroll.ts` | The editorial landing page and Lenis. |
| `src/studio/Studio.tsx`, `Builder.tsx`, `Pages.tsx` | Studio shell, the four-step builder, My ads / Moments / Brand kit. |
| `src/ui/*` | Reel (the live ad player), Pickers (voice, model), Seg, Sheet, Meter, Mark. |

Samples in the voice picker are silent (the line lights word by word); the studio plays real ElevenLabs voices.
Frames in the reel are colour fields until Phase 0 gives real product shots.
