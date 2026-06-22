import Link from 'next/link'
import { api } from '@/lib/api'
import type { Ficha, FichaStatus, FichaType, Project, PaginatedResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { MapPin } from 'lucide-react'

const TYPE_LABEL: Record<FichaType, string> = {
  electrico: 'Eléctrico',
  civil: 'Civil',
  electromecanico: 'Electromecánico',
  levantamiento: 'Levantamiento',
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
  searchParams: Promise<{ projectId?: string; type?: string; status?: string }>
}) {
  const { projectId, type, status } = await searchParams

  const params = new URLSearchParams()
  if (projectId) params.set('projectId', projectId)
  if (type) params.set('type', type)
  if (status) params.set('status', status)

  const [fichas, projects] = await Promise.all([
    api.get<Ficha[]>(`/fichas?${params}`).catch(() => [] as Ficha[]),
    api.get<PaginatedResponse<Project>>('/projects?limit=200').catch(() => ({ data: [] as Project[], total: 0, page: 1, limit: 200 })),
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
      <form className="flex flex-wrap gap-2">
        <select
          name="projectId"
          defaultValue={projectId ?? ''}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Todos los proyectos</option>
          {projects.data.map((p) => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </select>

        <select
          name="type"
          defaultValue={type ?? ''}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Todos los tipos</option>
          {(Object.entries(TYPE_LABEL) as [FichaType, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={status ?? ''}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Todos los estados</option>
          {(Object.entries(STATUS_LABEL) as [FichaStatus, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        <Button type="submit" variant="outline" size="sm">Filtrar</Button>

        {(projectId ?? type ?? status) && (
          <Button variant="ghost" size="sm" render={<Link href="/dashboard/fichas" />}>
            Limpiar
          </Button>
        )}
      </form>

      {/* Tabla */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Proyecto</TableHead>
              <TableHead>Técnico</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>Enviada</TableHead>
              <TableHead>Fecha</TableHead>
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
                  </TableCell>
                  <TableCell className="text-sm">{TYPE_LABEL[f.type] ?? f.type}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[f.status]}>{STATUS_LABEL[f.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {f.project ? (
                      <Link href={`/dashboard/proyectos/${f.project.id}`} className="hover:underline text-primary">
                        {f.project.code}
                      </Link>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {f.technician ? `${f.technician.firstName} ${f.technician.lastName}` : '—'}
                  </TableCell>
                  <TableCell>
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
                  <TableCell className="text-xs text-muted-foreground">
                    {f.submittedAt ? new Date(f.submittedAt).toLocaleDateString('es-DO') : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(f.createdAt).toLocaleDateString('es-DO')}
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
