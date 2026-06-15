import { api } from '@/lib/api'
import type {
  Project,
  Client,
  PaginatedResponse,
  ProjectReport,
  ClientReport,
  ExpenseCategory,
  Quote,
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

const QUOTE_STATUS_LABELS: Record<Quote['status'], string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
}

// ── Project Summary ────────────────────────────────────────────────────────────

function ProjectSummary({ report }: { report: ProjectReport }) {
  const { project, tasks, expenses, payments, balance } = report
  const totalTasks = Object.values(tasks).reduce((s, n) => s + n, 0)
  const budgetUsed = expenses.budgetUsed

  return (
    <div className="space-y-4">
      {/* Header */}
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
        {/* Tasks breakdown */}
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

        {/* Payments */}
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

        {/* Balance */}
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

      {/* Expenses */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Gastos</CardTitle>
            <span className="text-sm font-semibold tabular-nums">
              {DOP.format(expenses.total)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Budget bar */}
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
                    budgetUsed > 100
                      ? 'bg-destructive'
                      : budgetUsed > 80
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
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

          {/* By category */}
          {Object.entries(expenses.byCategory).length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Por categoría
              </p>
              {Object.entries(expenses.byCategory).map(([cat, amount]) => {
                const pct =
                  expenses.total > 0 ? ((amount / expenses.total) * 100).toFixed(0) : '0'
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

  return (
    <div className="space-y-4">
      {/* Header */}
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

      {/* Financial summary */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-lg font-bold tabular-nums">
              {DOP.format(approvedAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Monto aprobado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">
              {DOP.format(totalPaid)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Total cobrado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-lg font-bold tabular-nums text-destructive">
              {DOP.format(totalExpenses)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Gastos en proyectos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div
              className={`text-lg font-bold tabular-nums ${
                outstanding > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'
              }`}
            >
              {DOP.format(outstanding)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Saldo pendiente</p>
          </CardContent>
        </Card>
      </div>

      {/* Quotes by status */}
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
                {(
                  ['approved', 'sent', 'draft', 'rejected', 'expired'] as Quote['status'][]
                )
                  .filter((s) => quotes[s])
                  .map((s) => {
                    const q = quotes[s]!
                    return (
                      <TableRow key={s}>
                        <TableCell className="py-2">
                          {QUOTE_STATUS_LABELS[s]}
                        </TableCell>
                        <TableCell className="py-2 text-center tabular-nums">
                          {q.count}
                        </TableCell>
                        <TableCell className="py-2 text-right tabular-nums font-medium">
                          {DOP.format(q.amount)}
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
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ proyecto?: string; cliente?: string }>
}) {
  const { proyecto, cliente } = await searchParams

  const [projectsResult, clientsResult] = await Promise.allSettled([
    api.get<PaginatedResponse<Project>>('/projects?limit=200'),
    api.get<PaginatedResponse<Client>>('/clients?limit=200'),
  ])

  const projects =
    projectsResult.status === 'fulfilled' ? projectsResult.value.data : []
  const clients =
    clientsResult.status === 'fulfilled' ? clientsResult.value.data : []

  let projectReport: ProjectReport | null = null
  let clientReport: ClientReport | null = null

  if (proyecto) {
    try {
      projectReport = await api.get<ProjectReport>(`/reports/projects/${proyecto}`)
    } catch {}
  }

  if (cliente) {
    try {
      clientReport = await api.get<ClientReport>(`/reports/clients/${cliente}`)
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="size-6" />
          Reportes
        </h1>
        <p className="text-muted-foreground text-sm">
          Análisis detallado por proyecto y balance por cliente
        </p>
      </div>

      <ReporteNav
        projects={projects}
        clients={clients}
        activeProyecto={proyecto}
        activeCliente={cliente}
      />

      <Separator />

      {!proyecto && !cliente && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="size-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-sm">
            Selecciona un proyecto o cliente arriba para ver el reporte.
          </p>
        </div>
      )}

      {proyecto && !projectReport && (
        <p className="text-sm text-destructive">
          No se pudo cargar el reporte del proyecto. Verifica que el proyecto exista.
        </p>
      )}
      {cliente && !clientReport && (
        <p className="text-sm text-destructive">
          No se pudo cargar el balance del cliente. Verifica que el cliente exista.
        </p>
      )}

      {projectReport && <ProjectSummary report={projectReport} />}
      {clientReport && <ClientBalance report={clientReport} />}
    </div>
  )
}
