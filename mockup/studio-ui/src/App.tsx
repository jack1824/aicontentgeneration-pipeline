import { useEffect, useState } from 'react'
import Landing from '@/landing/Landing'
import Studio from '@/studio/Studio'
import { ScrollTrigger } from '@/lib/gsap'
import { EMPTY_BRIEF, type Brief, type Page } from '@/lib/data'

const PAGES: Page[] = ['brief', 'openings', 'making', 'result', 'ads', 'moments', 'brand']
type Route = { view: 'landing' } | { view: 'studio'; page: Page }

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (!h.startsWith('studio')) return { view: 'landing' }
  const p = h.split('/')[1] as Page
  return { view: 'studio', page: PAGES.includes(p) ? p : 'brief' }
}

export default function App() {
  const [route, setRoute] = useState<Route>(parse)
  const [brief, setBriefRaw] = useState<Brief>(EMPTY_BRIEF)
  const setBrief = (p: Partial<Brief>) => setBriefRaw(b => ({ ...b, ...p }))
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => { ScrollTrigger.refresh() }, [route])
  const go = (p: Page) => { window.location.hash = '/studio/' + p }
  if (route.view === 'landing') return <Landing brief={brief} setBrief={setBrief} onStart={() => go('brief')} />
  return <Studio page={route.page} go={go} brief={brief} setBrief={setBrief} onHome={() => { window.location.hash = '/' }} />
}
