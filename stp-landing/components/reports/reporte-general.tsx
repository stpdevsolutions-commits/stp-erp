import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { GeneralReport } from '@/lib/types'

/**
 * Reporte general: cómo va el negocio en el período.
 *
 * Es la única vista que cruza ingresos con gastos y enseña la UTILIDAD; el resto
 * de reportes miran un módulo cada uno.
 *
 * El bloque de nómina solo se pinta si el backend lo envía (`payroll`): para un
 * USER llega en `null` porque son sueldos, y en ese caso ni se insinúa.
 */

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

function fechaCorta(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`)

/** Variación contra el período anterior. Sin base no se pinta nada. */
function Variacion({ valor, invertido = false }: { valor: number | null; invertido?: boolean }) {
  if (valor == null) return null
  const sube = valor >= 0
  // En gastos, subir es malo: el color se invierte.
  const bueno = invertido ? !sube : sube
  const Icono = sube ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        bueno ? 'text-green-600 dark:text-green-400' : 'text-destructive'
      }`}
    >
      <Icono className="size-3" />
      {sube ? '+' : ''}
      {valor}%
    </span>
  )
}

function Cifra({
  titulo,
  valor,
  nota,
  variacion,
  invertido,
  tono,
}: {
  titulo: string
  valor: string
  nota?: string
  variacion?: number | null
  invertido?: boolean
  tono?: 'positivo' | 'negativo' | 'neutro'
}) {
  const color =
    tono === 'positivo'
      ? 'text-green-600 dark:text-green-400'
      : tono === 'negativo'
      ? 'text-destructive'
      : ''
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className={`text-xl font-bold tabular-nums ${color}`}>{valor}</div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          <Variacion valor={variacion ?? null} invertido={invertido} />
        </div>
        {nota && <p className="text-[11px] text-muted-foreground mt-1">{nota}</p>}
      </CardContent>
    </Card>
  )
}

export function ReporteGeneral({ report }: { report: GeneralReport }) {
  const { period, previousPeriod, finance, quotes, payroll, projects, fichas } = report
  const utilidadPositiva = finance.profit >= 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Reporte general del negocio</h2>
        <span className="text-sm text-muted-foreground font-normal">
          {fechaCorta(period.from)} — {fechaCorta(period.to)}
        </span>
        {previousPeriod && (
          <span className="text-xs text-muted-foreground">
            comparado con {fechaCorta(previousPeriod.from)} — {fechaCorta(previousPeriod.to)}
          </span>
        )}
      </div>

      {/* ── Resultado del período ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Cifra
          titulo="Ingresos cobrados"
          valor={DOP.format(finance.income)}
          nota={`${finance.incomeCount} cobro${finance.incomeCount === 1 ? '' : 's'}`}
          variacion={finance.variation?.income}
          tono="positivo"
        />
        <Cifra
          titulo="Gastos"
          valor={DOP.format(finance.expenses)}
          nota={`${finance.expenseCount} registro${finance.expenseCount === 1 ? '' : 's'}`}
          variacion={finance.variation?.expenses}
          invertido
          tono="negativo"
        />
        <Cifra
          titulo="Utilidad"
          valor={DOP.format(finance.profit)}
          nota="ingresos − gastos"
          variacion={finance.variation?.profit}
          tono={utilidadPositiva ? 'positivo' : 'negativo'}
        />
        <Cifra
          titulo="Margen de utilidad"
          valor={pct(finance.margin)}
          nota="sobre lo cobrado"
          tono={finance.margin != null && finance.margin >= 0 ? 'positivo' : 'negativo'}
        />
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* ── Cotizaciones ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Cotizaciones</CardTitle>
              <span className="text-xs text-muted-foreground">
                Conversión: <span className="font-semibold">{pct(quotes.conversionRate)}</span>
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-center">Cantidad</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="py-2 text-sm">Emitidas</TableCell>
                  <TableCell className="py-2 text-sm text-center tabular-nums">
                    {quotes.emitted.count}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-right tabular-nums font-medium">
                    {DOP.format(quotes.emitted.amount)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-2 text-sm">Aprobadas</TableCell>
                  <TableCell className="py-2 text-sm text-center tabular-nums text-green-600 dark:text-green-400">
                    {quotes.approved.count}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-right tabular-nums font-medium">
                    {DOP.format(quotes.approved.amount)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-2 text-sm">Rechazadas</TableCell>
                  <TableCell className="py-2 text-sm text-center tabular-nums text-destructive">
                    {quotes.rejected.count}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-right tabular-nums font-medium">
                    {DOP.format(quotes.rejected.amount)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="text-[11px] text-muted-foreground px-4 py-2">
              Emitidas = creadas en el período. Aprobadas y rechazadas = las que recibieron
              respuesta en el período; la conversión se mide sobre esas {quotes.decidedCount}.
            </p>
          </CardContent>
        </Card>

        {/* ── Proyectos ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Proyectos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xl font-bold tabular-nums">{projects.active}</div>
                <p className="text-xs text-muted-foreground">Activos</p>
              </div>
              <div>
                <div className="text-xl font-bold tabular-nums">{projects.completedInPeriod}</div>
                <p className="text-xs text-muted-foreground">Terminados en el período</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Presupuesto comprometido vs. gastado</span>
                <span className="font-semibold">{pct(projects.budgetUsed)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${
                    (projects.budgetUsed ?? 0) > 100
                      ? 'bg-destructive'
                      : (projects.budgetUsed ?? 0) > 80
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(projects.budgetUsed ?? 0, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="tabular-nums font-medium">
                  {DOP.format(projects.spent)}{' '}
                  <span className="text-xs text-muted-foreground">gastado</span>
                </span>
                <span className="tabular-nums font-medium">
                  {DOP.format(projects.budgetCommitted)}{' '}
                  <span className="text-xs text-muted-foreground">presupuestado</span>
                </span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Presupuesto y gasto son de los proyectos activos, en toda su vida — no solo del
              período.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* ── Nómina: solo si el backend la envía (MANAGER+) ── */}
        {payroll && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Nómina del período</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Pagos de nómina ({payroll.count})
                </span>
                <span className="font-semibold tabular-nums">{DOP.format(payroll.gross)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Neto entregado</span>
                <span className="font-medium tabular-nums">{DOP.format(payroll.net)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ya incluido en gastos</span>
                <span className="font-medium tabular-nums">
                  {DOP.format(payroll.imputedToExpenses)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                La nómina imputada a proyectos ya está dentro de &quot;Gastos&quot; como mano de
                obra: no se resta otra vez de la utilidad.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Fichas ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fichas técnicas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Creadas</span>
              <span className="font-semibold tabular-nums">{fichas.total}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Enviadas</span>
              <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">
                {fichas.enviadas}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tasa de envío</span>
              <span className="font-medium tabular-nums">{fichas.tasaEnvio}%</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
