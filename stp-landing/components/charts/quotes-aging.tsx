'use client'

import * as React from 'react'
import { ChartFrame } from './chart-frame'
import { AMBER_RAMP, DOP, safePct } from './viz-tokens'
import type { AnalyticsReport } from './types'

/**
 * Cotizaciones enviadas que siguen sin respuesta, por antigüedad.
 *
 * Rampa ordinal de un solo tono (ámbar): las cubetas están ordenadas y el
 * color debe leer esa escalada. No se usan los colores de estado
 * (bien/aviso/grave/crítico) para no confundir una antigüedad con una alerta
 * del sistema; el aviso de "más de 7 días" va con icono y texto, nunca solo
 * con color.
 */
export function QuotesAging({ aging }: { aging: AnalyticsReport['quotesAging'] }) {
  const [hover, setHover] = React.useState<number | null>(null)
  const peak = aging.buckets.reduce((m, b) => Math.max(m, b.count), 0)

  return (
    <ChartFrame
      title="Cotizaciones esperando respuesta"
      subtitle="Antigüedad desde el envío al cliente — a quién toca perseguir"
      hasData={aging.hasData}
      empty={{
        message: 'Ninguna cotización esperando respuesta',
        hint: 'Aquí aparecerán las cotizaciones en estado "enviada" agrupadas por los días que llevan sin decisión del cliente.',
      }}
      table={{
        caption: 'Cotizaciones enviadas sin respuesta, por antigüedad',
        head: ['Antigüedad', 'Cantidad', 'Monto en juego'],
        rows: aging.buckets.map((b) => [b.label, b.count, DOP.format(b.amount)]),
      }}
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <span>
          <strong className="text-lg">{aging.total}</strong>{' '}
          <span className="text-muted-foreground">sin responder</span>
        </span>
        <span className="text-muted-foreground">
          <strong className="tabular-nums text-foreground">{DOP.format(aging.amount)}</strong> en juego
        </span>
        {aging.stale > 0 && (
          <span className="text-muted-foreground">
            ⚠︎ {aging.stale} con más de 7 días
          </span>
        )}
      </div>

      <ul className="space-y-2.5">
        {aging.buckets.map((b, i) => (
          <li
            key={b.key}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{b.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                <strong className="text-foreground">{b.count}</strong>
                <span className="ml-2">{DOP.format(b.amount)}</span>
              </span>
            </div>
            <div className="mt-1 h-5 rounded-sm bg-muted/60">
              <div
                className="viz-bar-h h-full"
                style={{
                  width: `${b.count > 0 ? Math.max(safePct(b.count, peak), 3) : 0}%`,
                  background: AMBER_RAMP[i] ?? AMBER_RAMP[AMBER_RAMP.length - 1],
                  opacity: hover != null && hover !== i ? 0.55 : 1,
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      {aging.oldest && (
        <p className="mt-3 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
          La más antigua:{' '}
          <span className="font-mono text-foreground">{aging.oldest.number}</span>
          {aging.oldest.client ? ` · ${aging.oldest.client}` : ''} ·{' '}
          <span className="tabular-nums">{aging.oldest.ageDays} días</span> ·{' '}
          {aging.oldest.reminders} recordatorio{aging.oldest.reminders === 1 ? '' : 's'} enviado
          {aging.oldest.reminders === 1 ? '' : 's'}
        </p>
      )}
    </ChartFrame>
  )
}
