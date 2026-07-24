'use client'

import * as React from 'react'
import { ChartFrame } from './chart-frame'
import { DOP, safePct } from './viz-tokens'
import { EXPENSE_CATEGORY_LABELS, type AnalyticsReport } from './types'

/**
 * Gastos por categoría — barras horizontales, UNA sola serie.
 *
 * Un solo color (slot 2, navy STP: la entidad "gastos" viste navy en todo el
 * dashboard). No se pinta cada barra de un color distinto ni se usa una rampa
 * por valor: la longitud de la barra ya codifica la magnitud, y gastar el
 * canal de color en repetirlo es ruido. Con una sola serie no hace falta
 * leyenda: el título ya dice qué se está midiendo.
 */
export function ExpensesByCategory({
  expenses,
  months,
}: {
  expenses: AnalyticsReport['expenses']
  months: number
}) {
  const [hover, setHover] = React.useState<number | null>(null)
  const peak = expenses.byCategory.reduce((m, c) => Math.max(m, c.total), 0)

  return (
    <ChartFrame
      title="Gastos por categoría"
      subtitle={`Últimos ${months} meses · total ${DOP.format(expenses.total)}`}
      hasData={expenses.hasData}
      empty={{
        message: 'Aún no hay gastos registrados',
        hint: 'Al registrar gastos por proyecto (materiales, mano de obra, equipos, subcontratos…) esta gráfica muestra en qué se va el dinero.',
      }}
      table={{
        caption: 'Gastos por categoría',
        head: ['Categoría', 'Movimientos', 'Total'],
        rows: expenses.byCategory.map((c) => [
          EXPENSE_CATEGORY_LABELS[c.category] ?? c.category,
          c.count,
          DOP.format(c.total),
        ]),
      }}
    >
      <ul className="space-y-2.5">
        {expenses.byCategory.map((c, i) => (
          <li
            key={c.category}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-muted-foreground">
                {EXPENSE_CATEGORY_LABELS[c.category] ?? c.category}
              </span>
              <span className="shrink-0 tabular-nums">
                <strong>{DOP.format(c.total)}</strong>
                <span className="ml-2 text-muted-foreground">
                  {safePct(c.total, expenses.total).toFixed(0)}%
                </span>
              </span>
            </div>
            <div className="mt-1 h-5 rounded-sm bg-muted/60">
              <div
                className="viz-bar-h h-full"
                style={{
                  width: `${c.total > 0 ? Math.max(safePct(c.total, peak), 2) : 0}%`,
                  background: 'var(--viz-s2)',
                  opacity: hover != null && hover !== i ? 0.55 : 1,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </ChartFrame>
  )
}
