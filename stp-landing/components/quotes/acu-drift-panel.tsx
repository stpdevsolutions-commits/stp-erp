'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowDown, ArrowUp, Calculator, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { refreshAcuPrices } from '@/lib/actions/quotes'
import type { AcuDriftLine, AcuDriftReport, AcuRefreshResult } from '@/lib/types'
import { fmtDOP, fmtUnitCost } from '@/components/costos/acu-labels'

/**
 * Aviso de precios viejos en una cotización: qué líneas salen de una partida de costos
 * (ACU) y cuánto se ha movido ese costo desde que se congelaron.
 *
 * El panel NO actualiza nada solo. El precio que vio un cliente no puede cambiar porque
 * subiera el cobre: actualizar es un botón que alguien pulsa, y lo que no se debe pisar
 * a ciegas (un ACU al que le faltan precios, un unitario escrito a mano) se salta y se
 * dice por qué.
 */
export function AcuDriftPanel({
  quoteId,
  report,
  canRefresh,
}: {
  quoteId: string
  report: AcuDriftReport
  /** Solo MANAGER+ y con la cotización editable; si no, el aviso es de solo lectura. */
  canRefresh: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AcuRefreshResult | null>(null)

  if (report.linkedLines === 0) return null

  const conAviso = report.lines.filter((l) => l.stale)
  const sube = report.totalDelta > 0

  async function actualizar(opts: { allowIncomplete?: boolean; overrideManual?: boolean } = {}) {
    setPending(true)
    setError(null)
    setResult(null)
    const res = await refreshAcuPrices(quoteId, opts)
    setPending(false)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo actualizar')
      return
    }
    setResult(res.result ?? null)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Calculator className="size-4" />
            Precios calculados desde partidas de costos
            <Badge className="bg-muted text-muted-foreground">
              {report.linkedLines} línea{report.linkedLines === 1 ? '' : 's'}
            </Badge>
          </span>
          {conAviso.length > 0 && canRefresh && (
            <Button size="sm" variant="outline" onClick={() => actualizar()} disabled={pending}>
              <RefreshCw className={`size-3.5 mr-1.5 ${pending ? 'animate-spin' : ''}`} />
              Actualizar a los costos de hoy
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {conAviso.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Los {report.linkedLines} unitarios calculados siguen coincidiendo con el costo de
            hoy. No hay nada que actualizar.
          </p>
        ) : (
          <>
            <div className="rounded-md bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>
                {conAviso.length} de {report.linkedLines} línea
                {report.linkedLines === 1 ? '' : 's'} tiene{conAviso.length === 1 ? '' : 'n'} el
                precio desfasado.{' '}
                {report.totalDelta !== 0 && (
                  <>
                    Rehacerlos con los costos de hoy dejaría esas líneas en{' '}
                    <strong>{fmtDOP(report.suggestedTotal)}</strong> en vez de{' '}
                    {fmtDOP(report.currentTotal)} ({sube ? '+' : ''}
                    {fmtDOP(report.totalDelta)}
                    {report.totalDeltaPct !== null && `, ${sube ? '+' : ''}${report.totalDeltaPct}%`}
                    ).
                  </>
                )}{' '}
                La cotización no cambia hasta que se pulse el botón.
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left font-medium py-1.5 pr-2">Línea</th>
                    <th className="text-right font-medium py-1.5 px-2">Costo congelado</th>
                    <th className="text-right font-medium py-1.5 px-2">Costo hoy</th>
                    <th className="text-right font-medium py-1.5 px-2">Unitario</th>
                    <th className="text-right font-medium py-1.5 pl-2">Quedaría en</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {conAviso.map((l) => (
                    <DriftRow key={l.itemId} line={l} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="space-y-2 text-sm">
            {result.updated.length > 0 && (
              <p className="text-green-700 dark:text-green-400">
                {result.updated.length} línea{result.updated.length === 1 ? '' : 's'} actualizada
                {result.updated.length === 1 ? '' : 's'} con los costos de hoy.
              </p>
            )}
            {result.skipped.length > 0 && (
              <div className="rounded-md border p-2.5 space-y-1.5">
                <p className="font-medium">
                  {result.skipped.length} línea{result.skipped.length === 1 ? '' : 's'} sin tocar:
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  {result.skipped.map((s) => (
                    <li key={s.itemId}>
                      <span className="font-medium text-foreground">{s.description}</span> —{' '}
                      {s.detail}
                    </li>
                  ))}
                </ul>
                {canRefresh && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {result.skipped.some((s) => s.reason === 'incomplete') && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => actualizar({ allowIncomplete: true })}
                      >
                        Actualizar igual las incompletas
                      </Button>
                    )}
                    {result.skipped.some((s) => s.reason === 'manual-override') && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => actualizar({ overrideManual: true })}
                      >
                        Pisar los precios escritos a mano
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Motivos legibles de por qué una línea aparece en el aviso. */
function motivos(line: AcuDriftLine): string[] {
  const out: string[] = []
  if (line.flags.noBaseline) out.push('sin costo congelado con el que comparar')
  if (line.flags.currentIncomplete) out.push('a la partida le faltan precios hoy')
  if (line.flags.frozenIncomplete) out.push('se congeló con precios incompletos')
  if (line.flags.manualOverride) out.push('el unitario se escribió a mano')
  if (line.flags.aged && line.ageDays !== null) out.push(`congelado hace ${line.ageDays} días`)
  return out
}

function DriftRow({ line }: { line: AcuDriftLine }) {
  const razones = motivos(line)
  const Icono = line.direction === 'up' ? ArrowUp : line.direction === 'down' ? ArrowDown : null
  const color =
    line.direction === 'up'
      ? 'text-destructive'
      : line.direction === 'down'
        ? 'text-green-700 dark:text-green-400'
        : 'text-muted-foreground'

  return (
    <tr>
      <td className="py-2 pr-2 align-top">
        <div className="flex items-start gap-2">
          {line.label && (
            <span className="text-xs tabular-nums text-muted-foreground shrink-0">
              {line.label}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate">{line.description}</p>
            <p className="text-xs text-muted-foreground truncate">
              {line.acuCode ? (
                <Link
                  href={`/dashboard/costos/acus/${line.acuId}`}
                  className="hover:underline"
                >
                  {line.acuCode} · {line.acuName}
                </Link>
              ) : (
                'partida de costos no disponible'
              )}
              {line.markupPct > 0 && ` · margen ${line.markupPct}%`}
            </p>
            {razones.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">{razones.join(' · ')}</p>
            )}
          </div>
        </div>
      </td>
      <td className="py-2 px-2 text-right tabular-nums align-top">
        {line.frozenUnitCost !== null ? fmtUnitCost(line.frozenUnitCost) : '—'}
      </td>
      <td className={`py-2 px-2 text-right tabular-nums align-top ${color}`}>
        <span className="inline-flex items-center gap-1">
          {Icono && <Icono className="size-3.5" />}
          {line.currentUnitCost !== null ? fmtUnitCost(line.currentUnitCost) : '—'}
        </span>
        {line.unitCostDeltaPct !== null && line.unitCostDeltaPct !== 0 && (
          <p className={`text-xs ${color}`}>
            {line.unitCostDeltaPct > 0 ? '+' : ''}
            {line.unitCostDeltaPct}%
          </p>
        )}
      </td>
      <td className="py-2 px-2 text-right tabular-nums align-top">
        {fmtDOP(line.currentUnitPrice)}
      </td>
      <td className="py-2 pl-2 text-right tabular-nums align-top">
        {line.suggestedUnitPrice !== null ? (
          <>
            <span className="font-medium">{fmtDOP(line.suggestedUnitPrice)}</span>
            {line.lineTotalDelta !== null && line.lineTotalDelta !== 0 && (
              <p className="text-xs text-muted-foreground">
                total {line.lineTotalDelta > 0 ? '+' : ''}
                {fmtDOP(line.lineTotalDelta)}
              </p>
            )}
          </>
        ) : (
          '—'
        )}
      </td>
    </tr>
  )
}
