import * as React from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Inbox, ArrowRight } from 'lucide-react'

/**
 * Marco común de todas las gráficas del dashboard.
 *
 * Se encarga de tres cosas que el método de dataviz exige y que es fácil
 * olvidar en cada gráfica por separado:
 *
 *  1. **Estado vacío explícito.** Si `hasData` es falso, no se dibuja un
 *     lienzo en blanco ni ejes con NaN: se muestra un mensaje concreto que
 *     dice qué falta para que la gráfica tenga sentido.
 *  2. **Leyenda siempre presente con 2 o más series** (la identidad nunca
 *     depende solo del color).
 *  3. **Vista de tabla gemela** — todo valor pintado es legible como texto,
 *     así que ningún dato queda detrás de un tooltip ni de un color.
 */

export interface LegendItem {
  label: string
  color: string
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ background: it.color }}
            aria-hidden="true"
          />
          {it.label}
        </li>
      ))}
    </ul>
  )
}

export interface EmptyAction {
  label: string
  href: string
}

export function ChartEmpty({
  message,
  hint,
  action,
}: {
  message: string
  hint?: string
  action?: EmptyAction
}) {
  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 px-6 py-8 text-center">
      <Inbox className="size-5 text-muted-foreground/70" aria-hidden="true" />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
      {hint && <p className="max-w-xs text-xs text-muted-foreground/80">{hint}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-1 inline-flex items-center gap-1 rounded-md text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {action.label}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}

/** Tabla gemela plegada; el equivalente accesible de la gráfica. */
export function ChartTable({
  caption,
  head,
  rows,
}: {
  caption: string
  head: string[]
  rows: (string | number)[][]
}) {
  if (rows.length === 0) return null
  return (
    <details className="group mt-4 border-t border-border/60 pt-3">
      <summary className="cursor-pointer text-xs text-muted-foreground select-none marker:text-muted-foreground hover:text-foreground">
        Ver datos en tabla
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border/60">
              {head.map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`py-1.5 pr-3 font-medium text-muted-foreground ${i === 0 ? 'text-left' : 'text-right'}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b border-border/40 last:border-0">
                {r.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`py-1.5 pr-3 ${ci === 0 ? 'text-left font-medium' : 'text-right'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function ChartFrame({
  title,
  subtitle,
  legend,
  action,
  empty,
  hasData,
  table,
  children,
}: {
  title: string
  subtitle?: string
  legend?: LegendItem[]
  action?: React.ReactNode
  empty: { message: string; hint?: string; action?: EmptyAction }
  hasData: boolean
  table?: { caption: string; head: string[]; rows: (string | number)[][] }
  children: React.ReactNode
}) {
  return (
    <Card className="stp-viz">
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
        {hasData && legend && <ChartLegend items={legend} />}
      </CardHeader>
      <CardContent>
        {hasData ? (
          <>
            {children}
            {table && <ChartTable {...table} />}
          </>
        ) : (
          <ChartEmpty {...empty} />
        )}
      </CardContent>
    </Card>
  )
}
