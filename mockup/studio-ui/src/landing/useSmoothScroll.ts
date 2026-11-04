import { useEffect } from 'react'
import Lenis from 'lenis'
import { gsap, ScrollTrigger, reduced } from '@/lib/gsap'

/* Weight on the wheel, never a page that keeps sliding: Lenis at lerp 0.12, off for touch and reduced motion,
   driven by GSAP's ticker so ScrollTrigger stays in step. */
export function useSmoothScroll() {
  useEffect(() => {
    if (reduced() || window.matchMedia('(pointer: coarse)').matches) return
    const lenis = new Lenis({ lerp: 0.12, smoothWheel: true })
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => { gsap.ticker.remove(tick); lenis.destroy() }
  }, [])
}
