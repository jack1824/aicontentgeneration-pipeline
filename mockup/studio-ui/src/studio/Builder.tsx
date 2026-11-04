import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, ImagePlus, X, Check, Loader2, MessageCircle, Download, RefreshCw } from 'lucide-react'
import { gsap, useGSAP, reduced } from '@/lib/gsap'
import { buildBeats, buildHooks, buildShots, estimate, aboutMin, VOICES, VIDEO_MODELS, MOMENTS, CTAS, AUTO_PICK, type Step, type Beat } from '@/lib/data'
import { Reel } from '@/ui/Reel'
import { Seg } from '@/ui/Seg'
import { Meter } from '@/ui/Meter'
import { VoiceInitial, VoiceSample, VoicePicker, ModelPicker } from '@/ui/Pickers'
import type { Ctx } from './Studio'

const modelOf = (id: string) => VIDEO_MODELS.find(m => m.id === id) ?? VIDEO_MODELS[0]
const modelName = (id: string) => modelOf(id).name

const STEPS: { s: Step; l: string }[] = [{ s: 'brief', l: 'Brief' }, { s: 'openings', l: 'Opening' }, { s: 'making', l: 'Making' }, { s: 'result', l: 'Your ad' }]

export default function Builder({ c, step }: { c: Ctx; step: Step }) {
  const b = c.brief
  const hooks = useMemo(() => buildHooks(b), [b])
  const hook = hooks.find(h => h.id === c.hook) ?? (step === 'brief' ? undefined : hooks[0])
  const beats = buildBeats(b, hook)
  const shots = buildShots(b)
  const est = estimate(b)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState<null | string>(null)
  const [missing, setMissing] = useState(false)
  const [done, setDone] = useState(step === 'result')
  const [t, setT] = useState(0)
  const productRef = useRef<HTMLInputElement>(null)
  const idx = STEPS.findIndex(x => x.s === step)
  const voice = VOICES.find(v => v.id === b.voice) ?? VOICES[0]
  const sampleLine = b.product.trim() ? `${b.product.trim()}, अब आपकी दुकान पर।` : 'आपका विज्ञापन इसी आवाज़ में बनेगा।'

  const next = () => {
    if (step === 'brief') {
      if (!b.product.trim()) { setMissing(true); productRef.current?.focus(); return }
      if (!c.hook) c.setHook(hooks[0].id)
      c.go('openings')
    } else if (step === 'openings') c.go('making')
    else if (step === 'making') { c.addAd({ id: 'ad-' + b.product, name: b.product, dur: b.dur, voice: voice.name, model: modelName(b.model), at: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date()) }); c.go('result') }
  }
  const primary = { brief: 'Write my openings', openings: 'Make this ad', making: done ? 'Watch your ad' : 'Making…', result: 'Send to WhatsApp' }[step]
  const reelProps = { beats, hookCard: hook?.card, photos: b.photos.map(p => p.src), offer: b.offer.trim(), endName: b.product || 'Your shop', endLine: `${b.cta}${b.contact ? ' ' + b.contact : ''}`, script: b.captions }

  return (
    <div className="flex min-h-[100svh] flex-col">
      {/* 44px top bar on the window ground, no rule */}
      <header className="flex min-h-[52px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-1.5">
        <button type="button" className="btn btn-quiet" onClick={() => c.go('ads')} aria-label="Back to My ads"><ArrowLeft size={16} aria-hidden="true" /></button>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[1rem] font-semibold">{b.product.trim() ? `${b.product.trim()} ad` : 'New ad'}</h1>
          <span className={`pill ${step === 'result' ? 'pill-pos' : ''}`}>{['Brief', 'Choosing opening', done ? 'Ready' : 'Making', 'Ready'][idx]}</span>
        </div>
        <nav aria-label="Steps" className="order-3 flex w-full gap-1 overflow-x-auto md:order-none md:mx-auto md:w-auto">
          {STEPS.map((x, i) => (
            <button type="button" key={x.s} disabled={i > idx} onClick={() => c.go(x.s)} aria-current={i === idx ? 'step' : undefined}
              className={`relative h-9 shrink-0 px-3 text-[0.875rem] font-semibold ${i === idx ? 'text-ink' : i < idx ? 'text-text-2 hover:text-ink' : 'text-text-2 font-normal'}`}>
              {x.l}{i === idx && <span className="absolute inset-x-3 bottom-0 h-[2px] bg-ink" />}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Seg label="Interface" value={c.mode} onChange={c.setMode} options={[{ v: 'simple', label: 'Simple' }, { v: 'advanced', label: 'Advanced' }]} />
          <button type="button" className="btn btn-ink btn-sm" disabled={step === 'making' && !done} onClick={step === 'result' ? () => c.toast(`Opening WhatsApp with your ${b.dur}-second ad`) : next}>
            {step === 'result' && <MessageCircle size={15} aria-hidden="true" />}{primary}
          </button>
        </div>
      </header>

      <div className="grid flex-1 gap-3 px-2 pb-2 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-[16px] border border-line bg-sheet lg:max-h-[calc(100svh-68px)] lg:overflow-y-auto" aria-label={`${STEPS[idx].l} controls`}>
          {step === 'brief' && <BriefPanel c={c} missing={missing} productRef={productRef} onVoice={() => setVoiceOpen(true)} onModel={() => setModelOpen('all')} est={est} />}
          {step === 'openings' && <OpeningsPanel c={c} hooks={hooks} chosen={hook?.id ?? ''} />}
          {step === 'making' && <MakingPanel c={c} onDone={() => setDone(true)} total={shots.length} />}
          {step === 'result' && <ResultPanel c={c} onVoice={() => setVoiceOpen(true)} onModel={() => setModelOpen('all')} est={est} />}
        </aside>

        <section aria-label="Canvas" className="min-w-0 rounded-[16px] border border-line bg-well p-4 md:p-6">
          {step === 'making'
            ? <ShotGrid c={c} />
            : (
              <div className="grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className="mx-auto w-full max-w-[300px] xl:sticky xl:top-4">
                  <Reel {...reelProps} className="w-full" label="Preview of your ad" playing={step !== 'brief' || !!b.product} onTime={step === 'result' ? (x: number) => setT(x) : undefined} />
                  <p className="mt-3 text-center text-[0.8125rem] text-text-2">{b.photos.length ? `${b.photos.length} photo${b.photos.length > 1 ? 's' : ''} in use` : 'Add photos and they replace the plain frames'}</p>
                </div>
                {step === 'result' && c.mode === 'advanced' ? <DirectorsCut c={c} beats={beats} t={t} onModel={id => setModelOpen(id)} /> : <Spine beats={beats} dur={b.dur} empty={!b.product.trim()} />}
              </div>
            )}
        </section>
      </div>

      <VoicePicker open={voiceOpen} onOpenChange={setVoiceOpen} value={b.voice} mode={c.mode} line={sampleLine}
        onChange={id => { c.setBrief({ voice: id }); setVoiceOpen(false); if (step === 'result') c.toast(`Re-voicing with ${VOICES.find(v => v.id === id)?.name ?? 'the new voice'}. About a minute, no re-shoot.`) }} />
      <ModelPicker open={modelOpen !== null} onOpenChange={o => { if (!o) setModelOpen(null) }} mode={c.mode}
        title={modelOpen && modelOpen !== 'all' ? `Re-shoot ${modelOpen} with` : step === 'result' ? 'Re-shoot the ad with' : 'Choose the video model'}
        value={modelOpen && modelOpen !== 'all' ? (c.shotModels[modelOpen] ?? b.model) : b.model}
        onChange={id => {
          const nm = modelName(id)
          if (modelOpen && modelOpen !== 'all') { c.setShotModel(modelOpen, id); c.toast(`Re-shooting ${modelOpen} with ${nm}`) }
          else { c.setBrief({ model: id }); if (step === 'result') c.toast(`Re-shooting with ${nm}. The voice and captions stay.`) }
          setModelOpen(null)
        }} />
    </div>
  )
}

/* ---------------- left panels ---------------- */

function Group({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="border-t border-line px-5 py-5 first:border-0">
      <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
      {hint && <p className="fhint mt-0.5">{hint}</p>}
      <div className="mt-3 grid gap-4">{children}</div>
    </div>
  )
}

function BriefPanel({ c, missing, productRef, onVoice, onModel, est }: { c: Ctx; missing: boolean; productRef: React.RefObject<HTMLInputElement | null>; onVoice: () => void; onModel: () => void; est: ReturnType<typeof estimate> }) {
  const b = c.brief
  const file = useRef<HTMLInputElement>(null)
  const voice = VOICES.find(v => v.id === b.voice) ?? VOICES[0]
  const model = VIDEO_MODELS.find(m => m.id === b.model) ?? VIDEO_MODELS[0]
  const add = (files: FileList | null) => {
    if (!files) return
    Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 5 - b.photos.length).forEach(f => {
      const r = new FileReader()
      r.onload = () => c.setBrief({ photos: [...c.brief.photos, { id: crypto.randomUUID(), src: String(r.result), name: f.name }] })
      r.readAsDataURL(f)
    })
  }
  return (
    <div>
      <Group title="What are you selling?">
        <div>
          <label className="flabel" htmlFor="b-product">Product or service</label>
          <input ref={productRef} id="b-product" name="product" autoComplete="off" className="field" placeholder="Kurta, birthday cake, phone repair…" value={b.product}
            aria-invalid={missing && !b.product.trim()} aria-describedby={missing && !b.product.trim() ? 'b-product-err' : undefined} onChange={e => c.setBrief({ product: e.target.value.slice(0, 40) })} />
          {missing && !b.product.trim() && <p id="b-product-err" className="mt-1.5 text-[0.8125rem] font-semibold text-[var(--negative)]">Add what you are selling, then write the openings.</p>}
        </div>
        <div>
          <label className="flabel" htmlFor="b-offer">The offer <span className="font-normal text-text-2">(optional)</span></label>
          <input id="b-offer" name="offer" autoComplete="off" className="field" placeholder="Delivery before Diwali, new colours in…" value={b.offer} onChange={e => c.setBrief({ offer: e.target.value.slice(0, 60) })} />
        </div>
      </Group>

      <Group title="Photos" hint="Product, shop or you. Up to 5.">
        <div className="grid grid-cols-4 gap-2">
          {b.photos.map(p => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-[8px] bg-well">
              <img src={p.src} alt={p.name} width={80} height={80} className="h-full w-full object-cover" />
              <button type="button" onClick={() => c.setBrief({ photos: b.photos.filter(x => x.id !== p.id) })} aria-label={`Remove ${p.name}`}
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink/70 text-white"><X size={12} aria-hidden="true" /></button>
            </div>
          ))}
          {b.photos.length < 5 && (
            <button type="button" onClick={() => file.current?.click()} className="grid aspect-square place-items-center rounded-[8px] border border-dashed border-control text-text-2 hover:border-ink hover:text-ink"
              onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); add(e.dataTransfer.files) }} aria-label="Add photos">
              <ImagePlus size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={e => add(e.target.files)} />
        {b.photos.length === 0 && <p className="fhint -mt-2">No photos yet. The plain frames in the preview are where they will go.</p>}
      </Group>

      <Group title="Voice">
        <div className="flex items-center gap-3">
          <VoiceInitial v={voice} />
          <div className="min-w-0 flex-1"><div className="font-semibold">{voice.name}</div><div className="truncate text-text-2">{voice.tone}, {voice.city}</div></div>
          <button type="button" className="btn btn-line btn-sm" onClick={onVoice}>Change</button>
        </div>
      </Group>

      <Group title="Video model">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-[0.8rem] font-extrabold ${model.id === 'auto' ? 'bg-accent text-white' : 'bg-well'}`}>{model.mono}</span>
          <div className="min-w-0 flex-1"><div className="font-semibold">{model.name}</div><div className="flex items-center gap-2 text-text-2">{model.speedWord} <Meter n={model.speed} of={4} label="Speed" /></div></div>
          <button type="button" className="btn btn-line btn-sm" onClick={onModel}>Change</button>
        </div>
      </Group>

      <Group title="Length and language">
        <div className="flex flex-wrap gap-2">
          <Seg label="Length" value={b.dur} onChange={v => c.setBrief({ dur: v })} options={[{ v: 15, label: '15 s' }, { v: 30, label: '30 s' }]} />
          <Seg label="Language" value={b.lang} onChange={v => c.setBrief({ lang: v })} options={[{ v: 'Hinglish', label: 'Hinglish' }, { v: 'Hindi', label: 'हिंदी' }]} />
        </div>
        <div className="flex items-center justify-between gap-3"><span className="text-[0.875rem] font-semibold">Captions</span><Seg label="Captions" value={b.captions} onChange={v => c.setBrief({ captions: v })} options={[{ v: 'lat', label: 'Abc' }, { v: 'dev', label: 'हिंदी' }]} /></div>
      </Group>

      <Group title="How should people reach you?">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Ending">
          {CTAS.map(x => (
            <button type="button" role="radio" key={x} aria-checked={b.cta === x} onClick={() => c.setBrief({ cta: x })} className="pick min-h-[40px] px-3 text-[0.875rem] font-semibold">{x}</button>
          ))}
        </div>
        {(b.cta === 'WhatsApp' || b.cta === 'Call') && (
          <div><label className="flabel" htmlFor="b-contact">Number</label><input id="b-contact" name="tel" type="tel" inputMode="tel" autoComplete="tel" className="field num" placeholder="98765 43210" value={b.contact} onChange={e => c.setBrief({ contact: e.target.value.replace(/[^0-9 +]/g, '').slice(0, 14) })} /></div>
        )}
      </Group>

      <Group title="Festival">
        <div><label className="flabel sr-only" htmlFor="b-moment">Festival</label>
          <select id="b-moment" className="field" value={b.moment} onChange={e => c.setBrief({ moment: e.target.value })}>
            <option value="">No festival</option>
            {MOMENTS.map(m => <option key={m.id} value={m.id}>{m.name}, in {m.days} days</option>)}
          </select>
        </div>
      </Group>

      {c.mode === 'advanced' && (
        <Group title="Production" hint="Advanced">
          <div className="flex flex-wrap gap-2">
            <Seg label="Quality" value={b.preset} onChange={v => c.setBrief({ preset: v })} options={[{ v: 'draft', label: 'Draft' }, { v: 'standard', label: 'Standard' }, { v: 'master', label: 'Master' }]} />
            <Seg label="Presenter" value={b.presenter} onChange={v => c.setBrief({ presenter: v })} options={[{ v: 'none', label: 'No one' }, { v: 'ai', label: 'AI actor' }, { v: 'me', label: 'My face' }]} />
          </div>
          <table className="w-full text-[0.8125rem]">
            <thead><tr className="text-left text-text-2"><th className="pb-1.5 font-semibold">Step</th><th className="num pb-1.5 text-right font-semibold">Time</th></tr></thead>
            <tbody>
              {est.rows.map(r => <tr key={r.step} className="border-t border-line align-top"><td className="py-1.5"><span className="block">{r.step}</span><span className="text-text-2">{r.model}</span></td><td className="num py-1.5 text-right">{r.s} s</td></tr>)}
              <tr className="border-t border-ink font-semibold"><td className="py-1.5">This ad</td><td className="num py-1.5 text-right">{aboutMin(est.secs)}</td></tr>
            </tbody>
          </table>
        </Group>
      )}
      <p className="border-t border-line px-5 py-4 text-[0.8125rem] text-text-2">Ready {aboutMin(est.secs)} after you pick an opening.</p>
    </div>
  )
}

function OpeningsPanel({ c, hooks, chosen }: { c: Ctx; hooks: ReturnType<typeof buildHooks>; chosen: string }) {
  const [own, setOwn] = useState('')
  return (
    <div>
      <Group title="Pick the opening" hint="The first two seconds decide whether people keep watching.">
        <div className="grid gap-2" role="radiogroup" aria-label="Openings">
          {hooks.map(h => (
            <div key={h.id} role="radio" tabIndex={0} aria-checked={chosen === h.id} onClick={() => c.setHook(h.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.setHook(h.id) } }} className="pick cursor-pointer p-3">
              <div className="flex items-center justify-between gap-2"><span className="text-[0.8125rem] text-text-2">{h.type}</span>{c.mode === 'advanced' && <Meter n={h.score} of={5} label="Score" />}</div>
              <p className="mt-1 text-[0.9375rem] font-semibold">{h.lat}</p>
              <p className="hi text-[0.875rem] text-text-2" lang="hi">{h.dev}</p>
              {c.mode === 'advanced' && <p className="mt-1.5 text-[0.8125rem] text-text-2">{h.why}</p>}
            </div>
          ))}
        </div>
      </Group>
      <Group title="Or write your own">
        <div className="flex gap-2">
          <label htmlFor="own-hook" className="sr-only">Your opening line</label>
          <input id="own-hook" className="field" placeholder="Up to eight words…" value={own} onChange={e => setOwn(e.target.value.slice(0, 60))} autoComplete="off" />
          <button type="button" className="btn btn-line btn-sm" onClick={() => c.toast(own.trim() ? 'Your line is set as the opening' : 'Write a line first')}>Use</button>
        </div>
      </Group>
    </div>
  )
}

function MakingPanel({ c, onDone, total }: { c: Ctx; onDone: () => void; total: number }) {
  const voice = VOICES.find(v => v.id === c.brief.voice) ?? VOICES[0]
  const [p, setP] = useState(0)
  useGSAP(() => {
    const o = { v: 0 }
    gsap.to(o, { v: 1, duration: reduced() ? 0.6 : 10, ease: 'none', onUpdate: () => setP(o.v), onComplete: onDone })
  }, [])
  const stages = [
    { t: `${voice.name} records the voice`, d: 'Five beats, measured to a tenth of a second', at: 0.12 },
    { t: 'Pictures for each shot', d: 'Your face, product and shop kept the same', at: 0.3 },
    { t: `Filming ${total} shots`, d: 'All shots at once', at: 0.75 },
    { t: 'Checking each shot', d: 'A changed face or a warped label is re-shot', at: 0.88 },
    { t: 'Cutting to the voice', d: 'Captions, offer card, end card, every size', at: 1 },
  ]
  return (
    <Group title={p >= 1 ? 'Your ad is ready' : `About ${Math.max(1, Math.round((1 - p) * 6))} min left`} hint="You can leave this page. The ad is also sent to your WhatsApp.">
      <div className="h-1.5 overflow-hidden rounded-full bg-well" role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress"><div className="h-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${p})` }} /></div>
      <ol className="grid gap-0">
        {stages.map((s, i) => {
          const prev = i ? stages[i - 1].at : 0
          const st = p >= s.at ? 'done' : p >= prev ? 'now' : 'wait'
          return (
            <li key={s.t} className="flex items-start gap-3 border-t border-line py-3 first:border-0">
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${st === 'done' ? 'bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)]' : st === 'now' ? 'bg-ink text-white' : 'bg-well text-text-2'}`}>
                {st === 'done' ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : st === 'now' ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              <span className="min-w-0"><span className={`block font-semibold ${st === 'wait' ? 'text-text-2' : ''}`}>{s.t}</span><span className="text-text-2">{s.d}</span></span>
            </li>
          )
        })}
      </ol>
    </Group>
  )
}

function ResultPanel({ c, onVoice, onModel, est }: { c: Ctx; onVoice: () => void; onModel: () => void; est: ReturnType<typeof estimate> }) {
  const b = c.brief
  const [sizes, setSizes] = useState(['reels', 'feed'])
  const [music, setMusic] = useState('Festive')
  const voice = VOICES.find(v => v.id === b.voice) ?? VOICES[0]
  const model = VIDEO_MODELS.find(m => m.id === b.model) ?? VIDEO_MODELS[0]
  const SIZES = [['reels', 'Reels, Shorts, Status', '9:16'], ['feed', 'Instagram and Facebook feed', '1:1'], ['yt', 'YouTube', '16:9'], ['bumper', 'Six-second bumper', '9:16']]
  return (
    <div>
      <Group title="Send or save">
        <button type="button" className="btn btn-ink w-full" onClick={() => c.toast('Opening WhatsApp. The file is under 16 MB.')}><MessageCircle size={16} aria-hidden="true" /> Send to WhatsApp</button>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-[0.875rem] font-semibold">Sizes to download</legend>
          {SIZES.map(([k, t, r]) => (
            <label key={k} className="flex cursor-pointer items-center gap-3 rounded-[8px] py-1.5">
              <input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={sizes.includes(k)} onChange={e => setSizes(x => (e.target.checked ? [...x, k] : x.filter(y => y !== k)))} />
              <span className="flex-1">{t}</span><span className="num text-text-2">{r}</span>
            </label>
          ))}
        </fieldset>
        <button type="button" className="btn btn-line w-full" disabled={!sizes.length} onClick={() => c.toast(`Downloading ${sizes.length} ${sizes.length === 1 ? 'size' : 'sizes'}`)}><Download size={16} aria-hidden="true" /> Download {sizes.length} {sizes.length === 1 ? 'size' : 'sizes'}</button>
      </Group>
      <Group title="Change something">
        {[
          ['Opening', c.hook ? buildHooks(b).find(h => h.id === c.hook)?.type ?? 'First choice' : 'First choice', () => c.go('openings')],
          ['Voice', `${voice.name}, ${voice.tone.toLowerCase()}`, onVoice],
          ['Video model', model.name, onModel],
        ].map(([k, v, on]) => (
          <div key={k as string} className="flex items-center gap-3">
            <div className="min-w-0 flex-1"><div className="font-semibold">{k as string}</div><div className="truncate text-text-2">{v as string}</div></div>
            <button type="button" className="btn btn-line btn-sm" onClick={on as () => void}>Change</button>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3"><span className="font-semibold">Music</span><Seg label="Music" value={music} onChange={v => { setMusic(v); c.toast('Music changed. No re-shoot needed.') }} options={['Festive', 'Calm', 'Upbeat'].map(v => ({ v, label: v }))} /></div>
      </Group>
      {c.mode === 'advanced' ? (
        <Group title="How it was made" hint="Advanced">
          <table className="w-full text-[0.8125rem]"><tbody>
            {est.rows.map(r => <tr key={r.step} className="border-t border-line first:border-0"><td className="py-1.5"><span className="block">{r.step}</span><span className="text-text-2">{r.model}</span></td><td className="num py-1.5 text-right">{r.s} s</td></tr>)}
          </tbody></table>
        </Group>
      ) : <p className="border-t border-line px-5 py-4 text-[0.8125rem] text-text-2">Switch to Advanced in the top bar to edit shot by shot.</p>}
    </div>
  )
}

/* ---------------- canvas ---------------- */

function Spine({ beats, dur, empty }: { beats: Beat[]; dur: number; empty: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between"><h2 className="text-[1rem] font-semibold">The {dur} seconds</h2><span className="num text-text-2">{beats.reduce((a, b) => a + b.sec, 0).toFixed(1)} s</span></div>
      <ol className="mt-4 grid gap-0">
        {beats.map((b, i) => (
          <li key={b.n} className="relative pb-4 pl-6 last:pb-0">
            {i < beats.length - 1 && <span className="absolute bottom-0 left-[7px] top-4 w-px bg-control" aria-hidden="true" />}
            <span className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-ink bg-sheet" aria-hidden="true" />
            <div className="rounded-[12px] border border-line bg-sheet p-4">
              <div className="flex items-baseline justify-between gap-3"><span className="text-[1rem] font-semibold">{b.type}</span><span className="num text-text-2">{b.sec.toFixed(1)} s</span></div>
              <p className={`mt-1 text-[1rem] ${empty ? 'text-text-2' : ''}`}>{b.lat}</p>
              <p className="hi text-[0.9375rem] text-text-2" lang="hi">{b.dev}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ShotGrid({ c }: { c: Ctx }) {
  const b = c.brief
  const shots = buildShots(b)
  const root = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    if (reduced()) return
    const tiles = gsap.utils.toArray<HTMLElement>('[data-tile]')
    gsap.from(tiles, { y: 16, autoAlpha: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out' })
    tiles.forEach((t, i) => {
      const img = t.querySelector('[data-dev]')
      gsap.fromTo(img, { filter: 'blur(8px) saturate(0)', scale: 1.08 }, { filter: 'blur(0px) saturate(1)', scale: 1, duration: 0.9, ease: 'power2.out', delay: 3.2 + i * (6 / shots.length) })
      gsap.set(t.querySelector('[data-state="filming"]'), { autoAlpha: 1 })
      gsap.to(t.querySelector('[data-state="filming"]'), { autoAlpha: 0, duration: 0.2, delay: 3.2 + i * (6 / shots.length) })
      gsap.fromTo(t.querySelector('[data-state="checked"]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, delay: 3.3 + i * (6 / shots.length) })
    })
  }, { scope: root })
  return (
    <div ref={root}>
      <h2 className="text-[1rem] font-semibold">Shots</h2>
      <p className="text-text-2">Each one is checked against your photos before it goes in the ad.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {shots.map((s, i) => {
          const mid = c.shotModels[s.id] ?? (b.model === 'auto' ? AUTO_PICK[s.kind] : b.model)
          const m = modelOf(mid)
          const src = b.photos.length ? b.photos[i % b.photos.length].src : null
          return (
            <figure key={s.id} data-tile className="min-w-0">
              <div className="relative aspect-[9/16] overflow-hidden rounded-[12px]" style={{ background: ['#0b0c0e', '#1f2de6', '#2b2e35'][i % 3] }}>
                <div data-dev className="absolute inset-0">{src && <img src={src} alt="" width={180} height={320} className="h-full w-full object-cover" />}</div>
                <span className="absolute left-2 top-2 rounded-[4px] bg-black/55 px-1.5 text-[0.75rem] font-semibold text-white">{s.id}</span>
                <span data-state="filming" className="pill absolute bottom-2 left-2 bg-black/55 text-white">Filming</span>
                <span data-state="checked" className="pill pill-pos absolute bottom-2 left-2 opacity-0"><Check size={11} strokeWidth={3} aria-hidden="true" /> Checked</span>
              </div>
              <figcaption className="mt-2"><span className="block font-semibold">{s.kind}</span><span className="block truncate text-text-2">{s.what}</span>
                {c.mode === 'advanced' && <span className="num block text-[0.8125rem] text-text-2">{m.name}, {Math.round(m.secPerShot / 6) / 10} min</span>}</figcaption>
            </figure>
          )
        })}
      </div>
    </div>
  )
}

function DirectorsCut({ c, beats, t, onModel }: { c: Ctx; beats: Beat[]; t: number; onModel: (id: string) => void }) {
  const b = c.brief
  const shots = buildShots(b)
  const [sel, setSel] = useState(shots[1].id)
  const [note, setNote] = useState('')
  const total = beats.reduce((a, x) => a + x.sec, 0)
  const pct = (x: number) => `${(x / total) * 100}%`
  const shot = shots.find(s => s.id === sel) ?? shots[0]
  const mid = c.shotModels[sel] ?? (b.model === 'auto' ? AUTO_PICK[shot.kind] : b.model)
  const m = modelOf(mid)
  // shots inherit their beat's span, split evenly inside it
  const spans = shots.map(s => {
    const bt = beats.find(x => x.n === s.beat) ?? beats[0]
    const same = shots.filter(x => x.beat === s.beat)
    const start = beats.filter(x => x.n < s.beat).reduce((a, x) => a + x.sec, 0) + (bt.sec / same.length) * same.indexOf(s)
    return { s, start, len: bt.sec / same.length }
  })
  let at = 0
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between"><h2 className="text-[1rem] font-semibold">Director's Cut</h2><span className="text-text-2">Advanced</span></div>
      <div className="mt-4 overflow-x-auto rounded-[12px] border border-line bg-sheet p-4">
        <div className="relative grid min-w-[560px] gap-1.5">
          <span aria-hidden="true" className="pointer-events-none absolute bottom-0 top-0 z-10 w-[2px] bg-accent" style={{ left: `calc(72px + (100% - 72px) * ${Math.min(t, total) / total})` }} />
          <Lane label="Beats">{beats.map(x => { const el = <span key={x.n} className="blk bg-ink text-white" style={{ left: pct(at), width: `calc(${pct(x.sec)} - 3px)` }}>{x.type}</span>; at += x.sec; return el })}</Lane>
          <Lane label="Shots">{spans.map(({ s, start, len }) => (
            <button type="button" key={s.id} aria-pressed={sel === s.id} onClick={() => setSel(s.id)} className="blk" style={{ left: pct(start), width: `calc(${pct(len)} - 3px)`, background: sel === s.id ? 'var(--accent)' : 'var(--control)', color: sel === s.id ? '#fff' : 'var(--ink)' }}>{s.id}</button>
          ))}</Lane>
          <Lane label="Captions">{(() => { let a = 0; return beats.map(x => { const el = <span key={x.n} className="blk bg-well text-ink" style={{ left: pct(a), width: `calc(${pct(x.sec)} - 3px)` }}>{x.lat}</span>; a += x.sec; return el }) })()}</Lane>
          <Lane label="Music"><span className="blk bg-well text-text-2" style={{ left: 0, right: 0 }}>Music, lowered under the voice</span></Lane>
        </div>
      </div>
      <div className="mt-3 rounded-[12px] border border-line bg-sheet p-4">
        <div className="flex flex-wrap items-baseline gap-x-3"><h3 className="text-[1rem] font-semibold">{shot.id}, {shot.kind}</h3><span className="text-text-2">{shot.what}</span></div>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[8px] bg-well p-3">
          <span className="min-w-0 flex-1"><span className="block text-text-2">Model for this shot</span><span className="font-semibold">{m.name}</span> <span className="text-text-2">{m.res}, {m.speedWord.toLowerCase()}</span></span>
          <button type="button" className="btn btn-line btn-sm" onClick={() => onModel(sel)}>Change model</button>
        </div>
        <div className="mt-3 flex items-center gap-3 border-t border-line pt-3"><span className="font-semibold">Take 1</span><span className="pill pill-pos">Passed check</span><span className="ml-auto text-text-2">In the ad</span></div>
        <div className="mt-3 flex gap-2">
          <label htmlFor="reshoot" className="sr-only">What should change</label>
          <input id="reshoot" className="field" value={note} onChange={e => setNote(e.target.value)} placeholder="What should change? Keep the label straight…" autoComplete="off" />
          <button type="button" className="btn btn-ink btn-sm" onClick={() => { c.toast(`Re-shooting ${sel} with ${m.name}`); setNote('') }}><RefreshCw size={14} aria-hidden="true" /> Re-shoot</button>
        </div>
      </div>
      <div className="mt-3 rounded-[12px] border border-line bg-sheet p-4">
        <h3 className="text-[1rem] font-semibold">Voice by beat</h3>
        <ul className="mt-2">
          {beats.map(x => <li key={x.n} className="grid gap-x-3 border-t border-line py-2 first:border-0 sm:grid-cols-[64px_minmax(0,1fr)_auto]"><span className="font-semibold">{x.type}</span><span className="hi min-w-0 truncate" lang="hi">{x.dev}</span><span className="num text-text-2">{x.sec.toFixed(1)} s</span></li>)}
        </ul>
        <div className="mt-2"><VoiceSample v={VOICES.find(v => v.id === b.voice) ?? VOICES[0]} line={beats[0].dev} /></div>
      </div>
    </div>
  )
}

function Lane({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2"><span className="text-[0.75rem] font-semibold text-text-2">{label}</span><div className="lane">{children}</div></div>
}
