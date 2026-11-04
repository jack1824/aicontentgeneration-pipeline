# content/ — the content system (data, not code)

Phase 2 (task 2.3) turns `docs/plan/02-templates-and-hooks.md` into versioned JSON here:

- `templates/*.json` — 8 first (default DR, unboxing, three reasons, festive gifting, WhatsApp-us, store visit,
  presenter explainer, owner-led), then the rest of the 19. Price anchor (template 3) is parked until owner decision D11:
  the website shows no prices.
- `hooks.json` — 16 hook types with Hinglish examples (Latin display + Devanagari voice), visual at 0–2 s, fits.
- `calendar.json` — campaign packs (dates, angle, motifs, palette, greeting, categories). Phase 2 ships Nov 2026 → Mar 2027; Phase 3 extends it to Dec 2027 from `docs/plan/02-templates-and-hooks.md`.
- `playbooks.json` — 17 verticals: angles, must-show, default CTA, blocked claims, switched-off templates.
- `cta.json`, `platforms.json` (export profiles + safe boxes), `samples/` (the Diwali sample brief and script).

Every file carries `version` and `last_verified`. `scripts/validate_content.py` checks them against the schemas.
