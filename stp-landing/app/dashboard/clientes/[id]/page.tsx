import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Client, Project, FileUpload, PaginatedResponse, User as AppUser } from '@/lib/types'
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
import { ChevronLeft, Building2, Phone, Mail, MapPin, User, Hash } from 'lucide-react'
import { ClientActions } from '@/components/clients/client-actions'
import { ArchivoViewer } from '@/components/files/archivo-viewer'
import { MembersCard } from '@/components/access/members-card'
import type { Member } from '@/lib/actions/memberships'

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

  const [projectsRes, files] = await Promise.all([
    api.get<PaginatedResponse<Project>>(`/projects?clientId=${id}&limit=100`).catch(
      () => ({ data: [], total: 0, page: 1, limit: 100 }) as PaginatedResponse<Project>,
    ),
    api.get<FileUpload[]>(`/files/clients/${id}`).catch(() => [] as FileUpload[]),
  ])

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
            <Badge variant={client.isActive ? 'default' : 'secondary'}>
              {client.isActive ? 'Activo' : 'Inactivo'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {TYPE_LABELS[client.type] ?? client.type}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
        </div>
        <ClientActions cliente={client} />
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
              <p className="font-medium text-sm">{client.email}</p>
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
              <p className="font-medium text-sm">{client.phone}</p>
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
                <p className="text-xs text-muted-foreground mt-0.5">{client.contactPhone}</p>
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
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <Badge className={PROJECT_STATUS_BADGE[p.status]}>
                        {PROJECT_STATUS_LABELS[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.startDate ? new Date(p.startDate).toLocaleDateString('es-DO') : '—'}
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

      {/* Accesos (solo ADMIN) */}
      {isAdmin && (
        <MembersCard scope="client" resourceId={id} members={members} users={users} />
      )}

      {/* Archivos */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Archivos</h2>
        <ArchivoViewer
          files={files}
          clientId={id}
          canDelete={true}
        />
      </div>
    </div>
  )
}
