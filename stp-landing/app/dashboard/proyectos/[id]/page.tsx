import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Project, Task, Expense, Payment, FileUpload, PaginatedResponse, Ficha, User as AppUser } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, Calendar, DollarSign, FileText, User } from 'lucide-react'
import { ProjectDetailTabs } from '@/components/projects/project-detail-tabs'
import { MembersCard } from '@/components/access/members-card'
import type { Member } from '@/lib/actions/memberships'

const STATUS_LABELS: Record<Project['status'], string> = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}
// Colores semánticos de estado (tinte suave, coherente con la identidad STP)
const STATUS_BADGE: Record<Project['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-primary/10 text-primary',
  on_hold: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  completed: 'bg-green-600/10 text-green-700 dark:text-green-400',
  cancelled: 'bg-destructive/10 text-destructive',
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

  const rawFiles = await api.get<FileUpload[]>(`/files/clients/${project.clientId}/projects/${id}`).catch(() => [] as FileUpload[])
  const [tasks, expenses, payments, fichas] = await Promise.all([
    api.get<PaginatedResponse<Task>>(`/tasks?projectId=${id}&limit=100`).catch(() => ({ data: [], total: 0, page: 1, limit: 100 })),
    api.get<PaginatedResponse<Expense>>(`/expenses?projectId=${id}&limit=100`).catch(() => ({ data: [], total: 0, page: 1, limit: 100 })),
    api.get<PaginatedResponse<Payment>>(`/payments?projectId=${id}&limit=100`).catch(() => ({ data: [], total: 0, page: 1, limit: 100 })),
    api.get<Ficha[]>(`/fichas?projectId=${id}`).catch(() => [] as Ficha[]),
  ])
  const files = { data: rawFiles, total: rawFiles.length, page: 1, limit: rawFiles.length || 1 }

  // Panel de accesos: solo para ADMIN (los endpoints /members también lo son)
  const me = await api.get<Pick<AppUser, 'role'>>('/users/me').catch(() => ({ role: 'user' as const }))
  const isAdmin = me.role === 'admin'
  const [members, users] = isAdmin
    ? await Promise.all([
        api.get<Member[]>(`/projects/${id}/members`).catch(() => [] as Member[]),
        api
          .get<PaginatedResponse<AppUser>>('/users?limit=100')
          .then((r) => r.data)
          .catch(() => [] as AppUser[]),
      ])
    : [[] as Member[], [] as AppUser[]]

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm text-muted-foreground">{project.code}</span>
            <Badge className={STATUS_BADGE[project.status]}>{STATUS_LABELS[project.status]}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="text-muted-foreground text-sm mt-1">{project.description}</p>
          )}
        </div>
        {/* Informes del proyecto: uno interno (económico) y otro para entregar
            al cliente. La página elige cuál según el rol. */}
        <Button variant="outline" size="sm" render={<Link href={`/dashboard/proyectos/${id}/informe`} />}>
          <FileText className="size-4 mr-1.5" />
          Informes
        </Button>
      </div>

      {/* Info cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <User className="size-3.5" />
              <span className="text-xs">Cliente</span>
            </div>
            {project.client ? (
              <Link href={`/dashboard/clientes/${project.client.id}`} className="hover:underline font-medium text-sm">
                {project.client.name}
              </Link>
            ) : <p className="font-medium text-sm">—</p>}
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

      {/* Accesos (solo ADMIN) */}
      {isAdmin && (
        <MembersCard scope="project" resourceId={id} members={members} users={users} />
      )}

      {/* Tabs */}
      <ProjectDetailTabs
        tasks={tasks}
        expenses={expenses}
        payments={payments}
        files={files}
        fichas={fichas}
        clientId={project.clientId}
        projectId={id}
      />
    </div>
  )
}
