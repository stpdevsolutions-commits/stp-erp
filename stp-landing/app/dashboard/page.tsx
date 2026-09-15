export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { api } from '@/lib/api'
import type { DashboardReport } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, FolderKanban, CheckSquare, Scale } from 'lucide-react'

import type { AnalyticsReport } from '@/components/charts/types'
import { VizTokens } from '@/components/charts/viz-tokens'
import { IncomeVsExpenses } from '@/components/charts/income-vs-expenses'
import { QuotesFunnel } from '@/components/charts/quotes-funnel'
import { QuotesAging } from '@/components/charts/quotes-aging'
import { ReceivablesMeter } from '@/components/charts/receivables-meter'
import { PendingActions } from '@/components/charts/pending-actions'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

const MONTHS_WINDOW = 6

export default async function DashboardPage() {
  const [drResult, anResult] = await Promise.allSettled([
    api.get<DashboardReport>('/reports/dashboard'),
    api.get<AnalyticsReport>(`/reports/analytics?months=${MONTHS_WINDOW}`),
  ])

  const dashReport = drResult.status === 'fulfilled' ? drResult.value : null
  const analytics = anResult.status === 'fulfilled' ? anResult.value : null

  const totalClientes = dashReport?.clients.total ?? '—'
  const proyectosEnCurso = dashReport?.projects.active ?? 0
  const tareasVencidas = dashReport?.tasks.overdue ?? 0
  const gastosEsteMes = dashReport?.expenses.thisMonth ?? 0
  const cobrosEsteMes = dashReport?.payments.thisMonth ?? 0
  const balanceMes = cobrosEsteMes - gastosEsteMes

  return (
    <div className="space-y-6">
      <VizTokens />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Resumen</h1>
        <p className="text-muted-foreground text-sm">
          Vista general del sistema ERP
          {analytics && ` · datos al ${new Date(analytics.generatedAt + 'T00:00:00').toLocaleDateString('es-DO')}`}
        </p>
      </div>

      {/* Fila de indicadores — cada tarjeta lleva a su registro */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/clientes" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full transition-colors hover:bg-accent/40">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Clientes</CardTitle>
              <Users className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalClientes}</div>
              <p className="text-xs text-muted-foreground mt-1">en total</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/proyectos" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full transition-colors hover:bg-accent/40">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Proyectos en curso</CardTitle>
              <FolderKanban className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{proyectosEnCurso}</div>
              <p className="text-xs text-muted-foreground mt-1">activos ahora</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/tareas" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full transition-colors hover:bg-accent/40">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Tareas vencidas</CardTitle>
              <CheckSquare className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${tareasVencidas > 0 ? 'text-destructive' : ''}`}>
                {tareasVencidas}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {tareasVencidas > 0 ? (
                  <span className="text-destructive">requieren atención</span>
                ) : (
                  'sin vencidas'
                )}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/pagos" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full transition-colors hover:bg-accent/40">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Balance del mes</CardTitle>
              <Scale className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-lg font-bold tabular-nums ${
                  balanceMes > 0
                    ? 'text-green-700 dark:text-green-400'
                    : balanceMes < 0
                      ? 'text-destructive'
                      : ''
                }`}
              >
                {DOP.format(balanceMes)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                {DOP.format(cobrosEsteMes)} cobrados
                <br className="sm:hidden" />
                <span className="hidden sm:inline"> − </span>
                <span className="sm:hidden">menos </span>
                {DOP.format(gastosEsteMes)} gastados
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {analytics ? (
        <>
          <PendingActions
            receivables={analytics.receivables}
            aging={analytics.quotesAging}
            overdueTasks={dashReport?.tasks.overdue ?? tareasVencidas}
          />

          <ReceivablesMeter receivables={analytics.receivables} />

          <IncomeVsExpenses
            months={analytics.cashflow.months}
            totals={analytics.cashflow.totals}
            hasData={analytics.cashflow.hasData}
          />

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <QuotesFunnel quotes={analytics.quotes} />
            <QuotesAging aging={analytics.quotesAging} />
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No se pudieron cargar las gráficas del panel. Vuelve a intentarlo en unos
            minutos.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
