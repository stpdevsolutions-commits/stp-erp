import { api } from '@/lib/api'
import type { Client, Project, Task, Quote, PaginatedResponse } from '@/lib/types'
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
import { Users, FolderKanban, CheckSquare, FileText } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

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

const QUOTE_STATUS_VARIANTS: Record<Quote['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  sent: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  expired: 'secondary',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  let clients: Client[] = []
  let projects: Project[] = []
  let tasks: Task[] = []
  let quotes: Quote[] = []

  try {
    const [cRes, pRes, tRes, qRes] = await Promise.all([
      api.get<PaginatedResponse<Client>>('/clients?limit=200'),
      api.get<PaginatedResponse<Project>>('/projects?limit=200'),
      api.get<PaginatedResponse<Task>>('/tasks?limit=200'),
      api.get<PaginatedResponse<Quote>>('/quotes?limit=200'),
    ])
    clients = cRes.data
    projects = pRes.data
    tasks = tRes.data
    quotes = qRes.data
  } catch {
    // Partial data is fine — each section handles empty arrays gracefully
  }

  // Derived stats
  const activeClients = clients.filter((c) => c.isActive).length
  const inProgressProjects = projects.filter((p) => p.status === 'active')
  const activeTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'in-progress')
  const urgentTasks = activeTasks
    .filter((t) => t.priority === 'urgent' || t.priority === 'high')
    .slice(0, 6)
  const approvedTotal = quotes
    .filter((q) => q.status === 'approved')
    .reduce((sum, q) => sum + q.total, 0)
  const recentQuotes = [...quotes]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueTasks = activeTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < today,
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Resumen</h1>
        <p className="text-muted-foreground text-sm">Vista general del sistema ERP</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Clientes activos</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeClients}</div>
            <p className="text-xs text-muted-foreground mt-1">{clients.length} en total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Proyectos en curso</CardTitle>
            <FolderKanban className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{inProgressProjects.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{projects.length} en total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tareas activas</CardTitle>
            <CheckSquare className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeTasks.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {overdueTasks > 0 ? (
                <span className="text-destructive font-medium">{overdueTasks} vencidas</span>
              ) : (
                'Sin vencidas'
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cotizaciones aprobadas</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{DOP.format(approvedTotal)}</div>
            <p className="text-xs text-muted-foreground mt-1">{quotes.length} cotizaciones</p>
          </CardContent>
        </Card>
      </div>

      {/* Projects status breakdown */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
        {(['draft', 'active', 'on_hold', 'completed', 'cancelled'] as const).map((s) => {
          const count = projects.filter((p) => p.status === s).length
          return (
            <Card key={s} className="text-center">
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold">{count}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{PROJECT_STATUS_LABELS[s]}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Two-column: active projects + priority tasks */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">

        {/* Active projects */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Proyectos en curso</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {inProgressProjects.length === 0 ? (
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
                  {inProgressProjects.slice(0, 6).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm py-2">{p.code}</TableCell>
                      <TableCell className="font-medium py-2">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm py-2">
                        {p.client?.name ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* High-priority tasks */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tareas urgentes y de alta prioridad</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
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
                      <TableRow key={t.id}>
                        <TableCell className="py-2">
                          <div className="font-medium text-sm">{t.title}</div>
                          {t.project && (
                            <div className="text-xs text-muted-foreground">{t.project.code}</div>
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

      {/* Recent quotes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Últimas cotizaciones</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-sm py-2">{q.number}</TableCell>
                    <TableCell className="font-medium py-2">{q.title}</TableCell>
                    <TableCell className="text-muted-foreground text-sm py-2">
                      {q.client?.name ?? '—'}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant={QUOTE_STATUS_VARIANTS[q.status]}>
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
