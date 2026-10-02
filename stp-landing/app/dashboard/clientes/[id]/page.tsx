import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Client, Payment, Project, Quote, PaginatedResponse, User as AppUser } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChevronLeft, Building2, Phone, Mail, MapPin, User, Hash, FolderOpen } from 'lucide-react'
import { ClientActions } from '@/components/clients/client-actions'
import type { Member } from '@/lib/actions/memberships'
import { formatDate } from '@/lib/utils'

const TYPE_LABELS = { company: 'Empresa', individual: 'Persona física' }

const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}
// Colores semánticos de estado (tinte suave, coherente con la identidad STP)
const PROJECT_STATUS_BADGE: Record<Project['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-primary/10 text-primary',
  on_hold: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  completed: 'bg-green-600/10 text-green-700 dark:text-green-400',
  cancelled: 'bg-destructive/10 text-destructive',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let client: Client
  try {
    client = await api.get<Client>(`/clients/${id}`)
  } catch {
    notFound()
  }

  const projectsRes = await api
    .get<PaginatedResponse<Project>>(`/projects?clientId=${id}&limit=100`)
    .catch(() => ({ data: [], total: 0, page: 1, limit: 100 }) as PaginatedResponse<Project>)

  // Cobros del cliente (pagos completados) y cotizaciones aprobadas. Un rol sin
  // acceso a Pagos/Cotizaciones recibe 403: la consulta vuelve vacía y el
  // resumen simplemente no se muestra.
  const [pagosRes, cotizacionesRes] = await Promise.all([
    api
      .get<PaginatedResponse<Payment>>(`/payments?clientId=${id}&limit=100`)
      .catch(() => ({ data: [], total: 0, page: 1, limit: 100 }) as PaginatedResponse<Payment>),
    api
      .get<PaginatedResponse<Quote>>(`/quotes?clientId=${id}&status=approved&limit=100`)
      .catch(() => ({ data: [], total: 0, page: 1, limit: 100 }) as PaginatedResponse<Quote>),
  ])
  const pagosCompletados = pagosRes.data.filter((p) => p.status === 'completed')
  const cobrado = pagosCompletados.reduce((s, p) => s + p.amount, 0)
  const aprobado = cotizacionesRes.data.reduce((s, q) => s + q.total, 0)
  const ultimoPago = pagosCompletados.map((p) => p.date).sort().at(-1)

  // Panel de accesos: solo para ADMIN (los endpoints /members también lo son)
  const me = await api.get<Pick<AppUser, 'role'>>('/users/me').catch(() => ({ role: 'user' as const }))
  const isAdmin = me.role === 'admin'
  const [members, users] = isAdmin
    ? await Promise.all([
        api.get<Member[]>(`/clients/${id}/members`).catch(() => [] as Member[]),
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
        <Button variant="ghost" size="sm" render={<Link href="/dashboard/clientes" />}>
          <ChevronLeft className="size-4" />
          Clientes
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className={client.isActive ? 'bg-green-600/10 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}>
              {client.isActive ? 'Activo' : 'Inactivo'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {TYPE_LABELS[client.type] ?? client.type}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Se saca a su propia página (en pestaña nueva) en vez de vivir al final
              de esta: la ficha de cliente ya es larga y Archivos rara vez se
              consulta junto con el resto de la info. */}
          <Button
            variant="outline"
            size="sm"
            render={<a href={`/dashboard/clientes/${id}/archivos`} target="_blank" rel="noopener noreferrer" />}
          >
            <FolderOpen className="size-4 mr-1.5" />
            Archivos
          </Button>
          <ClientActions cliente={client} userRole={me.role} showAccess={isAdmin} members={members} users={users} />
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {client.email && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Mail className="size-3.5" />
                <span className="text-xs">Correo</span>
              </div>
              <a href={`mailto:${client.email}`} className="font-medium text-sm break-all hover:underline">
                {client.email}
              </a>
            </CardContent>
          </Card>
        )}
        {client.phone && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Phone className="size-3.5" />
                <span className="text-xs">Teléfono</span>
              </div>
              <a href={`tel:${client.phone.replace(/[^\d+]/g, '')}`} className="font-medium text-sm hover:underline">
                {client.phone}
              </a>
            </CardContent>
          </Card>
        )}
        {client.rnc && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Hash className="size-3.5" />
                <span className="text-xs">RNC / Cédula</span>
              </div>
              <p className="font-medium text-sm font-mono">{client.rnc}</p>
            </CardContent>
          </Card>
        )}
        {(client.city || client.address) && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <MapPin className="size-3.5" />
                <span className="text-xs">Dirección</span>
              </div>
              <p className="font-medium text-sm">{[client.address, client.city].filter(Boolean).join(', ')}</p>
            </CardContent>
          </Card>
        )}
        {client.contactName && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <User className="size-3.5" />
                <span className="text-xs">Contacto</span>
              </div>
              <p className="font-medium text-sm">{client.contactName}</p>
              {client.contactPhone && (
                <a
                  href={`tel:${client.contactPhone.replace(/[^\d+]/g, '')}`}
                  className="block text-xs text-muted-foreground mt-0.5 hover:underline"
                >
                  {client.contactPhone}
                </a>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Building2 className="size-3.5" />
              <span className="text-xs">Proyectos</span>
            </div>
            <p className="font-medium text-sm">{projectsRes.total}</p>
          </CardContent>
        </Card>
      </div>

      {(cobrado > 0 || aprobado > 0) && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Cobrado al cliente</p>
              <p className="text-xl font-bold tabular-nums text-green-700 dark:text-green-400">
                {DOP.format(cobrado)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {pagosCompletados.length} pago{pagosCompletados.length === 1 ? '' : 's'}
                {ultimoPago ? ` · último el ${formatDate(ultimoPago)}` : ''}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Cotizaciones aprobadas</p>
              <p className="text-xl font-bold tabular-nums">{DOP.format(aprobado)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {cotizacionesRes.data.length} cotización{cotizacionesRes.data.length === 1 ? '' : 'es'}
              </p>
            </CardContent>
          </Card>
          <Link
            href={`/dashboard/pagos?clientId=${id}`}
            className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1">Historial</p>
                <p className="text-sm font-medium">Ver pagos de este cliente →</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {client.notes && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Notas</p>
            <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Proyectos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Proyectos</h2>
          <Button variant="outline" size="sm" render={<Link href={`/dashboard/proyectos?clientId=${id}`} />}>
            Ver todos
          </Button>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead className="text-right">Presupuesto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectsRes.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No hay proyectos para este cliente
                  </TableCell>
                </TableRow>
              ) : (
                projectsRes.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="font-mono px-0 h-auto" render={<Link href={`/dashboard/proyectos/${p.id}`} />}>
                        {p.code}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/proyectos/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge className={PROJECT_STATUS_BADGE[p.status]}>
                        {PROJECT_STATUS_LABELS[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDate(p.startDate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.budget != null ? DOP.format(p.budget) : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
