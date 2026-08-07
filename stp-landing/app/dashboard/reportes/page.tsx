import Link from 'next/link'
import { api } from '@/lib/api'
import type {
  Project,
  Client,
  PaginatedResponse,
  ProjectReport,
  ClientReport,
  ExpenseCategory,
  Quote,
  IncomeReport,
  ExpensesReport,
  FichasReport,
  PaymentMethod,
  FichaType,
  FichaStatus,
  GeneralReport,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ReporteNav } from '@/components/reports/reporte-nav'
import { ExportarReporte } from '@/components/reports/exportar-reporte'
import { ReporteGeneral } from '@/components/reports/reporte-general'
import { BarChart3, AlertCircle } from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────────────────────

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const PROJECT_STATUS_VARIANTS: Record<
  Project['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'outline',
  active: 'default',
  on_hold: 'secondary',
  completed: 'secondary',
  cancelled: 'destructive',
}

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendientes',
  in_progress: 'En progreso',
  review: 'En revisión',
  done: 'Completadas',
  cancelled: 'Canceladas',
}

const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  subcontract: 'Subcontrato',
  travel: 'Transporte / Viaje',
  other: 'Otro',
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  check: 'Cheque',
  card: 'Tarjeta',
  other: 'Otro',
}

const QUOTE_STATUS_LABELS: Record<Quote['status'], string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
}

const FICHA_TYPE_LABELS: Record<FichaType, string> = {
  electrico: 'Eléctrico',
  civil: 'Civil',
  electromecanico: 'Electromecánico',
  levantamiento: 'Levantamiento',
  evaluacion_danos: 'Evaluación de daños',
}

const FICHA_STATUS_LABELS: Record<FichaStatus, string> = {
  borrador: 'Borrador',
  en_progreso: 'En progreso',
  enviada: 'Enviada',
}

// ── Period header ─────────────────────────────────────────────────────────────

function PeriodBadge({ from, to }: { from: string; to: string }) {
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })
  return (
    <span className="text-sm text-muted-foreground font-normal">
      {fmt(from)} — {fmt(to)}
    </span>
  )
}

// ── Project Summary ────────────────────────────────────────────────────────────

function ProjectSummary({ report }: { report: ProjectReport }) {
  const { project, tasks, expenses, payments, balance } = report
  const totalTasks = Object.values(tasks).reduce((s, n) => s + n, 0)
  const budgetUsed = expenses.budgetUsed

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm text-muted-foreground">{project.code}</span>
                <Badge variant={PROJECT_STATUS_VARIANTS[project.status]}>
                  {PROJECT_STATUS_LABELS[project.status]}
                </Badge>
              </div>
              <h2 className="text-xl font-bold">{project.name}</h2>
              {project.client && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Cliente: {project.client.name}
                </p>
              )}
            </div>
            <div className="text-right text-sm text-muted-foreground space-y-0.5">
              {project.startDate && (
                <p>Inicio: {new Date(project.startDate).toLocaleDateString('es-DO')}</p>
              )}
              {project.endDate && (
                <p>Cierre: {new Date(project.endDate).toLocaleDateString('es-DO')}</p>
              )}
              {project.budget != null && (
                <p className="font-medium text-foreground">
                  Presupuesto: {DOP.format(project.budget)}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tareas ({totalTasks})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {totalTasks === 0 ? (
              <p className="text-sm text-muted-foreground">Sin tareas registradas.</p>
            ) : (
              Object.entries(tasks).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {TASK_STATUS_LABELS[status] ?? status}
                  </span>
                  <span className="font-semibold tabular-nums">{count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cobros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
              {DOP.format(payments.total)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">total recibido</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold tabular-nums ${
                balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'
              }`}
            >
              {DOP.format(balance)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">cobros − gastos</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Gastos</CardTitle>
            <span className="text-sm font-semibold tabular-nums">{DOP.format(expenses.total)}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {budgetUsed != null && project.budget != null && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uso de presupuesto</span>
                <span
                  className={
                    budgetUsed > 100
                      ? 'text-destructive font-semibold'
                      : budgetUsed > 80
                      ? 'text-yellow-600 dark:text-yellow-400 font-semibold'
                      : 'text-green-600 dark:text-green-400 font-semibold'
                  }
                >
                  {budgetUsed.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${
                    budgetUsed > 100 ? 'bg-destructive' : budgetUsed > 80 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(budgetUsed, 100)}%` }}
                />
              </div>
              {budgetUsed > 100 && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3" />
                  Presupuesto excedido en {DOP.format(expenses.total - project.budget)}
                </p>
              )}
            </div>
          )}
          {Object.entries(expenses.byCategory).length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Por categoría</p>
              {Object.entries(expenses.byCategory).map(([cat, amount]) => {
                const pct = expenses.total > 0 ? ((amount / expenses.total) * 100).toFixed(0) : '0'
                return (
                  <div key={cat} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory] ?? cat}
                    </span>
                    <span className="font-medium tabular-nums">
                      {DOP.format(amount)}{' '}
                      <span className="text-xs text-muted-foreground">({pct}%)</span>
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin gastos registrados.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Client Balance ─────────────────────────────────────────────────────────────

function ClientBalance({ report }: { report: ClientReport }) {
  const { client, quotes, approvedAmount, totalPaid, totalExpenses, outstanding } = report
  const proyectos = report.projects ?? []
  const presupuestoProyectos = report.projectsBudget ?? 0

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold">{client.name}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {client.type === 'company' ? 'Empresa' : 'Persona natural'}
                {client.rnc && ` · RNC: ${client.rnc}`}
              </p>
            </div>
            <div className="text-right text-sm text-muted-foreground space-y-0.5">
              {client.email && <p>{client.email}</p>}
              {client.phone && <p>{client.phone}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-lg font-bold tabular-nums">{DOP.format(approvedAmount)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Monto aprobado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">{DOP.format(totalPaid)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Total cobrado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-lg font-bold tabular-nums text-destructive">{DOP.format(totalExpenses)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Gastos en proyectos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className={`text-lg font-bold tabular-nums ${outstanding > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
              {DOP.format(outstanding)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Saldo pendiente</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            Proyectos{proyectos.length > 0 && ` (${proyectos.length})`}
          </CardTitle>
          {proyectos.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Presupuesto total: {DOP.format(presupuestoProyectos)}
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {proyectos.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-4">Sin proyectos registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Presupuesto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proyectos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="py-2 font-mono text-sm">
                      <Link href={`/dashboard/proyectos/${p.id}`} className="hover:underline">
                        {p.code}
                      </Link>
                    </TableCell>
                    <TableCell className="py-2 font-medium">
                      <Link href={`/dashboard/proyectos/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                      {p.startDate && (
                        <div className="text-xs text-muted-foreground font-normal">
                          Inicio: {new Date(p.startDate).toLocaleDateString('es-DO')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant={PROJECT_STATUS_VARIANTS[p.status]}>
                        {PROJECT_STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-right tabular-nums">
                      {p.budget != null ? DOP.format(p.budget) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cotizaciones</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {Object.keys(quotes).length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-4">Sin cotizaciones registradas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-center">Cantidad</TableHead>
                  <TableHead className="text-right">Monto total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(['approved', 'sent', 'draft', 'rejected', 'expired'] as Quote['status'][])
                  .filter((s) => quotes[s])
                  .map((s) => {
                    const q = quotes[s]!
                    return (
                      <TableRow key={s}>
                        <TableCell className="py-2">{QUOTE_STATUS_LABELS[s]}</TableCell>
                        <TableCell className="py-2 text-center tabular-nums">{q.count}</TableCell>
                        <TableCell className="py-2 text-right tabular-nums font-medium">{DOP.format(q.amount)}</TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Income Report ─────────────────────────────────────────────────────────────

function IncomeReportView({ report }: { report: IncomeReport }) {
  const { period, summary, byMethod, payments } = report

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Reporte de Ingresos</h2>
        <PeriodBadge from={period.from} to={period.to} />
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold tabular-nums text-green-600 dark:text-green-400">{DOP.format(summary.total)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Cobrado en el período</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold tabular-nums">{summary.count}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Pagos recibidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold tabular-nums">{DOP.format(summary.quotesApproved.total)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Cotizaciones aprobadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold tabular-nums text-yellow-600 dark:text-yellow-400">{DOP.format(summary.pendingPayments.total)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Pagos pendientes</p>
          </CardContent>
        </Card>
      </div>

      {byMethod.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Por método de pago</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {byMethod.map((row) => {
              const pct = summary.total > 0 ? ((row.total / summary.total) * 100).toFixed(0) : '0'
              return (
                <div key={row.method} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{PAYMENT_METHOD_LABELS[row.method] ?? row.method}</span>
                  <span className="font-medium tabular-nums">
                    {DOP.format(row.total)}{' '}
                    <span className="text-xs text-muted-foreground">({pct}% · {row.count} pago{row.count !== 1 ? 's' : ''})</span>
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {payments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Detalle de pagos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="py-2 text-sm tabular-nums whitespace-nowrap">
                      {new Date(p.date + 'T00:00:00').toLocaleDateString('es-DO')}
                    </TableCell>
                    <TableCell className="py-2 text-sm">{p.client ?? '—'}</TableCell>
                    <TableCell className="py-2 text-sm text-muted-foreground">{p.project ?? '—'}</TableCell>
                    <TableCell className="py-2 text-sm">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</TableCell>
                    <TableCell className="py-2 text-sm text-right tabular-nums font-medium">{DOP.format(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {payments.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">Sin pagos registrados en el período seleccionado.</p>
      )}
    </div>
  )
}

// ── Expenses Report ───────────────────────────────────────────────────────────

function ExpensesReportView({ report }: { report: ExpensesReport }) {
  const { period, summary, byCategory, byProject, topSuppliers } = report

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Reporte de Gastos</h2>
        <PeriodBadge from={period.from} to={period.to} />
      </div>

      <div className="grid gap-4 grid-cols-2">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold tabular-nums text-destructive">{DOP.format(summary.total)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Total en el período</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold tabular-nums">{summary.count}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Registros de gasto</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {byCategory.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Por categoría</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {byCategory.map((row) => {
                const pct = summary.total > 0 ? ((row.total / summary.total) * 100).toFixed(0) : '0'
                return (
                  <div key={row.category} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{EXPENSE_CATEGORY_LABELS[row.category] ?? row.category}</span>
                    <span className="font-medium tabular-nums">
                      {DOP.format(row.total)}{' '}
                      <span className="text-xs text-muted-foreground">({pct}%)</span>
                    </span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {topSuppliers.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top proveedores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topSuppliers.map((row, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[60%]">{row.supplier}</span>
                  <span className="font-medium tabular-nums">{DOP.format(row.total)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {byProject.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Por proyecto</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proyecto</TableHead>
                  <TableHead className="text-center">Registros</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byProject.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-2 text-sm">{row.project}</TableCell>
                    <TableCell className="py-2 text-sm text-center tabular-nums">{row.count}</TableCell>
                    <TableCell className="py-2 text-sm text-right tabular-nums font-medium">{DOP.format(row.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {byCategory.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">Sin gastos registrados en el período seleccionado.</p>
      )}
    </div>
  )
}

// ── Fichas Report ─────────────────────────────────────────────────────────────

function FichasReportView({ report }: { report: FichasReport }) {
  const { period, summary, byType, byStatus, byTechnician } = report

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Reporte de Fichas</h2>
        <PeriodBadge from={period.from} to={period.to} />
      </div>

      <div className="grid gap-4 grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold tabular-nums">{summary.total}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Total fichas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold tabular-nums text-green-600 dark:text-green-400">{summary.enviadas}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Enviadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xl font-bold tabular-nums">{summary.tasaEnvio}%</div>
            <p className="text-xs text-muted-foreground mt-0.5">Tasa de envío</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {byType.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Por tipo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {byType.map((row) => (
                <div key={row.type} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{FICHA_TYPE_LABELS[row.type] ?? row.type}</span>
                  <span className="font-semibold tabular-nums">{row.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {byStatus.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Por estado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {byStatus.map((row) => (
                <div key={row.status} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{FICHA_STATUS_LABELS[row.status as FichaStatus] ?? row.status}</span>
                  <span className="font-semibold tabular-nums">{row.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {byTechnician.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Por técnico</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Técnico</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Enviadas</TableHead>
                  <TableHead className="text-right">Tasa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byTechnician.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="py-2 text-sm">{row.name}</TableCell>
                    <TableCell className="py-2 text-sm text-center tabular-nums">{row.total}</TableCell>
                    <TableCell className="py-2 text-sm text-center tabular-nums text-green-600 dark:text-green-400">{row.enviadas}</TableCell>
                    <TableCell className="py-2 text-sm text-right tabular-nums">
                      {row.total > 0 ? ((row.enviadas / row.total) * 100).toFixed(0) : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {summary.total === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">Sin fichas registradas en el período seleccionado.</p>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ proyecto?: string; cliente?: string; view?: string; from?: string; to?: string; tab?: string }>
}) {
  const { proyecto, cliente, view, from, to, tab } = await searchParams

  const [projectsResult, clientsResult] = await Promise.allSettled([
    api.get<PaginatedResponse<Project>>('/projects?limit=200'),
    api.get<PaginatedResponse<Client>>('/clients?limit=200'),
  ])

  const projects = projectsResult.status === 'fulfilled' ? projectsResult.value.data : []
  const clients = clientsResult.status === 'fulfilled' ? clientsResult.value.data : []

  let projectReport: ProjectReport | null = null
  let clientReport: ClientReport | null = null
  let incomeReport: IncomeReport | null = null
  let expensesReport: ExpensesReport | null = null
  let fichasReport: FichasReport | null = null
  let generalReport: GeneralReport | null = null

  if (proyecto) {
    try { projectReport = await api.get<ProjectReport>(`/reports/projects/${proyecto}`) } catch {}
  } else if (cliente) {
    try { clientReport = await api.get<ClientReport>(`/reports/clients/${cliente}`) } catch {}
  } else if (view === 'ingresos') {
    const q = from && to ? `?from=${from}&to=${to}` : ''
    try { incomeReport = await api.get<IncomeReport>(`/reports/income${q}`) } catch {}
  } else if (view === 'gastos') {
    const q = from && to ? `?from=${from}&to=${to}` : ''
    try { expensesReport = await api.get<ExpensesReport>(`/reports/expenses${q}`) } catch {}
  } else if (view === 'fichas') {
    const q = from && to ? `?from=${from}&to=${to}` : ''
    try { fichasReport = await api.get<FichasReport>(`/reports/fichas${q}`) } catch {}
  } else if (view === 'general') {
    const q = from && to ? `?from=${from}&to=${to}` : ''
    try { generalReport = await api.get<GeneralReport>(`/reports/general${q}`) } catch {}
  }

  const hasContent = projectReport || clientReport || incomeReport || expensesReport || fichasReport || generalReport

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="size-6" />
            Reportes
          </h1>
          <p className="text-muted-foreground text-sm">
            Análisis de proyectos, clientes, ingresos, gastos y fichas
          </p>
        </div>
        {/* Solo se ofrece exportar lo que efectivamente hay en pantalla. */}
        {projectReport && <ExportarReporte tipo="proyecto" id={proyecto} />}
        {clientReport && <ExportarReporte tipo="cliente" id={cliente} />}
        {incomeReport && <ExportarReporte tipo="ingresos" from={from} to={to} />}
        {expensesReport && <ExportarReporte tipo="gastos" from={from} to={to} />}
        {fichasReport && <ExportarReporte tipo="fichas" from={from} to={to} />}
        {generalReport && <ExportarReporte tipo="general" from={from} to={to} />}
      </div>

      <ReporteNav
        projects={projects}
        clients={clients}
        activeProyecto={proyecto}
        activeCliente={cliente}
        activeView={view}
        activeFrom={from}
        activeTo={to}
        activeTab={tab}
      />

      <Separator />

      {!hasContent && !proyecto && !cliente && !view && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="size-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-sm">
            Selecciona una vista arriba para ver el reporte.
          </p>
        </div>
      )}

      {proyecto && !projectReport && (
        <p className="text-sm text-destructive">No se pudo cargar el reporte del proyecto.</p>
      )}
      {cliente && !clientReport && (
        <p className="text-sm text-destructive">No se pudo cargar el balance del cliente.</p>
      )}
      {(view === 'ingresos') && !incomeReport && (
        <p className="text-sm text-destructive">No se pudo cargar el reporte de ingresos.</p>
      )}
      {(view === 'gastos') && !expensesReport && (
        <p className="text-sm text-destructive">No se pudo cargar el reporte de gastos.</p>
      )}
      {(view === 'fichas') && !fichasReport && (
        <p className="text-sm text-destructive">No se pudo cargar el reporte de fichas.</p>
      )}
      {(view === 'general') && !generalReport && (
        <p className="text-sm text-destructive">No se pudo cargar el reporte general.</p>
      )}

      {projectReport && <ProjectSummary report={projectReport} />}
      {clientReport && <ClientBalance report={clientReport} />}
      {incomeReport && <IncomeReportView report={incomeReport} />}
      {expensesReport && <ExpensesReportView report={expensesReport} />}
      {fichasReport && <FichasReportView report={fichasReport} />}
      {generalReport && <ReporteGeneral report={generalReport} />}
    </div>
  )
}
