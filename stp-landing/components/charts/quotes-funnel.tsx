'use client'

import * as React from 'react'
import { ChartFrame } from './chart-frame'
import { DOP, NAVY_RAMP, safePct } from './viz-tokens'
import type { AnalyticsReport } from './types'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada, sin respuesta',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
}

/**
 * Embudo de cotizaciones — barras horizontales sobre una rampa ordinal de
 * un solo tono (navy STP, claro → oscuro).
 *
 * Es ordinal y no categórica a propósito: las etapas tienen orden
 * (creada → enviada → con respuesta → aprobada), y el orden debe leerse en
 * el color. Barras horizontales porque las etiquetas son largas.
 *
 * La cifra que manda —la tasa de conversión— va como número, no como gráfica:
 * un solo valor no es un gráfico de una barra.
 */
export function QuotesFunnel({ quotes }: { quotes: AnalyticsReport['quotes'] }) {
  const [hover, setHover] = React.useState<number | null>(null)
  const base = quotes.stages[0]?.count ?? 0
  const conv = quotes.conversion.sentToApproved

  const breakdownRows = Object.entries(quotes.breakdown)
    .filter(([, v]) => v.count > 0)
    .map(([k, v]) => [STATUS_LABELS[k] ?? k, v.count, DOP.format(v.total)])

  return (
    <ChartFrame
      title="Embudo de cotizaciones"
      subtitle="De la cotización creada al sí del cliente (histórico completo)"
      hasData={quotes.hasData}
      empty={{
        message: 'Aún no hay cotizaciones',
        hint: 'El embudo y la tasa de conversión se calculan sobre las cotizaciones registradas.',
      }}
      table={{
        caption: 'Cotizaciones por estado',
        head: ['Estado', 'Cantidad', 'Monto'],
        rows: breakdownRows,
      }}
    >
      <div className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <div className="text-3xl leading-none font-semibold">
            {conv != null ? `${conv}%` : '—'}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            de las enviadas terminan aprobadas
          </p>
        </div>
        <div>
          <div className="text-xl leading-none font-semibold">
            {quotes.response.avgDays != null ? `${quotes.response.avgDays} d` : '—'}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {quotes.response.sampleSize > 0
              ? `respuesta media (${quotes.response.sampleSize} con fecha registrada)`
              : 'respuesta media — sin envíos con fecha registrada aún'}
          </p>
        </div>
      </div>

      <ul className="space-y-2.5">
        {quotes.stages.map((s, i) => {
          const pct = safePct(s.count, base)
          const dropoff =
            i > 0 && quotes.stages[i - 1].count > 0
              ? Math.round((s.count / quotes.stages[i - 1].count) * 100)
              : null
          return (
            <li
              key={s.key}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground">{s.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {dropoff != null && <span className="mr-2">{dropoff}% del paso previo</span>}
                  <strong className="text-foreground">{s.count}</strong>
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-5 min-w-0 flex-1 rounded-sm bg-muted/60">
                  <div
                    className="viz-bar-h h-full"
                    style={{
                      width: `${Math.max(pct, s.count > 0 ? 2 : 0)}%`,
                      background: NAVY_RAMP[i] ?? NAVY_RAMP[NAVY_RAMP.length - 1],
                      opacity: hover != null && hover !== i ? 0.55 : 1,
                    }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {DOP.format(s.amount)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </ChartFrame>
  )
}
