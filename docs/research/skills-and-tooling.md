# Skills and tooling research (4 Nov 2026)

Why each Claude Code skill is in this package, which ones the owner installed that we left out, and how Claude
Code should pick between them. Sources are the repositories listed in `THIRD_PARTY.md`.

## What the owner installed (`docs/research/skills-lock.json`, 33 skills)

Everything in the lock file came from five repositories: greensock/gsap-skills, Leonxlnx/taste-skill,
vercel-labs/agent-skills, antfu/skills and currents-dev/playwright-best-practices-skill.

### Bundled (24: 21 from the lock file plus three Anthropic skills not in it)

| Area | Skills | What they give us |
| --- | --- | --- |
| Motion | gsap-core, gsap-timeline, gsap-scrolltrigger, gsap-plugins (SplitText, Flip), gsap-react (`useGSAP`, cleanup), gsap-performance, gsap-utils, gsap-frameworks | Official GreenSock guidance; matches GSAP 3.13 in the mockup. |
| Visual design | design-taste-frontend | Direction draw (`scripts/draw.mjs`), a CSS/JSX lint (`scripts/lint.mjs`) and a rendered-page inspector (`scripts/inspect.mjs`, `--app` for app screens). Used to build v4 and to check v5. |
| Visual design | frontend-design (Anthropic) | Distinct, non-templated choices; plan → review → build → critique. |
| UI rules | web-design-guidelines (Vercel Web Interface Guidelines) | Review checklist: focus, forms, motion, touch, copy. |
| React | vercel-react-best-practices, vercel-composition-patterns, vercel-react-view-transitions | Performance rules (waterfalls, bundle size, re-renders), composition over boolean props, `<ViewTransition>`. |
| Writing | writing-guidelines | Interface copy rules; pairs with our `ui-system` copy section. |
| Code quality | antfu, antfu-simplify | Opinionated TypeScript/ESLint conventions and a simplify pass. |
| Build and test | vite, vitest, pnpm | The mockup is Vite; apps/web tests run on Vitest; the repo is a pnpm workspace. |
| Browser testing | playwright-best-practices, webapp-testing (Anthropic) | Locators, fixtures, screenshots; a helper to drive a local server. |
| Git | antfu-create-pr | Clean PR descriptions when the owner wants PRs. |
| Meta | skill-creator (Anthropic) | For writing or improving our own skills. |

### Left out on purpose (12; do not reinstall into this project)

| Skill | Why it is out |
| --- | --- |
| nuxt, vue, pinia, unocss, vitepress, nitro | Vue/Nuxt family; our app is React + Next.js + Tailwind. They would pull Claude toward the wrong framework. |
| vercel-react-native-skills | No native app in scope. |
| deploy-to-vercel, vercel-cli-with-tokens, vercel-optimize | Hosting is Phase 4, after G3; the Vercel CLI is denied in `.claude/settings.json`. Revisit in Phase 4. |
| antfu-issue-triage, antfu-query | GitHub issue triage and an antfu-specific query helper; no use in a solo build. |

If these are already installed globally (`~/.claude/skills`), that is fine: CLAUDE.md's routing rule tells
Claude Code which skills apply to this project. The project copies in `.claude/skills` take precedence.

## Plugin

**superpowers** (obra/superpowers) is installed as a plugin, not bundled. Use it for: brainstorming before a work
package, writing a plan, test-driven development (red → green → refactor), systematic debugging, and
verification before claiming something is done. It complements `planner-architect` and `qc-reviewer`.

## Routing rule (copied into CLAUDE.md)

- Planning a work package → superpowers brainstorming/plan + `planner-architect`.
- Any code → superpowers TDD; tests first.
- Any UI → `ui-system` → `design-taste-frontend` → `frontend-design` → the relevant `gsap-*` → `vercel-react-best-practices`
  → `web-design-guidelines` review → `writing-guidelines` for copy.
- Tests → `vitest` (unit/component), `playwright-best-practices` + `webapp-testing` (browser).
- Before a gate → `/code-review` and `/security-review`, then `qc-reviewer`.
- Our domain skills stay first for their areas: `higgsfield-api`, `elevenlabs-hindi`, `free-llm-chain`,
  `compositor-ffmpeg`, `script-brain`, `indian-ad-craft`, `local-testing`, `phase-summary`.

## The reference frontend stack

The owner shared a reference stack (the "Notch" stack: Next.js, Tailwind v4, Radix, GSAP, Lenis, dnd-kit, cmdk,
Zod, Vitest, Playwright, ESLint 9, in-browser background removal, colour extraction, PWA share target). The
mapping to SocialAdz is in `docs/design/FRONTEND_STACK.md`.
