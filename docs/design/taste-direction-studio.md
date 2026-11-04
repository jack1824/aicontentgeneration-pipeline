> **Status (4 Nov 2026):** this is the direction the taste skill dealt for the studio in the v4 build.
> In v5 the owner replaced its colour and type with the plum / charcoal / bone palette and the Bodoni Moda + Tiro Devanagari
> + Schibsted Grotesk type set. `docs/design/DESIGN_SYSTEM.md` is the authority; this sheet is kept as research.
> The studio still follows this sheet for layout only (framed sheet, builder canvas), with the accent changed to wine.
> Ignore its type choices (IBM Plex Sans / Mono): v5 uses Schibsted Grotesk and Mukta in the studio.

# APP SHEET — Framed sheet
seed 2129887710 · drawn 2026-11-04 · kind builder · light
Brief: Ad studio for Indian shop owners: brief, pick an opening hook, watch the shots being made, then edit the 15-second ad on a beat timeline and send it to WhatsApp

This is the style for this product. Adopt it whole and keep its move intact; everything the sheet does not fix comes from the
shared defaults in references/app-screens.md. Redraw only for a reason you can state (it contradicts the brand, or the product is
used in a way the style does not suit) and say why in your report. The values were measured on real product screens: use them
as given rather than rounding them towards your habits.

## 1. The style
The app chrome is one tinted L-shaped frame; the work sits on a white sheet with a hairline edge and soft corners, so depth comes from a single tone step and no shadow.

**The move:** One tinted frame holds the sidebar and the 48px top bar with no rule between them; the page is a white sheet inset 8px from the window's right and bottom edges, with a 1px edge, 16px corners and no shadow. The active tab is a 2px underline in ink or the accent; everything else in the chrome is grey.

**Colour budget:** under 3%; the brand shrinks to the logo and a 2px tab underline, the data carries the chroma.
**Off-style here:** a border between the sidebar and the top bar; a shadow under the sheet; cards whose border is heavier than the sheet's (#cdcfcf on cards read as heavy in the study); a fourth nesting level: frame, sheet and card are enough; different gutters for the KPI row and the chart row (20 against 24 was flagged).
Distilled from 6 screens: a developer platform overview, an analytics overview, an events analytics tab, a list detail, a reports dashboard, a flow builder. The study's second data hue in this style was an orange (#e88e46) that falls inside the house terracotta range; the third chart colour here is an amber moved out of that range and darkened to 3:1 on white.

**Its face.** Choose one of these (or one of your own of the same weight) before you build, write it in your notes next to
the screen's question, and check that it shows on the first screen. Without one the screen reads as a well-applied kit.
- The frame tinted from the product's colour in place of #f9fbfc: one low-chroma step of its hue (a green-grey for a climate or farm tool, a blue-grey for an observability tool, a stone for a print shop). The sheet stays white.
- The brand's own hue from the brief as --chart-1 in place of the dealt teal, on the main series and the one selected state, at 3:1 or more on white, never violet or indigo.
- IBM Plex Mono for IDs, keys and the figures in tables (one job): its figures have their own drawing, and a developer reads them as the product's.

## 2. Tokens
Kept from the brand: map its colours onto this style's roles (ground, surface, raised, border, rule, control, text, muted, accent, status pills, chart) and keep its proportions: under 3%; the brand shrinks to the logo and a 2px tab underline, the data carries the chroma. Take the sizes, radii, row and control heights from the style as they are.

## 4. Shell — Tinted frame, white sheet
Sidebar and top bar share one tinted ground with no rule between them, forming an L; the page lives on a white sheet. Variant one: the sheet butts against the sidebar and the top bar and is inset 8px from the right and bottom edges, 16px radius, 1px edge. Variant two: a flush L-frame with no inset, the frame marked by one rule. Variant three: sidebar and content are two floating panels inset 12px from every edge with a 12px gutter. The top bar, when present, is 48px and holds a centred search, the account button and a help or AI icon. Inside the sheet the content has 24px padding and starts with the breadcrumb or title row.
Numbers: chrome #f6f6f6-#f9fbfc (a warm #f7f6f2 once); sheetInset 8px from the window's right and bottom edges (12 and 16 once each); sheetRadius 10-16, median 16; sheetEdge 1px #eaeaea-#ededed, no shadow; sidebarWidth 220-263 (228 on two screens); topBar 48px on the chrome ground with no rule; search 548x32 centred on the window with a shortcut hint; contentPadding 24; floatingVariant both panels inset 12px with a 12px gutter, radius 10.
On a phone: The frame disappears: the sheet becomes the screen, with a 48px top bar (menu button, title, one action) on the chrome tint. The search moves into the menu sheet or behind an icon.

## 5. Screens

### builder — Builder canvas
No global navigation: a 44px top bar on the window ground with no rule (an exit arrow, the object's name at 16/600 with a status pill, and on the right 16px icon buttons on a 40px pitch, a secondary and a near-black primary, split by 1px dividers). Below, two panels on the ground with 8px outer margins and a 12px gap, both with a 1px border, 16px radius and no shadow: a 232px palette (16px padding, groups under 14px labels, items on a 40px pitch with a small type tile, a label and a drag grip) and the canvas, a flat well one step darker than the ground (#f4f6f8 on #f9fbfc) with no dot grid. Nodes share one width (338px in the study), 12px radius, a 1px hairline, padding 16 on top and 12 at the sides, a type tile and a 16/600 title, and their metrics in a well as key-value rows on a 32px pitch with right-aligned tabular or mono values ('0% (0)'). Nodes stack on one spine 64px apart with a 38px round insert button centred in each gap; connectors are 1px orthogonal lines with 6px rounded elbows. Overlays (date range, zoom, minimap) are small white controls pinned 16px inside the canvas corners. Canvas content is one size larger than the chrome (16 against 14). Node-type tiles may be tinted, one pastel per type, the same in the palette and on the canvas: pass --allow icon-chips to the inspector and say why.
On a phone: Editing a graph on a phone is rarely the job: show the flow read-only as a vertical list of nodes with their metrics, and the palette as a bottom sheet if editing is kept.

### list
No pattern in the library for this screen. Compose it from the rules in references/app-screens.md.

### settings — Settings in two columns
A centred column of about 1152px. Each section is one row: a label column of about 450px (16/500 title, 14px grey description; the title's cap top 6-8px below the panel top, level with the panel's first line) beside a panel of about 700px with a #fafafa fill, 16px radius, 16px padding, no border and no shadow. Sections are split by a full-width 1px rule with 32px above and below. Inside a panel: field labels 14/500 above 40px white inputs (1px #e8e8e8, radius 10), 8px from label to field, 16px between fields, 24px from the description to the first label, 16px to the Save button; switch rows with a 14/500 title, a 20px status badge 8px after it, a 14px grey description and a 28x16 toggle 16px from the right edge, centred on the title line. A plan-gated feature shows a 48px tinted strip with a 32px button directly above its panel, and the panel stays readable. When a panel runs much taller than its label, put the section's help or a summary of the current values in the label column rather than 250px of nothing.
On a phone: Each section stacks: title and description, then the panel at full width. Inside, label, 8-10px, field, 16-26px to the next pair; toggles stay on the right of their title.

## 6. Always
Real data for this product, written before the markup: names, amounts that add up, dates in order, units on every figure,
honest zeros and dashes. One chart answers one question. No gradients, glows, glass, icons in tinted squares, sparklines on KPIs,
rainbow charts, emoji, lorem or Acme. `<skill>/assets/app.css` and `<skill>/assets/charts.js` are a neutral start set to these
rules. Check with `node <skill>/scripts/lint.mjs <files>` and `node <skill>/scripts/inspect.mjs <page>`: this sheet switches both
to app rules.

Saved to /home/claude/adz/.taste-skill/app/direction.json · reprint with `node draw.mjs --show`
