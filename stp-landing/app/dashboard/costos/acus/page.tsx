import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { api, pageError } from '@/lib/api'
import type { Acu, PaginatedResponse, Unit } from '@/lib/types'
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
import { Input } from '@/components/ui/input'
import { Paginacion } from '@/components/ui/paginacion'
import { NuevoAcuDialog } from '@/components/costos/nuevo-acu-dialog'
import { AcuActions } from '@/components/costos/acu-actions'
import { CostoUnitario } from '@/components/costos/costo-unitario'
import { TRADE_LABELS } from '@/components/costos/acu-labels'

const LIMIT = 20

export default async function AcusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1'))
  const search = sp.search ?? ''

  const query = new URLSearchParams({
    limit: String(LIMIT),
    page: String(page),
    withCost: 'true',
  })
  if (search) query.set('search', search)

  let res: PaginatedResponse<Acu> = { data: [], total: 0, page: 1, limit: LIMIT }
  let error: string | null = null

  try {
    res = await api.get<PaginatedResponse<Acu>>(`/costs/acus?${query}`)
  } catch (e) {
    error = pageError(e, 'Error al cargar las partidas')
  }

  const [units, todas] = await Promise.all([
    api.get<Unit[]>('/costs/units').catch(() => [] as Unit[]),
    // Solo para sugerir capítulos ya usados: sin `withCost`, que es lo que cuesta.
    api
      .get<PaginatedResponse<Acu>>('/costs/acus?limit=200')
      .then((r) => r.data)
      .catch(() => [] as Acu[]),
  ])

  const chapters = [...new Set(todas.map((a) => a.chapter).filter(Boolean) as string[])].sort()
  const incompletas = res.data.filter((a) => a.cost?.incomplete).length
  const totalPages = Math.max(1, Math.ceil(res.total / LIMIT))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partidas (ACU)</h1>
          <p className="text-muted-foreground text-sm">
            {res.total} {res.total === 1 ? 'partida' : 'partidas'} · el unitario se recalcula con
            los precios vigentes, no se guarda
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/costos/materiales"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
          >
            Materiales
          </Link>
          <Link
            href="/dashboard/costos/catalogo"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
          >
            Unidades y categorías
          </Link>
          <NuevoAcuDialog units={units} chapters={chapters} />
        </div>
      </div>

      {incompletas > 0 && (
        <p className="text-destructive flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          {incompletas} {incompletas === 1 ? 'partida usa' : 'partidas usan'} materiales sin precio
          vigente. Su costo unitario es un mínimo, no un dato para cotizar.
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <form method="GET" className="flex flex-wrap gap-2">
            <Input
              name="search"
              defaultValue={search}
              placeholder="Buscar por nombre, código o capítulo..."
              className="w-72 h-8 text-sm"
            />
            <button type="submit" className="sr-only">
              Buscar
            </button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <p className="text-destructive text-sm px-6 py-4">{error}</p>
          ) : res.data.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-muted-foreground text-sm">
                {search
                  ? 'Ninguna partida coincide con la búsqueda.'
                  : 'Todavía no hay partidas. Una partida descompone una unidad de obra en los insumos que consume.'}
              </p>
              {!search && (
                <div className="mt-4 flex justify-center">
                  <NuevoAcuDialog units={units} chapters={chapters} />
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Partida</TableHead>
                    <TableHead>Capítulo</TableHead>
                    <TableHead>Oficio</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Insumos</TableHead>
                    <TableHead className="text-right">Costo unitario</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {res.data.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {a.code}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/costos/acus/${a.id}`}
                          className="font-medium hover:underline underline-offset-4"
                        >
                          {a.name}
                        </Link>
                        {a.description && (
                          <span className="text-muted-foreground block text-xs">
                            {a.description}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {a.chapter ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {TRADE_LABELS[a.trade]}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {a.unit?.code ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {a.cost?.lines.length ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <CostoUnitario cost={a.cost} unit={a.unit?.code} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.isActive ? 'default' : 'secondary'}>
                          {a.isActive ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <AcuActions acu={a} units={units} chapters={chapters} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && <Paginacion total={res.total} page={page} limit={LIMIT} />}
    </div>
  )
}
