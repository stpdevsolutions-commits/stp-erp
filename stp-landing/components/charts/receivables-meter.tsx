import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartEmpty } from './chart-frame'
import { DOP, safePct } from './viz-tokens'
import type { AnalyticsReport } from './types'

/**
 * Cartera por cobrar — medidor (una sola razón contra un límite).
 *
 * Es un ratio único contra un tope: cuánto del trabajo ya aprobado por el
 * cliente está efectivamente cobrado. Un medidor, no un pastel de dos
 * porciones ni una gráfica de una sola barra.
 *
 * La pista sin rellenar es un paso más claro de la MISMA rampa que el
 * relleno, para que el estado se lea a lo largo de toda la barra. El
 * porcentaje va escrito: nunca solo color.
 */
export function ReceivablesMeter({
  receivables,
}: {
  receivables: AnalyticsReport['receivables']
}) {
  const pct = receivables.collectedPct ?? 0
  const width = safePct(receivables.collected, receivables.approved)

  return (
    <Card className="stp-viz">
      <CardHeader className="gap-1">
        <CardTitle className="text-base">Cartera por cobrar</CardTitle>
        <p className="text-xs text-muted-foreground">
          Lo contratado (presupuesto del proyecto o cotización aprobada) frente a lo cobrado
        </p>
      </CardHeader>
      <CardContent>
        {!receivables.hasData ? (
          <ChartEmpty
            message="Aún no hay datos suficientes"
            hint="No hay proyectos con presupuesto, cotizaciones aprobadas ni cobros registrados todavía."
            action={{ label: 'Ir a Cotizaciones', href: '/dashboard/cotizaciones' }}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div>
                <div className="text-4xl leading-none font-semibold">
                  {DOP.format(receivables.pending)}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  pendiente de cobro sobre {DOP.format(receivables.approved)} contratados
                  {receivables.approvedCount > 0 &&
                    ` en ${receivables.approvedCount} proyecto${receivables.approvedCount === 1 ? '' : 's'} o cotización${receivables.approvedCount === 1 ? '' : 'es'}`}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl leading-none font-semibold tabular-nums">
                  {pct.toFixed(0)}%
                </div>
                <p className="mt-1 text-xs text-muted-foreground">cobrado</p>
              </div>
            </div>

            <div
              className="mt-4 h-5 w-full overflow-hidden rounded-sm"
              style={{ background: 'color-mix(in srgb, var(--viz-s1) 20%, var(--card))' }}
              role="img"
              aria-label={`Cobrado ${DOP.format(receivables.collected)} de ${DOP.format(receivables.approved)} contratados, ${pct.toFixed(0)} por ciento`}
            >
              <div
                className="viz-bar-h h-full"
                style={{ width: `${width}%`, background: 'var(--viz-s1)' }}
              />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
              <div className="flex items-baseline gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: 'var(--viz-s1)' }}
                />
                <dt className="text-muted-foreground">Cobrado</dt>
                <dd className="ml-auto font-medium tabular-nums">
                  {DOP.format(receivables.collected)}
                </dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: 'color-mix(in srgb, var(--viz-s1) 20%, var(--card))' }}
                />
                <dt className="text-muted-foreground">Pendiente</dt>
                <dd className="ml-auto font-medium tabular-nums">
                  {DOP.format(receivables.pending)}
                </dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="text-muted-foreground">Pagos sin confirmar</dt>
                <dd className="ml-auto font-medium tabular-nums">
                  {DOP.format(receivables.unconfirmed)}
                </dd>
              </div>
            </dl>

            {receivables.unallocated > 0 && (
              <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                Además hay{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {DOP.format(receivables.unallocated)}
                </span>{' '}
                cobrados que no caen sobre nada contratado: proyectos sin presupuesto ni
                cotización aprobada, o cobros por encima del presupuesto. Ponle presupuesto
                a esos proyectos para que la cartera sea exacta.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
