/* The product's mark: a 9:16 frame with a caption bar, the thing the studio makes. */
export function Mark({ size = 28, onInk = false }: { size?: number; onInk?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="7" y="1" width="14" height="26" rx="3" fill={onInk ? '#fff' : 'var(--accent)'} />
      <rect x="9.5" y="17" width="9" height="3.2" rx="1" fill={onInk ? 'var(--ink)' : '#fff'} />
      <rect x="9.5" y="21.6" width="6" height="2.2" rx="1" fill={onInk ? 'var(--ink)' : '#fff'} opacity=".7" />
    </svg>
  )
}

export function Wordmark({ onInk = false }: { onInk?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" translate="no">
      <Mark onInk={onInk} />
      <span className="text-[1.05rem] font-extrabold tracking-[-0.03em]">SocialAdz</span>
    </span>
  )
}
