import Link from 'next/link'
import { api } from '@/lib/api'
import type { Ficha, FichaStatus, FichaType, Project, Client, PaginatedResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { FiltrosFichas } from '@/components/fichas/filtros-fichas'
import { MapPin } from 'lucide-react'
import { formatDate } from '@/lib/utils'

const TYPE_LABEL: Record<FichaType, string> = {
  electrico: 'Eléctrico',
  civil: 'Civil',
  electromecanico: 'Electromecánico',
  levantamiento: 'Levantamiento',
  domotica: 'Domótica',
  evaluacion_danos: 'Evaluación de daños',
}

const STATUS_LABEL: Record<FichaStatus, string> = {
  borrador: 'Borrador',
  en_progreso: 'En progreso',
  enviada: 'Enviada',
}

const STATUS_VARIANT: Record<FichaStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  borrador: 'secondary',
  en_progreso: 'outline',
  enviada: 'default',
}

export default async function FichasPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; projectId?: string; type?: string; status?: string }>
}) {
  const { clientId, projectId, type, status } = await searchParams

  const params = new URLSearchParams()
  if (clientId) params.set('clientId', clientId)
  if (projectId) params.set('projectId', projectId)
  if (type) params.set('type', type)
  if (status) params.set('status', status)

  const [fichas, projects, clients] = await Promise.all([
    api.get<Ficha[]>(`/fichas?${params}`).catch(() => [] as Ficha[]),
    api.get<PaginatedResponse<Project>>('/projects?limit=200').catch(() => ({ data: [] as Project[], total: 0, page: 1, limit: 200 })),
    api.get<PaginatedResponse<Client>>('/clients?limit=200').catch(() => ({ data: [] as Client[], total: 0, page: 1, limit: 200 })),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fichas de campo</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Registros técnicos generados desde la app móvil
        </p>
      </div>

      {/* Filtros */}
      <FiltrosFichas clients={clients.data} projects={projects.data} />

      {/* Tabla */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead className="hidden md:table-cell">Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden md:table-cell">Proyecto</TableHead>
              <TableHead className="hidden lg:table-cell">Técnico</TableHead>
              <TableHead className="hidden sm:table-cell">GPS</TableHead>
              <TableHead className="hidden lg:table-cell">Enviada</TableHead>
              <TableHead className="hidden md:table-cell">Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fichas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No se encontraron fichas
                </TableCell>
              </TableRow>
            ) : (
              fichas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="font-mono px-0 h-auto" render={<Link href={`/dashboard/fichas/${f.id}`} />}>
                      {f.code}
                    </Button>
                    <div className="text-xs text-muted-foreground md:hidden">
                      {[TYPE_LABEL[f.type] ?? f.type, f.project?.code, formatDate(f.createdAt)]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{TYPE_LABEL[f.type] ?? f.type}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[f.status]}>{STATUS_LABEL[f.status]}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {f.project ? (
                      <Link href={`/dashboard/proyectos/${f.project.id}`} className="hover:underline text-primary">
                        {f.project.code}
                      </Link>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    {f.technician ? `${f.technician.firstName} ${f.technician.lastName}` : '—'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {f.latitude && f.longitude ? (
                      <a
                        href={`https://maps.google.com/?q=${f.latitude},${f.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <MapPin className="size-3" /> Ver
                      </a>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {formatDate(f.submittedAt)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {formatDate(f.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
