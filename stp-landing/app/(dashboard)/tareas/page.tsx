import { api } from '@/lib/api'
import type { Task, PaginatedResponse } from '@/lib/types'
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

const STATUS_LABELS: Record<Task['status'], string> = {
  pending: 'Pendiente',
  'in-progress': 'En curso',
  completed: 'Completada',
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

export default async function TareasPage() {
  let tareas: Task[] = []
  let error: string | null = null

  try {
    const res = await api.get<PaginatedResponse<Task>>('/tasks?limit=100')
    tareas = res.data
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar tareas'
  }

  const pendientes = tareas.filter((t) => t.status === 'pending').length
  const enCurso = tareas.filter((t) => t.status === 'in-progress').length
  const completadas = tareas.filter((t) => t.status === 'completed').length
  const urgentes = tareas.filter((t) => t.priority === 'urgent' && t.status !== 'completed').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tareas</h1>
        <p className="text-muted-foreground text-sm">Seguimiento de tareas por proyecto</p>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Pendientes</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{pendientes}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">En curso</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{enCurso}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Completadas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{completadas}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Urgentes activas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{urgentes}</div></CardContent>
        </Card>
      </div>

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Vence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tareas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No hay tareas registradas
                  </TableCell>
                </TableRow>
              ) : (
                tareas.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.project ? `${t.project.code} — ${t.project.title}` : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANTS[t.priority]}>{PRIORITY_LABELS[t.priority]}</Badge>
                    </TableCell>
                    <TableCell>{STATUS_LABELS[t.status]}</TableCell>
                    <TableCell>
                      {t.dueDate
                        ? new Date(t.dueDate).toLocaleDateString('es-DO')
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
