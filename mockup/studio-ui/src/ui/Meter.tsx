export function Meter({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-[3px]" role="img" aria-label={`${label}: ${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} data-meter className="h-[6px] w-[12px] rounded-[2px]" style={{ background: i < n ? 'var(--meter-on, var(--ink))' : 'var(--meter-off, var(--control))' }} />
      ))}
    </span>
  )
}
