import { useRef, useState } from 'react'
import { gsap, useGSAP, reduced } from '@/lib/gsap'
import type { Beat } from '@/lib/data'

/* The product's 9:16 preview player. Frames cut on the measured beat times; caption words light in sequence;
   the hook card, offer card and end card arrive on their beats. Frames are the owner's photos, or flat fields. */
const FIELDS = ['var(--reel-1, #0b0c0e)', 'var(--reel-2, #1f2de6)', 'var(--reel-3, #2b2e35)', 'var(--reel-4, #1621bd)', 'var(--reel-1, #0b0c0e)']

export type ReelProps = {
  beats: Beat[]; hookCard?: string; photos?: string[]; offer?: string; endName?: string; endLine?: string
  script?: 'lat' | 'dev'; playing?: boolean; className?: string; onBeat?: (n: number) => void; onTime?: (t: number, total: number) => void
  label?: string
}

export function Reel(props: ReelProps) {
  const [still] = useState(reduced)
  return still ? <StillReel {...props} /> : <LiveReel {...props} />
}

function LiveReel({ beats, hookCard, photos = [], offer, endName, endLine, script = 'lat', playing = true, className = '', onBeat, onTime, label = 'Ad preview' }: ReelProps) {
  const root = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const tl = useRef<gsap.core.Timeline | null>(null)
  const cb = useRef({ onBeat, onTime })
  cb.current = { onBeat, onTime }
  const key = JSON.stringify([beats, hookCard, photos.length, offer, endName, endLine, script])

  useGSAP(() => {
    const q = gsap.utils.selector(root)
    const total = beats.reduce((a, b) => a + b.sec, 0)
    const t = gsap.timeline({ repeat: -1, repeatDelay: 0.5, paused: !playing, onUpdate() { cb.current.onTime?.(this.time(), total) } })
    tl.current = t
    const frames = q('[data-frame]')
    const caps = q('[data-cap]')
    gsap.set(frames, { autoAlpha: 0 }); gsap.set(frames[0], { autoAlpha: 1 })
    gsap.set(caps, { autoAlpha: 0 })
    if (hookCard) gsap.set(q('[data-hookcard]'), { autoAlpha: 0, y: -10 })
    if (offer) gsap.set(q('[data-offer]'), { autoAlpha: 0, y: 10 })
    gsap.set(q('[data-end]'), { autoAlpha: 0 })
    let at = 0
    beats.forEach((b, i) => {
      const f = frames[i]
      const inner = f.querySelector('[data-move]')
      if (inner) t.fromTo(inner, { scale: 1.04 }, { scale: 1.12, duration: b.sec + 0.3, ease: 'none' }, at)
      if (i > 0) { t.to(f, { autoAlpha: 1, duration: 0.18, ease: 'power1.out' }, at); t.set(frames[i - 1], { autoAlpha: 0 }, at + 0.18) }
      t.call(() => cb.current.onBeat?.(b.n), [], at)
      const cap = caps[i]
      const words = cap.querySelectorAll('.w')
      t.to(cap, { autoAlpha: 1, duration: 0.1 }, at + (i === 0 ? 0.3 : 0.05))
      const step = (b.sec - 0.4) / Math.max(words.length, 1)
      words.forEach((w, wi) => t.to(w, { opacity: 1, duration: 0.08 }, at + 0.15 + wi * step))
      t.to(cap, { autoAlpha: 0, duration: 0.08 }, at + b.sec - 0.08)
      t.set(words, { opacity: 0.55 }, at + b.sec)
      if (b.type === 'Offer' && offer) {
        t.to(q('[data-offer]'), { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out' }, at + 0.1)
        t.to(q('[data-offer]'), { autoAlpha: 0, duration: 0.15 }, at + b.sec - 0.15)
      }
      if (b.type === 'CTA') t.to(q('[data-end]'), { autoAlpha: 1, duration: 0.25 }, at + 0.4)
      at += b.sec
    })
    if (hookCard) {
      t.to(q('[data-hookcard]'), { autoAlpha: 1, y: 0, duration: 0.35, ease: 'expo.out' }, 0.02)
      t.to(q('[data-hookcard]'), { autoAlpha: 0, duration: 0.15 }, beats[0].sec - 0.1)
    }
    t.to(q('[data-end]'), { autoAlpha: 0, duration: 0.2 }, at + 0.3)
    t.set(frames[frames.length - 1], { autoAlpha: 0 }, at + 0.45)
    t.set(frames[0], { autoAlpha: 1 }, at + 0.45)
    t.fromTo(bar.current, { scaleX: 0 }, { scaleX: 1, duration: at, ease: 'none' }, 0)
  }, { scope: root, dependencies: [key], revertOnUpdate: true })

  // paused, the preview rests on a frame where the hook card and the first caption are showing
  useGSAP(() => { if (tl.current) { if (playing) tl.current.play(); else tl.current.pause(Math.min(1.2, beats[0].sec - 0.2)) } }, { dependencies: [playing, key] })

  return (
    <div ref={root} className={`reel ${className}`} role="img" aria-label={label} data-ui>
      {beats.map((b, i) => {
        const src = photos.length ? photos[i % photos.length] : null
        return (
          <div key={b.n} data-frame className="absolute inset-0">
            <div data-move className="absolute inset-0" style={{ background: FIELDS[i % FIELDS.length] }}>
              {src && <img src={src} alt="" className="h-full w-full object-cover" width={540} height={960} />}
            </div>
          </div>
        )
      })}
      {hookCard && (
        <div data-hookcard className="absolute inset-x-0 z-[3] flex justify-center px-[8%]" style={{ top: '15%' }}>
          <div className="reel-hook text-center" style={{ fontSize: '8.4cqw' }}>{hookCard}</div>
        </div>
      )}
      {offer && (
        <div data-offer className="absolute inset-x-[8%] z-[3] rounded-[6px] px-[4cqw] py-[3cqw]" style={{ top: '16%', background: 'var(--reel-card, #fff)', color: 'var(--reel-card-ink, #0b0c0e)' }}>
          <span className="font-extrabold leading-[1.05] tracking-[-0.03em]" style={{ fontSize: '7cqw' }}>{offer}</span>
        </div>
      )}
      {beats.map(b => (
        <div key={b.n} data-cap className="absolute inset-x-0 z-[3] px-[9%] text-center" style={{ top: '60%', fontSize: script === 'dev' ? '6.6cqw' : '6.4cqw' }}>
          <span className={`reel-cap ${script === 'dev' ? 'hi' : ''}`}>
            {(script === 'dev' ? b.dev : b.lat).split(' ').map((w, i) => <span key={i} className="w">{w} </span>)}
          </span>
        </div>
      ))}
      <div data-end className="absolute inset-0 z-[4] flex flex-col items-start justify-end gap-[3cqw] p-[8cqw]" style={{ background: 'var(--reel-end, var(--accent))', color: 'var(--reel-end-ink, #fff)' }}>
        <span className="font-extrabold leading-[0.9] tracking-[-0.05em]" style={{ fontSize: '12cqw' }}>{endName || 'Your shop'}</span>
        <span className="font-semibold" style={{ fontSize: '5cqw' }}>{endLine || 'WhatsApp karo'}</span>
      </div>
      <div className="pointer-events-none absolute bottom-[3.2%] left-[5%] z-[5] rounded-[3px] bg-black/55 px-[1.6cqw] py-[0.5cqw] font-semibold text-white" style={{ fontSize: '2.9cqw' }}>Video created using AI</div>
      <div className="absolute inset-x-0 bottom-0 z-[5] h-[3px] bg-white/25"><div ref={bar} className="h-full origin-left bg-white" style={{ transform: 'scaleX(0)' }} /></div>
    </div>
  )
}

/* Reduced motion: the finished first frame, everything readable, nothing waiting for a beat. */
function StillReel({ beats, hookCard, photos = [], script = 'lat', className = '', label = 'Ad preview' }: ReelProps) {
  const b = beats[0]
  return (
    <div className={`reel ${className}`} role="img" aria-label={label} data-ui>
      <div className="absolute inset-0" style={{ background: FIELDS[0] }}>{photos[0] && <img src={photos[0]} alt="" className="h-full w-full object-cover" width={540} height={960} />}</div>
      {hookCard && <div className="absolute inset-x-0 z-[3] flex justify-center px-[8%]" style={{ top: '15%' }}><div className="reel-hook text-center" style={{ fontSize: '8.4cqw' }}>{hookCard}</div></div>}
      <div className="absolute inset-x-0 z-[3] px-[9%] text-center" style={{ top: '60%', fontSize: '6.4cqw' }}><span className={`reel-cap ${script === 'dev' ? 'hi' : ''}`}>{script === 'dev' ? b.dev : b.lat}</span></div>
      <div className="pointer-events-none absolute bottom-[3.2%] left-[5%] z-[5] rounded-[3px] bg-black/55 px-[1.6cqw] py-[0.5cqw] font-semibold text-white" style={{ fontSize: '2.9cqw' }}>Video created using AI</div>
    </div>
  )
}
