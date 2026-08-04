import Link from 'next/link'
import { api, pageError } from '@/lib/api'
import type { Material, MaterialCategory, PaginatedResponse, Unit } from '@/lib/types'
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
import { NuevoMaterialDialog } from '@/components/costos/nuevo-material-dialog'
import { MaterialActions } from '@/components/costos/material-actions'
import { PrecioVigente } from '@/components/costos/precio-vigente'

const LIMIT = 20

export default async function MaterialesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1'))
  const search = sp.search ?? ''
  const categoryId = sp.categoryId ?? ''

  const query = new URLSearchParams({
    limit: String(LIMIT),
    page: String(page),
    withPrices: 'true',
  })
  if (search) query.set('search', search)
  if (categoryId) query.set('categoryId', categoryId)

  let res: PaginatedResponse<Material> = { data: [], total: 0, page: 1, limit: LIMIT }
  let error: string | null = null

  try {
    res = await api.get<PaginatedResponse<Material>>(`/costs/materials?${query}`)
  } catch (e) {
    error = pageError(e, 'Error al cargar los materiales')
  }

  // Unidades y categorías se necesitan para el formulario de alta.
  const [units, categories] = await Promise.all([
    api.get<Unit[]>('/costs/units').catch(() => [] as Unit[]),
    api.get<MaterialCategory[]>('/costs/material-categories').catch(() => [] as MaterialCategory[]),
  ])

  const totalPages = Math.max(1, Math.ceil(res.total / LIMIT))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Materiales</h1>
          <p className="text-muted-foreground text-sm">
            {res.total} {res.total === 1 ? 'material' : 'materiales'} en el catálogo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/costos/acus"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
          >
            Partidas (ACU)
          </Link>
          <Link
            href="/dashboard/costos/catalogo"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
          >
            Unidades y categorías
          </Link>
          <Link
            href="/dashboard/costos/importar"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
          >
            Importar precios
          </Link>
          <NuevoMaterialDialog units={units} categories={categories} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <form method="GET" className="flex flex-wrap gap-2">
            <Input
              name="search"
              defaultValue={search}
              placeholder="Buscar por nombre, código, marca..."
              className="w-72 h-8 text-sm"
            />
            {categoryId && <input type="hidden" name="categoryId" value={categoryId} />}
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
                  ? 'Ningún material coincide con la búsqueda.'
                  : 'El catálogo está vacío. Crea el primer material para empezar a registrar precios.'}
              </p>
              {!search && (
                <div className="mt-4 flex justify-center">
                  <NuevoMaterialDialog units={units} categories={categories} />
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Precio vigente</TableHead>
                    <TableHead className="text-right">Rango</TableHead>
                    <TableHead className="text-right">Precios</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {res.data.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {m.code}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/costos/materiales/${m.id}`}
                          className="font-medium hover:underline underline-offset-4"
                        >
                          {m.name}
                        </Link>
                        {(m.brand || m.model) && (
                          <span className="text-muted-foreground block text-xs">
                            {[m.brand, m.model].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {m.category?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {m.unit?.code ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <PrecioVigente summary={m.priceSummary} unit={m.unit?.code} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {m.priceSummary?.min != null && m.priceSummary.max != null
                          ? m.priceSummary.min === m.priceSummary.max
                            ? '—'
                            : `${m.priceSummary.min.toFixed(2)} – ${m.priceSummary.max.toFixed(2)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {m.priceSummary?.count ?? 0}
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.isActive ? 'default' : 'secondary'}>
                          {m.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <MaterialActions material={m} units={units} categories={categories} />
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
