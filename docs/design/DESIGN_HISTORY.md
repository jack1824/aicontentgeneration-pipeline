# How the UI got to v5 (3–4 Nov 2026)

This is a short record of what was tried and why it changed, so nobody brings back a rejected direction.

| Version | Direction | Owner's verdict | What we learned |
| --- | --- | --- | --- |
| v2 | Dark graphite studio, one kesar (saffron) accent, Bricolage Grotesque + IBM Plex | "bad" | Dark-on-dark with one accent felt generic and heavy; no landing page. |
| v3 | Light chalk surfaces, neel indigo ink, rani pink actions, Anek + Mukta; Reels phone frame; first landing page | "the ui is bad", wanted model and voice choice, a landing page, proper GSAP and better colour | Choice of **voice** and **video model** must be in Simple mode. Colour should feel authentic and professional, not festive-loud. |
| v4 | Rebuilt with the taste skill (dense-tiles direction), GSAP skills and Vercel guidelines; Vite + Tailwind v4 single file; examples removed | Accepted as a base | Tooling worked (lint, inspect, a11y). The tiles still looked cluttered. |
| v5 | Editorial redesign on the owner's two palettes (deep plum / charcoal, bone, wine, electric orange, champagne), Bodoni Moda + Tiro Devanagari display, "controlled chaos" composition; every money mention removed | **"loved it"** | This is the look. See `DESIGN_SYSTEM.md`. |

## Owner rules that came out of the rounds

1. No money anywhere on the website, in any mode or component (verbatim rule in `DESIGN_SYSTEM.md`).
2. Voice and video model are chosen in Simple mode; Auto is the default model.
3. No examples or galleries until real ads exist.
4. Use the skills: GSAP, taste, frontend-design, Vercel guidelines, linting.
5. Editorial and premium: no excessive gradients, glow or decoration; keep functionality and copy when restyling;
   refine rather than rebuild.

## Inspector findings kept on purpose (v5)

The taste inspector flags these; they are deliberate and marked `taste-skill-ignore` where it applies:
- The hook-type strip bleeds past the screen edge (it is a moving line, clipped by its own section).
- "रुको।" sits partly behind the reel (layering is the composition).
- Champagne hairlines and the bone colour read as "cream" to the inspector; both are the owner's palette.
- Mixed display faces (Bodoni + Tiro + Schibsted): Latin and Devanagari need their own display face.
- No real photographs yet: frames are colour fields until Phase 0 proofs give us real product shots.
- Blank areas in full-page inspector shots are scroll reveals measured before they ran.
