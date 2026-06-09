import { api } from '@/lib/api'
import type { Project, Task, User, PaginatedResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NuevaTareaDialog } from '@/components/tasks/nueva-tarea-dialog'
import { TaskActions } from '@/components/tasks/task-actions'
import { FiltrosTareas } from '@/components/tareas/filtros-tareas'
import { Paginacion } from '@/components/ui/paginacion'

const STATUS_LABELS: Record<Task['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  review: 'En revisión',
  done: 'Completada',
  cancelled: 'Cancelada',
}

const PRIORITY_LABELS: Record<Task['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

const PRIORITY_VARIANTS: Record<Task['priority'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'default',
  urgent: 'destructive',
}

const LIMIT = 20

export default async function TareasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1))

  const q = new URLSearchParams({ limit: String(LIMIT), page: String(page) })
  if (sp.search) q.set('search', sp.search)
  if (sp.status) q.set('status', sp.status)
  if (sp.priority) q.set('priority', sp.priority)

  let tareasRes: PaginatedResponse<Task> = { data: [], total: 0, page, limit: LIMIT }
  let projects: Project[] = []
  let users: User[] = []
  let error: string | null = null

  try {
    const [tr, proyRes, usersRes] = await Promise.all([
      api.get<PaginatedResponse<Task>>(`/tasks?${q.toString()}`),
      api.get<PaginatedResponse<Project>>('/projects?limit=200'),
      api.get<PaginatedResponse<User>>('/users?limit=200'),
    ])
    tareasRes = tr
    projects = proyRes.data
    users = usersRes.data
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar tareas'
  }

  const tareas = tareasRes.data
  const pendientes = tareas.filter((t) => t.status === 'pending').length
  const enCurso = tareas.filter((t) => t.status === 'in_progress' || t.status === 'review').length
  const completadas = tareas.filter((t) => t.status === 'done').length
  const urgentes = tareas.filter((t) => t.priority === 'urgent' && t.status !== 'done').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tareas</h1>
          <p className="text-muted-foreground text-sm">Seguimiento de tareas por proyecto</p>
        </div>
        <NuevaTareaDialog projects={projects} users={users} />
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Pendientes</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{pendientes}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">En curso</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{enCurso}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Completadas</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{completadas}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Urgentes activas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{urgentes}</div>
          </CardContent>
        </Card>
      </div>

      <FiltrosTareas />

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Asignado a</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tareas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No hay tareas que coincidan con los filtros
                    </TableCell>
                  </TableRow>
                ) : (
                  tareas.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        <div>{t.title}</div>
                        {t.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.project ? `${t.project.code} — ${t.project.name}` : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={PRIORITY_VARIANTS[t.priority]}>{PRIORITY_LABELS[t.priority]}</Badge>
                      </TableCell>
                      <TableCell>{STATUS_LABELS[t.status]}</TableCell>
                      <TableCell>
                        {t.dueDate ? new Date(t.dueDate).toLocaleDateString('es-DO') : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '—'}
                      </TableCell>
                      <TableCell>
                        <TaskActions tarea={t} projects={projects} users={users} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Paginacion total={tareasRes.total} page={page} limit={LIMIT} />
        </>
      )}
    </div>
  )
}
