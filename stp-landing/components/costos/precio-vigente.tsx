import { ArrowDown, ArrowUp } from 'lucide-react'
import type { PriceSummary } from '@/lib/types'

const DOP = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** A partir de aquí un precio deja de ser fiable para cotizar. */
const STALE_DAYS = 90

/**
 * Precio vigente con su variación y un aviso si está viejo. Es un Server Component:
 * no necesita interactividad y así no engorda el bundle del listado.
 */
export function PrecioVigente({
  summary,
  unit,
  showAge = true,
}: {
  summary?: PriceSummary
  unit?: string
  showAge?: boolean
}) {
  if (!summary || summary.current == null) {
    return <span className="text-muted-foreground text-sm">Sin precio</span>
  }

  const { current, changePct, ageDays } = summary
  const stale = showAge && ageDays != null && ageDays > STALE_DAYS

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className="font-mono text-sm font-medium">
        {DOP.format(current)}
        {unit && <span className="text-muted-foreground font-sans text-xs">/{unit}</span>}
      </span>

      <span className="flex items-center gap-1.5">
        {changePct != null && changePct !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
              changePct > 0
                ? 'text-destructive'
                : 'text-green-700 dark:text-green-400'
            }`}
          >
            {changePct > 0 ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )}
            {Math.abs(changePct).toFixed(1)}%
          </span>
        )}
        {stale && (
          <span
            className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
            title={`El precio tiene ${ageDays} días`}
          >
            {ageDays! > 365 ? '+1 año' : `${ageDays}d`}
          </span>
        )}
      </span>
    </span>
  )
}
