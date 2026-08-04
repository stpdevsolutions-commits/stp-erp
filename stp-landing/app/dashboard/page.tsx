export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { api } from '@/lib/api'
import type {
  Project,
  Task,
  Quote,
  PaginatedResponse,
  DashboardReport,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Users,
  FolderKanban,
  CheckSquare,
  Scale,
  AlertCircle,
} from 'lucide-react'

import type { AnalyticsReport } from '@/components/charts/types'
import { VizTokens } from '@/components/charts/viz-tokens'
import { IncomeVsExpenses } from '@/components/charts/income-vs-expenses'
import { QuotesFunnel } from '@/components/charts/quotes-funnel'
import { QuotesAging } from '@/components/charts/quotes-aging'
import { ProjectsMix } from '@/components/charts/projects-mix'
import { ExpensesByCategory } from '@/components/charts/expenses-by-category'
import { ReceivablesMeter } from '@/components/charts/receivables-meter'
import { PendingActions } from '@/components/charts/pending-actions'

/** Enlace dentro de una celda: se subraya al pasar por encima, no siempre. */
const CELL_LINK = 'underline-offset-4 hover:underline focus:outline-none focus-visible:underline'

const PRIORITY_VARIANTS: Record<Task['priority'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'default',
  urgent: 'destructive',
}

const PRIORITY_LABELS: Record<Task['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

const QUOTE_STATUS_LABELS: Record<Quote['status'], string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
}

// Colores semánticos de estado (tinte suave, coherente con la identidad STP)
const QUOTE_STATUS_BADGE: Record<Quote['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-primary/10 text-primary',
  approved: 'bg-green-600/10 text-green-700 dark:text-green-400',
  rejected: 'bg-destructive/10 text-destructive',
  expired: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

const MONTHS_WINDOW = 6

export default async function DashboardPage() {
  const [drResult, anResult, pResult, tResult, qResult] = await Promise.allSettled([
    api.get<DashboardReport>('/reports/dashboard'),
    api.get<AnalyticsReport>(`/reports/analytics?months=${MONTHS_WINDOW}`),
    api.get<PaginatedResponse<Project>>('/projects?limit=20'),
    api.get<PaginatedResponse<Task>>('/tasks?limit=20'),
    api.get<PaginatedResponse<Quote>>('/quotes?limit=5'),
  ])

  const dashReport = drResult.status === 'fulfilled' ? drResult.value : null
  const analytics = anResult.status === 'fulfilled' ? anResult.value : null
  const allProjects = pResult.status === 'fulfilled' ? pResult.value.data : []
  const allTasks = tResult.status === 'fulfilled' ? tResult.value.data : []
  const recentQuotes = qResult.status === 'fulfilled' ? qResult.value.data : []

  const activeProjects = allProjects.filter((p) => p.status === 'active')
  const urgentTasks = allTasks
    .filter(
      (t) =>
        (t.priority === 'urgent' || t.priority === 'high') &&
        (t.status === 'pending' || t.status === 'in_progress' || t.status === 'review'),
    )
    .slice(0, 6)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const totalClientes = dashReport?.clients.total ?? '—'
  const proyectosEnCurso = dashReport?.projects.active ?? activeProjects.length
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

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <ProjectsMix projects={analytics.projects} />
            <ExpensesByCategory
              expenses={analytics.expenses}
              months={analytics.window.months}
            />
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

      {/* Dos columnas: proyectos activos + tareas prioritarias */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Proyectos en curso</CardTitle>
            <Link href="/dashboard/proyectos" className={`text-sm text-muted-foreground ${CELL_LINK}`}>
              Ver todos
            </Link>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {activeProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground px-6 pb-4">No hay proyectos en curso.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Cliente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeProjects.slice(0, 6).map((p) => (
                    <TableRow key={p.id} className="hover:bg-accent/40">
                      <TableCell className="font-mono text-sm py-2">
                        <Link href={`/dashboard/proyectos/${p.id}`} className={CELL_LINK}>
                          {p.code}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium py-2">
                        <Link href={`/dashboard/proyectos/${p.id}`} className={CELL_LINK}>
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm py-2">
                        {p.client ? (
                          <Link href={`/dashboard/clientes/${p.client.id}`} className={CELL_LINK}>
                            {p.client.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <CardTitle className="text-base">Tareas urgentes / alta prioridad</CardTitle>
            {tareasVencidas > 0 && (
              <Badge variant="destructive" className="ml-auto">
                <AlertCircle className="size-3 mr-1" />
                {tareasVencidas} vencidas
              </Badge>
            )}
            <Link
              href="/dashboard/tareas"
              className={`text-sm text-muted-foreground ${tareasVencidas > 0 ? '' : 'ml-auto'} ${CELL_LINK}`}
            >
              Ver todas
            </Link>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {urgentTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground px-6 pb-4">No hay tareas urgentes activas.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarea</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Vence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {urgentTasks.map((t) => {
                    const overdue = t.dueDate && new Date(t.dueDate) < today
                    return (
                      <TableRow key={t.id} className="hover:bg-accent/40">
                        <TableCell className="py-2">
                          {/* Las tareas no tienen página propia: el enlace útil es su proyecto. */}
                          <div className="font-medium text-sm">{t.title}</div>
                          {t.project && (
                            <Link
                              href={`/dashboard/proyectos/${t.project.id}`}
                              className={`text-xs text-muted-foreground ${CELL_LINK}`}
                            >
                              {t.project.code}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant={PRIORITY_VARIANTS[t.priority]}>
                            {PRIORITY_LABELS[t.priority]}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-sm">
                          {t.dueDate ? (
                            <span className={overdue ? 'text-destructive font-medium' : ''}>
                              {new Date(t.dueDate).toLocaleDateString('es-DO')}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Últimas cotizaciones */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Últimas cotizaciones</CardTitle>
          <Link href="/dashboard/cotizaciones" className={`text-sm text-muted-foreground ${CELL_LINK}`}>
            Ver todas
          </Link>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {recentQuotes.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-4">No hay cotizaciones registradas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentQuotes.map((q) => (
                  <TableRow key={q.id} className="hover:bg-accent/40">
                    <TableCell className="font-mono text-sm py-2">
                      <Link href={`/dashboard/cotizaciones/${q.id}`} className={CELL_LINK}>
                        {q.number}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium py-2">
                      <Link href={`/dashboard/cotizaciones/${q.id}`} className={CELL_LINK}>
                        {q.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm py-2">
                      {q.client ? (
                        <Link href={`/dashboard/clientes/${q.client.id}`} className={CELL_LINK}>
                          {q.client.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge className={QUOTE_STATUS_BADGE[q.status]}>
                        {QUOTE_STATUS_LABELS[q.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums py-2">
                      {DOP.format(q.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
