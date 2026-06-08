import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Project, Task, Expense, Payment, FileUpload, PaginatedResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, Calendar, DollarSign, User } from 'lucide-react'
import { ProjectDetailTabs } from '@/components/projects/project-detail-tabs'

const STATUS_LABELS: Record<Project['status'], string> = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}
const STATUS_VARIANTS: Record<Project['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  active: 'default',
  on_hold: 'outline',
  completed: 'default',
  cancelled: 'destructive',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

export default async function ProyectoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let project: Project
  try {
    project = await api.get<Project>(`/projects/${id}`)
  } catch {
    notFound()
  }

  const [tasks, expenses, payments, files] = await Promise.all([
    api.get<PaginatedResponse<Task>>(`/tasks?projectId=${id}&limit=100`).catch(() => ({ data: [], total: 0, page: 1, limit: 100 })),
    api.get<PaginatedResponse<Expense>>(`/expenses?projectId=${id}&limit=100`).catch(() => ({ data: [], total: 0, page: 1, limit: 100 })),
    api.get<PaginatedResponse<Payment>>(`/payments?projectId=${id}&limit=100`).catch(() => ({ data: [], total: 0, page: 1, limit: 100 })),
    api.get<PaginatedResponse<FileUpload>>(`/files/clients/${project.clientId}/projects/${id}?limit=100`).catch(() => ({ data: [], total: 0, page: 1, limit: 100 })),
  ])

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/dashboard/proyectos" />}>
          <ChevronLeft className="size-4" />
          Proyectos
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm text-muted-foreground">{project.code}</span>
            <Badge variant={STATUS_VARIANTS[project.status]}>{STATUS_LABELS[project.status]}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="text-muted-foreground text-sm mt-1">{project.description}</p>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <User className="size-3.5" />
              <span className="text-xs">Cliente</span>
            </div>
            <p className="font-medium text-sm">{project.client?.name ?? '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="size-3.5" />
              <span className="text-xs">Presupuesto</span>
            </div>
            <p className="font-medium text-sm">
              {project.budget != null ? DOP.format(project.budget) : '—'}
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

      {/* Tabs */}
      <ProjectDetailTabs
        tasks={tasks}
        expenses={expenses}
        payments={payments}
        files={files}
      />
    </div>
  )
}
