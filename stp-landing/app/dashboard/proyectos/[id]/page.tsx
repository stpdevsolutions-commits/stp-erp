import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Client, Collaborator, Project, Task, Expense, Payment, FileUpload, PaginatedResponse, Ficha, User as AppUser } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, Calendar, DollarSign, FileText, User, HardHat, UserCheck, MapPin } from 'lucide-react'
import { ProjectDetailTabs } from '@/components/projects/project-detail-tabs'
import { ProjectActions } from '@/components/projects/project-actions'
import type { Member } from '@/lib/actions/memberships'
import { formatDate } from '@/lib/utils'

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

  // /expenses devuelve la suma de TODO el proyecto (no solo los 100 cargados);
  // los pagos de un proyecto son pocos, se suman los completados aquí.
  const gastado =
    (expenses as PaginatedResponse<Expense> & { totalAmount?: number }).totalAmount ??
    expenses.data.reduce((s, e) => s + e.amount, 0)
  const cobrado = payments.data
    .filter((p) => p.status === 'completed')
    .reduce((s, p) => s + p.amount, 0)
  const balance = cobrado - gastado
  const presupuesto = project.budget ?? 0

  // Clientes/colaboradores/usuarios: para los selects del diálogo de edición
  // (Editar requiere MANAGER, no solo ADMIN — igual que en el listado de
  // proyectos; /users es ADMIN-only y devuelve 403 para MANAGER/USER, con su
  // propio catch para no tumbar la carga entera de la página).
  const me = await api.get<Pick<AppUser, 'role'>>('/users/me').catch(() => ({ role: 'user' as const }))
  const isAdmin = me.role === 'admin'
  const [clients, collaborators, users] = await Promise.all([
    api
      .get<PaginatedResponse<Client>>('/clients?limit=200&isActive=true')
      .then((r) => r.data)
      .catch(() => [] as Client[]),
    api
      .get<PaginatedResponse<Collaborator>>('/collaborators?limit=200&status=active')
      .then((r) => r.data)
      .catch(() => [] as Collaborator[]),
    api
      .get<PaginatedResponse<AppUser>>('/users?limit=100')
      .then((r) => r.data)
      .catch(() => [] as AppUser[]),
  ])

  // Panel de Accesos (dentro del diálogo de edición): solo para ADMIN, el
  // endpoint /members también lo es.
  const members = isAdmin
    ? await api.get<Member[]>(`/projects/${id}/members`).catch(() => [] as Member[])
    : ([] as Member[])

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
        <div className="flex items-center gap-2">
          {/* Informes del proyecto: uno interno (económico) y otro para entregar
              al cliente. La página elige cuál según el rol. */}
          <Button variant="outline" size="sm" render={<Link href={`/dashboard/proyectos/${id}/informe`} />}>
            <FileText className="size-4 mr-1.5" />
            Informes
          </Button>
          <ProjectActions
            proyecto={project}
            clients={clients}
            collaborators={collaborators}
            users={users}
            isAdmin={isAdmin}
            showAccess={isAdmin}
            members={members}
          />
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
              <MapPin className="size-3.5" />
              <span className="text-xs">Ubicación</span>
            </div>
            <p className="font-medium text-sm">{project.location || '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="size-3.5" />
              <span className="text-xs">Inicio</span>
            </div>
            <p className="font-medium text-sm">
              {formatDate(project.startDate)}
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
              {formatDate(project.endDate)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <HardHat className="size-3.5" />
              <span className="text-xs">Supervisor</span>
            </div>
            <p className="font-medium text-sm">
              {project.supervisor
                ? `${project.supervisor.firstName} ${project.supervisor.lastName}`
                : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <UserCheck className="size-3.5" />
              <span className="text-xs">Encargado</span>
            </div>
            <p className="font-medium text-sm">
              {project.assignedTo
                ? `${project.assignedTo.firstName} ${project.assignedTo.lastName}`
                : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Resumen económico: cuánto entró, cuánto salió y cómo va contra el
          presupuesto. Se oculta si no hay nada que mostrar (o si el rol no
          puede ver pagos ni gastos: esas consultas vuelven vacías). */}
      {(cobrado > 0 || gastado > 0) && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Cobrado al cliente</p>
              <p className="text-xl font-bold tabular-nums text-green-700 dark:text-green-400">
                {DOP.format(cobrado)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {presupuesto > 0
                  ? `${Math.round((cobrado / presupuesto) * 100)}% del presupuesto`
                  : 'sin presupuesto registrado'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Gastado</p>
              <p className="text-xl font-bold tabular-nums">{DOP.format(gastado)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {expenses.total} gasto{expenses.total === 1 ? '' : 's'} registrado{expenses.total === 1 ? '' : 's'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Balance (cobrado − gastado)</p>
              <p
                className={`text-xl font-bold tabular-nums ${
                  balance < 0 ? 'text-destructive' : 'text-green-700 dark:text-green-400'
                }`}
              >
                {DOP.format(balance)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {balance < 0 ? 'se ha gastado más de lo cobrado' : 'a favor del proyecto'}
              </p>
            </CardContent>
          </Card>
        </div>
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
