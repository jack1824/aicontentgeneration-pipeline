import { useRef, useState } from 'react'
import { ArrowRight, Check, Play } from 'lucide-react'
import { gsap, useGSAP, SplitText, ScrollTrigger, reduced } from '@/lib/gsap'
import { buildBeats, buildHooks, CTAS, MOMENTS, VIDEO_MODELS, VOICES, type Brief, type Cta } from '@/lib/data'
import { Reel } from '@/ui/Reel'
import { Seg } from '@/ui/Seg'
import { Meter } from '@/ui/Meter'
import { Mark } from '@/ui/Mark'
import { VoiceInitial } from '@/ui/Pickers'
import { useSmoothScroll } from './useSmoothScroll'

type Props = { brief: Brief; setBrief: (p: Partial<Brief>) => void; onStart: () => void }

const LINKS: [string, string][] = [['how', 'How it works'], ['try', 'Try it'], ['studio', 'The studio'], ['questions', 'Questions']]
const HOOK_TYPES = ['Relatable pain', 'Question', 'Stop scrolling', 'Festival moment', 'Offer first', 'POV', 'Before and after', 'Visual first', 'City shout-out', 'Myth buster', 'Pattern interrupt', 'Three-second challenge']

export default function Landing({ brief, setBrief, onStart }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [beat, setBeat] = useState(1)
  const [step, setStep] = useState(0)
  const [hover, setHover] = useState(0)
  useSmoothScroll()

  const hooks = buildHooks(brief)
  const beats = buildBeats(brief, hooks[0])
  const voice = VOICES.find(v => v.id === brief.voice) ?? VOICES[0]
  const reel = { beats, hookCard: hooks[0]?.card, offer: brief.offer.trim(), endName: brief.product || 'Your shop', endLine: `${brief.cta}${brief.contact ? ' ' + brief.contact : ''}`, script: brief.captions }

  useGSAP((_, contextSafe) => {
    const q = gsap.utils.selector(root)
    const mm = gsap.matchMedia()
    let split: SplitText | null = null
    let live = true

    mm.add({ motion: '(prefers-reduced-motion: no-preference)', fine: '(pointer: fine)', wide: '(min-width: 1024px)' }, ctx => {
      const { motion, fine, wide } = ctx.conditions as { motion: boolean; fine: boolean; wide: boolean }
      if (!motion) return
      // load, settled by about 1.2 s: the reel opens like a shutter and leans into place, the word behind it arrives
      const intro = gsap.timeline({ defaults: { ease: 'expo.out' } })
        .fromTo(q('[data-shutter]'), { clipPath: 'inset(100% 0 0 0)', rotate: -9 }, { clipPath: 'inset(0% 0 0 0)', rotate: -4, duration: 1.1, ease: 'power3.inOut' }, 0)
        .from(q('[data-ruko]'), { yPercent: 12, autoAlpha: 0, duration: 1.2 }, 0.1)
        .from(q('[data-hero-text]'), { y: 18, autoAlpha: 0, duration: 0.8, stagger: 0.08 }, 0.45)
      document.fonts.ready.then(() => {
        if (!live || !root.current) return
        split = SplitText.create(q('[data-title]'), { type: 'lines', mask: 'lines' })
        intro.from(split.lines, { yPercent: 108, duration: 0.95, stagger: 0.1 }, 0.05)
      })
      // the giant word drifts slower than the page: editorial layering, linked to the scroll, never on a loop
      gsap.to(q('[data-ruko]'), { yPercent: -14, ease: 'none', scrollTrigger: { trigger: q('[data-hero]')[0], start: 'top top', end: 'bottom top', scrub: true } })
      // the hook-type strip moves with the scroll, so it stops when the reader stops
      gsap.fromTo(q('[data-strip]'), { xPercent: 0 }, { xPercent: -28, ease: 'none', scrollTrigger: { trigger: q('[data-strip]')[0], start: 'top bottom', end: 'bottom top', scrub: 0.6 } })

      // section entrances, once, each in its own manner
      const once = (el: Element, tl: gsap.core.Timeline) => ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, animation: tl })
      q('[data-rise]').forEach(el => once(el, gsap.timeline({ paused: true }).from(el, { y: 28, autoAlpha: 0, duration: 0.9, ease: 'expo.out' })))
      q('[data-row]').forEach((el, i) => once(el, gsap.timeline({ paused: true }).from(el, { x: -14, autoAlpha: 0, duration: 0.55, ease: 'power3.out', delay: (i % 8) * 0.04 })))
      q('[data-mark]').forEach(el => once(el, gsap.timeline({ paused: true }).from(el, { yPercent: 40, duration: 1.4, ease: 'expo.out' })))

      if (wide) {
        // how it works: each clause takes the page in turn and the card on the left moves one step along
        q('[data-step]').forEach((el, i) => ScrollTrigger.create({ trigger: el, start: 'top 60%', end: 'bottom 60%', onToggle: s => { if (s.isActive) setStep(i) } }))
      }
      if (fine) {
        // the hero reel leans a little toward the pointer: the one surprise under the hand
        const el = q('[data-tilt]')[0]
        if (el && contextSafe) {
          const rx = gsap.quickTo(el, 'rotation', { duration: 0.6, ease: 'power3.out' })
          const ry = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' })
          const move = contextSafe((e: PointerEvent) => { const r = el.getBoundingClientRect(); const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth; const dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight; rx(dx * 5); ry(dy * -14) })
          window.addEventListener('pointermove', move)
          return () => window.removeEventListener('pointermove', move)
        }
      }
    })
    return () => { live = false; split?.revert(); mm.revert() }
  }, { scope: root })

  // the studio index: the preview slides to the row you point at
  useGSAP(() => {
    const p = root.current?.querySelector('[data-preview-stack]')
    if (!p) return
    if (reduced()) gsap.set(p, { yPercent: -100 * hover })
    else gsap.to(p, { yPercent: -100 * hover, duration: 0.55, ease: 'power3.inOut', overwrite: true })
  }, { dependencies: [hover], scope: root })

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' })
  const features = FEATURES(brief)

  return (
    <div ref={root} className="lp font-sans">
      <a href="#main" className="skip lp-btn lp-btn-bone">Skip to content</a>

      {/* navigation: the name, four plain links, one action */}
      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-6 px-6 md:px-12">
          <a href="#top" className="flex items-center gap-2.5" aria-label="SocialAdz, back to top"><Mark size={26} /><span className="serif-i text-[1.5rem] leading-none" translate="no">SocialAdz</span></a>
          <nav aria-label="Sections" className="hidden lg:block">
            <ul className="flex gap-9 text-[0.95rem] text-[color:var(--off)]/80">
              {LINKS.map(([id, l]) => <li key={id}><a href={`#${id}`} onClick={e => { e.preventDefault(); go(id) }} className="lp-nav">{l}</a></li>)}
            </ul>
          </nav>
          <button type="button" onClick={onStart} className="lp-btn lp-btn-line">Open the studio</button>
        </div>
      </header>

      <main id="main">
        {/* hero: one line, a stopped thumb, and the reel it would stop on */}
        <section id="top" data-hero aria-labelledby="hero-title" className="grain relative min-h-[100svh] overflow-hidden bg-[var(--plum)]">
          <span data-ruko aria-hidden="true" lang="hi" className="deva pointer-events-none absolute bottom-[-0.1em] right-[-0.04em] select-none leading-[0.8] text-[var(--s-plum)]" style={{ fontSize: 'clamp(180px, 30vw, 520px)' }}>रुको।</span>

          <div className="relative mx-auto grid max-w-[1440px] gap-14 px-6 pb-20 pt-36 md:px-12 lg:grid-cols-12 lg:gap-6 lg:pb-28 lg:pt-44">
            <div className="lg:col-span-7">
              <h1 id="hero-title" data-title className="serif text-[clamp(40px,6.5vw,112px)] leading-[0.94] text-[var(--off)]">
                <span className="block">Hindi video ads</span>
                <span className="block pl-[0.6em] md:pl-[0.9em]">for your shop.</span>
              </h1>
              <p data-hero-text className="mt-10 max-w-[30rem] text-[1.1875rem] leading-relaxed text-[color:var(--bone)]/85">
                Ready in about ten minutes. Write one line about your offer and add a photo. You get a 15-second Reel with an opening, a Hindi voice, captions and your WhatsApp number.
              </p>
              <div data-hero-text className="mt-10 max-w-[30rem]">
                <label htmlFor="hero-product" className="text-[0.9375rem] text-[var(--champ)]">What do you sell?</label>
                <input id="hero-product" name="product" autoComplete="off" className="lp-field serif-i mt-1 text-[clamp(1.75rem,2.6vw,2.4rem)]" placeholder="Banarasi saree, birthday cake…"
                  value={brief.product} onChange={e => setBrief({ product: e.target.value.slice(0, 40) })} />
                <p className="mt-2 text-[0.875rem] text-[var(--mplum)]">The reel on this page is written from what you type.</p>
              </div>
              <div data-hero-text className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
                <button type="button" onClick={onStart} className="lp-btn lp-btn-orange">Make your first ad <ArrowRight size={18} className="arr" aria-hidden="true" /></button>
                <a href="#how" onClick={e => { e.preventDefault(); go('how') }} className="lp-link text-[1rem]">See how it works</a>
              </div>
            </div>

            <figure className="relative mx-auto w-[min(62vw,300px)] lg:col-span-4 lg:col-start-9 lg:mt-6 lg:w-full lg:max-w-[340px]">
              <div data-tilt className="relative">
                <div data-shutter data-ui style={{ transform: 'rotate(-4deg)' }}>
                  <Reel {...reel} onBeat={setBeat} className="w-full rounded-[4px]" label="A live preview of an ad written from what you type" />
                </div>
              </div>
              <figcaption className="mt-8 flex items-baseline gap-3 text-[0.875rem] text-[var(--champ)]">
                <span className="serif-i shrink-0 whitespace-nowrap text-[1.05rem]">Fig. 1</span>
                <span>Beat {beat} of 5: {beats[beat - 1]?.type}. Fifteen seconds, cut to the voice.</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* transition: the opening types, moving only when the page moves */}
        <div className="overflow-hidden bg-[var(--char)] py-10">
          <p data-strip className="serif-i whitespace-nowrap text-[clamp(2rem,4.4vw,4.2rem)] leading-none text-[var(--champ)]">
            <span className="sr-only">Opening types in the hook library: </span>
            {[...HOOK_TYPES, ...HOOK_TYPES].map((h, i) => <span key={i} className="mr-[0.6em]" aria-hidden={i >= HOOK_TYPES.length}>{h}<span className="ml-[0.6em] not-italic text-[var(--wine)]" aria-hidden="true">/</span></span>)}
          </p>
        </div>

        {/* how it works: the card stays, the clauses pass it */}
        <section id="how" aria-labelledby="how-title" className="bg-[var(--char)]">
          <div className="mx-auto grid max-w-[1440px] gap-16 px-6 py-28 md:px-12 lg:grid-cols-12 lg:gap-6 lg:py-40">
            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-28">
                <h2 id="how-title" data-rise className="serif text-[clamp(44px,5.4vw,92px)] leading-[0.95] text-[var(--off)]">How an ad<br />gets made</h2>
                <div data-rise className="mt-14 hidden lg:block"><AdCard stage={step} brief={brief} /></div>
              </div>
            </div>
            <ol className="lg:col-span-6 lg:col-start-7">
              {STEPS.map((s, i) => (
                <li key={s.t} data-step className="grid grid-cols-[3.2rem_1fr] gap-x-4 pb-24 last:pb-0 lg:min-h-[40vh] lg:pb-0">
                  <span aria-hidden="true" className={`serif-i text-[2.6rem] leading-none transition-colors duration-300 ${step === i ? 'text-[var(--orange)]' : 'text-[var(--champ)]'}`}>{i + 1}</span>
                  <div data-rise>
                    <h3 className="serif text-[clamp(2rem,3.2vw,3.1rem)] leading-[1.02] text-[var(--off)]">{s.t}</h3>
                    <p className="mt-5 max-w-[32rem] text-[1.125rem] leading-relaxed text-[color:var(--bone)]/80">{s.d}</p>
                    <div className="mt-10 lg:hidden"><AdCard stage={i} brief={brief} /></div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* try it: the controls on the left, the reel leaning the other way on a wine block */}
        <section id="try" aria-labelledby="try-title" className="grain bg-[var(--plum)]">
          <div className="mx-auto grid max-w-[1440px] items-start gap-20 px-6 py-28 md:px-12 lg:grid-cols-12 lg:gap-6 lg:py-40">
            <div className="lg:col-span-5">
              <h2 id="try-title" data-rise className="serif text-[clamp(44px,5.4vw,92px)] leading-[0.95] text-[var(--off)]">Try it with<br />your offer</h2>
              <p data-rise className="mt-8 max-w-[28rem] text-[1.125rem] leading-relaxed text-[color:var(--bone)]/80">Every row changes the reel at once. Open it in the studio to make the real ad.</p>
              <div className="mt-14 grid gap-7">
                <Row label="What you sell" htmlFor="try-product"><input id="try-product" name="product" autoComplete="off" className="lp-field text-[1.0625rem]" placeholder="Kurta, cake, phone cover…" value={brief.product} onChange={e => setBrief({ product: e.target.value.slice(0, 40) })} /></Row>
                <Row label="The offer" htmlFor="try-offer"><input id="try-offer" name="offer" autoComplete="off" className="lp-field text-[1.0625rem]" placeholder="Delivery before Diwali…" value={brief.offer} onChange={e => setBrief({ offer: e.target.value.slice(0, 60) })} /></Row>
                <Row label="Voice" htmlFor="try-voice"><select id="try-voice" className="lp-select text-[1.0625rem]" value={brief.voice} onChange={e => setBrief({ voice: e.target.value })}>{VOICES.map(v => <option key={v.id} value={v.id}>{v.name}, {v.tone.toLowerCase()}</option>)}</select></Row>
                <Row label="Video model" htmlFor="try-model"><select id="try-model" className="lp-select text-[1.0625rem]" value={brief.model} onChange={e => setBrief({ model: e.target.value })}>{VIDEO_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Row>
                <Row label="Ends with" htmlFor="try-cta"><select id="try-cta" className="lp-select text-[1.0625rem]" value={brief.cta} onChange={e => setBrief({ cta: e.target.value as Cta })}>{CTAS.map(c => <option key={c}>{c}</option>)}</select></Row>
                <Row label="Festival" htmlFor="try-moment"><select id="try-moment" className="lp-select text-[1.0625rem]" value={brief.moment} onChange={e => setBrief({ moment: e.target.value })}><option value="">None</option>{MOMENTS.slice(0, 5).map(m => <option key={m.id} value={m.id}>{m.name}, in {m.days} days</option>)}</select></Row>
                <div data-row className="flex flex-wrap items-center gap-x-10 gap-y-4">
                  <span className="flex items-center gap-4"><span className="text-[0.9375rem] text-[var(--champ)]">Length</span><Seg label="Length" value={brief.dur} onChange={v => setBrief({ dur: v })} options={[{ v: 15, label: '15 s' }, { v: 30, label: '30 s' }]} /></span>
                  <span className="flex items-center gap-4"><span className="text-[0.9375rem] text-[var(--champ)]">Captions</span><Seg label="Captions" value={brief.captions} onChange={v => setBrief({ captions: v })} options={[{ v: 'lat', label: 'Abc' }, { v: 'dev', label: 'हिंदी' }]} /></span>
                </div>
              </div>
              <button type="button" onClick={onStart} className="lp-btn lp-btn-orange mt-14">Open this in the studio <ArrowRight size={18} className="arr" aria-hidden="true" /></button>
            </div>
            <figure className="relative mx-auto w-[min(76vw,380px)] lg:col-span-5 lg:col-start-8 lg:mt-28 lg:w-full lg:max-w-[400px]">
              <div aria-hidden="true" className="absolute -right-[14%] -top-[8%] h-[86%] w-[92%] bg-[var(--wine)]" />
              <div data-ui className="relative" style={{ transform: 'rotate(3deg)' }}><Reel {...reel} className="w-full rounded-[4px]" label="Preview of your ad" /></div>
              <figcaption className="relative mt-10 text-[0.875rem] text-[var(--champ)]"><span className="serif-i mr-3 text-[1.05rem]">Fig. 2</span>The voice is {voice.name}, {voice.tone.toLowerCase()}.</figcaption>
            </figure>
          </div>
        </section>

        {/* the studio: an index, with the working piece beside the row you point at */}
        <section id="studio" aria-labelledby="studio-title" className="bg-[var(--char)]">
          <div className="mx-auto max-w-[1440px] px-6 py-28 md:px-12 lg:py-40">
            <h2 id="studio-title" data-rise className="serif max-w-[12ch] text-[clamp(44px,5.4vw,92px)] leading-[0.95] text-[var(--off)]">What the studio does</h2>
            <div className="mt-20 grid gap-6 lg:grid-cols-12">
              <ul className="lg:col-span-7">
                {features.map((f, i) => (
                  <li key={f.t} data-row onPointerEnter={() => setHover(i)} className="grid gap-3 border-t rule-champ py-8 last:border-b md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-8">
                    <h3 className="serif text-[clamp(1.75rem,2.6vw,2.6rem)] leading-[1.05]">
                      <button type="button" onFocus={() => setHover(i)} onClick={() => setHover(i)} aria-pressed={hover === i}
                        className={`text-left transition-colors duration-300 ${hover === i ? 'text-[var(--orange)]' : 'text-[var(--off)]'}`}>{f.t}</button>
                    </h3>
                    <p className="max-w-[34rem] text-[1.0625rem] leading-relaxed text-[color:var(--bone)]/80">{f.d}</p>
                    <div data-ui className="mt-2 rounded-[4px] bg-[var(--s-char)] p-5 text-[var(--off)] lg:hidden">{f.frag}</div>
                  </li>
                ))}
              </ul>
              <div className="hidden lg:col-span-4 lg:col-start-9 lg:block">
                <div className="sticky top-28">
                  <div className="h-[340px] overflow-hidden rounded-[4px] bg-[var(--s-char)]" data-ui aria-hidden="true">
                    <div data-preview-stack>
                      {features.map(f => <div key={f.t} className="flex h-[340px] flex-col justify-center p-8 text-[var(--off)]">{f.frag}</div>)}
                    </div>
                  </div>
                  <p className="mt-5 text-[0.875rem] text-[var(--champ)]"><span className="serif-i mr-3 text-[1.05rem]">Fig. 3</span>{features[hover].t}, as it looks in the studio.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* questions: the heading holds its place while the answers pass */}
        <section id="questions" aria-labelledby="q-title" className="grain bg-[var(--plum)]">
          <div className="mx-auto grid max-w-[1440px] gap-14 px-6 py-28 md:px-12 lg:grid-cols-12 lg:gap-6 lg:py-40">
            <div className="lg:col-span-4"><h2 id="q-title" data-rise className="serif-i text-[clamp(56px,8vw,136px)] leading-[0.9] text-[var(--off)] lg:sticky lg:top-28">Questions</h2></div>
            <dl className="lg:col-span-7 lg:col-start-6">
              {FAQ.map(([qn, a]) => (
                <div key={qn} data-row className="border-t rule-champ py-10 first:border-0 first:pt-0">
                  <dt className="serif text-[clamp(1.5rem,2.2vw,2.1rem)] leading-[1.1] text-[var(--off)]">{qn}</dt>
                  <dd className="mt-4 max-w-[38rem] text-[1.125rem] leading-relaxed text-[color:var(--bone)]/80">{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* the close: one field of wine, one sentence, one action */}
        <section aria-labelledby="cta-title" className="bg-[var(--wine)] text-[var(--off)]">
          <div className="mx-auto grid max-w-[1440px] items-end gap-10 px-6 py-28 md:px-12 lg:grid-cols-12 lg:py-36">
            <h2 id="cta-title" data-rise className="serif text-[clamp(40px,7.4vw,132px)] leading-[0.92] lg:col-span-9">Your first ad,<br /><span className="md:pl-[0.9em]">before Dhanteras.</span></h2>
            <div data-rise className="lg:col-span-3">
              <p className="text-[1.125rem] leading-relaxed">Dhanteras is in two days and Diwali in four. One line and one photo is enough to start.</p>
              <button type="button" onClick={onStart} className="lp-btn lp-btn-bone mt-8">Open the studio <ArrowRight size={18} className="arr" aria-hidden="true" /></button>
            </div>
          </div>
        </section>
      </main>

      {/* footer: the name, set large and cropped by the page edge */}
      <footer className="overflow-hidden bg-[var(--char)]">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-6 pt-24 md:px-12 lg:grid-cols-12 lg:gap-6">
          {[
            ['Studio', ['New ad', 'My ads', 'Moments', 'Brand kit']],
            ['On this page', LINKS.map(l => l[1])],
            ['Rules followed', ['ASCI AI labelling, 2026', 'MeitY IT Rules, 2026', 'CCPA advertising rules', 'NMC for clinics']],
          ].map(([h, items]) => (
            <div key={h as string} className="lg:col-span-2">
              <h3 className="text-[0.9375rem] text-[var(--champ)]">{h as string}</h3>
              <ul className="mt-4 grid gap-2.5 text-[0.9375rem] text-[color:var(--bone)]/75">{(items as string[]).map(x => <li key={x}>{x}</li>)}</ul>
            </div>
          ))}
          <div className="text-[1rem] leading-relaxed text-[color:var(--bone)]/80 lg:col-span-4 lg:col-start-9">
            <p>For kirana stores, sweet shops, salons, jewellers, boutiques and every shop that sells on WhatsApp.</p>
            <p className="mt-3 text-[var(--mplum)]">Hindi and Hinglish now. Marathi, Tamil or Gujarati next. Built on Higgsfield and ElevenLabs.</p>
          </div>
        </div>
        <div className="mx-auto mt-16 flex max-w-[1440px] items-center justify-between gap-4 px-6 text-[0.875rem] text-[var(--mplum)] md:px-12">
          <span>© 2026 SocialAdz Studio</span>
          <button type="button" onClick={onStart} className="lp-link">Open the studio</button>
        </div>
        <p aria-hidden="true" className="serif-i mt-6 select-none whitespace-nowrap text-center leading-[0.74] text-[var(--off)]" style={{ fontSize: 'clamp(96px, 21vw, 340px)' }} translate="no"><span data-mark className="inline-block">SocialAdz</span></p>
      </footer>
    </div>
  )
}

function Row({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div data-row className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-end gap-5">
      <label htmlFor={htmlFor} className="pb-2 text-[0.9375rem] text-[var(--champ)]">{label}</label>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

const STEPS = [
  { t: 'First you write one line.', d: 'What you sell and the offer, in your own words, with two or three photos from your phone. Pick the voice and the video model, or leave them on their defaults.' },
  { t: 'Then you pick the opening.', d: 'Six opening lines across different hook types, each with the first frame it will start on. The first two seconds decide whether people keep watching, so you choose.' },
  { t: 'Then we film it and check every shot.', d: 'Your face, product and shop stay the same in every shot. A shot with a changed face or a warped label is filmed again before you see it.' },
  { t: 'Then it goes to WhatsApp.', d: 'Captions, the offer card and an end card with your number, in every size: Reels, Shorts, Status and feed. One tap sends it.' },
]

/* the same ad, further along at each step */
function AdCard({ stage, brief }: { stage: number; brief: Brief }) {
  const rows: [string, string][] = [
    ['What you sell', brief.product || 'Your product'],
    ['Opening', stage >= 1 ? (buildHooks(brief)[0]?.type ?? 'Chosen') : '—'],
    ['Shots checked', stage >= 2 ? '6 of 6' : '—'],
    ['Sizes', stage >= 3 ? '9:16, 1:1, 16:9' : '—'],
  ]
  const status = ['Brief', 'Opening picked', 'Filming', 'Sent to WhatsApp'][stage]
  return (
    <div data-ui className="w-full max-w-[340px] rounded-[4px] bg-[var(--s-char)] p-6 text-[var(--off)]">
      <div className="flex items-baseline justify-between gap-3"><span className="serif-i text-[1.25rem]">New ad, {brief.dur} s</span><span className={`text-[0.875rem] ${stage === 3 ? 'text-[var(--orange)]' : 'text-[var(--champ)]'}`}>{status}</span></div>
      <dl className="mt-5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-t rule-champ py-3 text-[0.9375rem]">
            <dt className="text-[var(--mplum-2)]">{k}</dt><dd className={`min-w-0 truncate text-right ${v === '—' ? 'text-[var(--mplum-2)]' : ''}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 h-[2px] bg-[var(--s-plum)]"><div className="h-full origin-left bg-[var(--orange)] transition-transform duration-500" style={{ transform: `scaleX(${(stage + 1) / 4})` }} /></div>
      {stage === 3 && <div className="mt-4 flex items-center gap-2 text-[0.9375rem] text-[var(--off)]"><Check size={15} className="text-[var(--orange)]" aria-hidden="true" /> Delivered, 15.0 s</div>}
    </div>
  )
}

const FAQ: [string, string][] = [
  ['Do I need to film anything?', 'No. Two or three photos of your product from your phone are enough. If you want your own face in the ad, add ten photos of yourself once.'],
  ['Can I use my own script?', 'Yes. Paste it in. Your words are kept and fitted to 15 or 30 seconds; we only suggest an opening line if yours has none.'],
  ['Which languages?', 'Hindi and Hinglish now, with captions in Hindi script or in English letters. Marathi, Tamil or Gujarati comes next.'],
  ['Does the presenter speak on camera?', 'For now the presenter appears in the shots and the voice plays over them, the way most Reels ads are cut. Lip-synced talking heads come later.'],
  ['Is the ad labelled as AI?', '“Video created using AI” is added whenever a presenter or voice is generated, as India’s 2026 rules require. Customer testimonials are never generated.'],
  ['Where does the ad go?', 'Download every size or send it to WhatsApp in one tap, then post it from your phone or from Meta Ads Manager.'],
]

function FEATURES(b: Brief) {
  const hooks = buildHooks(b)
  return [
    { t: 'Six Hindi voices, or your own', d: 'Delhi, Mumbai, Jaipur, Lucknow, Indore and Bengaluru. Numbers and dates are spoken the way people say them, and brand names stay in English.',
      frag: <ul className="grid gap-4">{VOICES.slice(0, 4).map(v => <li key={v.id} className="flex items-center gap-3 text-[0.9375rem]"><VoiceInitial v={v} size={32} /><span className="min-w-0 flex-1"><span className="font-semibold">{v.name}</span> <span className="text-[var(--mplum-2)]">{v.tone.toLowerCase()}, {v.city}</span></span><Play size={14} className="text-[var(--champ)]" aria-hidden="true" /></li>)}</ul> },
    { t: 'Seven video models', d: 'Wan, Kling, Seedance and Cinema Studio on the Higgsfield API. Pick one for the whole ad, one per shot, or leave it on Auto.',
      frag: <ul className="grid gap-4">{VIDEO_MODELS.slice(0, 5).map(m => <li key={m.id} className="flex items-center justify-between gap-3 text-[0.9375rem]"><span className="font-semibold">{m.name}</span><span className="flex items-center gap-2 text-[var(--mplum-2)]">{m.speedWord} <Meter n={m.speed} of={4} label="Speed" /></span></li>)}</ul> },
    { t: 'Openings written from your offer', d: 'Six opening lines across different hook types. Each shows the first frame and the line the voice will say.',
      frag: <ul className="grid gap-3">{hooks.slice(0, 3).map((h, i) => <li key={h.id} className="border-l-2 pl-4 text-[0.9375rem]" style={{ borderColor: i === 0 ? 'var(--orange)' : 'var(--s-plum)' }}><span className="block text-[var(--champ)]">{h.type}</span><span className="serif text-[1.15rem]">{h.lat}</span></li>)}</ul> },
    { t: "Director's Cut, beat by beat", d: 'Swap a take, film one shot again with another model, re-voice one beat. The rest of the ad stays as it is.',
      frag: <div className="grid gap-2">{['Beats', 'Shots', 'Voice'].map((l, r) => <div key={l} className="grid grid-cols-[52px_1fr] items-center gap-2"><span className="text-[0.75rem] text-[var(--mplum-2)]">{l}</span><div className="relative h-7 rounded-[2px] bg-[var(--s-plum)]">{[0, 16, 37, 68, 85].map((x, k) => <span key={k} className="absolute inset-y-[3px] grid items-center overflow-hidden rounded-[2px] px-1.5 text-[0.6875rem] font-semibold" style={{ left: `${x}%`, width: `${[15, 20, 30, 16, 14][k]}%`, background: r === 0 ? 'var(--bone)' : r === 1 && k === 2 ? 'var(--orange)' : 'color-mix(in srgb, var(--champ) 30%, transparent)', color: 'var(--plum)' }}>{r === 0 ? ['Hook', 'Setup', 'Proof', 'Offer', 'CTA'][k] : r === 1 ? `S${k + 1}` : ''}</span>)}</div></div>)}</div> },
    { t: 'Ready for the calendar', d: 'Each festival opens six weeks ahead with its own angle and a last-48-hours version with a delivery-by line.',
      frag: <table className="w-full text-[0.9375rem]"><tbody>{MOMENTS.slice(0, 5).map(m => <tr key={m.id} className="border-t rule-champ first:border-0"><td className="py-2">{m.name}</td><td className="py-2 text-[var(--mplum-2)]">{m.date.replace(' 2026', '')}</td><td className="num py-2 text-right text-[var(--champ)]">{m.days} days</td></tr>)}</tbody></table> },
    { t: 'Every size, and the rules', d: 'Reels, Shorts, Status, feed and YouTube from one cut, with the AI label and the right disclaimers for your business type.',
      frag: <ul className="grid gap-3 text-[0.9375rem]">{[['Reels, Shorts, Status', '9:16'], ['Feed', '1:1'], ['YouTube', '16:9'], ['AI label', 'On']].map(([a, z]) => <li key={a} className="flex items-center gap-3"><Check size={15} className="text-[var(--orange)]" aria-hidden="true" /><span className="flex-1">{a}</span><span className="num text-[var(--champ)]">{z}</span></li>)}</ul> },
  ]
}
