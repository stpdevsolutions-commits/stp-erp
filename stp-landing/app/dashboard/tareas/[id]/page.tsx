import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Task, Project, Collaborator, User, PaginatedResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, FolderKanban, Calendar, CalendarClock, UserCheck } from 'lucide-react'
import { TaskActions } from '@/components/tasks/task-actions'

const STATUS_LABELS: Record<Task['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  review: 'En revisión',
  done: 'Completada',
  cancelled: 'Cancelada',
}

const STATUS_BADGE: Record<Task['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  in_progress: 'bg-primary/10 text-primary',
  review: 'bg-primary/10 text-primary',
  done: 'bg-green-600/10 text-green-700 dark:text-green-400',
  cancelled: 'bg-destructive/10 text-destructive',
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

export default async function TareaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let tarea: Task
  try {
    tarea = await api.get<Task>(`/tasks/${id}`)
  } catch {
    notFound()
  }

  const [projects, collaborators, users] = await Promise.all([
    api.get<PaginatedResponse<Project>>('/projects?limit=200').then((r) => r.data).catch(() => [] as Project[]),
    api.get<PaginatedResponse<Collaborator>>('/collaborators?limit=200&status=active').then((r) => r.data).catch(() => [] as Collaborator[]),
    api.get<PaginatedResponse<User>>('/users?limit=200').then((r) => r.data).catch(() => [] as User[]),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/dashboard/tareas" />}>
          <ChevronLeft className="size-4" />
          Tareas
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className={STATUS_BADGE[tarea.status]}>{STATUS_LABELS[tarea.status]}</Badge>
            <Badge variant={PRIORITY_VARIANTS[tarea.priority]}>{PRIORITY_LABELS[tarea.priority]}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{tarea.title}</h1>
          {tarea.description && (
            <p className="text-muted-foreground text-sm mt-1">{tarea.description}</p>
          )}
        </div>
        <TaskActions tarea={tarea} projects={projects} collaborators={collaborators} users={users} />
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {tarea.project && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FolderKanban className="size-3.5" />
                <span className="text-xs">Proyecto</span>
              </div>
              <Link href={`/dashboard/proyectos/${tarea.project.id}`} className="font-medium text-sm hover:underline">
                {tarea.project.code} — {tarea.project.name}
              </Link>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="size-3.5" />
              <span className="text-xs">Inicio</span>
            </div>
            <p className="font-medium text-sm">
              {tarea.startDate ? new Date(tarea.startDate).toLocaleDateString('es-DO') : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CalendarClock className="size-3.5" />
              <span className="text-xs">Vence</span>
            </div>
            <p className="font-medium text-sm">
              {tarea.dueDate ? new Date(tarea.dueDate).toLocaleDateString('es-DO') : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <UserCheck className="size-3.5" />
              <span className="text-xs">Asignado a</span>
            </div>
            <p className="font-medium text-sm">
              {tarea.collaborator
                ? `${tarea.collaborator.firstName} ${tarea.collaborator.lastName}`
                : tarea.assignedTo
                  ? `${tarea.assignedTo.firstName} ${tarea.assignedTo.lastName}`
                  : '—'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
