import type { CSSProperties } from 'react'

/** Barra segmentada de avance. Tres tramos con tratamiento distinto (no solo
 * color): sólido = resuelto, rayado = en curso, vacío = sin empezar. */
export function Meter({
  done,
  inFlight,
  pending,
  total,
  className = 'h-2',
}: {
  done: number
  inFlight: number
  pending: number
  total: number
  className?: string
}) {
  if (total <= 0) return null
  const pct = (n: number) => `${(n / total) * 100}%`

  const stripes: CSSProperties = {
    width: pct(inFlight),
    backgroundColor: 'color-mix(in oklch, var(--primary) 60%, transparent)',
    backgroundImage:
      'repeating-linear-gradient(45deg, transparent 0 3px, color-mix(in oklch, var(--primary) 45%, transparent) 3px 6px)',
  }

  return (
    <div className={`flex ${className} overflow-hidden rounded-full bg-muted`}>
      <span style={{ width: pct(done) }} className="bg-[var(--chart-2)]" />
      <span style={stripes} />
      <span style={{ width: pct(pending) }} />
    </div>
  )
}
