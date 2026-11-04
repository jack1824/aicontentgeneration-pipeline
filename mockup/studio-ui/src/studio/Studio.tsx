import { useRef, useState } from 'react'
import { gsap, useGSAP, reduced } from '@/lib/gsap'
import type { Brief, Mode, Page } from '@/lib/data'
import Builder from './Builder'
import { Shell, MyAds, Moments, BrandKit } from './Pages'

export type MadeAd = { id: string; name: string; dur: number; voice: string; model: string; at: string }
export type Ctx = {
  mode: Mode; setMode: (m: Mode) => void; brief: Brief; setBrief: (p: Partial<Brief>) => void
  hook: string; setHook: (h: string) => void; go: (p: Page) => void; toast: (t: string) => void
  ads: MadeAd[]; addAd: (a: MadeAd) => void; shotModels: Record<string, string>; setShotModel: (s: string, m: string) => void
  onHome: () => void
}

export default function Studio(props: { page: Page; go: (p: Page) => void; brief: Brief; setBrief: (p: Partial<Brief>) => void; onHome: () => void }) {
  const [mode, setModeRaw] = useState<Mode>(() => { try { return localStorage.getItem('sa-mode') === 'advanced' ? 'advanced' : 'simple' } catch { return 'simple' } })
  const setMode = (m: Mode) => { setModeRaw(m); try { localStorage.setItem('sa-mode', m) } catch { /* storage blocked */ } }
  const [hook, setHook] = useState('')
  const [ads, setAds] = useState<MadeAd[]>([])
  const [shotModels, setShotModels] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  const toastRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!msg || !toastRef.current) return
    const tl = gsap.timeline({ onComplete: () => setMsg('') })
    tl.fromTo(toastRef.current, { y: reduced() ? 0 : 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.3, ease: 'power3.out' })
      .to(toastRef.current, { autoAlpha: 0, duration: 0.2, ease: 'power1.in' }, '+=2.8')
  }, { dependencies: [msg] })

  useGSAP(() => {
    window.scrollTo({ top: 0 })
    if (!reduced() && pageRef.current) gsap.fromTo(pageRef.current, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power3.out' })
  }, { dependencies: [props.page] })

  const ctx: Ctx = {
    mode, setMode, brief: props.brief, setBrief: props.setBrief, hook, setHook, go: props.go, toast: setMsg,
    ads, addAd: a => setAds(x => (x.some(y => y.id === a.id) ? x : [a, ...x])), shotModels, setShotModel: (s, m) => setShotModels(x => ({ ...x, [s]: m })), onHome: props.onHome,
  }
  const builder = ['brief', 'openings', 'making', 'result'].includes(props.page)

  return (
    <div className="min-h-[100svh] bg-frame text-[0.875rem] leading-[1.45] text-ink">
      <div ref={pageRef}>
        {builder
          ? <Builder c={ctx} step={props.page as 'brief' | 'openings' | 'making' | 'result'} />
          : <Shell c={ctx} page={props.page}>{props.page === 'ads' ? <MyAds c={ctx} /> : props.page === 'moments' ? <Moments c={ctx} /> : <BrandKit c={ctx} />}</Shell>}
      </div>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {msg && <div ref={toastRef} className="rounded-[10px] bg-ink px-4 py-3 text-[0.9375rem] font-semibold text-white shadow-[0_12px_28px_rgba(11,12,14,.22)]">{msg}</div>} {/* taste-skill-ignore: the toast floats above the page */}
      </div>
    </div>
  )
}
