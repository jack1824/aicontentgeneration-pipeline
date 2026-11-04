# What makes a high-performing 15–30s Indian social video ad in 2026
## Research report for an AI ad generator (Hindi / Hinglish, SMB + D2C focus)

**Compiled:** 3 November 2026. **Scope:** hooks, ad structures, cultural playbook, Nov 2026 → Dec 2027 campaign calendar, 2026 platform specs, SMB category playbooks, compliance (ASCI / CCPA / MeitY / NMC etc.), and 2026 format trends.

**How to read this:** every fact carries a bracketed source link. Items I could not verify against a primary or reputable secondary source are marked **[UNVERIFIED]** or **[ESTIMATE]**. Example Hinglish hook lines and beat sheets in Sections 1–2 are authored for this report (informed by the cited sources) unless a source is given; they are templates, not quoted ads. Dates for lunar festivals in 2027 come from panchang sites whose 2027 tables are computed approximations (±1 day); confirm against the final Drik Panchang before locking campaign flights.

**Headline findings (for the system instructions):**
1. Reels is >50% of Instagram time spent in India, and Meta/Toluna's own ad research says direct-response Reels ads are 5.3x more likely to rank top-20% for purchase intent when they add context (features/USP), 2.7x when the product is shown more than once, 4.8x when brand presence is ≤25% of runtime, and 1.9x with a CTA [Social Samosa / Meta–Toluna](https://www.socialsamosa.com/news-2/meta-playbook-boost-reels-ad-performance-10867111).
2. 15–30s is the duration sweet spot cited for D2C conversion in India, and completion for sub-30s Reels (~72%) is far higher than 30–60s (~46%) [AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html), [MARQN](https://www.marqn.in/post/top-instagram-content-formats-that-drive-results-for-indian-d2c-brands).
3. Language is the biggest cheap lever: 98% of Indian internet users consume Indic-language content; vernacular campaigns are reported at ~2x engagement vs English/Hindi (AnyMind) and Facebook India reports regional content at 1.5–2x engagement [Business Standard / IAMAI-Kantar](https://www.business-standard.com/india-news/india-s-internet-users-to-exceed-900-mn-in-2025-driven-by-indic-languages-125011600835_1.html), [Exchange4media](https://www.exchange4media.com/advertising-news/from-challenge-to-opportunity-vernacular-advertising-sees-2x-growth-in-engagement-rates-141481.html), [Findise](https://findise.in/regional-language-ads-in-india-cheaper-impressions-faster-burnout/).
4. Compliance changed materially in 2026: MeitY's IT (Amendment) Rules 2026 (effective 20 Feb 2026) require prominent labels on synthetically generated content; ASCI's Guidelines for Responsible Labelling of Synthetically Generated Content in Advertising were published 29 Sept 2026 and take effect ~late Dec 2026; the NMC issued ethical-advertising guidelines for doctors on 6 Oct 2026 that explicitly require an "AI-generated" source mark and ban synthetic testimonials [Medianama](https://www.medianama.com/2026/02/223-meity-amendments-it-rules-synthetic-media-deepfakes/), [ASCI press release](https://www.ascionline.in/wp-content/uploads/2026/09/Press-Release_Guidelines-for-Responsible-Labelling-of-Synthetically-Generated-Content-in-Advertising.pdf), [NMC guidelines PDF](https://medicaldialogues.in/pdf_upload/2026/10/07/nmc-guidelines-on-ethical-advertising-and-public-communication-478642.pdf).
5. An AI ad generator must therefore: (a) never output AI "customer testimonials" presented as real; (b) default to an "Video created using AI" label when synthetic presenters/voices/events are used; (c) burn captions in; (d) keep text inside platform safe zones; (e) front-load product + hook in 0–3s and never let brand presence dominate a DR Reel.

---

## 1. HOOKS — taxonomy for the first 1–3 seconds

### 1.1 Why the first 3 seconds matter (data)

| Metric / finding | Value | Source |
|---|---|---|
| Reels share of Instagram time spent (India) | >50% | [Social Samosa citing Meta Business Summit India](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html); [Social Samosa / Toluna](https://www.socialsamosa.com/news-2/meta-playbook-boost-reels-ad-performance-10867111) |
| Brand + main message in first 5s (brand ads) | 1.7x more likely to rank top-20% for purchase intent | [Meta–Toluna via Social Samosa](https://www.socialsamosa.com/news-2/meta-playbook-boost-reels-ad-performance-10867111) |
| Visual **and** audio hook (DR ads) | 1.5x | same |
| Reels hook rate (3s views ÷ impressions), third-party benchmarks | Meta Reels range 24–36%, median ~30% (AdSights); "good" 30–40%, elite 40%+, <25% poor (Taylor Sicard) | [jetfuel.agency benchmarks 2026](https://jetfuel.agency/creative-performance-metrics-for-dtc-video-ads-hold-rate-thumbstop-and-thruplay-benchmarks-2026/) |
| Hook-rate target used by an Indian AI-creator vendor | >35% (author's target, not an industry benchmark) | [TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india) |
| Hook-rate / hold-rate targets (global DR guide) | Hook 25–35%+; hold (25% views ÷ 3s views) 40–60%+; scale at hook ≥30% + hold ≥45% | [AdLibrary Reels guide 2026](https://adlibrary.com/posts/meta-reels-ads-guide-2026) |
| Hold rate (15s views ÷ 3s plays), Meta Reels | ~23% | [jetfuel.agency](https://jetfuel.agency/creative-performance-metrics-for-dtc-video-ads-hold-rate-thumbstop-and-thruplay-benchmarks-2026/) |
| India Reels ads benchmarks (D2C, Jan–Mar 2026) | CPM ₹55–90; CTR 0.8–1.4%; CPC ₹4–12; completion 12–22% | [AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html) |
| Organic Reels completion by length (Indian business accounts) | <30s: 72%; 30–60s: 46%; 60–90s: 28% | [MARQN, Oct 2026](https://www.marqn.in/post/top-instagram-content-formats-that-drive-results-for-indian-d2c-brands) |
| Hindi creative vs English, non-metro targeting | "meaningfully higher 3-second view rates" (author's campaigns, no figure) | [AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html) |
| Hinglish hook vs pure English in Tier 2/3 | +42% claimed, **[UNVERIFIED – no source given]** | [TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india) |
| Sound-on on Reels | ~80% viewed with sound on (Instagram for Business); 78% IG Reels / 71% FB Reels (Benly Q1-2026 aggregate) | [Adam Connell stats](https://adamconnell.me/instagram-reels-statistics/), [Benly](https://benly.ai/learn/meta-ads/meta-ads-reels-ads-guide) |
| Mute viewing in India | "~85% watch on mute in public" (TrueFan) and ">60% watch on mute at least some of the time" (AlphaBeta) — **both unsourced [UNVERIFIED]** | [TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india), [AlphaBeta](https://alphabetasolution.org/the-reels-playbook-for-indian-brands-in-2026-from-someone-whos-tested-everything/) |

**No platform-published India-specific hook-rate or thumb-stop benchmark was found** (Meta India and YouTube India publish directional claims, not hook-rate tables). Treat 30% hook rate / 45% hold rate as the practical "scale" threshold, and 25% hook as the "fix the first 2 seconds" floor.

### 1.2 Hook taxonomy

Conventions for the generator: hook = spoken line + on-screen text (OST) + first visual, all landing within 0–2s; at least one cut or motion event in the first second; product or outcome visible by second 3–5 ([AdLibrary](https://adlibrary.com/posts/meta-reels-ads-guide-2026), [TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india)). Example lines below are authored templates (Hinglish in Roman script; swap to Devanagari per Section 3.3).

| # | Hook type | Example Hinglish hook lines (authored) | Visual to pair (0–2s) | Best-fit categories | Notes / evidence |
|---|---|---|---|---|---|
| 1 | **Pattern interrupt** (crash-zoom, odd object, mid-sentence start) | "…aur phir maine yeh kar diya." / "Ruko. Yeh dekho pehle." / "Isko mat kharido jab tak…" | Crash-zoom from wide to macro; prop reveal; hand enters frame fast | Any; strongest for D2C gadgets, beauty, food | TrueFan's "Mid-Sentence Start" and crash-zoom pairing; AdLibrary's "pattern-interrupt" archetype ([TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india), [AdLibrary](https://adlibrary.com/posts/meta-reels-ads-guide-2026)) |
| 2 | **Bold claim / result-first** | "3 din mein glass skin? Sirf ek cheez badlo." / "Yeh ₹999 ka kurta ₹5000 wala lagta hai." / "Bijli ka bill aadha, guarantee nahi—proof." | After-state first, then cut to before | Beauty, fashion, appliances, home | Beauty: "show after first, then before" ([AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html)); claims must be substantiable (Section 7) |
| 3 | **Question** | "Aapki skin dhoop ke baad itchy hoti hai?" / "Diwali gift abhi tak decide nahi hua?" / "Bachchon ka tuition fee kitna de rahe ho?" | Face to camera, eyebrow raise; or problem close-up | Skincare, gifting, edtech, finance | AdsSarthi's example hook ("Skin itchy after sun? Here's the fix") ([AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html)) |
| 4 | **Relatable pain ("Kya aapke bhi…")** | "Kya aapke bhi balon mein har wash pe itna hair-fall hota hai?" / "Kya aapke ghar bhi Sunday ko 'kya banaun' wali ladai hoti hai?" / "Kya aapke bhi phone ki battery 4 baje khatam?" | Mess/problem montage: comb full of hair, kitchen chaos, 1% battery | Haircare, kitchen/food, electronics, home services | Meta: "people in everyday scenarios" 1.5x for purchase intent ([Social Samosa/Toluna](https://www.socialsamosa.com/news-2/meta-playbook-boost-reels-ad-performance-10867111)) |
| 5 | **Price shock / price-jugaad** | "₹50 mein full makeover?" / "Sirf ₹199 mein poora week ka tiffin." / "Iska daam suno, phir decide karo." | Big price card OST; hand slams product on table; price reveal animation | Fashion, food, kirana, mobile shops, salons | TrueFan's "Price-Jugaad"; show original + discounted price per CCPA 2022 ([TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india), [Mondaq CCPA](https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022)) |
| 6 | **Before/after** | "Pehle yeh tha… ab yeh." / "7 din. Same ladki. Dekho fark." / "Purana sofa vs naya look—₹2,000 mein." | Split screen or hard cut, after shown first | Beauty, salons, furniture, home décor, fitness | 52% higher save rate for before/after vs standard demos (unsourced vendor stat) ([Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/)); **banned for clinics/doctors** (Section 7.9) |
| 7 | **POV** | "POV: Mummy ne pehli baar tumhari skincare approve kar di." / "POV: Shaadi 3 din baad hai aur outfit abhi tak nahi aaya." / "POV: Tum Tier-2 se ho aur delivery 2 din mein aa gayi." | First-person phone-camera framing, OST "POV:" top-centre | Fashion, beauty, gifting, quick-commerce | Format trend (Section 8); family-approval trope (Section 3) |
| 8 | **"Stop scrolling" / swipe-interrupt** | "Stop! Yeh 3 galtiyan mat karo." / "Scroll mat karo—10 second do." / "Swipe karne se pehle yeh suno." | Hand-in-front-of-lens "stop" gesture; freeze-frame + red OST | Edtech, finance, fitness, services | TrueFan "Swipe-Interrupt" and "No/Stop opener" ([TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india)); overuse fatigues fast |
| 9 | **Social proof bomb** | "50,000 Indore walon ne already order kiya." / "4.8 stars, 12,000 reviews—koi toh wajah hogi." / "Mohalle ki 3 aunties ne yeh recommend kiya." | Order-count counter; review wall; crowd/queue at shop | Local retail, D2C, restaurants, coaching | TrueFan "Social Proof Bomb"; numbers must be true/substantiable (CCPA 2022) |
| 10 | **Curiosity gap / myth-buster** | "99% log yahan galti karte hain…" / "Jeweller aapko yeh kabhi nahi batayega." / "Gym jaane se pehle yeh jaan lo." | Finger pointing at hidden detail; blurred reveal | Jewellers, electronics, gyms, edtech | TrueFan "Myth-Buster" example "99% log yahan galti karte hai" ([TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india)) |
| 11 | **Visual hook (product in action, no words)** | (OST only) "Dekho." / "10 second mein." / "Satisfying." | Pour, slice, swatch, unbox, light-up, bite — product doing its thing in 0–1s | Food, beauty, gadgets, furniture, mithai | AdLibrary "demonstration cut": product on screen by 5s, value clear by 8s ([AdLibrary](https://adlibrary.com/posts/meta-reels-ads-guide-2026)) |
| 12 | **Text-on-screen hook** (big OST carries the hook, VO optional) | "₹499 → ₹249 sirf aaj" / "Diwali ke 3 din baaki" / "Yeh dekh ke mummy khush ho jayengi" | Bold 40pt-equivalent OST centred, high contrast, kinetic | Everything on sound-off placements (FB Feed/Reels) | Hook text ~40pt-equivalent, supporting ~28pt, central 80% of frame ([AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html)); captions = 40% higher completion (vendor stat) ([Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/)) |
| 13 | **Sound hook** (trending audio / jingle / dialogue) | Trending audio + OST "Isse better offer nahi milega" / Bollywood-style dhol sting for festive | Beat-synced cuts; lip-sync to audio | Fashion, food, festive, youth brands | Reels is sound-on (~80%) ([Adam Connell](https://adamconnell.me/instagram-reels-statistics/)); **ads cannot use licensed/trending music** — use Meta Sound Collection ([Benly](https://benly.ai/learn/meta-ads/meta-ads-reels-ads-guide), [CineRads](https://www.cinerads.com/blog/meta-ads-video-creative-best-practices)); speech + music = 2.1x (DR) ([Social Samosa/Toluna](https://www.socialsamosa.com/news-2/meta-playbook-boost-reels-ad-performance-10867111)) |
| 14 | **Festival hook / Festive FOMO** | "Diwali ke pehle yeh setting change kar lo." / "Rakhi 2 din baad—bhai ka gift ready?" / "Is Navratri 9 din, 9 looks, ek budget." | Diya/rangoli/lights in frame; countdown OST; calendar flip | Fashion, jewellers, sweets, gifting, electronics | TrueFan "Festival FOMO" example; festival hooks 3–4x vs generic in fashion try-ons (AdsSarthi, unsourced) ([TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india), [AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html)) |
| 15 | **Regional / colloquial / city shout-out** | "Bangalore walon, suno!" / "Jaipur ki aunties ka favourite salon." / "Surat mein sabse sasta saree market—address niche." | City landmark; local-language OST (Tamil/Marathi etc.); shop exterior | Local SMB (salons, restaurants, retail, real estate, dealers) | TrueFan "City Shoutout"; vernacular 1.5–2x engagement ([TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india), [Findise](https://findise.in/regional-language-ads-in-india-cheaper-impressions-faster-burnout/)) |
| 16 | **Interval twist / "I thought it was a scam"** | "Mujhe laga scam hai… phir order kar diya." / "Pehle hassa, phir try kiya, ab roz use karta hoon." | Sceptical face → surprised face | D2C newcomers, services | TrueFan "Interval Twist" ([TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india)) |
| 17 | **3-second challenge / listicle speed-run** | "3 second mein batao yeh asli hai ya nakli." / "5 kurta hacks, 15 second." | Fast-cut list with numbers; countdown | Jewellers, fashion, edtech | TrueFan "3-Second Challenge", "Listicle Speed-Run" |

**Hook hygiene rules (from sources):** no logo intros, no landscape openers, no "hi everyone" ([AlphaBeta](https://alphabetasolution.org/the-reels-playbook-for-indian-brands-in-2026-from-someone-whos-tested-everything/)); ≥3 cuts in the first 3s for Reels; opening OST should match the caption's curiosity for Shorts ([TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india)); a spoken hook in the first 2s outperforms visual-only hooks ([AdLibrary](https://adlibrary.com/posts/meta-reels-ads-guide-2026)); keep the main subject centred so budget phones' crops don't lose it ([TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india)).

---

## 2. AD STRUCTURES / FRAMEWORKS for 15s and 30s

### 2.1 Global parameters for Hindi/Hinglish VO

| Parameter | Value | Source / note |
|---|---|---|
| Indian TV CPG ads, total spoken words per 30s (2022) | ~65 words (≈2.2 wps); personal care ~69, food ~52; VO portion ~22 words + dialogue ~38 | [Business Standard, "How many words can you pack in an ad?"](https://www.business-standard.com/amp/article/opinion/how-many-words-can-you-pack-in-an-ad-122030801615_1.html) |
| Historic trend | 41 words (1980s) → 53 (2010s) → 65 (2022) | same |
| Author's rule of thumb | narration should occupy about half the ad; let visuals do the work | same |
| **Recommended for Reels VO (this report)** | 2.2–2.6 Hindi words/sec for a natural creator-style read; 15s → 28–38 words; 30s → 55–75 words; leave ≥20% of runtime without VO for product sound/beat | **[ESTIMATE]** derived from the above plus Reels pacing norms |
| Disclaimer VO | 14 words in ≤3s (~4.7 wps) is the mutual-fund extreme — avoid for claims; ASCI requires disclaimer VO "at a normal pace" | [Business Standard](https://www.business-standard.com/amp/article/opinion/how-many-words-can-you-pack-in-an-ad-122030801615_1.html), [TheMediaAnt ASCI summary](https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers) |
| Shot count | 15s: 5–8 shots (hook needs ≥3 cuts in 3s); 30s: 9–14 shots | [TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india) + **[ESTIMATE]** |
| Product on screen | DR: product shown >1x = 2.7x; on screen by 5s; brand presence ≤25% of runtime = 4.8x | [Social Samosa/Toluna](https://www.socialsamosa.com/news-2/meta-playbook-boost-reels-ad-performance-10867111), [AdLibrary](https://adlibrary.com/posts/meta-reels-ads-guide-2026) |
| Structure Indian agencies use for Reels | Hook 0–3s → problem amplification 3–8s → solution reveal 8–18s → CTA + offer 18–25s | [AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html) |
| Shorts creative framework | Google ABCD: Attention, Branding (early, natural), Connection, Direction (clear CTA) | [Google Shorts ads page](https://business.google.com/us/ad-solutions/youtube-ads/shorts-ads/) |
| Captions | Burn in (Facebook Reels ads have no auto-captions); sync OST to speech; bold high-contrast sans (Inter/Poppins; Noto Sans for Indic scripts) | [CineRads](https://www.cinerads.com/blog/meta-ads-video-creative-best-practices), [AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html), [AlphaBeta](https://alphabetasolution.org/the-reels-playbook-for-indian-brands-in-2026-from-someone-whos-tested-everything/) |
| Refresh cadence | Frequency >3–4 per 7 days → CTR drops 20–30%; refresh every 5–7 days in festivals, 10–14 days otherwise (agency data) | [AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html) |

### 2.2 Indian CTA phrasing library

| CTA intent | Hinglish phrasing (VO / OST) | Platform button to pair | Evidence / note |
|---|---|---|---|
| Buy now | "Abhi order karein" / "Abhi order karo" / "Link pe tap karo" | Shop Now / Order Now | "Include a CTA" = 1.9x (DR) ([Social Samosa/Toluna](https://www.socialsamosa.com/news-2/meta-playbook-boost-reels-ad-performance-10867111)) |
| WhatsApp lead | "WhatsApp karein" / "WhatsApp pe 'Hi' bhejo" / "Niche button dabao, WhatsApp pe baat karo" | Send WhatsApp Message (Click-to-WhatsApp) | WhatsApp-led commerce: +61% ROAS, +62% leads (Meta–RAI); ~60% likely to buy after a WhatsApp offer ([Social Samosa](https://www.socialsamosa.com/industry-updates/reels-ai-and-whatsapp-power-indias-new-shopping-behaviour-meta-11835320)) |
| DM / organic | "DM karo 'PRICE'" / "Comment mein 'LINK' likho" | (organic) | Comment-to-DM automations are common; keep for organic, not ads |
| Store visit | "Visit karo – [area], [landmark] ke paas" / "Aaj hi showroom aayein" | Get Directions / Learn More | Local SMB; pair with city shout-out hook |
| Call | "Call now – number screen pe" / "Abhi call karein" | Call Now | Use for clinics (within NMC limits), dealers, real estate |
| Link in bio | "Link bio mein hai" | (organic only) | Not for paid ads — ads have native buttons |
| Lead form | "Form bharo, callback 10 minute mein" | Sign Up / Apply Now (Instant Form) | Edtech, real estate, insurance |
| Urgency | "Offer sirf aaj tak" / "Stock khatam hone wala hai" | — | **Only if true**: false urgency is a listed dark pattern ([JSA Law – CCPA Dark Patterns 2023](https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/)) |
| Save/share micro-CTA at 0:03 | "Save kar lo" / "Bhai ko bhejo" | — | TrueFan micro-CTA around 0:03 ([TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india)) |

### 2.3 Beat sheets (15s and 30s) for each framework

Format: `time — beat — VO (word budget) — visual/shot — OST/caption`. Product-appearance and CTA placement follow Section 2.1. VO word budgets assume ~2.4 wps.

#### A. Hook → Problem → Solution → Proof → Offer → CTA (default DR template)
**15s (6–7 shots, ~32 words)**
- 0–2s Hook: VO 6w ("Kya aapke bhi balon mein itna hair-fall hota hai?") — comb close-up → face — OST: the question, big.
- 2–5s Problem: VO 7w — 2 quick shots of the pain (pillow, drain) — OST: "Har wash pe?"
- 5–9s Solution: VO 8w — product in hand, apply/use, 2 shots — OST: product name + 1 benefit.
- 9–12s Proof: VO 5w — result shot + review card "4.7★ (3,200 reviews)" — OST: proof number.
- 12–15s Offer + CTA: VO 6w ("₹499 ki jagah ₹349. Abhi order karein.") — pack shot + button mimic — OST: price strike-through + CTA.
**30s (11–13 shots, ~64 words)**
- 0–3s Hook (8w) · 3–8s Problem with 3 relatable scenarios (12w) · 8–16s Solution: demo + how it works + ingredient/mechanism (18w) · 16–22s Proof: testimonial clip (real, consented) or stat + before/after (12w) · 22–27s Offer: price anchor + bundle + COD/EMI (9w) · 27–30s CTA repeated in VO and OST (5w). Product visible at 8s, 16s, 22s, 27s (≥3 appearances).

#### B. PAS (Problem → Agitate → Solve)
**15s:** 0–2 Problem hook (6w) · 2–7 Agitate: cost of not solving ("Har mahine ₹2,000 parlour pe?") (12w) · 7–13 Solve: product demo + result (10w) · 13–15 CTA (4w).
**30s:** 0–3 Problem (8w) · 3–11 Agitate with two consequences + social embarrassment beat (18w) · 11–22 Solve: demo, mechanism, "kaise use karein" (22w) · 22–27 Offer (10w) · 27–30 CTA (6w).

#### C. AIDA (Attention → Interest → Desire → Action)
**15s:** 0–2 Attention: pattern interrupt or price shock (5w) · 2–7 Interest: what it is, one differentiator (12w) · 7–12 Desire: outcome shot + "yeh wali feeling" (10w) · 12–15 Action (5w).
**30s:** 0–3 Attention (7w) · 3–12 Interest: 3 reasons (18w) · 12–23 Desire: lifestyle usage, family reaction (20w) · 23–30 Action: offer + CTA + WhatsApp button (12w).

#### D. UGC testimonial (creator/customer to camera)
**15s:** 0–2 "Honestly? Mujhe laga scam hai…" (6w) · 2–8 what I tried, what happened (14w) · 8–12 product held up, 1 specific result (8w) · 12–15 "Try karo, link niche" (5w). Single handheld shot + 2 B-roll inserts; captions word-synced.
**30s:** 0–3 twist hook (8w) · 3–10 context/pain (14w) · 10–20 experience + demo (20w) · 20–26 who it's for / who it's not for (12w) · 26–30 CTA (6w).
**Compliance:** must be a real user/creator with disclosure (#ad etc.) if paid; **AI-generated presenters may not be run as genuine testimonials** — fabricated endorsements are prohibited outright under ASCI's 2026 SGC guidelines ([ASCI press release](https://www.ascionline.in/wp-content/uploads/2026/09/Press-Release_Guidelines-for-Responsible-Labelling-of-Synthetically-Generated-Content-in-Advertising.pdf), [MorphAds](https://morphads.in/learn)). Label AI presenters as "Video created using AI".

#### E. Founder-led
**15s:** 0–2 founder, direct: "Maine yeh isliye banaya…" (6w) · 2–9 the problem I saw in my city/family (14w) · 9–13 product + one promise (8w) · 13–15 CTA "Ek baar try karo" (4w).
**30s:** 0–3 hook (7w) · 3–12 origin story with 2 B-roll shots of factory/kitchen (18w) · 12–22 product walk-through (18w) · 22–27 guarantee/returns (9w) · 27–30 CTA (6w). Founder-led content outperforms brand-account content on trust metrics ([MARQN](https://www.marqn.in/post/top-instagram-content-formats-that-drive-results-for-indian-d2c-brands)); founder-led watch-through +42% (vendor stat) ([Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/)).

#### F. Unboxing
**15s:** 0–1 box slam/tear (0w, sound) · 1–6 reveal items one by one with OST labels (8w) · 6–11 first use (8w) · 11–15 price + CTA (8w).
**30s:** 0–2 hook "₹999 mein itna sab?" (5w) · 2–12 unbox each item (14w) · 12–22 use 2 items (16w) · 22–27 "kya-kya milta hai" recap list OST (8w) · 27–30 CTA (5w).

#### G. "3 reasons" / listicle
**15s:** 0–2 "3 reasons yeh [product] lo" (6w) · 2–6 Reason 1 (7w) · 6–10 Reason 2 (7w) · 10–13 Reason 3 (7w) · 13–15 CTA (4w). Big numerals OST 1/2/3.
**30s:** add a 2s proof beat after each reason and a 5s offer block.

#### H. Day in the life (DITL)
**15s:** 0–2 "Subah 6 baje…" (4w) · 2–12 three moments where product appears naturally (16w) · 12–15 CTA (5w).
**30s:** 0–3 hook · 3–24 five moments (morning/commute/work/evening/night) with product in ≥3 (40w) · 24–30 offer + CTA (12w). Everyday scenarios = 1.5x purchase intent ([Social Samosa/Toluna](https://www.socialsamosa.com/news-2/meta-playbook-boost-reels-ad-performance-10867111)).

#### I. Before/after
**15s:** 0–2 AFTER first (3w) · 2–5 BEFORE (5w) · 5–11 how (product demo) (12w) · 11–15 side-by-side + CTA (8w).
**30s:** 0–3 after (5w) · 3–8 before + pain (10w) · 8–20 process in 3 steps (22w) · 20–26 result + proof (10w) · 26–30 CTA (6w). Not allowed for medical/dental outcomes (Section 7.9); skin "visible/rapid/guaranteed results" claims were the top personal-care violation at ASCI in FY26 ([FM Live / ASCI report](https://www.fmlive.in/offshore-betting-and-realty-emerge-as-most-violative-sectors-in-asci-annual-complaints-report-2025-26-cases-surge-21/)).

#### J. Price anchoring / offer
**15s:** 0–2 "₹2,999? Nahi." (3w) · 2–6 what you'd normally pay (8w) · 6–11 our price + what's included (10w) · 11–15 CTA + COD/EMI OST (8w).
**30s:** 0–3 anchor (5w) · 3–10 comparison table OST (12w) · 10–20 product demo (18w) · 20–26 bundle/no-cost EMI/COD (10w) · 26–30 CTA (6w). Show both original and discounted price ([Mondaq CCPA 2022](https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022)); no drip pricing ([JSA Law](https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/)).

#### K. Us vs them
**15s:** 0–2 "Market wala vs hamara" (4w) · 2–8 split screen 3 differences (12w) · 8–12 our proof (8w) · 12–15 CTA (5w).
**30s:** 5 differences + a price beat. **Never name/denigrate a competitor** (ASCI Chapter IV fair competition; CCPA bars disparagement) ([TheMediaAnt ASCI summary](https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers)). Use "ordinary/regular" not brand names.

#### L. FAQ / objection handling
**15s:** 0–2 "Sabse bada sawaal: 'asli hai?'" (5w) · 2–8 answer with proof (hallmark/certificate/return policy) (12w) · 8–12 second objection (8w) · 12–15 CTA (5w).
**30s:** 3 objections (price, quality, delivery/returns) 7s each + CTA. Strong for jewellers (BIS hallmark), electronics (warranty), coaching (fees/refund).

#### M. Tutorial / how-to
**15s:** 0–2 "Yeh look 3 step mein" (5w) · 2–12 step 1/2/3 with OST numbers (18w) · 12–15 CTA (5w).
**30s:** 0–3 hook with final result · 3–24 steps (36w) · 24–30 product + CTA (10w). Product visible every step.

#### N. Festive gifting
**15s:** 0–2 festival cue + hook "Rakhi gift abhi tak nahi liya?" (6w) · 2–8 3 gift options with price OST (12w) · 8–12 packaging/delivery promise (8w) · 12–15 CTA (5w).
**30s:** 0–3 hook · 3–10 emotional family beat (12w) · 10–22 gift options + personalisation (22w) · 22–27 delivery-by date + COD (10w) · 27–30 CTA (6w). Content showing product transforming a moment = 2.3x save rate ([MediaBrief / Meta Festive Accelerator 2026](https://mediabrief.com/meta-releases-festive-accelerator-2026-playbook/)).

#### O. Limited time
**15s:** 0–2 countdown OST "48 ghante" (4w) · 2–8 offer detail (12w) · 8–12 proof/scarcity (true stock) (8w) · 12–15 CTA (5w).
**30s:** add "kyun itna sasta" justification beat (festival clearance, launch). Meta notes a last-48-hours surge before occasions ([MediaBrief](https://mediabrief.com/meta-releases-festive-accelerator-2026-playbook/)); urgency must be real ([JSA Law](https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/)).

#### P. WhatsApp-us CTA
**15s:** 0–2 hook (5w) · 2–9 offer/product (14w) · 9–13 "WhatsApp pe 'Hi' bhejo, catalogue milega" + phone mock (9w) · 13–15 button point (3w).
**30s:** add FAQ beat and a screen-recorded WhatsApp catalogue scroll (6s). Pair with Click-to-WhatsApp objective; WhatsApp ads formats: image/video/carousel; CTA opens chat ([EnrichLabs WhatsApp guide](https://www.enrichlabs.ai/blog/whatsapp-advertising-complete-guide-2026)).

#### Q. Store-visit / local CTA
**15s:** 0–2 city shout-out (5w) · 2–8 what's in store + price (12w) · 8–12 exterior + landmark + timings OST (8w) · 12–15 "Visit karo" + map pin (4w).
**30s:** add owner-to-camera welcome (6s) and 3 product shots; end card: address, timing, phone, "Get Directions". Keep address OST inside safe zone (Section 5).

---

## 3. INDIAN CULTURAL PLAYBOOK

### 3.1 What the effectiveness data says
- Kantar's Creative Effectiveness Awards India 2026 (250+ campaigns, 1,500+ India creative tests): the most effective ads are "rooted" in recognisable Indian truths and rituals (Cadbury Dairy Milk "Vidaai", Tata Salt "Pehle Aap", KitKat, Dettol, Taj Mahal Tea); adapting global templates is "losing relevance"; performance gaps of up to 55 percentile points exist between best and worst assets of the same campaign; creator influence +77% but only 27% of creator content links back to the brand ([Indian Television / Kantar CEA 2026](https://indiantelevision.com/mam/kantar-says-indias-most-effective-ads-now-begin-with-local-truths/)).
- Meta's festive research: 86% of shoppers look for inspiration on social before buying; 60% of new online shoppers come from Tier 2/3; 1 in 2 festive shoppers follow creators; content showing a product transforming a moment earns 2.3x save rate; cultural content creation rises 50% in festive season ([MediaBrief / Meta Festive Accelerator 2026](https://mediabrief.com/meta-releases-festive-accelerator-2026-playbook/)); 77% said a personalised Meta ad inspired a festive purchase; 44% of mothers bought on Meta platforms; Gen Z is more price-sensitive and values promo codes ([Meta Newsroom, Sept 2025](https://about.fb.com/news/2025/09/genai-creators-and-reels-are-reshaping-festive-shopping-in-india/)).
- Gen Z India: 93% say trusted YouTube creators are more reliable than other media; prefers relatable micro-creators over celebrities; overwhelmingly prefers videos under 60s ([ET BrandEquity–Ipsos State of Digital Marketing 2025](https://www.ipsos.com/sites/default/files/ct/publication/documents/2025-09/ET%20Brand%20Equity%20Ipsos%20The%20State%20of%20Digital%20Marketing%20in%20India%202025.pdf)).
- Consumer-behaviour synthesis: value-for-money mindset spans income levels; emotion (maternal love, patriotism, romance) and over-the-top humour (CRED/Dravid, Swiggy Bolt/Pant) land; cricket and cinema are pan-Indian touchpoints; consumers blend tradition and modernity ([ELEVATE Insights](https://www.elevateinsights.in/post/decoding-indian-consumer-behavior-timeless-truths-from-the-heart-of-a-complex-nation)).

### 3.2 Trope & motif library

| Trope / motif | How to use in a 15–30s ad | Watch-outs | Source basis |
|---|---|---|---|
| **Family / mom approval** ("Mummy ne approve kar diya") | Reaction shot of mother/mother-in-law; POV hook; gifting for parents | Avoid gender stereotyping (ASCI gender guidelines) | Kantar "rituals, relationships"; 44% of mothers bought on Meta ([Indian Television](https://indiantelevision.com/mam/kantar-says-indias-most-effective-ads-now-begin-with-local-truths/), [Meta](https://about.fb.com/news/2025/09/genai-creators-and-reels-are-reshaping-festive-shopping-in-india/)) |
| **Sasta-tikau / paisa vasool / value** | Price-per-use math OST ("₹3 per day"); "lambe time chalega" durability demo | Show original + discounted price; no fake MRP | [ELEVATE](https://www.elevateinsights.in/post/decoding-indian-consumer-behavior-timeless-truths-from-the-heart-of-a-complex-nation), [Mondaq CCPA](https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022) |
| **Festivals** | Festival cue in frame within 1s; "X din baaki" countdown; gifting lists | Plan the whole Jul–Dec + Jan–Mar run, not just Diwali | [Meta Newsroom](https://about.fb.com/news/2025/09/genai-creators-and-reels-are-reshaping-festive-shopping-in-india/) |
| **Cricket / IPL** | Match-night snacks, "boundary" puns, jersey colours; IPL window ~Mar–May | Don't use team/league logos, player likeness without licence; ASCI real-money-gaming rules if gaming | ShareChat/Moj expected ₹850 cr social spend on IPL 2025 ([Exchange4media](https://www.exchange4media.com/digital-news/brands-to-spend-rs-850-cr-on-social-media-ads-for-ipl-2025-gaurav-jain-sharechat-moj-142363.html) – search result, not opened) **[UNVERIFIED]** |
| **Bollywood references** | Dialogue-style VO cadence, generic "filmy" tropes (dhol, slow-mo entry) | No film clips/music without licence; no celebrity face/voice without consent — deepfakes/likeness without consent are banned under ASCI SGC guidelines and MeitY rules; Cadbury's SRK "My Ad" worked because it was licensed ([ASCI](https://www.ascionline.in/wp-content/uploads/2026/09/Press-Release_Guidelines-for-Responsible-Labelling-of-Synthetically-Generated-Content-in-Advertising.pdf), [Agency Reporter](https://agencyreporter.com/ai-assisted-ad-viral-audience-reception-data/)) |
| **Chai** | "Chai ke saath" product moment; morning-ritual DITL | Universal; strongest in Hindi belt + monsoon | [ELEVATE](https://www.elevateinsights.in/post/decoding-indian-consumer-behavior-timeless-truths-from-the-heart-of-a-complex-nation) (rituals) |
| **Wedding season** | "Shaadi ka season" lead-ins; "3 din baaki outfit nahi aaya" | Muhurat windows: Nov 21–Dec 12 2026, Jan 15–Mar 14 2027 (Section 4) | [HinduTone muhurat](https://hindutone.com/astrology/vivah-muhurat-2026-27-shubh-marriage-dates/), [CAIT via Telangana Today](https://telanganatoday.com/indias-wedding-season-biz-expected-to-surge-41-pc-to-rs-6-lakh-crore-cait) |
| **Tier-2/3 aspiration** | "Delhi wali quality, Bareilly ke daam"; real compact Indian homes, not showroom sets | 60% of new online shoppers are Tier 2/3; 63% of Tier 2/3 shoppers used local e-commerce | [MediaBrief](https://mediabrief.com/meta-releases-festive-accelerator-2026-playbook/), [Meta](https://about.fb.com/news/2025/09/genai-creators-and-reels-are-reshaping-festive-shopping-in-india/), [AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html) |
| **"Made in India" / local pride** | Factory/kitchen B-roll, "hamare sheher mein bana" | "Made in India" claims must be true (origin rules); patriotism must not be exploited | Tata Tea patriotism example ([ELEVATE](https://www.elevateinsights.in/post/decoding-indian-consumer-behavior-timeless-truths-from-the-heart-of-a-complex-nation)) |
| **Monsoon** | Humidity/frizz/damp-clothes problems; pakoda-chai; waterproofing | Jun–Sep; regional onset differs | general knowledge **[ESTIMATE]** |
| **Exam season** | Parent anxiety, "result ke baad" rewards; coaching | CCPA coaching guidelines ban "100% selection"; EdTech ads must not show students skipping sleep/meals or shame low scorers | [Careers360](https://news.careers360.com/centre-issues-coaching-centres-guidelines-jee-neet-upsc-cuet-2025-crack-down-on-misleading-ads), [TheMediaAnt ASCI](https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers) |
| **"Offer khatam" / scarcity** | Countdown OST, "last 50 pieces" | False urgency = dark pattern | [JSA Law](https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/) |
| **EMI / no-cost EMI** | "₹1,499/month se shuru" for >₹3,000 items; pair with bank logos only if partner | Disclose tenure, total cost; home décor >₹3,000 benefits from EMI messaging | [AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html); Meta recommends bank/EMI offers in festive ads ([Meta](https://about.fb.com/news/2025/09/genai-creators-and-reels-are-reshaping-festive-shopping-in-india/)) |
| **Cash on delivery** | "COD available" OST near CTA; reassures first-time Tier 2/3 buyers | — | trust lever; **[ESTIMATE]** of impact |
| **"Ghar baithe"** | Convenience framing for services (salon-at-home, tuition, grocery) | 45% use quick-commerce; 56% among 25–34 | [Meta](https://about.fb.com/news/2025/09/genai-creators-and-reels-are-reshaping-festive-shopping-in-india/) |
| **Humour / meme** | Fast meme formats; Zomato/Swiggy style; 20–30% of calendar | Brand-safety review; humour must not deride groups (ASCI Ch. II/III) | [MARQN](https://www.marqn.in/post/top-instagram-content-formats-that-drive-results-for-indian-d2c-brands), [Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/) |

### 3.3 Hinglish copywriting rules

**Script choice (Devanagari vs Roman):** "not a style choice, an audience choice." Roman-script Hinglish for young, urban, bilingual Reels/Shorts viewers (comedy, lifestyle, tech, finance); Devanagari for Hindi-first, older, devotional/news-style and many Tier 2/3 contexts where it is "the more respectful and readable choice"; in Devanagari, English loanwords spelled phonetically read heavier for young urban viewers; many creators export both from one transcript ([VideoCaptions – Hindi vs Hinglish](https://www.videocaptions.ai/blog/hindi-vs-hinglish-captions)). Roman and Devanagari versions of Hindi ads "may perform differently by audience" — test both ([Findise](https://findise.in/regional-language-ads-in-india-cheaper-impressions-faster-burnout/)). Use Noto Sans (Devanagari/Indic) for regional scripts ([AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html)).

**Code-switching:** write it as spoken — Hindi grammar with English nouns ("aaj main aapko ek productivity hack batata hoon"); don't translate into one language; transliterate, don't translate; spotlight the English noun that carries the hook in kinetic captions; word-synced karaoke captions for fast Hinglish ([VideoCaptions – Hinglish guide](https://www.videocaptions.ai/blog/hinglish-captions-guide)). "Correct" textbook Hindi can sound colder than the mixed speech people actually use; match the language the customer thinks and shops in; B2B and luxury may still prefer English; A/B test per market ([eChai](https://echai.ventures/startingup/copywriting-messaging/when-should-i-write-copy-in-hindi-or-a-regional-language-versus-english-for-an-indian-consumer-product-and-how-do-i-get-the-tone-right)).

**Register (tu / tum / aap)** — no published rule was found; the following is a practitioner convention **[ESTIMATE]**: *aap* for default DR and any audience over ~30, parents, finance, health, jewellery, real estate, and all disclaimers; *tum* for youth-skewed D2C, fashion, food, gaming, creator-voice UGC ("tum bhi try karo"); *tu* only in meme/friend-banter formats aimed at 18–24 and never in brand VO. Mixed forms ("aap try karo") are common in creator speech but avoid in brand VO. Keep CTAs in imperative *karein* (formal) or *karo* (casual) consistently within one ad.

**Regional variants:** vernacular micro-creators report 20–30% higher engagement than English (Zapplr); Tamil creators' follower bases grew >300% through 2025; South India ≈ one-third of regional influencer spend; four South languages ≈ 450M audience ([afaqs advertorial – treat as vendor data](https://www.afaqs.com/news/advertorial/indias-influencer-marketing-is-racing-toward-3375-crore-and-south-india-is-driving-the-shift-to-regional-creators-12144842)). Dubbed Hindi ads lose meaning (Uber Eats "tinda" backlash in the South); build distinct local executions, not translations ([Adgully – Hinglish factor](https://archive.adgully.com/the-hinglish-factor-in-advertising-104577.html)). Famous Hinglish taglines to learn cadence from: "Thanda matlab Coca-Cola", "Hungry Kya?", "Har ek friend zaroori hota hai", "Yehi hai right choice baby" (same source).

### 3.4 Language / market statistics

| Statistic | Value | Source |
|---|---|---|
| Active internet users (2024) | 886M (+8% YoY), projected >900M in 2025; rural 488M (~55%) | [Business Standard / IAMAI-Kantar](https://www.business-standard.com/india-news/india-s-internet-users-to-exceed-900-mn-in-2025-driven-by-indic-languages-125011600835_1.html) |
| Users accessing Indic-language content | 98%; Tamil, Telugu, Malayalam most popular; 57% of urban users prefer regional-language content | same |
| Social media users | 491M (33.7% of population); Reels/short video/livestreams primary consumption modes; >600M internet users outside metros; vernacular demand: Hindi, Tamil, Telugu, Bengali, Marathi | [ET BE–Ipsos 2025](https://www.ipsos.com/sites/default/files/ct/publication/documents/2025-09/ET%20Brand%20Equity%20Ipsos%20The%20State%20of%20Digital%20Marketing%20in%20India%202025.pdf) |
| YouTube Shorts India | >650M monthly logged-in viewers (June 2025); YouTube CTV reach >75M adults (Apr 2025) | [Google India Brandcast 2025](https://blog.google/intl/en-in/brandcast-2025-ctv-shorts-and-youtube-as-indias-new-tv/) |
| Reels preference | 92% of surveyed Indian users prefer Reels; Reels 33% higher creator engagement; 80% discover brands on Meta | [Social Samosa / Meta–Ipsos](https://www.socialsamosa.com/industry-updates/reels-ai-and-whatsapp-power-indias-new-shopping-behaviour-meta-11835320) |
| Digital ad spend 2025 | ₹947 bn (+26%), 63% of all ad revenue; digital media >₹1 tn; CTV ~40M units | [EY / FICCI-EY 2026](https://www.ey.com/en_in/newsroom/2026/03/india-s-media-and-entertainment-sector-grew-9-percent-to-inr-2-point-78-trillion-in-2025-driven-by-digital-and-live-experiences-ficci-ey-report) |
| Online video share of FY25 digital ad spend | 29% (+~20%); social 29.8%; mobile 78% | [ET BE–Ipsos 2025](https://www.ipsos.com/sites/default/files/ct/publication/documents/2025-09/ET%20Brand%20Equity%20Ipsos%20The%20State%20of%20Digital%20Marketing%20in%20India%202025.pdf) |
| Vernacular performance | AnyMind: 2x engagement vs English/Hindi; PolicyBazaar Hindi: −8% CPL, 3x Hindi search traffic; "20–30% lower CAC" (industry claim) | [Exchange4media](https://www.exchange4media.com/advertising-news/from-challenge-to-opportunity-vernacular-advertising-sees-2x-growth-in-engagement-rates-141481.html) |
| Regional CPM vs English (Meta, illustrative) | ~₹80 vs ~₹200; agency claims 40–60% lower CPM; but regional pools burn out ~33x faster at frequency 2.5 (worked example, not measured) | [Findise](https://findise.in/regional-language-ads-in-india-cheaper-impressions-faster-burnout/) |
| ShareChat / Moj | ShareChat ~118M MAU, 15 languages; Moj ~88M MAU, 15 languages (2023 Similarweb figures — dated) | [TheMediaAnt ShareChat](https://www.themediaant.com/blog/media-kundli-sharechat-advertising/), [TheMediaAnt Moj](https://www.themediaant.com/blog/moj-advertising-types-and-targeting) |
| **Hindi vs regional share of consumption** | **No authoritative 2025–26 split found.** IAMAI-Kantar gives 98% Indic use but no Hindi share; FICCI-EY page did not expose a language split. Practitioner heuristic: Hindi-belt ≈ 40–45% of digital video audience, Tamil/Telugu/Bengali/Marathi next **[UNVERIFIED]** | — |

**Top regional languages to version into (ranked by audience/evidence):** Hindi → Tamil → Telugu → Bengali → Marathi → Kannada → Malayalam → Gujarati → Punjabi (ordering from IAMAI-Kantar popularity + Ipsos "vernacular demand" list + MorphAds' 9-language set) ([Business Standard](https://www.business-standard.com/india-news/india-s-internet-users-to-exceed-900-mn-in-2025-driven-by-indic-languages-125011600835_1.html), [Ipsos](https://www.ipsos.com/sites/default/files/ct/publication/documents/2025-09/ET%20Brand%20Equity%20Ipsos%20The%20State%20of%20Digital%20Marketing%20in%20India%202025.pdf), [MorphAds](https://morphads.in/learn)).

---

## 4. CAMPAIGN / FESTIVE CALENDAR — Nov 2026 → Dec 2027

Date confidence: **(C)** fixed civil date or confirmed by a 2026 panchang page; **(P)** 2027 panchang approximation (±1 day); **(X)** expected/announced-but-unconfirmed commercial window.

| Date (2026–27) | Occasion | Conf. | Typical ad angle | Categories that spike | Source |
|---|---|---|---|---|---|
| Fri 6 Nov 2026 | Dhanteras | C | "Shubh kharidari", gold/utensils/electronics buying day; price-lock offers | Jewellers, electronics, appliances, vehicles, kitchenware | [HinduTone 2026–27](https://hindutone.com/festivals/hindu-festival-calendar-2026-2027/) |
| Sat 7 Nov | Naraka Chaturdashi / Choti Diwali | C | Last-minute gifting, sweets, décor | Sweets, décor, fashion | [HinduTone 5-day guide (6–10 Nov)](https://hindutone.com/festivals/diwali-2026-the-complete-5-day-festival-guide/) (search result title) |
| Sun 8 Nov | Diwali / Lakshmi Puja | C | Family, lights, gifting; final-48h surge | Sweets, gifting, fashion, home, electronics | [HinduTone](https://hindutone.com/festivals/hindu-festival-calendar-2026-2027/) |
| Tue 10 Nov | Govardhan Puja | C | Regional (North) food/puja | Food, puja items | same |
| Wed 11 Nov | Bhai Dooj | C | Sibling gifting | Gifting, sweets, fashion, gadgets | same |
| 13–16 Nov (main Sun 15 Nov) | Chhath Puja | C | Bihar/UP/Jharkhand + diaspora; purity, family, dawn rituals | Food (fruits, ghee), ethnic wear, travel, kirana | same |
| Fri 20 Nov | Dev Uthani Ekadashi (wedding season opens) | C | "Shaadi season shuru" | Wedding services, jewellers, fashion, salons | [HinduTone muhurat](https://hindutone.com/astrology/vivah-muhurat-2026-27-shubh-marriage-dates/) |
| 21, 24, 25, 26 Nov; 2–6, 11, 12 Dec | Vivah muhurat dates (Nov–Dec 2026) | C | Countdown to specific dates; trousseau, gifting, décor | Wedding services, jewellers, ethnic wear, salons, photographers, travel | same |
| ~18–28 Nov (Black Friday Fri 27 Nov) | Black Friday India window | X | Western-style mega-discount; beauty/fashion-led | Beauty (Nykaa Pink Friday), fashion (Myntra/Ajio), electronics | [Shipway BF 2025 pattern](https://blog.shipway.com/black-friday-2025-sale-dates-india-ecommerce-deals/) |
| Tue 24 Nov | Guru Nanak Jayanti | C | Seva, langar, community | Food, Punjab-focused retail | [Drik Panchang](https://www.drikpanchang.com/calendars/indian/sikh-festivals/jayanti/guru-nanak-jayanti-date.html?year=2026) |
| ~5–15 Dec | Myntra Winter EORS (expected) | X | Clearance "60–90% off" | Fashion, footwear | [Zoutons Myntra calendar](https://zoutons.com/news/myntra-sale-calendar-2026) |
| 16 Dec 2026 – 14 Jan 2027 | Kharmas / Dhanurmas (no weddings) | C | Pause wedding urgency; shift to winter, travel, year-end | — | [HinduTone muhurat](https://hindutone.com/astrology/vivah-muhurat-2026-27-shubh-marriage-dates/) |
| Fri 25 Dec | Christmas | C | Gifting, cakes, winter fashion; metros + Goa/Kerala/NE | Bakeries, gifting, travel, fashion | fixed date |
| Thu 31 Dec – Fri 1 Jan 2027 | New Year | C | Resolutions (gym/edtech), party, year-end sale | Gyms, edtech, restaurants, travel, electronics | fixed date |
| Wed 13 / Thu 14 Jan 2027 | Lohri (sources differ: 13 Jan hindu-blog; 14 Jan evening HinduTone) | P | Punjabi harvest, bonfire, first Lohri | Food, Punjab retail, gifting | [hindu-blog](https://www.hindu-blog.com/2026/10/hindu-festivals-2027-calendar-important.html), [HinduTone](https://hindutone.com/festivals/makar-sankranti-2027/) |
| Thu 14 / Fri 15 Jan | Makar Sankranti / Uttarayan / Magh Bihu (sources differ by a day) | P | Kites, til-gud, harvest | Sweets, kites, ethnic wear, Gujarat/Maharashtra/Assam retail | [Drik Panchang 2027](https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027), [HinduTone](https://hindutone.com/festivals/makar-sankranti-2027/) |
| 14–17 Jan | Pongal (Bhogi 14, Thai Pongal 15, Mattu 16, Kaanum 17) | P | Tamil harvest, new clothes, family | Tamil-market fashion, jewellers, appliances, food | [HinduTone](https://hindutone.com/festivals/makar-sankranti-2027/) |
| 15, 18, 19, 20, 24, 26, 27, 30, 31 Jan; 2, 3, 9, 10, 11, 14, 15, 21, 22, 25–28 Feb; 1–4, 9, 10, 14 Mar | Vivah muhurat (Jan–Mar 2027) | C | Second wedding wave | Wedding services, jewellers, fashion, salons | [HinduTone muhurat](https://hindutone.com/astrology/vivah-muhurat-2026-27-shubh-marriage-dates/) |
| Tue 26 Jan | Republic Day (+ R-Day sales ~mid-Jan) | C / X | Patriotic/"Made in India"; sale events | Electronics, fashion, home | fixed date; Meta cites Republic Day sales as a post-Diwali peak ([MediaBrief](https://mediabrief.com/meta-releases-festive-accelerator-2026-playbook/)) |
| 7–14 Feb | Valentine's week (Rose 7, Propose 8, Chocolate 9, Teddy 10, Promise 11, Hug 12, Kiss 13, Valentine's 14) | C | Daily gifting countdown; Cadbury-style personalisation | Chocolates, flowers, jewellers, restaurants, gifting | fixed dates (convention) |
| ~Mon 8 Feb | Ramadan begins (UAE astronomical projection; India typically +1 day) | P | Iftar/sehri food, modest fashion, dates/dry fruit | Food, fashion, kirana | [Khaleej Times](https://www.khaleejtimes.com/uae/ramadan-eid-al-fitr-eid-al-adha-2027-likely-dates) |
| Thu 11 Feb | Vasant Panchami / Saraswati Puja | P | Yellow, education, new beginnings | Edtech, fashion, Bengal/Bihar retail | [Drik Panchang 2027](https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027) |
| Feb – Mar/Apr 2027 | CBSE board exams (Class 10 Feb–Mar; Class 12 Feb–Apr; practicals Jan) | X | Exam-stress, nutrition, stationery, coaching for next cycle | Edtech, coaching, food/nutrition, stationery | [Careers360](https://school.careers360.com/boards/cbse/cbse-date-sheet-2027) |
| Fri 5 / Sat 6 Mar | Maha Shivratri | P | Fasting foods, devotional | Food, puja, Varanasi/Ujjain travel | [Drik](https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027) / [hindu-blog](https://www.hindu-blog.com/2026/10/hindu-festivals-2027-calendar-important.html) |
| ~Tue 9 / Wed 10 Mar | Eid-ul-Fitr | P | Eidi, new clothes, sheer khurma, gifting | Fashion, sweets, perfumes, gifting | [Khaleej Times](https://www.khaleejtimes.com/uae/ramadan-eid-al-fitr-eid-al-adha-2027-likely-dates) |
| ~10 Mar – 15 May | IPL 2027 (BCCI: "likely" start ~10 Mar, end by 15 May; not final) | X | Match-night snacking, fantasy, TV/CTV, "boundary" offers | Food delivery, snacks, electronics (TVs), fantasy (restricted), beverages | [MyKhel](https://www.mykhel.com/cricket/ipl-2027-to-start-earlier-as-bcci-confirm-new-dates-for-tournament-reason-revealed-441201.html) |
| 15 Mar – ~13 Apr | Kharmas (Meena) — no weddings | C | — | — | [HinduTone muhurat](https://hindutone.com/astrology/vivah-muhurat-2026-27-shubh-marriage-dates/) |
| Sun 21 Mar (Holika Dahan) / Mon 22 Mar (Holi) | Holi | P | Colour, white kurtas, skincare/haircare "colour-proof", sweets (gujiya), parties | Fashion, beauty, food, detergents, travel | [Drik](https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027), [hindu-blog](https://www.hindu-blog.com/2026/10/hindu-festivals-2027-calendar-important.html) |
| Wed 7 Apr | Ugadi / Gudi Padwa (also ~Cheti Chand, Navreh) | P | New year in AP/TS/KA/MH; new purchases, gold | Jewellers, vehicles, real estate, appliances, fashion | same |
| ~13–15 Apr | Baisakhi (Punjab), Puthandu (TN), Vishu (KL), Poila Boishakh (WB), Bohag Bihu (Assam) | P **[dates not individually verified]** | Regional new year; gold, new clothes, Vishu kani | Jewellers, fashion, appliances | general knowledge |
| Wed 14 Apr | Ram Navami | P | Devotional | Puja, food | [Drik](https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027) |
| Apr – Jun 2027 | Second wedding season (muhurat list not fetched) | X | Summer weddings | Wedding services, jewellers, salons, AC/appliances | [CAIT via Telangana Today](https://telanganatoday.com/indias-wedding-season-biz-expected-to-surge-41-pc-to-rs-6-lakh-crore-cait) (seasonality) |
| Sat 8 / Sun 9 May | Akshaya Tritiya | P | Biggest gold-buying day after Dhanteras; "shubh muhurat" | Jewellers, real estate, vehicles | [Drik](https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027) / [hindu-blog](https://www.hindu-blog.com/2026/10/hindu-festivals-2027-calendar-important.html) |
| Sun 9 May | Mother's Day | C | Gifting for mom; "mummy ke liye" | Gifting, jewellers, beauty, restaurants, appliances | fixed (2nd Sunday) |
| May 2027 | Board results, NEET/JEE season; Amazon Great Summer Sale (typically early May) | X **[UNVERIFIED]** | Results rewards, admissions, summer appliances | Edtech, coaching, electronics (AC/cooler), travel | general knowledge |
| ~Sun 16 / Mon 17 May | Eid-ul-Adha (Bakrid) | P | Family feast, gifting | Food, fashion | [Khaleej Times](https://www.khaleejtimes.com/uae/ramadan-eid-al-fitr-eid-al-adha-2027-likely-dates) |
| Late May – early Jun | Myntra Summer EORS (expected) | X | Clearance | Fashion | [Zoutons](https://zoutons.com/news/myntra-sale-calendar-2026) |
| ~1 Jun – Sep | Monsoon (Kerala onset ~1 Jun; withdrawal by Oct) | X **[ESTIMATE]** | Frizz/humidity, waterproofing, immunity, pakoda-chai | Haircare, footwear, umbrellas, appliances, health | general knowledge |
| Jun – Jul | Back-to-school (CBSE session starts Apr; most states reopen Jun/Jul after summer break) | X **[ESTIMATE]** | Stationery, uniforms, bags, tuition | Stationery, fashion, edtech | general knowledge |
| Sun 20 Jun | Father's Day | C | Gifting for dad | Fashion, gadgets, grooming | fixed (3rd Sunday) |
| Mon 5 Jul | Rath Yatra (Puri) | P | Odisha/Jagannath devotees | Travel, sweets | [Drik](https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027) |
| Jul 2027 | Amazon Prime Day India (typically July) | X **[UNVERIFIED]** | Member deals | Electronics, home | general knowledge |
| Sun 18 Jul | Guru Purnima | P | Teacher gratitude | Edtech, gifting | [Drik](https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027) |
| Fri 6 Aug | Nag Panchami | P | Regional | Puja | same |
| Sun 15 Aug | Independence Day (+ I-Day sales ~9–15 Aug) | C | Patriotic, "Made in India", freedom sale | Electronics, fashion, home | fixed date |
| Mon 16 / Tue 17 Aug | Raksha Bandhan | P | Sibling gifting, rakhi delivery deadlines | Gifting, sweets, fashion, gadgets, jewellers | [Drik](https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027) / [hindu-blog](https://www.hindu-blog.com/2026/10/hindu-festivals-2027-calendar-important.html) |
| Tue 24 / Wed 25 Aug | Janmashtami | P | Dahi-handi, Krishna, kids' costumes | Sweets, kids' fashion, puja | same |
| Fri 3 / Sat 4 Sep | Ganesh Chaturthi (Anant Chaturdashi Tue 14 Sep) | P | Maharashtra-led; modak, décor, eco-idols | Sweets, décor, fashion, Mumbai/Pune retail | same |
| Sun 12 Sep | Onam (Thiruvonam) | P | Kerala; sadya, Kasavu sarees, gold, appliances ("Onam offers") | Jewellers, fashion, appliances, electronics (Kerala) | same |
| Thu 30 Sep / Fri 1 Oct – Fri 8 Oct | Sharad Navratri (starts 30 Sep in West India per hindu-blog; 1 Oct elsewhere) | P | 9 days / 9 colours, garba, fasting foods | Fashion (chaniya choli), jewellers, food, Gujarat retail | [Drik](https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027), [hindu-blog](https://www.hindu-blog.com/2026/10/hindu-festivals-2027-calendar-important.html) |
| ~late Sep / early Oct 2027 | Amazon Great Indian Festival & Flipkart Big Billion Days 2027 (2026 editions started 8 Oct / 9 Oct, ~4.5 weeks before Diwali) | X **[ESTIMATE]** | Mega-sale; bank offers, exchange, no-cost EMI | Electronics, mobiles, appliances, fashion, furniture | [Zoutons](https://zoutons.com/news/amazon-great-indian-festival-vs-flipkart-bbd-october-2026) |
| 5–9 Oct (Ashtami 7, Navami 8) | Durga Puja | P | Bengal; pandal-hopping, new clothes, food | Fashion, food, Kolkata retail, travel | [hindu-blog](https://www.hindu-blog.com/2026/10/hindu-festivals-2027-calendar-important.html) |
| Sat 9 Oct | Dussehra / Vijayadashami | P | Victory/new-start; vehicle & appliance buying | Vehicles, electronics, appliances | [Drik](https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027) |
| Mon 18 Oct | Karva Chauth | P | Sargi, mehendi, gifting for wife | Jewellers, salons, fashion, sweets | same |
| Tue 26 / Wed 27 Oct | Dhanteras 2027 (India sources: 27 Oct) | P | As above | Jewellers, electronics, vehicles | [hindu-blog](https://www.hindu-blog.com/2026/10/hindu-festivals-2027-calendar-important.html) |
| Thu 28 Oct | Naraka Chaturdashi / Deepavali (South) | P | — | — | same |
| Fri 29 Oct | Diwali / Lakshmi Puja 2027 (Delhi IST; US sources show 28 Oct) | P | Peak | All | [Daanyam (Delhi)](https://daanyam.in/global-hindu-festival-timings/diwali-2027/delhi) |
| Sat 30 Oct | Govardhan Puja | P | — | — | [Drik](https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027) (±1) |
| Sun 31 Oct | Bhai Dooj | P | Sibling gifting | Gifting | [hindu-blog](https://www.hindu-blog.com/2026/10/hindu-festivals-2027-calendar-important.html) |
| Thu 4 Nov | Chhath Puja 2027 | P | As above | Food, ethnic wear, travel | same |
| Sun 14 Nov | Guru Nanak Jayanti 2027 | C | Seva | Food, Punjab retail | [PublicHolidays.in](https://publicholidays.in/guru-nanak-jayanti/) |
| ~mid-Nov 2027 onward | Wedding season 2027–28 opens (Dev Uthani Ekadashi ~11 Nov 2027 **[UNVERIFIED]**) | X | — | Wedding services | — |
| Fri 26 Nov | Black Friday 2027 | C | — | Beauty, fashion, electronics | fixed (4th Friday) |
| Dec 2027 | Winter EORS, Christmas 25 Dec, New Year | C/X | — | Fashion, gifting, gyms | — |

**Wedding-season scale:** CAIT estimated 48 lakh weddings and ~₹6 lakh crore of business in the Nov 12–Dec 16 2024 window, with the season resuming mid-Jan to March ([Telangana Today](https://telanganatoday.com/indias-wedding-season-biz-expected-to-surge-41-pc-to-rs-6-lakh-crore-cait)). Meta says "India has no off-season for shopping anymore" and advises planning from Jul–Aug through New Year, then Black Friday, weddings, Republic Day ([Social Samosa](https://www.socialsamosa.com/industry-updates/reels-ai-and-whatsapp-power-indias-new-shopping-behaviour-meta-11835320), [MediaBrief](https://mediabrief.com/meta-releases-festive-accelerator-2026-playbook/)).

**Timing rule for the generator:** start festival creatives ~6 weeks before the occasion (planned peak) and keep a "last-48-hours" variant with delivery-by-date messaging ([MediaBrief](https://mediabrief.com/meta-releases-festive-accelerator-2026-playbook/)).

---

## 5. PLATFORM SPECS 2026

Meta's own ads-guide pages (facebook.com/business/ads-guide/…) could not be fetched directly in this session; the Meta figures below are from secondary guides that cite those pages (CineRads read them on 7 Sept 2026; AdLibrary as of May 2026). Verify in Ads Manager placement previews before locking templates.

### 5.1 Specs table

| Placement | Aspect / resolution | File | Duration | Safe zone (keep text/logo/CTA out of) | Text limits | Sound / captions | CTA buttons | Source |
|---|---|---|---|---|---|---|---|---|
| **Instagram Reels ads** | 9:16; Meta lists 1440×2560 (CineRads) / 1080×1920 recommended, 500×888 min (AdLibrary, Benly) | MP4/MOV (GIF per Benly); ≤4 GB; H.264/H.265, AAC ≥128 kbps | **Sources conflict:** 1–60s (AdLibrary), 1–90s (Benly); recommended 15–30s | Unified 9:16 zone since Mar 2026: top 14% (~358 px @2560) / bottom 35% (~896 px) / 6% each side (~87 px); AdLibrary: top 250 px, bottom 320 px @1920 | Primary text 44 chars (IG Reels); truncates ~72 chars | Sound on by default (~80% sound-on); captions "optional but recommended"; licensed music not allowed in ads → Meta Sound Collection | Shop Now, Learn More, Send WhatsApp Message, Get Directions, Call Now, Sign Up, Apply Now (standard Meta set) | [CineRads](https://www.cinerads.com/blog/meta-ads-video-creative-best-practices), [Billo](https://billo.app/blog/meta-ads-safe-zones), [AdLibrary](https://adlibrary.com/posts/meta-reels-ads-guide-2026), [Benly](https://benly.ai/learn/meta-ads/meta-ads-reels-ads-guide), [Adam Connell](https://adamconnell.me/instagram-reels-statistics/) |
| **Facebook Reels ads** | 9:16; 1440×2560 | MP4/MOV ≤4 GB | Not stated by Meta page (CineRads); use ≤30s | Same unified zone | Primary 40 chars, headline 55 chars | **No auto-captions on FB Reels ads — burn in**; sound-on ~71% | Same | [CineRads](https://www.cinerads.com/blog/meta-ads-video-creative-best-practices), [Benly](https://benly.ai/learn/meta-ads/meta-ads-reels-ads-guide) |
| **Facebook / Instagram Stories ads** | 9:16; 1440×2560 | MP4/MOV ≤4 GB | 1s–60 min (technical); keep ≤15s | Stories-only: top 14% / bottom 14%; treat 20–35% bottom as danger zone | Primary 125 chars | Captions recommended | Same | [CineRads](https://www.cinerads.com/blog/meta-ads-video-creative-best-practices), [Billo](https://billo.app/blog/meta-ads-safe-zones) |
| **Facebook Feed video** | 4:5 (1440×1800) or 9:16; 1:1 legacy | MP4/MOV/GIF ≤4 GB | 1s–241 min technical; 15–30s DR | — | Headline/CTA may not display on mobile with awareness objective | ~85% of FB video watched without sound (Balistro, unsourced) | Same | [CineRads](https://www.cinerads.com/blog/meta-ads-video-creative-best-practices), [Billo](https://billo.app/blog/meta-ads-safe-zones), [Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/) |
| **Meta Advantage+ creative** | Enhancements (image/video expansion, 3D animation, text generation, music, background generation, templates, standard brightness/contrast) are on by default on most new campaigns; opt out per enhancement or "No enhancements" at ad level; catalog overlays controlled in Commerce Manager | — | — | Video expansion can re-crop; check safe zones after enhancement | AI-generated headline/primary-text variants — review | Music enhancement adds royalty-free tracks (Reels) | — | [Flighted](https://www.flighted.co/blog/metas-advantage-plus-ai-creative-enhancements-each-one-explained) |
| **WhatsApp Status ads / Promoted Channels** | Vertical (Status-style); specs not published in sources fetched **[UNVERIFIED]** | — | — | Status UI top/bottom | — | — | Tap opens chat / Channel | Rolled out Dec 2025 (India named); label "Sponsored"; targeting = country/city, device language, Channels followed, engagement; no use of private chats; bought via Meta ads (Marketing API family; placement "Updates tab") | [India TV](https://www.indiatvnews.com/technology/news/whatsapp-begins-rolling-out-ads-in-status-and-channels-how-it-affects-you-2025-12-10-1021128), [EnrichLabs](https://www.enrichlabs.ai/blog/whatsapp-advertising-complete-guide-2026) |
| **Click-to-WhatsApp ads** | Image/video/carousel/slideshow in FB/IG/Messenger placements | Standard Meta specs | — | — | — | — | "Send WhatsApp Message"; objectives Engagement/Leads/Sales/Traffic; "Start conversation" or WhatsApp Flows form | [EnrichLabs](https://www.enrichlabs.ai/blog/whatsapp-advertising-complete-guide-2026) |
| **YouTube Shorts ads** | 9:16; 1080×1920 (Google) | MP4/MOV | Google: up to 3 min, **<60s recommended**; MegaDigital lists 10–60s | **Google: top 10%, bottom 25%, right 10%** (channel name, captions, engagement buttons) | Headline ≤40 chars, description ≤100 chars (MegaDigital) | Sound-on feed; captions advisable | Shop now / Sign up / Learn more etc.; serve via Video Reach, Video View (Shorts-only possible via "Multi-format ads"), Demand Gen, App, PMax | [Google Shorts ads](https://business.google.com/us/ad-solutions/youtube-ads/shorts-ads/), [MegaDigital](https://megadigital.ai/en/blog/youtube-ad-specs/) |
| **YouTube bumper** | 16:9 (1920×1080) or 9:16 / 1:1 | ≤256 GB | **5–6s**, non-skippable | — | Headline ≤15 chars (10 with CTA) | — | — | [Google Ads Help – formats](https://support.google.com/youtube/answer/2375464?hl=en), [MegaDigital](https://megadigital.ai/en/blog/youtube-ad-specs/) |
| **YouTube skippable in-stream** | 16:9 / 9:16 / 1:1 | ≤256 GB | No max; skip after 5s; ≥11s; recommended 15–20s (awareness/action); views counted after 30s or interaction | Brand/hook in first 5s | Headline ≤15 chars | — | Standard | same |
| **YouTube non-skippable in-stream** | same | — | ≤60s depending on subtype; 15–20s typical; <6s becomes bumper | — | — | — | — | same |
| **Moj (ShareChat group) in-feed video** | 9:16; 720p | MP4 | 10–30s; 2s fade-in; sound required | — | Caption ≤60 chars; CTA ≤20 chars | Sound mandatory | CTA text | [TheMediaAnt Moj (2023)](https://www.themediaant.com/blog/moj-advertising-types-and-targeting) |
| **ShareChat in-feed video** | 9:16 recommended (16:9, 3:4 accepted); 720p | MP4/MOV ≤20 MB | 15–30s; must have sound | — | Caption 50–60 chars | Captions optional | Standard | [TheMediaAnt ShareChat (2023)](https://www.themediaant.com/blog/media-kundli-sharechat-advertising/) |
| **Josh (VerSe)** | **No public spec page found** — assume 9:16, 1080×1920, 10–30s like Moj **[UNVERIFIED]** | — | — | — | — | — | — | — |
| **JioHotstar / Hotstar video (mobile + CTV)** | 16:9; 1920×1080; 25 fps | MP4 ≤500 MB | Mid-roll 10–60s non-skippable; pre-roll ≤6s (awareness/traffic) or ≤10s (impact) — page also mentions up to 20s | Fence banner 640×100 JPG ≤500 KB | Campaign title ≤24 chars | Sound-on (TV) | — | [ads.hotstar.com](https://ads.hotstar.com/ad-formats) |
| **CTV generally (India)** | 16:9 full-screen; non-skippable | — | 15–30s | Full-screen; no UI overlap | — | Sound-on | QR code / "search for" CTA | CTV ~40M MAU (2025) → >50M (2026); non-skippable CTV reports >90% completion, >95% viewability ([Ipsos](https://www.ipsos.com/sites/default/files/ct/publication/documents/2025-09/ET%20Brand%20Equity%20Ipsos%20The%20State%20of%20Digital%20Marketing%20in%20India%202025.pdf)); YouTube CTV reach >75M adults ([Google](https://blog.google/intl/en-in/brandcast-2025-ctv-shorts-and-youtube-as-indias-new-tv/)) |

**Practical safe-zone rule for a 1080×1920 template (this report's recommendation):** keep all text/logos/CTA inside x = 65–1015 px and y = 270–1250 px — this satisfies Meta's unified 14%/35%/6% zone and Google's 10%/25%/10% Shorts zone simultaneously ([Billo](https://billo.app/blog/meta-ads-safe-zones), [Google](https://business.google.com/us/ad-solutions/youtube-ads/shorts-ads/)). Text size: hook ≈40 pt-equivalent (≈36–64 px), body ≈28 pt ([AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html), [TrueFan](https://www.truefan.ai/blogs/instagram-reels-hooks-india)). Ultra-tall 20:9 phones get "Smart Zoom" (crops sides) or letterboxing, not controllable by the advertiser — so centre-weight the composition ([Billo](https://billo.app/blog/meta-ads-safe-zones)).

### 5.2 Meta creative best practices relevant to India
- Reels-first/vertical: Meta is testing a Reels-first Facebook UX in India (search result, [Social Samosa](https://www.socialsamosa.com/news-2/meta-tests-reels-first-ux-facebook-users-india-12636917) — not opened) **[UNVERIFIED]**; Reels >50% of IG time; 9:16 native assets claimed 18% CPM efficiency (AdLibrary citing a 2024 Meta report, unverifiable link) and 7% higher CTR (Billo, unsourced).
- Toluna/Meta Reels playbook (Dec 2025): brand+message in first 5s (1.7x), show brand >1x (1.8x), speech+music (2.0x), audio+visual message (1.8x), people in everyday scenarios (1.5x); DR: product >1x (2.7x), brand ≤25% runtime (4.8x), context/USP (5.3x), CTA (1.9x), emojis as native element (2.5x), visual+audio hook (1.5x) ([Social Samosa](https://www.socialsamosa.com/news-2/meta-playbook-boost-reels-ad-performance-10867111)).
- Festive: percentage-off, bundles, flash deals, bank/EMI offers; dynamic catalogues, Reels+Stories+Live; seasonal colour palettes and sound design; multi-language creative systems; retargeting + WhatsApp CRM + Reminder Ads ([Meta Newsroom](https://about.fb.com/news/2025/09/genai-creators-and-reels-are-reshaping-festive-shopping-in-india/), [MediaBrief](https://mediabrief.com/meta-releases-festive-accelerator-2026-playbook/)).
- Catalog Product Video: Ajio ~20% campaign-efficiency gain ([Social Samosa](https://www.socialsamosa.com/industry-updates/reels-ai-and-whatsapp-power-indias-new-shopping-behaviour-meta-11835320)).
- Google ABCD for Shorts and India-first Urban/Rural targeting split (Brandcast 2025) ([Google](https://blog.google/intl/en-in/brandcast-2025-ctv-shorts-and-youtube-as-indias-new-tv/), [Google Shorts ads](https://business.google.com/us/ad-solutions/youtube-ads/shorts-ads/)).

### 5.3 Platform AI-content disclosure / labelling rules for ads

| Platform | Rule | Source |
|---|---|---|
| **Meta (all ads)** | Ads "created or significantly edited" with Meta's own gen-AI tools get an "AI info" label (next to "Sponsored" when a photorealistic human is added; otherwise in the menu). From June 2026 the label sits in a new "About this ad" section on every ad. Meta will auto-detect ads made/altered with outside AI tools using "industry-standard signals" (e.g., C2PA-type provenance) and label them. Experience "may vary in certain regions due to legal requirements" (India's IT Rules apply). | [Meta Newsroom, Feb 2025 / updated Jun 2026](https://about.fb.com/news/2025/02/gen-ai-transparency-metas-ads-products/) |
| **Meta (social issues / elections / politics)** | Mandatory self-disclosure of photorealistic digitally created/altered people, events or audio; ads without disclosure are rejected; repeated failures penalised | [Telangana Today / Meta policy](https://telanganatoday.com/meta-asks-advertisers-to-disclose-use-of-ai-in-political-social-ads) |
| **Google Ads / YouTube (all ads)** | From July 2026, advertisers may place text/visual AI labels inside image/video creatives without violating text-overlay/watermark policies; an "AI label" setting rolls out in Google Ads, DV360, CM360, Merchant Center, Ads Editor; Google may auto-label assets generated by its own AI tools; Google explicitly cites India (and EU, New York) regulations as reasons; using the setting does not guarantee legal compliance | [Google Ads Policy – AI labeling (Jul 2026)](https://support.google.com/adspolicy/answer/17257106?hl=en) |
| **Google (election ads)** | Must tick "Altered or synthetic content" in campaign settings | same |
| **Moj / ShareChat / Josh** | No published advertiser AI-label rule found; as "significant social media intermediaries" they must take user SGI declarations and label confirmed SGI under IT Rules 2026 **[platform-specific ad policy UNVERIFIED]** | [Medianama](https://www.medianama.com/2026/02/223-meity-amendments-it-rules-synthetic-media-deepfakes/) |

---

## 6. CATEGORY PLAYBOOKS (Indian SMB verticals)

Each row: two winning angles, must-show elements, typical CTA, compliance notes. Angles are synthesised from the evidence in Sections 1–3; compliance items cite primary rules.

| Vertical | Winning angle 1 | Winning angle 2 | Must-show | Typical CTA | Compliance notes |
|---|---|---|---|---|---|
| **Kirana / grocery** | "Ghar baithe 30 minute mein" delivery + price-per-kg vs supermarket (value) | Festival stock-up list ("Diwali ki 10 cheezein, ek WhatsApp") | Shop front/owner face, fresh produce close-ups, price OST, delivery radius, COD/UPI | "WhatsApp karein" / "Call now" | Weights/measures accuracy; no misleading "free" (CCPA free-claims rule); FSSAI licence number on packaged food visuals is good practice ([Mondaq CCPA](https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022)) |
| **D2C beauty / skincare** | After-first before/after with timeframe you can prove; ingredient "science" explainer by creator | Creator UGC "I thought it was a scam" + price in last 5s | Texture/swatch macro, application, result at stated day, reviews count | "Abhi order karein" (Shop Now) | Personal care was #3 violative sector (576 cases) — "visible/rapid/guaranteed results" claims are the top violation; no fairness/skin-lightening derision (ASCI); AI-generated "transformations implying results" are prohibited even with a label ([FM Live](https://www.fmlive.in/offshore-betting-and-realty-emerge-as-most-violative-sectors-in-asci-annual-complaints-report-2025-26-cases-surge-21/), [TheMediaAnt ASCI](https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers), [ASCI SGC](https://www.ascionline.in/wp-content/uploads/2026/09/Press-Release_Guidelines-for-Responsible-Labelling-of-Synthetically-Generated-Content-in-Advertising.pdf)) |
| **Fashion / ethnic wear** | Drape/try-on with festival hook (3–4x vs generic per AdsSarthi) | "₹999 looks like ₹5,000" price-shock + fabric close-up + fit on 3 body types | Fabric macro, twirl/walk, size chart OST, return policy, delivery-by-festival date | "Shop Now" / "WhatsApp pe size poochho" | Show original + discounted price; no fake MRP; returns/exchange terms must be true ([AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html), [Mondaq CCPA](https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022)) |
| **Jewellers** | Objection-handling: "Asli hai?" → BIS hallmark HUID close-up, buyback policy, making-charge transparency | Occasion countdown (Dhanteras, Akshaya Tritiya, wedding muhurat) with gold-rate lock / EMI | Hallmark stamp, weight & purity OST, store exterior, owner, certificate | "Visit karo" / "Call now" / "WhatsApp pe rate poochho" | 6-digit HUID hallmarking mandatory for gold sales since 1 Apr 2023 — never show un-hallmarked gold as hallmarked; gold-rate claims must be dated; no "investment guarantee" ([Taxscan](https://www.taxscan.in/six-digit-bis-hallmark-compulsory-for-sale-of-gold-jewellery-from-april-1/258967)) |
| **Salons** | Before/after hair/makeup transformation (allowed for salons, unlike clinics) + city shout-out | Bridal/festive package with slots left (true scarcity) | Stylist at work, product brands used, hygiene (sanitised tools), price list OST, location | "Book karo – WhatsApp" / "Call now" | No medical/dermatological claims (hair regrowth, skin "treatment" cures) — DMRA/ASCI; avoid skin-tone derision ([CMS Law](https://cms.law/en/int/expert-guides/cms-expert-guide-to-advertising-of-medicines-and-medical-devices/india), [TheMediaAnt ASCI](https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers)) |
| **Clinics / dentists / doctors** | Factual information film: departments, equipment, timings, fees, accreditation | Doctor-led educational explainer (non-promotional) on a condition, with name/qualification/registration number OST | Facility, hygiene, factual services list, registration details; **no patient faces** | "Call for appointment" / "Visit" (factual) | **NMC Guidelines on Ethical Advertising (6 Oct 2026):** no solicitation, no testimonials/endorsements, no "best/No.1/100%/painless", no before/after photos, no success rates, no discounts/offers/coupons/free procedures, no doctor photo for self-promotion; AI promotional content must carry an "AI-generated" source mark; no synthetic patient testimonials; penalties up to removal from register. DMRA bans ads for listed diseases/sexual capacity etc.; health ads need MIB/PCI self-declaration ([NMC PDF](https://medicaldialogues.in/pdf_upload/2026/10/07/nmc-guidelines-on-ethical-advertising-and-public-communication-478642.pdf), [CMS Law](https://cms.law/en/int/expert-guides/cms-expert-guide-to-advertising-of-medicines-and-medical-devices/india)) |
| **Coaching institutes / edtech** | Faculty-led "one concept in 15s" demo + batch start date | Verified topper story with written post-selection consent and course disclosed | Faculty on camera, classroom/app UI, fee & refund policy OST, batch timings | "Form bharo / Call now / WhatsApp" | CCPA Coaching Guidelines 2024: no "100% selection/job", no false faculty/fee/refund/rank claims, topper name/photo only with written consent obtained after selection, prominent disclaimers; ASCI EdTech: no students skipping sleep/meals, no shaming low scorers, no false urgency/FOMO, no gender-subject linking; "affiliated" institution name must be prominent (≥50% of ad) ([Careers360](https://news.careers360.com/centre-issues-coaching-centres-guidelines-jee-neet-upsc-cuet-2025-crack-down-on-misleading-ads), [TheMediaAnt ASCI](https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers)) |
| **Gyms / fitness** | Member transformation with realistic timeframe + trainer certification | New-Year/wedding-season "8-week" programme with price anchor | Equipment, trainers, timings, trial offer terms, hygiene | "Free trial – WhatsApp" / "Visit karo" | No guaranteed weight-loss/cure claims (DMRA covers obesity-related magic remedies; ASCI health claims); testimonials must be real; health/nutrition advice by influencers requires qualifications (ASCI 2025 addendum) ([CMS Law](https://cms.law/en/int/expert-guides/cms-expert-guide-to-advertising-of-medicines-and-medical-devices/india), [Grynow ASCI influencer](https://www.grynow.in/blog/asci-guidelines-for-influencer-marketing-in-india.html)) |
| **Restaurants / cloud kitchens** | Satisfying food B-roll (pour/cheese-pull/sizzle) with speed-of-prep + price per plate | Match-night/festival combo with delivery radius and "order on WhatsApp" | Food macro, kitchen hygiene, FSSAI number, menu OST, delivery ETA | "Order karo – WhatsApp / Zomato / Swiggy" | FSSAI Advertising & Claims Regs 2018: no unsubstantiated "100% pure/natural", no health claims without evidence; penalties up to ₹10 lakh ([SS Rana FSSAI](https://ssrana.in/articles/fssai-targets-misleading-100-claims-a-wake-up-call-for-food-brands/)) |
| **Real estate** | Site walk-through with possession date, carpet area, price-per-sqft and EMI | "Your city's growth corridor" aspiration + RERA QR code in frame | RERA registration number, QR code, website (MahaRERA: top-right, font ≥ contact info, distinct colour), actual-site footage vs render labelled | "Site visit book karo" / "Call now" / lead form | Realty was #2 violative sector at ASCI (643 cases); MahaRERA mandates reg no + QR + site in all ads incl. social/WhatsApp, ₹50,000 fine; AI renders of unbuilt projects **require an AI label** under ASCI SGC; non-existent facilities shown as real are prohibited ([FM Live](https://www.fmlive.in/offshore-betting-and-realty-emerge-as-most-violative-sectors-in-asci-annual-complaints-report-2025-26-cases-surge-21/), [Free Press Journal MahaRERA](https://www.freepressjournal.in/mumbai/maharera-mandates-prominent-display-of-regulatory-details-in-real-estate-ads), [ASCI SGC](https://www.ascionline.in/wp-content/uploads/2026/09/Press-Release_Guidelines-for-Responsible-Labelling-of-Synthetically-Generated-Content-in-Advertising.pdf)) |
| **Electronics retailers / mobile shops** | Exchange + no-cost EMI + "same price as online, today in hand" | Unboxing/first-use of the hero SKU with spec OST in 3 lines | Price, EMI/month, exchange value conditions, warranty, store location | "Visit karo" / "WhatsApp pe best price" | Discount must show original price; EMI terms disclosed; no drip pricing; warranty claims accurate ([Mondaq CCPA](https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022), [JSA Law](https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/)) |
| **Furniture** | Real compact Indian home before/after (not showroom) + EMI for >₹3,000 | Durability/"sasta-tikau" test (kid jumping on sofa) + delivery/assembly promise | Material close-ups, dimensions OST, EMI, warranty, delivery time | "WhatsApp pe catalogue" / "Visit showroom" | EMI and warranty disclosures; AI-generated room renders need label if presented as real ([AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html), [ASCI SGC](https://www.ascionline.in/wp-content/uploads/2026/09/Press-Release_Guidelines-for-Responsible-Labelling-of-Synthetically-Generated-Content-in-Advertising.pdf)) |
| **Sweets / mithai** | Festival gifting box with delivery-by date + hygiene/fresh-made B-roll | "Ghar jaisa" taste, halwai at work, kilo price | Kitchen, ghee/ingredients, packaging, price per kg/box, FSSAI number | "Order karo WhatsApp" / "Visit" | FSSAI claims rules ("pure ghee", "100%"); no health claims ([SS Rana](https://ssrana.in/articles/fssai-targets-misleading-100-claims-a-wake-up-call-for-food-brands/)) |
| **Car / bike dealers** | Festival (Dhanteras/Dussehra/Ugadi) delivery slots + on-road price + exchange bonus | Test-ride POV + EMI per month + service promise | On-road price, EMI, offer validity, showroom, no stunts | "Test drive book karo – WhatsApp/Call" | ASCI auto guidelines: no traffic violations/reckless driving; stunts need caution caption; offer validity true ([TheMediaAnt ASCI](https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers)) |
| **Travel agents** | Package price-per-person with inclusions OST + real footage (not AI vistas labelled as real) | Long-weekend/festival calendar countdown | Itinerary, inclusions/exclusions, dates, price, booking terms | "WhatsApp pe itinerary" / "Call now" | Drip pricing banned; "non-existent locations/hotels" via AI are prohibited; AI-generated settings presented realistically need a label ([JSA Law](https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/), [Medianama ASCI draft](https://www.medianama.com/2026/06/223-asci-draft-synthetic-media-guidelines-ads-uses-prohibited-entirely/)) |
| **Wedding services (planners, photographers, décor, mehendi)** | Portfolio montage synced to muhurat countdown ("Dec 2–6 slots: 3 left") | Couple testimonial (consented) + package price band | Real past work, package price, dates available, city | "WhatsApp pe dates check karo" | Real client consent for images; scarcity must be true ([JSA Law](https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/)) |

---

## 7. COMPLIANCE

### 7.1 ASCI Code essentials (self-regulation; escalation to CCPA possible)
- Chapter I Honesty (truthful, substantiated claims; no misleading by implication/omission); Chapter II Decency; Chapter III no harmful/dangerous content and child protection; Chapter IV fair competition (no denigration/imitation). ASCI decisions are not statutory but can be escalated to CCPA ([TheMediaAnt ASCI summary](https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers), [CMS Law](https://cms.law/en/int/expert-guides/cms-expert-guide-to-advertising-of-medicines-and-medical-devices/india)).
- FY2025-26 enforcement: 11,581 cases (+21%); 97.3% of scrutinised ads were digital; Meta platforms = 79.84% of digital violations; top sectors: offshore betting 6,933, realty 643, personal care 576, F&B 331, DMRA 274; 98% of ads needed modification; 97.3% of 1,609 influencer ads needed modification ([FM Live](https://www.fmlive.in/offshore-betting-and-realty-emerge-as-most-violative-sectors-in-asci-annual-complaints-report-2025-26-cases-surge-21/)).

### 7.2 Disclaimers (ASCI Guidelines for Disclaimers, updated Jan 2023)
- Same language as the claim (dominant language in bilingual ads); must not contradict/modify/"cure" the claim or hide material info; one disclaimer per frame; max two full lines; **each line held >4 seconds**; extra hold time if regulatory text runs longer; all on-screen text at that moment counts toward hold calculation; avoid dense/complex text — fix the headline instead ([Social Samosa](https://www.socialsamosa.com/2023/01/asci-guidelines-for-disclaimers-in-advertisements)). Font size should match the claim's prominence; VO disclaimers at normal pace ([TheMediaAnt](https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers)). CCPA 2022 echoes: language, font, placement, VO speed and legibility must match the claim ([Mondaq](https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022)).
- **Generator rule:** in a 15s ad, a disclaimer line must be on screen ≥4s → place it from 10s–15s under the CTA, ≤2 lines, inside the safe zone, same language as VO.

### 7.3 Influencer / creator ads (ASCI Influencer Guidelines + 2025 addendum)
- Accepted labels: #ad, #advertisement, #sponsored, #collaboration, #partnership, #employee, #freegift, #affiliate ("collab", "thanks to" not accepted; IG Paid Partnership tag alone insufficient). **Videos ≤15s: label on screen ≥3s; 15s–2min: ≥⅓ of runtime; >2min: for the entire brand section; live: announce at start and end.** Virtual/AI influencers must disclose they are not human. Creators giving technical health/nutrition/BFSI advice must hold and disclose qualifications; brands must do due diligence ([Grynow summary](https://www.grynow.in/blog/asci-guidelines-for-influencer-marketing-in-india.html)). Endorsers face CCPA penalties and 1–3-year endorsement bans ([Mondaq](https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022)).

### 7.4 ASCI Guidelines for Responsible Labelling of Synthetically Generated Content in Advertising (published 29 Sept 2026; effective 3 months later ≈ late Dec 2026)
- **Label required** where SGC materially influences consumer decisions: synthetic influencers/ambassadors; a real person's likeness/voice (even with consent) in personalised messaging; fabricated events/settings/situations presented realistically; demos of products that don't yet exist (e.g., unbuilt housing); synthetic sound effects tied to core product features (headphones); paid AI-chatbot recommendations ("Sponsored by [Brand]").
- **Suggested wording:** "Audio/Video created using AI" or "Audio/Video enhanced using AI"; platform labels acceptable; alternatives OK if accurate; follow ASCI disclaimer guidelines for placement/legibility (i.e., the >4s/2-line rules above). **No explicit size/position/duration spec** in the press release.
- **Prohibited even with a label:** fabricated endorsements/testimonials; synthetic exaggeration of results; artificial transformations implying the product achieves them; non-existent locations/facilities shown as real; unauthorised copyrighted work; deepfakes/likeness without consent; AI "authority figures" (fake doctor) — and a label never cures a misleading ad.
- **Exempt:** colour correction, lighting, noise reduction, blemish removal, formatting/copy refinement, decorative backgrounds, ambient music/jingles unrelated to product promises, obviously fantastical effects, text/admin uses (copy generation), accessibility (subtitles, translations, audio descriptions).
([ASCI press release PDF](https://www.ascionline.in/wp-content/uploads/2026/09/Press-Release_Guidelines-for-Responsible-Labelling-of-Synthetically-Generated-Content-in-Advertising.pdf), [Conventus Law](https://conventuslaw.com/report/india-analysing-ascis-guidelines-on-labelling-synthetically-generated-content-in-advertising/), [Medianama – draft, Jun 2026](https://www.medianama.com/2026/06/223-asci-draft-synthetic-media-guidelines-ads-uses-prohibited-entirely/), [DSCI brief](https://www.dsci.in/resource/content/brief-ascis-guidelines-responsible-labelling-synthetically-generated-content-advertising))

### 7.5 MeitY IT (Amendment) Rules 2026 — synthetically generated information (SGI)
- Notified 10 Feb 2026, effective 20 Feb 2026. SGI = audio-visual content artificially/algorithmically created or altered to appear real/indistinguishable from a real person or event. Labels must be "prominent", "easily noticeable and adequately perceivable"; audio needs a "prominently prefixed audio disclosure". **The Oct-2025 draft's 10%-of-surface/10%-of-duration rule was dropped in the final rules.** Permanent metadata/provenance "to the extent technically feasible"; intermediaries must not allow label removal; significant platforms must collect user SGI declarations, verify and label. Takedown windows shortened (36h → 3h for certain orders). Exemptions: good-faith editing, documents/presentations, accessibility/quality improvements that don't alter substance ([Medianama](https://www.medianama.com/2026/02/223-meity-amendments-it-rules-synthetic-media-deepfakes/)).
- **Practical implication for an ad generator:** when uploading AI-generated video to Instagram/Facebook/YouTube/Moj etc., the uploader must declare it as SGI where the platform asks; the generator should (a) embed a visible label, (b) preserve C2PA/metadata, (c) prefix a short audio disclosure where a synthetic voice imitates a real person.

### 7.6 Consumer Protection Act 2019 + CCPA Guidelines 2022 (misleading ads & endorsements)
- Binding on manufacturers, service providers, traders, agencies, endorsers; all media. Bait ads need real stock/price; "free" cannot hide costs ("free trial" needing card details that auto-charge is misleading); surrogate ads barred; children: no exploitation/harmful depictions; discounts must show original and discounted price; research-based claims must cite source/date/sample; celebrity names/images need permission; obvious humorous exaggeration allowed. Penalties: up to ₹10 lakh first, ₹50 lakh subsequent; endorser bans 1 year, extendable to 3 ([Mondaq](https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022)).

### 7.7 CCPA Dark Patterns Guidelines 2023 (13 patterns)
False urgency, basket sneaking, confirm shaming, forced action, subscription trap, interface interference, bait-and-switch, drip pricing, disguised advertisement, nagging, trick question, SaaS billing, rogue malware; apply to sellers, advertisers and platforms incl. foreign entities serving India ([JSA Law](https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/)). ASCI also lists deceptive-design rules: ads distinguishable from content, no fake system messages, accurate buttons, easy to close/skip ([TheMediaAnt](https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers)). **Generator rule:** "AI UGC" must not be disguised as organic content; countdowns/scarcity only from real data.

### 7.8 Sector rules (quick list)
- **Coaching:** CCPA Coaching Sector Guidelines (Nov 2024) — see Section 6 ([Careers360](https://news.careers360.com/centre-issues-coaching-centres-guidelines-jee-neet-upsc-cuet-2025-crack-down-on-misleading-ads)).
- **Health:** DMRA 1954 (prohibited disease/claim categories; jail up to 6 months first offence); Drugs & Cosmetics Rules (no Schedule J cure claims; Rx drugs need approval); health ads need MIB/PCI self-declaration; HCP names/photos not usable in product ads ([CMS Law](https://cms.law/en/int/expert-guides/cms-expert-guide-to-advertising-of-medicines-and-medical-devices/india)).
- **Doctors/clinics:** NMC Guidelines on Ethical Advertising and Public Communication, 6 Oct 2026 — see Section 6 ([NMC PDF](https://medicaldialogues.in/pdf_upload/2026/10/07/nmc-guidelines-on-ethical-advertising-and-public-communication-478642.pdf)).
- **Food:** FSSAI Advertising & Claims Regulations 2018 + 28 May 2025 advisory against "100%" claims ([SS Rana](https://ssrana.in/articles/fssai-targets-misleading-100-claims-a-wake-up-call-for-food-brands/)).
- **Real estate:** RERA; MahaRERA circular 8 Apr 2025 ([Free Press Journal](https://www.freepressjournal.in/mumbai/maharera-mandates-prominent-display-of-regulatory-details-in-real-estate-ads)).
- **Gold:** BIS HUID hallmarking ([Taxscan](https://www.taxscan.in/six-digit-bis-hallmark-compulsory-for-sale-of-gold-jewellery-from-april-1/258967)).
- **Real-money gaming / crypto:** ASCI risk disclaimer 20% of ad space, normal pace; betting ads barred ([TheMediaAnt](https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers)) — avoid these categories in an SMB generator.
- **Kids:** ASCI Chapter III + CCPA 2022 child provisions; no exploiting credulity, no unrealistic expectations ([TheMediaAnt](https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers), [Mondaq](https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022)).

### 7.9 What an AI-generated Indian ad must disclose, and how (consolidated checklist)
1. **Trigger test:** synthetic presenter/voice, synthetic event/setting, product-that-doesn't-exist demo, or a real person's cloned face/voice (with consent) → label required (ASCI SGC; MeitY SGI).
2. **Label wording:** "Video created using AI" / "Video enhanced using AI" (ASCI); Hindi equivalent "यह वीडियो AI से बनाया गया है" **[wording not prescribed – ESTIMATE]**.
3. **Placement/size (no numeric rule in final texts):** satisfy "prominent, easily noticeable" (MeitY) + ASCI disclaimer rules → ≥4s on screen, ≤2 lines, same language as claims, inside safe zone; recommended practice: persistent small label (≈2.5–3% of frame height) top-left or bottom-left for the whole ad, plus a 4-second clear super at the start **[ESTIMATE based on the dropped 10% draft and ASCI disclaimer rules]**.
4. **Audio:** prefix a brief spoken/sound disclosure when a synthetic voice imitates a real person (MeitY).
5. **Metadata:** keep C2PA/provenance; do not strip platform labels; tick platform self-declaration (Meta auto-detects third-party AI; Google's AI-label setting).
6. **Never generate:** fake testimonials/endorsements, fake doctors/experts, celebrity likeness without licence, non-existent shops/hotels/projects shown as real, exaggerated AI "results".
7. **Doctor/clinic ads:** additionally carry NMC's "AI-generated" source mark; never synthetic patient stories.

---

## 8. TRENDS 2026

### 8.1 Formats trending in Indian short-form ads (with evidence quality)

| Format | What it is | Evidence (quality) |
|---|---|---|
| **AI UGC / AI-enhanced UGC** | Synthetic or AI-assisted presenter demos styled as phone footage; multi-language renders | Vendor claims of 35–45% lower CPA and Indian D2C beauty brands cutting production cost 60% (unsourced) ([Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/)); Indian AI-UGC vendors at ~₹200/10-s video with mandatory AI overlay ([MorphAds](https://morphads.in/learn)) — **must not be run as testimonials** |
| **Founder talks / founder-led** | Founder to camera on origin, objection, product | Outperforms brand-account content on trust/saves ([MARQN](https://www.marqn.in/post/top-instagram-content-formats-that-drive-results-for-indian-d2c-brands)); +42% watch-through (vendor) ([Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/)); listed as working format for Indian brands ([AlphaBeta](https://alphabetasolution.org/the-reels-playbook-for-indian-brands-in-2026-from-someone-whos-tested-everything/)) |
| **Meme / cultural commentary** | Trend-jacking, Zomato/Swiggy style | 20–30% of calendar suggested; Zomato/Swiggy cited ([MARQN](https://www.marqn.in/post/top-instagram-content-formats-that-drive-results-for-indian-d2c-brands), [Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/)) |
| **Before/after split-screen** | Side-by-side or time-lapse transformation | 52% higher save rate (vendor) ([Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/)); AdsSarthi "after first" ([AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html)) |
| **Micro-creator Reels boosted as ads** | Organic creator Reels whitelisted/boosted | Micro ₹7.14 return per ₹1, nano ₹6.52, macro ₹4.23; ethnic-wear client ₹12 lakh/month at 4.2x ROAS ([MARQN](https://www.marqn.in/post/top-instagram-content-formats-that-drive-results-for-indian-d2c-brands)); Gen Z prefers micro-creators ([Ipsos](https://www.ipsos.com/sites/default/files/ct/publication/documents/2025-09/ET%20Brand%20Equity%20Ipsos%20The%20State%20of%20Digital%20Marketing%20in%20India%202025.pdf)) |
| **Lo-fi authentic / phone-shot** | Minimal editing, home kitchen | +28% engagement (vendor); Slurrp Farm example ([Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/)); UGC-style > polished ([AdsSarthi](https://adssarthi.com/blog/instagram-reels-ads-india-guide.html)) |
| **Dynamic captions / kinetic typography** | Word-synced, branded captions | +40% completion (vendor) ([Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/)); karaoke/spotlight styles for Hinglish ([VideoCaptions](https://www.videocaptions.ai/blog/hinglish-captions-guide)) |
| **Shoppable / catalog video** | In-platform purchase, Catalog Product Video | Ajio ~20% efficiency gain ([Social Samosa](https://www.socialsamosa.com/industry-updates/reels-ai-and-whatsapp-power-indias-new-shopping-behaviour-meta-11835320)); 30% higher conversion (vendor) ([Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/)) |
| **Trending audio + brand message** | Low-production, high-distribution organic format | Listed as working ([AlphaBeta](https://alphabetasolution.org/the-reels-playbook-for-indian-brands-in-2026-from-someone-whos-tested-everything/)); **not usable in paid ads** (licensing) ([Benly](https://benly.ai/learn/meta-ads/meta-ads-reels-ads-guide)) |
| **AI-voiced regional variants** | One script, Hindi/Marathi/Tamil AI VO | "Significantly expanded reach into Tier 2" (no figures) ([AlphaBeta](https://alphabetasolution.org/the-reels-playbook-for-indian-brands-in-2026-from-someone-whos-tested-everything/)); Tata Gluco+ regional variants within a week ([Storyboard18](https://www.storyboard18.com/brand-marketing/campaign-turnaround-down-70-production-costs-cut-by-85-how-indian-brands-are-letting-ai-take-over-creative-wheel-72438.htm)) |
| **Interactive / try-on** | AR try-on, polls | Lenskart try-on ads 2.5x vs carousels (vendor) ([Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/)); in-video polls "increase dwell time" ([AlphaBeta](https://alphabetasolution.org/the-reels-playbook-for-indian-brands-in-2026-from-someone-whos-tested-everything/)) |
| **Green-screen reaction, podcast-clip, "notes-app" text style, vlog, ASMR, satisfying B-roll** | Widely used creator formats | **No India-specific performance evidence found in the pages opened [UNVERIFIED]**; satisfying B-roll overlaps with "demonstration cut" (product in action by 5s) ([AdLibrary](https://adlibrary.com/posts/meta-reels-ads-guide-2026)) |
| **Modular hook/body/CTA testing at volume** | 15–30 variants/week | Brands testing 10+/week see 25% lower CPA (vendor) ([Balistro](https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/)); Kantar: up to 55-percentile gaps between assets in one campaign ([Indian Television](https://indiantelevision.com/mam/kantar-says-indias-most-effective-ads-now-begin-with-local-truths/)) |

### 8.2 Notable AI-generated Indian ad campaigns 2025–2026 and reception

| Brand / campaign | What | Outcome / reception | Source |
|---|---|---|---|
| Cadbury Celebrations "Shah Rukh Khan My Ad" (Diwali 2021, benchmark case) | Licensed AI recreation of SRK's face/voice to promote ~2,000 local stores; ~130,000 ad variants | ~94M views; agency-claimed 35% business lift; Cannes Titanium Lion — the template for consented, labelled celebrity synthesis | [Agency Reporter](https://agencyreporter.com/ai-assisted-ad-viral-audience-reception-data/) |
| Cadbury Silk Valentine's (2025) | GenAI turned consumer moments into 500,000+ animated videos | Scale impossible traditionally (Mondelez) | [Storyboard18](https://www.storyboard18.com/brand-marketing/campaign-turnaround-down-70-production-costs-cut-by-85-how-indian-brands-are-letting-ai-take-over-creative-wheel-72438.htm) |
| Emami DermiCool "Warriors" (2025) | AI film via MidJourney/Kling/Suno; 8-person team | 80–85% production-cost reduction, "comparable quality" | same |
| Tata Gluco+ (2025, Aesthetic Intelligence Lab) | Runway/Leonardo/ElevenLabs | Turnaround cut >70%; regional variants in a week | same |
| Wipro Consumer (2025) | AI-led production | 5x faster at one-fifth cost (producer claim) | same |
| Siyaram Father's Day film (2025, Agency09) | AI-scripted/visualised/produced | 30–40% savings; "not plug-and-play" | same |
| Cost benchmark | AI-led campaigns ₹8–12 lakh vs ₹50–60 lakh; AI studio quotes 40–70% cheaper, 7–15 working days, entry ₹2–5 lakh | Vendor figures, unverified | same; [Chasing Illusions](https://www.chasingillusions.com/blog/ai-ad-film-production-india) |
| Reception (global context) | Coca-Cola's 2025 all-AI holiday ad drew "mostly negative responses"; smaller brands face higher backlash risk from fully-AI ads; keep a human touch | — | [eMarketer](https://www.emarketer.com/content/three-ads-that-defined-2025-and-what-they-mean-marketers-2026) |
| Audience data | No Indian campaign-level sentiment data published in sources fetched; Storyboard18 reports no audience metrics for the Indian AI films — **reception [UNVERIFIED]** | — | [Storyboard18](https://www.storyboard18.com/brand-marketing/campaign-turnaround-down-70-production-costs-cut-by-85-how-indian-brands-are-letting-ai-take-over-creative-wheel-72438.htm) |

**Regulatory tailwind:** MeitY rules (Feb 2026), ASCI draft (May/Jun 2026) → final (Sept 2026), NMC (Oct 2026), Google AI-label setting (Jul 2026), Meta "About this ad" (Jun 2026) mean that from Q1 2027 unlabeled synthetic ads in India are both a platform-policy and a legal risk.

---

## 9. Distilled rules for the ad generator's system instructions (derived from Sections 1–8)

1. Default output: 9:16, 1080×1920, 15s (DR) or 30s (consideration); hook by 0–2s with spoken line + OST + motion; product on screen by 5s and ≥3 times; brand presence ≤25% of runtime; CTA in VO and OST in the last 3s.
2. VO: Hindi/Hinglish at ~2.2–2.6 wps; 15s ≈ 30–38 words; 30s ≈ 55–75 words; ≥20% of runtime VO-free; register *aap* by default, *tum* for youth D2C; never *tu* in brand VO.
3. Captions always burned in, word-synced, inside x 65–1015 / y 270–1250 px; hook text ≈40 pt-eq, body ≈28 pt-eq; Roman Hinglish for metro/youth, Devanagari for Hindi-first/Tier 2-3; Noto Sans for Indic.
4. Offer blocks must show original + discounted price, EMI terms, COD availability; no fake scarcity; no competitor names.
5. Compliance gates by category (clinics, coaching, food, realty, gold, personal care) as per Section 6/7; auto-insert disclaimers ≥4s, ≤2 lines, same language.
6. AI-content gate: if synthetic presenter/voice/setting → "Video created using AI" label persistent + 4s super + metadata; never testimonials; never real-person likeness without a consent flag.
7. Festive engine: pick angle by calendar (Section 4); start 6 weeks out; generate a "last 48 hours" variant with delivery-by date.
8. Language engine: generate Hindi + up to 8 regional versions (Tamil, Telugu, Bengali, Marathi, Kannada, Malayalam, Gujarati, Punjabi) as distinct executions, not translations; expect regional pools to fatigue faster — refresh every 5–7 days in festivals.
9. Music: only royalty-free/Meta Sound Collection; speech + music together.
10. Test matrix: ≥3 hooks × 2 bodies × 2 CTAs per concept; kill below 25% hook rate; scale at ≥30% hook and ≥45% hold.

---

## Sources (every URL opened; grouped)

**Hooks / benchmarks / creative**
- https://www.truefan.ai/blogs/instagram-reels-hooks-india
- https://adssarthi.com/blog/instagram-reels-ads-india-guide.html
- https://adlibrary.com/posts/meta-reels-ads-guide-2026
- https://benly.ai/learn/meta-ads/meta-ads-reels-ads-guide
- https://jetfuel.agency/creative-performance-metrics-for-dtc-video-ads-hold-rate-thumbstop-and-thruplay-benchmarks-2026/
- https://www.socialsamosa.com/news-2/meta-playbook-boost-reels-ad-performance-10867111
- https://www.socialsamosa.com/industry-updates/reels-ai-and-whatsapp-power-indias-new-shopping-behaviour-meta-11835320
- https://www.marqn.in/post/top-instagram-content-formats-that-drive-results-for-indian-d2c-brands
- https://alphabetasolution.org/the-reels-playbook-for-indian-brands-in-2026-from-someone-whos-tested-everything/
- https://adamconnell.me/instagram-reels-statistics/
- https://www.balistro.com/ad-creative-trends-dominating-social-media-2026/
- https://www.business-standard.com/amp/article/opinion/how-many-words-can-you-pack-in-an-ad-122030801615_1.html

**Culture / language / market**
- https://indiantelevision.com/mam/kantar-says-indias-most-effective-ads-now-begin-with-local-truths/
- https://www.ipsos.com/sites/default/files/ct/publication/documents/2025-09/ET%20Brand%20Equity%20Ipsos%20The%20State%20of%20Digital%20Marketing%20in%20India%202025.pdf
- https://about.fb.com/news/2025/09/genai-creators-and-reels-are-reshaping-festive-shopping-in-india/
- https://mediabrief.com/meta-releases-festive-accelerator-2026-playbook/
- https://www.elevateinsights.in/post/decoding-indian-consumer-behavior-timeless-truths-from-the-heart-of-a-complex-nation
- https://www.business-standard.com/india-news/india-s-internet-users-to-exceed-900-mn-in-2025-driven-by-indic-languages-125011600835_1.html
- https://www.exchange4media.com/advertising-news/from-challenge-to-opportunity-vernacular-advertising-sees-2x-growth-in-engagement-rates-141481.html
- https://findise.in/regional-language-ads-in-india-cheaper-impressions-faster-burnout/
- https://www.afaqs.com/news/advertorial/indias-influencer-marketing-is-racing-toward-3375-crore-and-south-india-is-driving-the-shift-to-regional-creators-12144842
- https://www.videocaptions.ai/blog/hindi-vs-hinglish-captions
- https://www.videocaptions.ai/blog/hinglish-captions-guide
- https://echai.ventures/startingup/copywriting-messaging/when-should-i-write-copy-in-hindi-or-a-regional-language-versus-english-for-an-indian-consumer-product-and-how-do-i-get-the-tone-right
- https://archive.adgully.com/the-hinglish-factor-in-advertising-104577.html
- https://www.ey.com/en_in/newsroom/2026/03/india-s-media-and-entertainment-sector-grew-9-percent-to-inr-2-point-78-trillion-in-2025-driven-by-digital-and-live-experiences-ficci-ey-report
- https://blog.google/intl/en-in/brandcast-2025-ctv-shorts-and-youtube-as-indias-new-tv/

**Calendar**
- https://hindutone.com/festivals/hindu-festival-calendar-2026-2027/
- https://www.drikpanchang.com/calendars/hindu/hinducalendar.html?year=2027
- https://www.hindu-blog.com/2026/10/hindu-festivals-2027-calendar-important.html
- https://hindutone.com/festivals/makar-sankranti-2027/
- https://daanyam.in/global-hindu-festival-timings/diwali-2027/delhi
- https://www.drikpanchang.com/calendars/indian/sikh-festivals/jayanti/guru-nanak-jayanti-date.html?year=2026
- https://publicholidays.in/guru-nanak-jayanti/
- https://www.khaleejtimes.com/uae/ramadan-eid-al-fitr-eid-al-adha-2027-likely-dates
- https://www.mykhel.com/cricket/ipl-2027-to-start-earlier-as-bcci-confirm-new-dates-for-tournament-reason-revealed-441201.html
- https://hindutone.com/astrology/vivah-muhurat-2026-27-shubh-marriage-dates/
- https://telanganatoday.com/indias-wedding-season-biz-expected-to-surge-41-pc-to-rs-6-lakh-crore-cait
- https://zoutons.com/news/amazon-great-indian-festival-vs-flipkart-bbd-october-2026
- https://zoutons.com/news/myntra-sale-calendar-2026
- https://blog.shipway.com/black-friday-2025-sale-dates-india-ecommerce-deals/
- https://school.careers360.com/boards/cbse/cbse-date-sheet-2027

**Platform specs / policies**
- https://www.cinerads.com/blog/meta-ads-video-creative-best-practices
- https://billo.app/blog/meta-ads-safe-zones
- https://www.flighted.co/blog/metas-advantage-plus-ai-creative-enhancements-each-one-explained
- https://about.fb.com/news/2025/02/gen-ai-transparency-metas-ads-products/
- https://telanganatoday.com/meta-asks-advertisers-to-disclose-use-of-ai-in-political-social-ads
- https://support.google.com/adspolicy/answer/17257106?hl=en
- https://support.google.com/youtube/answer/2375464?hl=en
- https://business.google.com/us/ad-solutions/youtube-ads/shorts-ads/
- https://megadigital.ai/en/blog/youtube-ad-specs/
- https://www.indiatvnews.com/technology/news/whatsapp-begins-rolling-out-ads-in-status-and-channels-how-it-affects-you-2025-12-10-1021128
- https://www.enrichlabs.ai/blog/whatsapp-advertising-complete-guide-2026
- https://www.themediaant.com/blog/moj-advertising-types-and-targeting
- https://www.themediaant.com/blog/media-kundli-sharechat-advertising/
- https://ads.hotstar.com/ad-formats

**Compliance**
- https://www.medianama.com/2026/02/223-meity-amendments-it-rules-synthetic-media-deepfakes/
- https://www.ascionline.in/wp-content/uploads/2026/09/Press-Release_Guidelines-for-Responsible-Labelling-of-Synthetically-Generated-Content-in-Advertising.pdf
- https://conventuslaw.com/report/india-analysing-ascis-guidelines-on-labelling-synthetically-generated-content-in-advertising/
- https://www.medianama.com/2026/06/223-asci-draft-synthetic-media-guidelines-ads-uses-prohibited-entirely/
- https://www.dsci.in/resource/content/brief-ascis-guidelines-responsible-labelling-synthetically-generated-content-advertising
- https://www.socialsamosa.com/2023/01/asci-guidelines-for-disclaimers-in-advertisements
- https://www.themediaant.com/blog/simplifying-asci-guidelines-for-advertisers
- https://www.grynow.in/blog/asci-guidelines-for-influencer-marketing-in-india.html
- https://www.fmlive.in/offshore-betting-and-realty-emerge-as-most-violative-sectors-in-asci-annual-complaints-report-2025-26-cases-surge-21/
- https://www.mondaq.com/india/social-media/1312524/ccpa-guidelines-for-misleading-advertisements-and-endorsements-2022
- https://www.jsalaw.com/newsletters-and-updates/ccpa-issues-guidelines-for-prevention-and-regulation-of-dark-patterns-2023/
- https://news.careers360.com/centre-issues-coaching-centres-guidelines-jee-neet-upsc-cuet-2025-crack-down-on-misleading-ads
- https://www.freepressjournal.in/mumbai/maharera-mandates-prominent-display-of-regulatory-details-in-real-estate-ads
- https://medicaldialogues.in/pdf_upload/2026/10/07/nmc-guidelines-on-ethical-advertising-and-public-communication-478642.pdf
- https://cms.law/en/int/expert-guides/cms-expert-guide-to-advertising-of-medicines-and-medical-devices/india
- https://ssrana.in/articles/fssai-targets-misleading-100-claims-a-wake-up-call-for-food-brands/
- https://www.taxscan.in/six-digit-bis-hallmark-compulsory-for-sale-of-gold-jewellery-from-april-1/258967

**Trends / AI campaigns**
- https://www.storyboard18.com/brand-marketing/campaign-turnaround-down-70-production-costs-cut-by-85-how-indian-brands-are-letting-ai-take-over-creative-wheel-72438.htm
- https://agencyreporter.com/ai-assisted-ad-viral-audience-reception-data/
- https://www.chasingillusions.com/blog/ai-ad-film-production-india
- https://shhots.ai/blog/best-ai-commercials/
- https://www.emarketer.com/content/three-ads-that-defined-2025-and-what-they-mean-marketers-2026
- https://morphads.in/learn

**Pages that failed to load (not used as evidence):** exchange4media ASCI SGC article; storyboard18 ASCI/Kantar/annual-report pages; facebook.com/business ads-guide pages; drikpanchang Durga Puja 2027 and January 2027 pages; vikaspedia CCPA page; lawbhoomi doctor-ads page.
