import { cn } from '@/lib/utils'

/**
 * Fondo de "plano técnico" de STP: retícula fina + la línea del techo del logotipo.
 * Es solo decoración (aria-hidden) y vive en SVG para no costar peso de imagen.
 * Se usa en el Login y en el héroe del Inicio; cuando exista una foto real del
 * proyecto destacado, esta composición queda como fondo de respaldo.
 */
export function Blueprint({
  className,
  variant = 'tall',
}: {
  className?: string
  /** `tall` para paneles verticales (Login); `wide` para bandas horizontales (héroe de Inicio). */
  variant?: 'tall' | 'wide'
}) {
  const wide = variant === 'wide'
  const W = wide ? 1200 : 600
  const H = wide ? 420 : 700
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden bg-brand-deep',
        className,
      )}
    >
      <svg
        className="absolute inset-0 size-full"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio={wide ? 'xMaxYMid slice' : 'xMidYMid slice'}
      >
        <defs>
          <pattern id="stp-grid-s" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="white" strokeOpacity="0.05" strokeWidth="0.6" />
          </pattern>
          <pattern id="stp-grid-l" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M100 0H0V100" fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="0.8" />
          </pattern>
          <linearGradient id="stp-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.45" stopColor="black" stopOpacity="0" />
            <stop offset="1" stopColor="black" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#stp-grid-s)" />
        <rect width={W} height={H} fill="url(#stp-grid-l)" />

        {/* Techo del logotipo: aguas largas y mástil, a escala de plano */}
        <g fill="none" stroke="var(--brand-green-soft)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {wide ? (
            <>
              <path d="M720 340 L720 205 L930 120 L1130 200" strokeOpacity="0.9" />
              <path d="M930 120 L930 84" strokeOpacity="0.9" />
              <path d="M760 340 L760 189 M800 340 L800 173 M840 340 L840 157" strokeOpacity="0.4" />
            </>
          ) : (
            <>
              <path d="M80 400 L80 250 L330 150 L540 240" strokeOpacity="0.9" />
              <path d="M330 150 L330 110" strokeOpacity="0.9" />
              <path d="M120 400 L120 232 M160 400 L160 216 M200 400 L200 200" strokeOpacity="0.4" />
            </>
          )}
        </g>
        {/* Cotas */}
        <g stroke="white" strokeOpacity="0.28" strokeWidth="0.8" fill="none">
          {wide ? (
            <path d="M720 372 H1130 M720 364 V380 M1130 364 V380 M692 205 V340 M684 205 H700 M684 340 H700" />
          ) : (
            <path d="M80 430 H540 M80 422 V438 M540 422 V438 M52 250 V400 M44 250 H60 M44 400 H60" />
          )}
        </g>
        <g fill="white" fillOpacity="0.4" fontSize="11" fontFamily="var(--font-geist-mono), monospace">
          <text x={wide ? 925 : 310} y={wide ? 396 : 454} textAnchor="middle">STP · ESC 1:100</text>
        </g>
        <rect width={W} height={H} fill="url(#stp-fade)" />
      </svg>
    </div>
  )
}
