import { api, pageError } from '@/lib/api'
import type { Collaborator, PaginatedResponse, PayrollEntry } from '@/lib/types'
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
import { FiltrosColaboradores } from '@/components/collaborators/filtros-colaboradores'

const TYPE_LABELS: Record<Collaborator['type'], string> = {
  fixed: 'Fijo',
  contractor: 'Contratista',
  temporary: 'Temporero',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const LIMIT = 20

const UNIDAD: Record<PayrollEntry['paymentType'], string> = {
  day: 'día',
  m2: 'm²',
  m3: 'm³',
  ml: 'ml',
  lump_sum: 'P.A.',
}

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

  // La tarifa diaria del colaborador solo existe para quien cobra por día; los
  // demás (m², ml, partida) cobran según el trabajo. Se toma la tarifa de su
  // último pago de nómina. Nómina es admin/finanza: para otros roles la
  // consulta da 403 y se queda solo la tarifa diaria, como antes.
  const ultimoPago = new Map<string, PayrollEntry>()
  await api
    .get<PaginatedResponse<PayrollEntry>>('/payroll?limit=100')
    .then((r) => {
      // Viene ordenado por fin de período, más reciente primero.
      for (const e of r.data) if (!ultimoPago.has(e.collaboratorId)) ultimoPago.set(e.collaboratorId, e)
    })
    .catch(() => undefined)

  const tarifa = (col: Collaborator): { valor: string; nota?: string } => {
    const ultimo = ultimoPago.get(col.id)
    if (col.dailyRate) return { valor: `${DOP.format(col.dailyRate)}/día` }
    if (!ultimo?.dailyRate) return { valor: '—' }
    if (ultimo.paymentType === 'lump_sum')
      return { valor: 'Partida alzada', nota: `último ${DOP.format(ultimo.dailyRate)}` }
    return { valor: `${DOP.format(ultimo.dailyRate)}/${UNIDAD[ultimo.paymentType]}`, nota: 'último pago' }
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
          <FiltrosColaboradores />
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
                  <TableHead className="hidden md:table-cell">Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden xl:table-cell">Tipo</TableHead>
                  <TableHead className="hidden md:table-cell">Cargo</TableHead>
                  <TableHead className="hidden xl:table-cell">Cédula</TableHead>
                  <TableHead className="hidden lg:table-cell">Teléfono</TableHead>
                  <TableHead className="hidden xl:table-cell">Correo</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Tarifa</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {res.data.map((col) => (
                  <TableRow key={col.id}>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm font-mono">{col.code}</TableCell>
                    <TableCell className="font-medium whitespace-normal min-w-[150px]">
                      {col.firstName} {col.lastName}
                      <div className="text-xs font-normal text-muted-foreground md:hidden">
                        {[col.code, col.position].filter(Boolean).join(' · ')}
                      </div>
                      {col.phone && (
                        <a
                          href={`tel:${col.phone.replace(/[^\d+]/g, '')}`}
                          className="block text-xs font-normal text-muted-foreground hover:underline lg:hidden"
                        >
                          {col.phone}
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-muted-foreground text-sm">{TYPE_LABELS[col.type]}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{col.position ?? '—'}</TableCell>
                    <TableCell className="hidden xl:table-cell text-muted-foreground text-sm font-mono">{col.cedula ?? '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {col.phone ? (
                        <a
                          href={`tel:${col.phone.replace(/[^\d+]/g, '')}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {col.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-muted-foreground text-sm">{col.email ?? '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-right font-mono text-sm">
                      <div>{tarifa(col).valor}</div>
                      {tarifa(col).nota && (
                        <div className="text-xs font-sans text-muted-foreground">{tarifa(col).nota}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          col.status === 'active'
                            ? 'bg-green-600/10 text-green-700 dark:text-green-400'
                            : 'bg-muted text-muted-foreground'
                        }
                      >
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
