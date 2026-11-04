> **Status (4 Nov 2026):** this is the direction the taste skill dealt for the landing page in the v4 build.
> In v5 the owner replaced its colour and type with the plum / charcoal / bone palette and the Bodoni Moda + Tiro Devanagari
> + Schibsted Grotesk type set. `docs/design/DESIGN_SYSTEM.md` is the authority; this sheet is kept as research.
> From this sheet v5 keeps: one primary action per screen, real interface fragments as pictures, entrances once per section, no gradients or glow.

# DIRECTION SHEET — The well-kept board
seed 1317394583 · drawn 2026-11-04 · redraws: 15 · sector ai-product
Brief: A studio that turns product photos and one line about an offer into a 15-second Hindi video ad for an Indian shop, with a real opening hook, a Hindi voice, captions and a WhatsApp ending

| | |
| --- | --- |
| Direction | The well-kept board |
| Hero | Two-by-two board |
| Type | Schibsted Grotesk |
| Colour | Cool grey, cobalt |
| Sections | how-it-works (One card, four fields) → showcase (Live demo with controls) → features (Staggered fragment cells) → faq (A band per question) → cta (The action tile) → footer (The mark, built large) |
| Motion | Shutter image |
| Photographs | the "Architecture" set, as atmosphere |

This is the direction for this build. Adopt it. Do not blend it with the layout you would have made anyway,
and do not redraw because it is unfamiliar: unfamiliar is the point. Redraw a slot only when it conflicts
with a stated brand constraint or needs an asset that does not exist, and say why in your report.

The parts of this sheet were written separately and will disagree in small ways. Settle every disagreement in this order:
**house rules** (including type no smaller than 13px and body text of 16px or more) → **the direction** (the idea, the composition habits, where the
one accent goes) → **the type system and the palette** (which face does which job, the five size steps, which colour is the ground and where the
accent goes) → **the hero blueprint** → **the section blueprints**. Under each blueprint below, "Adjusted for this page" lists where it disagrees.
In practice: take geometry from blueprints (columns, proportions, what sits where) and take everything else from above them. Map every size a
blueprint names onto one of your five type steps instead of adding a sixth. Use one button shape, one corner radius and one pair of page margins on
the whole page, whatever individual blueprints say. If a blueprint names a kind of typeface (a light serif, a heavy grotesk), use the dealt face.

## 1. The idea
The whole page is a board of tiles fitted edge to edge with narrow gaps, like a tidy desk seen from above. Each tile is one thing: the name, a statement, a photograph, a number, a link, a short list. There is no hero and no sequence of bands; the page is one continuous composition that the eye roams. It suits subjects with many small true things to show (a studio with work, writing, clients and news; a product with several distinct capabilities) and it replaces the generic bento by having real content in every tile and a strict system for sizes.

Before anything else, write one sentence in your notes: "On this page, <the subject's own material> becomes <the device>."
Fill the first blank from your inventory of what only this client has (its name and what it means, its street, its numbers, its
constraint), then put the nearest competitor in the sentence: if it still works, the idea is the category's, not the client's.
Then name the one live thing the visitor can do on the page (SKILL.md step 4).

## 2. Composition
A 12-column grid with 8px gaps and 8–12px outer margins, filled completely, no empty cells. Tiles use only four sizes (for example 6×4, 6×2, 3×2, 3×4 in column × row units of about 90px). Every tile is a flat filled rectangle: ground colour one step from the page, or a palette colour, or a photograph covering it. One radius everywhere (0, or 6–10px). The first screen contains: a name tile (the name at display size, the largest type on the page) with the wordmark set large, a statement tile with the description at 28–40px, two or three image tiles and one action tile in the accent colour. Text inside tiles is top-left aligned with 20–24px padding and never centred. Below the first screen the board continues with the same sizes; the last row is the footer made of tiles.

## 3. Type — Schibsted Grotesk
A compact, warm grotesk set heavy with letters almost touching; small text stays in the same family at semibold. Suits music, events and culture pages where the type is the image.
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;600;800&display=swap" rel="stylesheet">
```
- Display: **Schibsted Grotesk** — weight 800 · tracking -0.05em · leading 0.88 · sentence case or all lowercase
- Text: **Schibsted Grotesk** — 400 for paragraphs, 600 for navigation and other functional text · leading 1.4 · tracking -0.01em
```css
:root {
  --step-small: clamp(0.8125rem, 0.79rem + 0.1vw, 0.875rem);
  --step-body: clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem);
  --step-lead: clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem);
  --step-head: clamp(2rem, 1.3rem + 3.2vw, 4rem);
}
```
One grotesk in two weights. Inside tiles: a large size for single statements, a small size for lists. No uppercase labels in tile corners.
The direction decides sizes and how many of them; the type system decides how this face is set. Where the two give different tracking or leading, use the values of the type system: they are tuned to this face.
The display size itself comes from the hero blueprint below.

## 4. Colour — Cool grey, cobalt
```css
:root {
  --bg: #eef0f3;
  --surface: #e2e5ea;
  --ink: #0b0c0e;
  --muted: #5d6470;
  --accent: #1f2de6;
  --accent-ink: #ffffff;
  --field-1: #1f2de6;  --field-1-ink: #ffffff;
}
```
Cool pale grey holds the page with near-black type and nothing else tinted. Cobalt starts as the button and one highlighted sentence, takes one whole section as a flat field with white text, then returns as a single button block.
Page ground, tile ground one step lighter or darker, and one or two palette colours on selected tiles. Photographs supply the rest.

## 5. Imagery
**This subject is software and there are no screenshots, so its pictures are its own interface.** Wherever this sheet says photograph, image or object, build a believable fragment of the product in HTML at real size (real labels, numbers that add up, one item hovered or selected) by the app-screen rules (references/app-screens.md: deal its style once with `node <skill>/scripts/draw.mjs --app --kind <kind> --keep palette,type --out .taste-skill/app`, and build it with assets/app.css and assets/charts.js), put the attribute `data-ui` on its root, and crop or scale it the way the blueprint treats a photograph: a full-bleed close crop, a tile, the fixed half of a split. Where a fragment makes no sense, use a flat colour field with type on it. Never a fake dashboard of grey bars, never a device frame. If the product works on something physical (ships, plants, buildings, a city), one real picture of that world can carry a section: find it with `node /tmp/claude-0/-home-claude/69c7a02f-569c-52e4-afea-f7a0c778d193/scratchpad/skillsrc/Leonxlnx_taste-skill/skills/taste-skill/scripts/assets.mjs "<that world>"`, download it with `--get`, credit it on the page, and never let it pass for the product or its customers.

Photographs fill whole tiles with `object-fit: cover`; choose images that crop well to both wide and tall tiles.

**Floor (the inspector checks it):** at least four real pictures on the page, usually six to twelve; SVG drawings do not count. One moving picture where an honest clip exists: `node <skill>/scripts/assets.mjs --video "<query>"`, used as a muted loop with a poster frame. Whatever this direction says about pictures, it is carried out with real ones.

Optional atmosphere, two at most, from the "Architecture" set (structure, lines, bridges, facades and building interiors). The page does not need them.
Order of preference for imagery: (1) the project's own photographs and product shots; (2) images you generate, if an image tool is
available; (3) real pictures of the subject's world found in the open collections (assets.mjs, downloaded and credited on the page);
(4) drawings of the subject in code; (5) these. They are real photographs (Unsplash licence, served by picsum.photos) of places, light and
texture. They are atmosphere, never a stand-in for a specific product, dish, person or interface. List the ones you use in your report so
they can be replaced.
- `https://picsum.photos/id/954/1600/1000` — Narrow opening in a white wall revealing a white staircase · light tone · off-white, pale beige · calm area: left · native landscape · photo: Todd Quackenbush
- `https://picsum.photos/id/620/1600/1000` — White arched bridge spanning grey water under a pale sky · light tone · white, pale grey, charcoal · black-and-white · calm area: bottom · native landscape · photo: Matthew Wiebe
- `https://picsum.photos/id/855/1600/1000` — Small figure walking past a huge bright yellow wall · light tone · bright yellow, black · calm area: left · native landscape · photo: Rodion Kutsaev
- `https://picsum.photos/id/1081/1600/1000` — Stepped white modern building corner rising into a pale blue sky · light tone · white, pale blue, soft grey · calm area: top · native landscape · photo: Julien Moreau
The last two path numbers are width and height: request the exact crop you render (`/1200/1500` for a 4:5 portrait, `/2400/1350` for a hero) and
add `?grayscale` to desaturate. Use at most two. Always set `width`, `height`, `alt` and `loading="lazy"` (not on the hero image).
Other sets that fit this brief: fog-and-quiet, water, sky-and-space — `node draw.mjs --photos <set>` prints one in full; `--photos list` shows all sets. Taking photographs from another set is your call and is not a redraw; keep them to one light and one treatment.

## 6. Hero — Two-by-two board
A board with 8px outer margins and 8px gaps throughout; every tile is a filled rectangle with one shared radius (0 or 8px). A 60px top row is itself made of tiles: a square ink tile with the logo mark, a wide ground-tone tile holding four text links that begin at the centre line, and an ink tile at the right end holding the single action. Below it the rest of the viewport is a two-by-two grid. Top-left: a paper tile with the name, or its first word, at clamp(96px, 12.5vw, 190px), medium weight, tracking -0.05em, sitting bottom-left on 24px padding. Top-right and bottom-left: photographs covering their tiles (object-fit: cover), both greyscale so they read as one picture continued across the board. Bottom-right is divided into two tiles side by side: a dark tile with one sentence at 24px, top-left aligned, and a tile in the accent colour with a second short statement at 24px, also top-left. Text never centres inside a tile. No tile is empty and none is outlined.

On a phone: The board becomes one column of tiles with 6px gaps: a top row with the logo tile and a menu tile; the name tile at 30% of the screen height with the name at 22vw bottom-left; one photograph tile at 4:3; then the dark tile and the accent tile side by side as two squares. The second photograph moves below the first screen.
Headline: The name, or its first word, up to 8 characters at 12.5vw; the two 24px statements are one sentence each.

## 7. Sections, in order
Each is a composition to rebuild with this project's content. Keep the geometry; change the subject. Re-order or drop a
section when the argument of the page needs it (see references/copy.md), never to fall back to a card grid.

### 1. how-it-works — One card, four fields (strip)
Four flat colour fields stand side by side across the full viewport, each 25vw wide and 84svh tall, butted together with no gaps; neighbours differ clearly in lightness. The same card from the product (a ticket, an order, a request) appears once in each field at the same height, 38% down, centred, 260px wide at true size, each copy marked data-ui. It is further along every time: bare as it arrives, then with an owner and a due date, then with its checklist half ticked, then closed with its final figure. Along the bottom of each field, 28px in, one clause at clamp(22px, 2vw, 32px) on two lines begins with its order word: 'First it lands here.' 'Then someone takes it.' The heading, two to four words at the same size in the heaviest weight, sits top-left in the first field only. On hover a field's card rises 6px over 150ms.
On a phone: The fields stack, each full width and 64svh tall, colours meeting edge to edge. In each: the clause at 24px top-left with 20px margins, then the card at true size, left-aligned, 32px below. The heading sits in the first field above its clause, at 24px in the heaviest weight.

### 2. showcase — Live demo with controls (split)
One filled panel, 680–760px wide and about 640px tall, radius 12px, in a tone clearly darker or lighter than the ground, placed on the text column's left edge or centred, with at least 15vh of empty ground above and below. The panel is split 62/38 into two flat areas that differ by one tone. Left area: the product doing its job on real content at true size. Right area: a narrow column of working controls, six to nine stacked rows 44px tall, each with a name at 14px on the left and a slider, toggle or value on the right; changing one changes the demonstration at once. A text link sits in the panel's bottom-left corner. The heading, two to four words at 24–32px, sits above the panel on its left edge with one sentence at 16px; under the panel, one line of start instruction.
On a phone: The panel fills the width. The demonstration takes the top at 4:3; the controls follow beneath as full-width rows 52px tall, only the four most telling ones, with a text link that reveals the rest. Heading and sentence sit above at 24px and 16px.

Adjusted for this page:
- It names its own corners: use the one radius of this page (square unless the direction says otherwise) and one button shape.

### 3. features — Staggered fragment cells (grid)
A three-column grid of six filled cells with 8px gaps, each cell 420–460px tall and filled one tone off the ground, no outlines. Every cell has two parts: a text part (a title at 17px medium and three lines at 15px in the soft ink, 24px padding) and a real fragment of the interface at true size (a control, a menu, a table slice, a swatch strip) docked flush against the opposite edge of the cell and cropped by it. The stagger is the idea: across the first row cells run text-top, fragment-top, text-top; the second row runs the reverse, so fragments form a checkerboard. Fragments differ in shape and size on purpose. The heading, two to four words at 32–40px, sits left-aligned above the grid with 56px beneath it and no supporting line.
On a phone: One column of cells at their natural height with 6px gaps. Every cell runs text first, fragment second, but fragments alternate between docking to the left edge and the right edge, and they are allowed to run off the side of the cell at true size instead of shrinking.

### 4. faq — A band per question (band)
Each question owns a full-bleed band, and the bands alternate between two flat tones (ground and one step away, or two palette colours with their assigned inks) and butt together with no gap. Inside every band the same grid applies: the question in columns 1–5 at 28–32px bold, top-aligned with 56px of padding above; the answer in columns 7–12 at 18px with leading 1.5, the same padding, and 56px below. Bands are as tall as their content, so their heights differ, which gives the stack its rhythm. Four to seven bands. The heading is the first band: two to four words at about 7vw on the accent colour, flush left, taller than the rest at about 40svh with the words anchored to its bottom-left. All answers are visible; there are no toggles.
On a phone: Bands stay full-bleed and alternate. Inside each, the question at 22px then the answer at 17px, with 32px padding top and bottom and 20px at the sides. The heading band is 30svh tall with its words at 13vw at the bottom-left.

### 5. cta — The action tile (grid)
The close is one row of the board. Three filled tiles sit side by side with 8–14px gaps, all 360px tall and sharing one radius: a wide centre tile spanning columns 3–10 in the accent colour, flanked by two narrow tiles (columns 1–2 and 11–12) that run off the left and right viewport edges, as if the row had been cropped from a longer one. The centre tile holds, left-aligned and vertically centred with 40px padding: a heading of three to five words at 40px, two lines at 17px, and the action. The action is either one rectangular button or an email field 420px wide in the paper colour with the submit button nested inside its right end. The flanking tiles hold no text: one is a photograph covering the tile, the other a flat palette colour. No shadows, no outlines.
On a phone: The accent tile runs full width, about 300px tall, heading at 28px, field and button stacked at full width. The two flanking tiles follow beneath as a pair, each half width and 120px tall, with the same gap and the same radius.

Adjusted for this page:
- It mentions a shadow: only on something open above the page (a menu, a dialog), never on a resting element.

### 6. footer — The mark, built large (band)
On a flat colour field, the brand closes the page as a construction rather than as set type. Across the full content width and about 34svh tall, the wordmark is built from blocks: each letter is knocked out of its own solid rectangle in a palette colour, the rectangles differ in height (60–100% of the band) and butt together with 4px gaps, bottoms on one line. Where the project has a simple geometric mark or motif, enlarge that instead, drawn as inline SVG from flat rectangles, circles and quarter-arcs with the same 4px gaps. Below, 56px lower: four columns of plain links at 15px across columns 1–8, and two addresses or contact lines in columns 9–12. A last row carries the copyright at the left and one small filled button at the right. Space and the block construction do all the separating.
On a phone: The block wordmark spans the full width at about 22svh tall; a long name breaks into two rows of blocks. Link columns go two across at 15px, contact lines beneath at full width, then copyright and the small button on one row.

## 8. Motion — Shutter image
The one hero or showcase image opens from an edge with a clip-path over about 1.1 seconds while the picture inside settles from 1.12 scale to rest. Use it once, on the image that matters most; later images simply are there. Recipe: 'Image shutter' in references/motion.md.
This is the signature move, the one loud moment. Around it the page still needs the rest of the motion layer (SKILL.md step 9): an entrance for the parts of every section, feedback on every control, and one moving picture. The inspector fails a page that barely moves. Recipes: references/motion.md.

## 10. Where the richness comes from
The fit. A full board with consistent gaps and varied tile contents is satisfying in the way a packed suitcase is.

## 11. How this direction goes wrong
Tiles are filled, never outlined, and never carry shadows. Do not put an icon and a two-line feature blurb in every tile; vary what tiles hold. Decide the phone layout as its own board: two columns, tiles re-ordered so the name and statement lead.

## 12. Real references
Studied sites that work this way. Take the principle, never the specifics: no names, copy, images or signature assets of theirs.
- **Realevate** (Awwwards Site of the Day, studied score 7.2) `aww-realevate`
  Idea: The site is a board you zoom out of: the home screen with its slogan marquee becomes one tile beneath four tall colour-coded category cards.
  Hero: White field, all type navy. Top row about 8% down: one link far left, an extended-caps wordmark centred, one link far right. Across the vertical middle a two-word slogan repeats as a marquee at about 15vw in medium weight, cropped by both edges; a square photograph about 19vw wide sits dead centre on top of it, hiding the letters behind. Lower third: a two-line centred subhead near 24px and, beneath it, a thin-outlined rectangular tag in tiny extended capitals. Bottom-left a copyright line; bottom-right an outlined rectangular button beside a solid navy square menu button.
  Worth taking: Run a giant slogan marquee through the middle of the viewport and park a square image on top so the words are read as they pass around the picture.
- **Aspen Search** (Awwwards Site of the Day, studied score 8.2) `aww-aspen-search`
  Idea: The page is a ruled tile system with no margins: the two-word name is split across cells that alternate type, dithered canvas, black and one mint green.
  Hero: A 60px top bar ruled into cells: black logo square, local time, nav links starting at the centre line, a theme toggle and a black contact cell flush right. Below, the viewport is a two-by-two grid divided by 1px black lines, no outer margin. Top-left is white with the first word of the name at 12.5vw, weight 450, sitting bottom-left. Top-right and bottom-left cells hold a black-and-white dithered canvas crossed by large pale-grey blade shapes that ignore cell borders. The bottom-right quadrant splits into a black cell (24px white summary, mono caps action row at its base) and a mint cell (second statement, client-logo marquee along the bottom).
  Worth taking: Rule the whole viewport into cells with 1px lines and no page margin, then give the nav, the headline, the summary and the proof each its own cell with a flat fill.
- **Elva** (One Page Love, studied score 7.2) `opl-elva`
  Idea: The entire page is staged inside one oversized phone: the headline lives on the phone's screen while a huge out-of-focus echo of the same words drifts behind it.
  Hero: Near-black grainy field. A phone outline about half the viewport wide stands centred, its top at 16% of the height and its lower half cropped by the bottom edge. Its screen shows a warm close-up of a smiling freckled face lit yellow from the right. The headline sits inside the screen, centred, white, three lines at roughly 64px with a two-line 18px sub-line. Behind the phone the same sentence repeats at about 8.5vw, blurred with colour fringing, dim grey, spanning the full width. Corners: rounded outlined logo chip top-left, glassy action bar top-right, small credit chip bottom-left, dot button bottom-right.
  Worth taking: Put the hero headline on the screen of an oversized, bottom-cropped device so the product frame doubles as the text container.
Full notes on any of them: `node draw.mjs --site <id>`.

## Always
Headlines two lines or fewer at every width. No eyebrow labels, no monospace, no 01/02/03, no thin rules, no gradients, no shadows at rest,
no cream-and-terracotta, no violet. The frame: one h1 on the first screen that says what this is, equal outer margins, no
section huddled on one side with the other half empty, no blank stretch over half a screen, a heading on every section.
`inspect.mjs` measures all of it.

Saved to /home/claude/adz/.taste-skill/direction.json · reprint with `node draw.mjs --show`
