import { api, pageError } from '@/lib/api'
import type { Collaborator, PaginatedResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { NuevoColaboradorDialog } from '@/components/collaborators/nuevo-colaborador-dialog'
import { ColaboradorActions } from '@/components/collaborators/colaborador-actions'
import { Paginacion } from '@/components/ui/paginacion'
import { Input } from '@/components/ui/input'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const LIMIT = 20

export default async function ColaboradoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1'))
  const search = sp.search ?? ''
  const status = sp.status ?? ''

  const query = new URLSearchParams({ limit: String(LIMIT), page: String(page) })
  if (search) query.set('search', search)
  if (status) query.set('status', status)

  let res: PaginatedResponse<Collaborator> = { data: [], total: 0, page: 1, limit: LIMIT }
  let error: string | null = null

  try {
    res = await api.get<PaginatedResponse<Collaborator>>(`/collaborators?${query}`)
  } catch (e) {
    error = pageError(e, 'Error al cargar colaboradores')
  }

  const totalPages = Math.max(1, Math.ceil(res.total / LIMIT))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Colaboradores</h1>
          <p className="text-muted-foreground text-sm">
            {res.total} {res.total === 1 ? 'colaborador' : 'colaboradores'} en total
          </p>
        </div>
        <NuevoColaboradorDialog />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3">
            <form method="GET" className="flex gap-2">
              <Input
                name="search"
                defaultValue={search}
                placeholder="Buscar por nombre, cédula..."
                className="w-64 h-8 text-sm"
              />
              {status && <input type="hidden" name="status" value={status} />}
              <button type="submit" className="sr-only">Buscar</button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <p className="text-destructive text-sm px-6 py-4">{error}</p>
          ) : res.data.length === 0 ? (
            <p className="text-muted-foreground text-sm px-6 py-8 text-center">
              No hay colaboradores registrados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Cédula</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead className="text-right">Tarifa/día</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {res.data.map((col) => (
                  <TableRow key={col.id}>
                    <TableCell className="font-medium">
                      {col.firstName} {col.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{col.position ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm font-mono">{col.cedula ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{col.phone ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{col.email ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {col.dailyRate != null ? DOP.format(col.dailyRate) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={col.status === 'active' ? 'default' : 'secondary'}>
                        {col.status === 'active' ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ColaboradorActions colaborador={col} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <Paginacion total={res.total} page={page} limit={LIMIT} />
      )}
    </div>
  )
}
