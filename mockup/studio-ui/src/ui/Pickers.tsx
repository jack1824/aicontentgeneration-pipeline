import { useLayoutEffect, useRef, useState } from 'react'
import { Check, Play, Square, Mic } from 'lucide-react'
import { gsap, useGSAP, Flip, reduced } from '@/lib/gsap'
import { VOICES, VIDEO_MODELS, type Voice, type VideoModel, type Mode } from '@/lib/data'
import { Sheet } from './Sheet'
import { Seg } from './Seg'
import { Meter } from './Meter'

export function VoiceInitial({ v, size = 36 }: { v: Voice; size?: number }) {
  return <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full font-extrabold text-ink" style={{ width: size, height: size, background: v.tint, fontSize: size * 0.42 }}>{v.name[0]}</span>
}

/* A silent sample: the line lights word by word and a level meter moves. The studio plays the real ElevenLabs voice. */
export function VoiceSample({ v, line }: { v: Voice; line: string }) {
  const [on, setOn] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    const words = root.current?.querySelectorAll('.w')
    const lv = root.current?.querySelectorAll('[data-lv]')
    if (!words || !lv) return
    if (on && !reduced()) {
      const tl = gsap.timeline({ onComplete: () => setOn(false) })
      words.forEach((w, i) => tl.to(w, { opacity: 1, duration: 0.06 }, i * 0.3))
      tl.to(lv, { scaleY: () => gsap.utils.random(0.3, 1), duration: 0.14, repeat: Math.ceil((words.length * 0.3) / 0.14), yoyo: true, repeatRefresh: true, stagger: 0.02, ease: 'sine.inOut' }, 0)
    } else { gsap.set(words, { opacity: on ? 1 : 0.5 }); gsap.set(lv, { scaleY: 0.35 }); if (on) setTimeout(() => setOn(false), 600) }
  }, { dependencies: [on, line], scope: root, revertOnUpdate: true })
  return (
    <div ref={root} className="flex min-w-0 items-center gap-3">
      <button type="button" onClick={e => { e.stopPropagation(); setOn(o => !o) }} className="btn btn-line btn-sm w-9 shrink-0 px-0" aria-label={on ? `Stop ${v.name}'s sample` : `Play ${v.name}'s sample`}>
        {on ? <Square size={13} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
      </button>
      <span className="flex h-5 shrink-0 items-center gap-[2px]" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i} data-lv className="h-full w-[3px] origin-center rounded-full bg-ink" style={{ transform: 'scaleY(.35)' }} />)}</span>
      <span className="hi min-w-0 truncate text-[0.95rem]" lang="hi">{line.split(' ').map((w, i) => <span key={i} className="w" style={{ opacity: 0.5 }}>{w} </span>)}</span>
    </div>
  )
}

export function VoicePicker({ open, onOpenChange, value, onChange, mode, line }:
  { open: boolean; onOpenChange: (o: boolean) => void; value: string; onChange: (id: string) => void; mode: Mode; line: string }) {
  const [g, setG] = useState<'All' | 'Female' | 'Male'>('All')
  const list = useRef<HTMLDivElement>(null)
  const state = useRef<Flip.FlipState | null>(null)
  const shown = VOICES.filter(v => g === 'All' || v.gender === g)
  const filter = (x: typeof g) => { if (list.current) state.current = Flip.getState(list.current.children); setG(x) }
  useLayoutEffect(() => {
    if (!state.current) return
    if (!reduced()) Flip.from(state.current, { duration: 0.4, ease: 'power3.inOut', absolute: true, onEnter: els => gsap.fromTo(els, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3 }), onLeave: els => gsap.to(els, { opacity: 0, duration: 0.15 }) })
    state.current = null
  }, [g])
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Choose the voice" description="Each voice reads Hindi and Hinglish, says numbers and dates the way people say them, and keeps brand names in English.">
      <div className="mb-4"><Seg label="Filter voices" value={g} onChange={filter} options={[{ v: 'All', label: 'All' }, { v: 'Female', label: 'Female' }, { v: 'Male', label: 'Male' }]} /></div>
      <div ref={list} className="grid gap-2" role="radiogroup" aria-label="Voice">
        {shown.map(v => (
          <div key={v.id} role="radio" tabIndex={0} aria-checked={value === v.id} onClick={() => onChange(v.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(v.id) } }} className="pick cursor-pointer p-4">
            <div className="flex items-center gap-3">
              <VoiceInitial v={v} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2"><span className="font-semibold">{v.name}</span><span className="text-[0.85rem] text-text-2">{v.gender}, {v.age}, {v.city}</span></div>
                <div className="text-[0.875rem] text-text-2">{v.tone}. Suits {v.good}.</div>
              </div>
              {value === v.id && <Check size={18} className="text-accent" aria-hidden="true" />}
            </div>
            <div className="mt-3"><VoiceSample v={v} line={line} /></div>
            {mode === 'advanced' && <div className="mt-2 text-[0.8125rem] text-text-2">Eleven v4, language hi, stability 0.40, similarity 0.75, seed fixed per ad</div>}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-[12px] bg-well p-4">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-white"><Mic size={16} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><div className="font-semibold">Use your own voice</div><div className="text-[0.875rem] text-text-2">Read one minute of text on your phone. We ask for your consent first.</div></div>
        <button type="button" className="btn btn-line btn-sm">Record</button>
      </div>
      <p className="mt-3 text-[0.8125rem] text-text-2">Samples are silent in this preview. The studio plays the real voice.</p>
    </Sheet>
  )
}

export function ModelRow({ m, selected, mode, onSelect }: { m: VideoModel; selected: boolean; mode: Mode; onSelect: () => void }) {
  return (
    <div role="radio" tabIndex={0} aria-checked={selected} onClick={onSelect}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }} className="pick cursor-pointer p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-[0.8rem] font-extrabold ${m.id === 'auto' ? 'bg-accent text-white' : 'bg-well text-ink'}`}>{m.mono}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2"><span className="font-semibold">{m.name}</span><span className="text-[0.85rem] text-text-2">{m.maker}</span></div>
          <p className="text-[0.9rem] text-text-2">{m.good}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-text-2">
            <span className="inline-flex items-center gap-2">{m.speedWord} <Meter n={m.speed} of={4} label="Speed" /></span>
            <span className="inline-flex items-center gap-2">Detail <Meter n={m.detail} of={5} label="Detail" /></span>
          </div>
          {mode === 'advanced' && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-[8px] bg-well p-3 text-[0.8125rem] sm:grid-cols-3">
              <div><dt className="text-text-2">Resolution</dt><dd>{m.res}</dd></div>
              <div><dt className="text-text-2">Shot length</dt><dd>{m.len}</dd></div>
              <div><dt className="text-text-2">Per shot</dt><dd className="num">{Math.round(m.secPerShot / 6) / 10} min</dd></div>
              <div className="col-span-full truncate text-text-2">{m.refs} · <code className="text-[0.75rem]">{m.slug}</code></div>
            </dl>
          )}
        </div>
        {selected && <Check size={18} className="mt-1 text-accent" aria-hidden="true" />}
      </div>
    </div>
  )
}

export function ModelPicker({ open, onOpenChange, value, onChange, mode, title = 'Choose the video model' }:
  { open: boolean; onOpenChange: (o: boolean) => void; value: string; onChange: (id: string) => void; mode: Mode; title?: string }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description="The model films your shots. Auto picks one per shot: product shots, faces, details.">
      <div className="grid gap-2" role="radiogroup" aria-label="Video model">
        {VIDEO_MODELS.map(m => <ModelRow key={m.id} m={m} mode={mode} selected={value === m.id} onSelect={() => onChange(m.id)} />)}
      </div>
      <p className="mt-3 text-[0.8125rem] text-text-2">Veo, Sora and lip-sync models are not listed because the Higgsfield API does not offer them.</p>
    </Sheet>
  )
}
