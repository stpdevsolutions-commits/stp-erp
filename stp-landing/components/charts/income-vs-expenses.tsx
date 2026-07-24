'use client'

import * as React from 'react'
import { ChartFrame } from './chart-frame'
import { DOP, dopShort, niceScale, safePct } from './viz-tokens'
import type { CashflowMonth } from './types'

/**
 * Ingresos vs gastos por mes — columnas agrupadas, 2 series, un solo eje.
 *
 * Por qué esta forma: son dos magnitudes en la MISMA unidad (RD$), así que
 * comparten eje. Nunca un eje doble.
 *
 * Identidad: ingresos = slot 1 (verde STP), gastos = slot 2 (navy STP), en
 * esta y en todas las demás gráficas. El color sigue a la entidad.
 */
export function IncomeVsExpenses({
  months,
  totals,
  hasData,
}: {
  months: CashflowMonth[]
  totals: { income: number; expenses: number; balance: number }
  hasData: boolean
}) {
  const [hover, setHover] = React.useState<number | null>(null)

  const peak = months.reduce((m, x) => Math.max(m, x.income, x.expenses), 0)
  const { max, ticks } = niceScale(peak)

  const focused = hover != null ? months[hover] : null
  const readout = focused
    ? {
        title: `${focused.label} ${focused.year}`,
        income: focused.income,
        expenses: focused.expenses,
        balance: focused.balance,
      }
    : {
        title: `Acumulado ${months.length} meses`,
        income: totals.income,
        expenses: totals.expenses,
        balance: totals.balance,
      }

  return (
    <ChartFrame
      title="Ingresos vs. gastos por mes"
      subtitle={`Últimos ${months.length} meses · cobros completados frente a gastos registrados`}
      hasData={hasData}
      legend={[
        { label: 'Ingresos', color: 'var(--viz-s1)' },
        { label: 'Gastos', color: 'var(--viz-s2)' },
      ]}
      empty={{
        message: 'Aún no hay datos suficientes',
        hint: 'No hay pagos cobrados ni gastos registrados en la ventana. La gráfica aparecerá en cuanto se registre el primer movimiento.',
      }}
      table={{
        caption: 'Ingresos y gastos por mes',
        head: ['Mes', 'Ingresos', 'Gastos', 'Balance'],
        rows: months.map((m) => [
          `${m.label} ${m.year}`,
          DOP.format(m.income),
          DOP.format(m.expenses),
          DOP.format(m.balance),
        ]),
      }}
    >
      {/* Lectura textual: ningún valor queda encerrado en el hover */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="text-xs text-muted-foreground">{readout.title}</span>
        <span className="flex items-baseline gap-1.5 text-sm">
          <span className="size-2 rounded-[2px]" style={{ background: 'var(--viz-s1)' }} />
          <span className="text-muted-foreground">Ingresos</span>
          <strong className="tabular-nums">{DOP.format(readout.income)}</strong>
        </span>
        <span className="flex items-baseline gap-1.5 text-sm">
          <span className="size-2 rounded-[2px]" style={{ background: 'var(--viz-s2)' }} />
          <span className="text-muted-foreground">Gastos</span>
          <strong className="tabular-nums">{DOP.format(readout.expenses)}</strong>
        </span>
        <span className="text-sm">
          <span className="text-muted-foreground">Balance </span>
          <strong className="tabular-nums">{DOP.format(readout.balance)}</strong>
        </span>
      </div>

      <div className="flex gap-2">
        {/* Eje Y con números limpios */}
        <div
          className="relative w-14 shrink-0 text-[10px] tabular-nums text-muted-foreground"
          style={{ height: 180 }}
          aria-hidden="true"
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
              style={{ bottom: `${safePct(t, max)}%` }}
            >
              {t === 0 ? '0' : dopShort(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: 180 }}>
            {/* Rejilla: línea de 1px sólida, un paso por encima de la superficie */}
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute inset-x-0 h-px"
                style={{
                  bottom: `${safePct(t, max)}%`,
                  background: t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)',
                }}
                aria-hidden="true"
              />
            ))}

            <div className="absolute inset-0 flex items-end">
              {months.map((m, i) => (
                <button
                  key={m.month}
                  type="button"
                  className="group/col flex h-full min-w-0 flex-1 cursor-default items-end justify-center gap-[2px] rounded-sm px-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ background: hover === i ? 'color-mix(in srgb, var(--foreground) 5%, transparent)' : undefined }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${m.label} ${m.year}: ingresos ${DOP.format(m.income)}, gastos ${DOP.format(m.expenses)}`}
                >
                  <span
                    className="viz-bar-v w-full max-w-[24px]"
                    style={{
                      height: `${safePct(m.income, max)}%`,
                      background: 'var(--viz-s1)',
                      opacity: hover != null && hover !== i ? 0.45 : 1,
                    }}
                  />
                  <span
                    className="viz-bar-v w-full max-w-[24px]"
                    style={{
                      height: `${safePct(m.expenses, max)}%`,
                      background: 'var(--viz-s2)',
                      opacity: hover != null && hover !== i ? 0.45 : 1,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-1.5 flex" aria-hidden="true">
            {months.map((m, i) => (
              <span
                key={m.month}
                className={`min-w-0 flex-1 text-center text-[10px] ${hover === i ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </ChartFrame>
  )
}
