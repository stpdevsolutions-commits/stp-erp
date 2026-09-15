export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { api } from '@/lib/api'
import type { Project, Task, PaginatedResponse } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, MapPin, User, HardHat, UserCheck, ExternalLink } from 'lucide-react'
import { VizTokens } from '@/components/charts/viz-tokens'
import { ProyectoSelector } from '@/components/cronograma/proyecto-selector'
import { AvanceProyeccion } from '@/components/cronograma/avance-proyeccion'
import { GanttSemanal } from '@/components/cronograma/gantt-semanal'

export default async function CronogramaPage({
  searchParams,
}: {
  searchParams: Promise<{ proyecto?: string }>
}) {
  const { proyecto: proyectoId } = await searchParams

  const projectsResult = await api
    .get<PaginatedResponse<Project>>('/projects?limit=200')
    .catch(() => ({ data: [] as Project[], total: 0, page: 1, limit: 200 }))
  const projects = projectsResult.data

  let project: Project | null = null
  let tasks: Task[] = []

  if (proyectoId) {
    project = await api.get<Project>(`/projects/${proyectoId}`).catch(() => null)
    if (project) {
      const tasksResult = await api
        .get<PaginatedResponse<Task>>(`/tasks?projectId=${proyectoId}&limit=200`)
        .catch(() => ({ data: [] as Task[], total: 0, page: 1, limit: 200 }))
      tasks = tasksResult.data
    }
  }

  return (
    <div className="space-y-6">
      <VizTokens />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma</h1>
        <p className="text-muted-foreground text-sm">
          Actividades de un proyecto organizadas por semana, con su avance frente al plazo.
        </p>
      </div>

      <ProyectoSelector projects={projects} selectedId={proyectoId ?? ''} />

      {!project ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {projects.length === 0
              ? 'No hay proyectos registrados todavía.'
              : 'Selecciona un proyecto para ver su cronograma.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{project.code}</span>
              </div>
              <h2 className="text-xl font-semibold tracking-tight">{project.name}</h2>
            </div>
            <Link
              href={`/dashboard/proyectos/${project.id}`}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              Ver ficha completa
              <ExternalLink className="size-3.5" />
            </Link>
          </div>

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <User className="size-3.5" />
                  <span className="text-xs">Cliente</span>
                </div>
                <p className="font-medium text-sm truncate">{project.client?.name ?? '—'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <MapPin className="size-3.5" />
                  <span className="text-xs">Ubicación</span>
                </div>
                <p className="font-medium text-sm truncate">{project.location || '—'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <UserCheck className="size-3.5" />
                  <span className="text-xs">Encargado</span>
                </div>
                <p className="font-medium text-sm truncate">
                  {project.assignedTo
                    ? `${project.assignedTo.firstName} ${project.assignedTo.lastName}`
                    : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <HardHat className="size-3.5" />
                  <span className="text-xs">Supervisor</span>
                </div>
                <p className="font-medium text-sm truncate">
                  {project.supervisor
                    ? `${project.supervisor.firstName} ${project.supervisor.lastName}`
                    : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="size-3.5" />
                  <span className="text-xs">Inicio</span>
                </div>
                <p className="font-medium text-sm">
                  {project.startDate ? new Date(project.startDate).toLocaleDateString('es-DO') : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="size-3.5" />
                  <span className="text-xs">Fin estimado</span>
                </div>
                <p className="font-medium text-sm">
                  {project.endDate ? new Date(project.endDate).toLocaleDateString('es-DO') : '—'}
                </p>
              </CardContent>
            </Card>
          </div>

          <AvanceProyeccion project={project} tasks={tasks} />
          <GanttSemanal project={project} tasks={tasks} />
        </>
      )}
    </div>
  )
}
