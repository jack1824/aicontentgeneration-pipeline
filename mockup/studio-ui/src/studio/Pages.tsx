import { useState, type ReactNode } from 'react'
import { Plus, Clapperboard, CalendarHeart, Store, Menu, ImagePlus, UserRound, Package } from 'lucide-react'
import { MOMENTS, VOICES, type Page } from '@/lib/data'
import { Mark } from '@/ui/Mark'
import { Seg } from '@/ui/Seg'
import { VoiceInitial, VoicePicker } from '@/ui/Pickers'
import type { Ctx } from './Studio'

const NAV: { p: Page; l: string; I: typeof Plus }[] = [
  { p: 'ads', l: 'My ads', I: Clapperboard }, { p: 'moments', l: 'Moments', I: CalendarHeart }, { p: 'brand', l: 'Brand kit', I: Store },
]

/* framed-sheet: one tinted L-frame (sidebar + 48px top bar, no rule between), the page on a white sheet inset 8px */
export function Shell({ c, page, children }: { c: Ctx; page: Page; children: ReactNode }) {
  const [menu, setMenu] = useState(false)
  const nav = (
    <nav aria-label="Studio" className="grid gap-0.5">
      <button type="button" onClick={() => c.go('brief')} className="btn btn-ink mb-3 w-full justify-start"><Plus size={16} aria-hidden="true" /> New ad</button>
      {NAV.map(({ p, l, I }) => (
        <button type="button" key={p} onClick={() => { c.go(p); setMenu(false) }} aria-current={p === page ? 'page' : undefined}
          className={`flex h-[34px] items-center gap-2.5 rounded-[8px] px-2.5 text-[0.875rem] font-semibold ${p === page ? 'bg-[#e3e6eb] text-ink' : 'text-text-2 hover:text-ink'}`}>
          <I size={16} strokeWidth={1.75} aria-hidden="true" />{l}
        </button>
      ))}
    </nav>
  )
  return (
    <div className="grid min-h-[100svh] lg:grid-cols-[228px_minmax(0,1fr)] lg:grid-rows-[48px_minmax(0,1fr)]">
      <div className="hidden items-center gap-2 px-4 lg:flex">
        <button type="button" onClick={c.onHome} className="flex items-center gap-2" aria-label="SocialAdz home"><Mark /><span className="font-extrabold tracking-[-0.03em]" translate="no">SocialAdz</span></button>
      </div>
      <div className="flex h-12 items-center gap-3 px-3 lg:px-2">
        <button type="button" className="btn btn-quiet lg:hidden" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-label="Menu"><Menu size={18} aria-hidden="true" /></button>
        <span className="flex items-center gap-2 lg:hidden"><Mark size={24} /><span className="font-semibold">{NAV.find(n => n.p === page)?.l}</span></span>
        <span className="hidden text-text-2 lg:inline">Your shop</span>
        <div className="ml-auto flex items-center gap-2">
          <Seg label="Interface" value={c.mode} onChange={c.setMode} options={[{ v: 'simple', label: 'Simple' }, { v: 'advanced', label: 'Advanced' }]} />
        </div>
      </div>
      <aside className="hidden px-3 pb-4 pt-2 lg:block">{nav}</aside>
      {menu && <div className="px-3 pb-3 lg:hidden">{nav}</div>}
      <main className="min-w-0 rounded-[16px] border border-line bg-sheet p-6 lg:mb-2 lg:mr-2 max-lg:mx-2 max-lg:mb-2">{children}</main>
    </div>
  )
}

function Title({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-[1.5rem] font-semibold tracking-[-0.02em]">{children}</h1>{action}</div>
}

export function MyAds({ c }: { c: Ctx }) {
  return (
    <div>
      <Title action={<button type="button" className="btn btn-ink btn-sm" onClick={() => c.go('brief')}><Plus size={15} aria-hidden="true" /> New ad</button>}>My ads</Title>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left">
          <thead><tr className="text-[0.8125rem] text-text-2"><th className="pb-2 font-semibold">Ad</th><th className="pb-2 font-semibold">Voice</th><th className="pb-2 font-semibold">Video model</th><th className="num pb-2 text-right font-semibold">Length</th><th className="pb-2 text-right font-semibold">Made</th></tr></thead>
          <tbody>
            {c.ads.length === 0 ? (
              <tr><td colSpan={5} className="border-t border-line pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-dashed border-control px-4 py-4">
                  <span>No ads yet. Your first one takes about ten minutes.</span>
                  <button type="button" className="btn btn-line btn-sm" onClick={() => c.go('brief')}>Make your first ad</button>
                </div>
              </td></tr>
            ) : c.ads.map(a => (
              <tr key={a.id} className="border-t border-line">
                <td className="py-3"><button type="button" className="link font-semibold" onClick={() => c.go('result')}>{a.name} ad</button></td>
                <td className="py-3">{a.voice}</td><td className="py-3">{a.model}</td><td className="num py-3 text-right">{a.dur} s</td><td className="num py-3 text-right text-text-2">{a.at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {c.ads.length === 0 && (
        <div className="mt-10">
          <h2 className="text-[1rem] font-semibold">Coming up</h2>
          <p className="text-text-2">A good first ad is one for the next festival.</p>
          <ul className="mt-3">
            {MOMENTS.slice(0, 4).map(m => (
              <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-t border-line py-3 sm:grid-cols-[180px_160px_minmax(0,1fr)_auto]">
                <span className="font-semibold">{m.name}</span>
                <span className="num text-text-2 max-sm:col-start-1 max-sm:row-start-2">{m.date}, {m.days} days</span>
                <span className="text-text-2 max-sm:hidden">{m.angle}</span>
                <button type="button" className="btn btn-quiet max-sm:row-span-2 max-sm:col-start-2 max-sm:row-start-1" onClick={() => { c.setBrief({ moment: m.id }); c.go('brief') }}>Start a {m.name} ad</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function Moments({ c }: { c: Ctx }) {
  return (
    <div>
      <Title>Moments</Title>
      <p className="mt-1 max-w-[60ch] text-text-2">Festivals and seasons ahead. Starting from one adds its angle and a delivery-by line to your brief.</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead><tr className="text-[0.8125rem] text-text-2"><th className="pb-2 font-semibold">Moment</th><th className="pb-2 font-semibold">Date</th><th className="num pb-2 text-right font-semibold">Days left</th><th className="pb-2 pl-6 font-semibold">Angle</th><th className="pb-2 font-semibold">Good for</th><th className="pb-2"><span className="sr-only">Action</span></th></tr></thead>
          <tbody>
            {MOMENTS.map(m => (
              <tr key={m.id} className="border-t border-line align-top">
                <td className="py-3 font-semibold">{m.name}</td>
                <td className="num py-3">{m.date}</td>
                <td className="num py-3 text-right">{m.days <= 7 ? <span className="pill pill-warn">{m.days}</span> : m.days}</td>
                <td className="py-3 pl-6">{m.angle}</td>
                <td className="py-3 text-text-2">{m.good}</td>
                <td className="py-3 text-right"><button type="button" className="btn btn-quiet" onClick={() => { c.setBrief({ moment: m.id }); c.go('brief') }}>Start</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Section({ title, desc, children, aside }: { title: string; desc: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line py-8 first:border-0 first:pt-2 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-10">
      <div><h2 className="text-[1rem] font-semibold">{title}</h2><p className="mt-1 text-text-2">{desc}</p>{aside && <div className="mt-4">{aside}</div>}</div>
      <div className="rounded-[16px] bg-[#fafafa] p-4">{children}</div>
    </section>
  )
}

export function BrandKit({ c }: { c: Ctx }) {
  const [shop, setShop] = useState({ name: '', area: '', number: '' })
  const [vOpen, setVOpen] = useState(false)
  const voice = VOICES.find(v => v.id === c.brief.voice) ?? VOICES[0]
  return (
    <div>
      <Title>Brand kit</Title>
      <p className="mt-1 max-w-[60ch] text-text-2">Set it once. Every ad uses it for the end card, the captions and the voice.</p>
      <div className="mt-6">
        <Section title="Shop" desc="Shown on the end card of every ad."
          aside={<div className="w-[160px]"><div className="reel" style={{ aspectRatio: '9 / 16' }} data-ui role="img" aria-label="End card preview">
            <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-ink p-4 text-white"><span className="text-[1.25rem] font-extrabold leading-[0.95] tracking-[-0.04em]">{shop.name || 'Your shop'}</span><span className="text-[0.8125rem] font-semibold">{shop.area || 'Area, city'}</span><span className="num text-[0.8125rem]">{shop.number ? `WhatsApp ${shop.number}` : 'WhatsApp number'}</span></div></div></div>}>
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); c.toast('Shop details saved') }}>
            <div><label className="flabel" htmlFor="s-name">Shop name</label><input id="s-name" name="organization" autoComplete="organization" className="field" placeholder="Name on your board…" value={shop.name} onChange={e => setShop({ ...shop, name: e.target.value })} /></div>
            <div><label className="flabel" htmlFor="s-area">Area and city</label><input id="s-area" name="address-level2" autoComplete="address-level2" className="field" placeholder="Market, city…" value={shop.area} onChange={e => setShop({ ...shop, area: e.target.value })} /></div>
            <div><label className="flabel" htmlFor="s-num">WhatsApp number</label><input id="s-num" name="tel" type="tel" inputMode="tel" autoComplete="tel" className="field num" placeholder="98765 43210" value={shop.number} onChange={e => setShop({ ...shop, number: e.target.value })} /></div>
            <button type="submit" className="btn btn-ink btn-sm justify-self-end">Save shop details</button>
          </form>
        </Section>
        <Section title="Logo and colours" desc="Your colours are taken from the logo. Change them if they look wrong.">
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className="grid h-20 w-20 place-items-center rounded-[12px] border border-dashed border-control text-text-2" aria-label="Upload logo"><ImagePlus size={20} aria-hidden="true" /></button>
            <p className="max-w-[40ch] text-text-2">No logo yet. Add one and its colours appear here.</p>
          </div>
        </Section>
        <Section title="Default voice" desc="Used for every new ad. You can still change it per ad.">
          <div className="flex items-center gap-3"><VoiceInitial v={voice} /><div className="min-w-0 flex-1"><div className="font-semibold">{voice.name}</div><div className="text-text-2">{voice.tone}, {voice.city}</div></div><button type="button" className="btn btn-line btn-sm" onClick={() => setVOpen(true)}>Change</button></div>
        </Section>
        <Section title="Faces" desc="Your own face, or an AI actor. Every face is labelled as AI in the ad.">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-dashed border-control px-4 py-4">
            <span className="flex items-center gap-2"><UserRound size={16} className="text-text-2" aria-hidden="true" /> No faces yet. Add ten photos of yourself, or make an AI actor.</span>
            <button type="button" className="btn btn-line btn-sm"><Plus size={14} aria-hidden="true" /> Add a face</button>
          </div>
        </Section>
        <Section title="Products" desc="Photos with the background removed, kept the same in every shot.">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-dashed border-control px-4 py-4">
            <span className="flex items-center gap-2"><Package size={16} className="text-text-2" aria-hidden="true" /> No products yet.</span>
            <button type="button" className="btn btn-line btn-sm"><Plus size={14} aria-hidden="true" /> Add product photos</button>
          </div>
        </Section>
      </div>
      <VoicePicker open={vOpen} onOpenChange={setVOpen} value={c.brief.voice} mode={c.mode} line="आपका विज्ञापन इसी आवाज़ में बनेगा।" onChange={id => { c.setBrief({ voice: id }); setVOpen(false); c.toast('Default voice saved') }} />
    </div>
  )
}
