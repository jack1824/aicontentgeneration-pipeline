export type Mode = 'simple' | 'advanced'
export type Preset = 'draft' | 'standard' | 'master'
export type Step = 'brief' | 'openings' | 'making' | 'result'
export type Page = Step | 'ads' | 'moments' | 'brand'

/* ---------- video models: Higgsfield API, verified 2 Nov 2026 (no money is ever shown on this site) ---------- */
export type VideoModel = {
  id: string; name: string; maker: string; mono: string; good: string
  speed: number; detail: number; speedWord: string
  res: string; len: string; refs: string; secPerShot: number; slug: string
}
export const VIDEO_MODELS: VideoModel[] = [
  { id: 'auto', name: 'Auto', maker: 'Picks per shot', mono: 'A', good: 'Each shot gets the model that suits it. Right for most ads.', speed: 3, detail: 4, speedWord: 'Balanced', res: 'per shot', len: 'per shot', refs: 'face, product, shop', secPerShot: 150, slug: 'config/router.yaml · standard' },
  { id: 'wan3', name: 'Wan 3.0', maker: 'Alibaba', mono: 'W3', good: 'Fast drafts to test an idea before you make the final.', speed: 4, detail: 3, speedWord: 'Fastest', res: '480p to 1080p', len: '2 to 30 s', refs: 'up to 10 images', secPerShot: 90, slug: 'alibaba/wan-3.0/image-to-video' },
  { id: 'kling3', name: 'Kling 3.0 Pro', maker: 'Kuaishou', mono: 'K3', good: 'Clean product shots and steady faces. The everyday final.', speed: 3, detail: 4, speedWord: 'Balanced', res: '1080p', len: '3 to 15 s', refs: 'first and last frame', secPerShot: 150, slug: 'kling-video/v3.0/pro/image-to-video' },
  { id: 'klingO3', name: 'Kling O3', maker: 'Kuaishou', mono: 'O3', good: 'Your face, product and shop together in one shot.', speed: 3, detail: 4, speedWord: 'Balanced', res: '720p to 4K', len: '3 to 15 s', refs: 'ordered images', secPerShot: 160, slug: 'kling-video/o3/image-reference' },
  { id: 'kling4', name: 'Kling 4.0', maker: 'Kuaishou', mono: 'K4', good: 'The most natural motion and fine detail, for hero shots.', speed: 2, detail: 5, speedWord: 'Slower', res: '720p to 1080p', len: '3 to 30 s', refs: 'images and video', secPerShot: 200, slug: 'kling-video/v4.0/reference-to-video' },
  { id: 'seedance', name: 'Seedance 2.5', maker: 'ByteDance', mono: 'S2', good: 'Holds many products through one long, continuous take.', speed: 2, detail: 5, speedWord: 'Slower', res: '480p to 1080p', len: '4 to 30 s', refs: 'up to 30 images', secPerShot: 240, slug: 'bytedance/seedance-2.5/reference-to-video' },
  { id: 'cinema', name: 'Cinema Studio 4.0', maker: 'Higgsfield', mono: 'C4', good: 'One cinematic take with real camera moves, for a brand film.', speed: 1, detail: 5, speedWord: 'Slowest', res: '480p to 720p', len: '4 to 30 s', refs: 'up to 30 images', secPerShot: 300, slug: 'higgsfield/cinema-studio/4.0' },
]

/* ---------- voices: ElevenLabs Hindi library voices, Eleven v4 (the studio auditions the real voice) ---------- */
export type Voice = { id: string; name: string; gender: 'Female' | 'Male'; age: string; tone: string; city: string; tint: string; good: string }
export const VOICES: Voice[] = [
  { id: 'v1', name: 'Priya', gender: 'Female', age: '20s', tone: 'Warm and chatty', city: 'Delhi', tint: '#dfe3fb', good: 'gifting, fashion, beauty' },
  { id: 'v2', name: 'Aarav', gender: 'Male', age: '20s', tone: 'Energetic', city: 'Mumbai', tint: '#dcefe4', good: 'electronics, food, offers' },
  { id: 'v3', name: 'Meera', gender: 'Female', age: '30s', tone: 'Calm and trusted', city: 'Jaipur', tint: '#f6e7d8', good: 'jewellers, coaching, clinics' },
  { id: 'v4', name: 'Kabir', gender: 'Male', age: '40s', tone: 'Deep and confident', city: 'Lucknow', tint: '#e4e1ef', good: 'real estate, dealers' },
  { id: 'v5', name: 'Sunita', gender: 'Female', age: '50s', tone: 'Homely', city: 'Indore', tint: '#f3e1e6', good: 'sweets, kirana, home food' },
  { id: 'v6', name: 'Rohan', gender: 'Male', age: '20s', tone: 'Friendly Hinglish', city: 'Bengaluru', tint: '#dceaf3', good: 'apps, gyms, D2C brands' },
]

/* ---------- calendar: real dates, days counted from 4 Nov 2026 ---------- */
export const MOMENTS = [
  { id: 'dhanteras', name: 'Dhanteras', date: 'Fri 6 Nov 2026', days: 2, angle: 'Shubh kharidari, the day families buy gold and new things', good: 'Jewellers, electronics, kitchenware' },
  { id: 'diwali', name: 'Diwali', date: 'Sun 8 Nov 2026', days: 4, angle: 'Gift boxes and a delivery-before-Diwali line', good: 'Sweets, gifting, fashion, home' },
  { id: 'bhaidooj', name: 'Bhai Dooj', date: 'Wed 11 Nov 2026', days: 7, angle: 'Sibling gifting with a delivery-by date', good: 'Gifting, sweets, gadgets' },
  { id: 'chhath', name: 'Chhath Puja', date: '13 to 16 Nov 2026', days: 9, angle: 'Purity and dawn rituals', good: 'Food, ethnic wear, kirana' },
  { id: 'wedding', name: 'Wedding season', date: 'from 20 Nov 2026', days: 16, angle: 'Shagun boxes, muhurat countdowns', good: 'Jewellers, salons, fashion' },
  { id: 'blackfriday', name: 'Black Friday week', date: '18 to 28 Nov 2026', days: 14, angle: 'Beauty and fashion discounts', good: 'Beauty, fashion, electronics' },
  { id: 'christmas', name: 'Christmas', date: 'Fri 25 Dec 2026', days: 51, angle: 'Cakes, gifting, winter wear', good: 'Bakeries, gifting, travel' },
  { id: 'sankranti', name: 'Makar Sankranti and Pongal', date: '14 to 17 Jan 2027', days: 71, angle: 'Til-gud, new clothes, harvest', good: 'Sweets, ethnic wear, appliances' },
]

export const CTAS = ['WhatsApp', 'Call', 'Visit the shop', 'Order online'] as const
export type Cta = (typeof CTAS)[number]

export type Photo = { id: string; src: string; name: string }
export type Brief = {
  product: string; offer: string; photos: Photo[]
  voice: string; model: string; dur: 15 | 30; lang: 'Hinglish' | 'Hindi'; captions: 'lat' | 'dev'
  cta: Cta; contact: string; moment: string; preset: Preset; presenter: 'none' | 'ai' | 'me'
}
export const EMPTY_BRIEF: Brief = {
  product: '', offer: '', photos: [], voice: 'v1', model: 'auto', dur: 15, lang: 'Hinglish', captions: 'lat',
  cta: 'WhatsApp', contact: '', moment: '', preset: 'standard', presenter: 'none',
}

const name = (b: Brief) => b.product.trim() || 'product'

/* ---------- openings: built from the brief with the hook library's types, never canned examples ---------- */
export type Hook = { id: string; type: string; lat: string; dev: string; card: string; why: string; score: number }
export function buildHooks(b: Brief): Hook[] {
  const p = name(b)
  const offer = b.offer.trim()
  const m = MOMENTS.find(x => x.id === b.moment)
  const list: Hook[] = []
  if (offer) list.push({ id: 'offer', type: 'Offer first', lat: `${p}: ${offer}.`, dev: `${p}: ${offer}।`, card: offer, why: 'Leads with the reason to buy today.', score: 5 })
  list.push({ id: 'pain', type: 'Relatable pain', lat: `Abhi tak sahi ${p} nahi mila?`, dev: `अभी तक सही ${p} नहीं मिला?`, card: `Sahi ${p} nahi mila?`, why: 'Starts from the problem your customer already has.', score: 4 })
  if (m) list.push({ id: 'moment', type: 'Festival moment', lat: `${m.name} se pehle ${p}, ghar tak.`, dev: `${m.name} से पहले ${p}, घर तक।`, card: `${m.name} se pehle`, why: `${m.name} is ${m.days} days away; the date does the selling.`, score: 5 })
  list.push({ id: 'stop', type: 'Stop scrolling', lat: `Ruko! ${p} ka yeh offer dekho.`, dev: `रुको! ${p} का यह ऑफ़र देखो।`, card: 'Ruko!', why: 'A direct command in the first second.', score: 3 })
  list.push({ id: 'question', type: 'Question', lat: `${p} lene se pehle yeh dekh lo.`, dev: `${p} लेने से पहले यह देख लो।`, card: 'Lene se pehle…', why: 'Opens a loop the rest of the ad closes.', score: 3 })
  list.push({ id: 'visual', type: 'Visual first', lat: `Dekho.`, dev: `देखो।`, card: 'Dekho.', why: 'The product does the talking; good when the photo is strong.', score: 3 })
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
  return list.sort((a, c) => c.score - a.score).slice(0, 6).map(h => ({ ...h, lat: cap(h.lat), card: cap(h.card) }))
}

export type Beat = { n: number; type: 'Hook' | 'Setup' | 'Proof' | 'Offer' | 'CTA'; lat: string; dev: string; sec: number }
export function buildBeats(b: Brief, hook: Hook | undefined): Beat[] {
  const p = name(b)
  const k = b.dur === 30 ? 2 : 1
  const offer = b.offer.trim()
  const cta = {
    WhatsApp: { lat: `WhatsApp karo${b.contact ? ' ' + b.contact : ''}.`, dev: `WhatsApp करो${b.contact ? ' ' + b.contact : ''}।` },
    Call: { lat: `Abhi call karo${b.contact ? ' ' + b.contact : ''}.`, dev: `अभी कॉल करो${b.contact ? ' ' + b.contact : ''}।` },
    'Visit the shop': { lat: 'Aaj hi dukaan aao.', dev: 'आज ही दुकान आओ।' },
    'Order online': { lat: 'Abhi order karo, link neeche.', dev: 'अभी ऑर्डर करो, लिंक नीचे।' },
  }[b.cta]
  return [
    { n: 1, type: 'Hook', lat: hook?.lat ?? `${p}?`, dev: hook?.dev ?? `${p}?`, sec: 2.4 * (k === 2 ? 1.2 : 1) },
    { n: 2, type: 'Setup', lat: b.product.trim() ? `Yeh hai ${p}${offer ? ', ' + offer : ''}.` : 'Aapki dukaan ka sabse accha product.', dev: b.product.trim() ? `यह है ${p}${offer ? ', ' + offer : ''}।` : 'आपकी दुकान का सबसे अच्छा प्रोडक्ट।', sec: 3.2 * k },
    { n: 3, type: 'Proof', lat: `Dekhiye, asal mein kaisa dikhta hai.`, dev: `देखिए, असल में कैसा दिखता है।`, sec: 4.6 * k },
    { n: 4, type: 'Offer', lat: offer ? `${offer.charAt(0).toUpperCase() + offer.slice(1)}.` : 'Aaj ka offer, aaj hi.', dev: offer ? `${offer}।` : 'आज का ऑफ़र, आज ही।', sec: 2.6 * k },
    { n: 5, type: 'CTA', lat: cta.lat, dev: cta.dev, sec: 2.2 * k },
  ]
}

export type Shot = { id: string; beat: number; kind: string; what: string }
export function buildShots(b: Brief): Shot[] {
  const p = name(b)
  const s: Shot[] = [
    { id: 'S1', beat: 1, kind: b.presenter === 'none' ? 'Product' : 'Presenter', what: b.presenter === 'none' ? `${p}, close-up, first frame` : `Presenter holds ${p}` },
    { id: 'S2', beat: 2, kind: 'Product', what: `${p} turning slowly` },
    { id: 'S3', beat: 3, kind: 'Detail', what: `Texture and detail of ${p}` },
    { id: 'S4', beat: 3, kind: 'In use', what: `${p} in use` },
    { id: 'S5', beat: 4, kind: 'Product', what: 'Clean frame for the offer card' },
    { id: 'S6', beat: 5, kind: 'End card', what: 'Your name, number and the action' },
  ]
  return b.dur === 30 ? [...s.slice(0, 4), { id: 'S7', beat: 3, kind: 'Detail', what: `Second angle of ${p}` }, { id: 'S8', beat: 3, kind: 'In use', what: `${p} with packaging` }, ...s.slice(4).map((x, i) => ({ ...x, id: 'S' + (9 + i) }))] : s
}

export const AUTO_PICK: Record<string, string> = { Presenter: 'klingO3', Product: 'kling3', Detail: 'wan3', 'In use': 'kling3', 'End card': 'wan3' }

/* Time only. The site never shows cost. */
export function estimate(b: Brief) {
  const m = VIDEO_MODELS.find(v => v.id === b.model) ?? VIDEO_MODELS[0]
  const shots = buildShots(b).length
  const rows = [
    { step: 'Script and openings', model: 'Script Brain', s: 8 },
    { step: 'Voice, five beats', model: 'Eleven v4, Hindi', s: 50 },
    { step: `Pictures, ${shots} shots`, model: b.preset === 'master' ? 'Soul 2 and Marketing Studio 4k' : 'Soul 2 with Soul ID', s: 35 },
    { step: `Video, ${shots} shots at once`, model: m.name, s: m.secPerShot },
    { step: 'Quality check', model: 'Quality judge', s: 15 },
    { step: 'Music and sound hits', model: 'Eleven Music and SFX', s: 30 },
    { step: 'Cut, captions, end card, sizes', model: 'Compositor (ffmpeg)', s: 40 },
  ]
  return { rows, secs: rows.reduce((a, r) => a + r.s, 0) }
}

export const aboutMin = (s: number) => `about ${Math.max(1, Math.round(s / 60))} min`
