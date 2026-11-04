import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { gsap, reduced } from '@/lib/gsap'

/* Segmented control. The thumb glides to the chosen option (GSAP, transform only). */
export function Seg<T extends string | number>({ value, options, onChange, label }:
  { value: T; options: { v: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLSpanElement>(null)
  const ready = useRef(false)
  useLayoutEffect(() => {
    const btn = wrap.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
    if (!btn || !thumb.current) return
    const to = { x: btn.offsetLeft, width: btn.offsetWidth }
    if (!ready.current || reduced()) { gsap.set(thumb.current, to); ready.current = true }
    else gsap.to(thumb.current, { ...to, duration: 0.32, ease: 'power3.inOut', overwrite: true })
  }, [value, options.length])
  return (
    <div ref={wrap} className="seg" role="group" aria-label={label}>
      <span ref={thumb} className="thumb" aria-hidden="true" />
      {options.map(o => (
        <button type="button" key={String(o.v)} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  )
}
