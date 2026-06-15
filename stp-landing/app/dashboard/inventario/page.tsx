import { api } from '@/lib/api'
import type { InventoryItem, PaginatedResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NuevoItemDialog } from '@/components/inventory/nuevo-item-dialog'
import { ItemActions } from '@/components/inventory/item-actions'
import { Paginacion } from '@/components/ui/paginacion'
import { Input } from '@/components/ui/input'

const CATEGORY_LABELS: Record<InventoryItem['category'], string> = {
  materials: 'Materiales',
  equipment: 'Equipos',
  tools: 'Herramientas',
  electrical: 'Eléctrico',
  mechanical: 'Mecánico',
  consumables: 'Consumibles',
  other: 'Otro',
}

const CATEGORY_COLORS: Record<InventoryItem['category'], string> = {
  materials: 'bg-amber-100 text-amber-800',
  equipment: 'bg-blue-100 text-blue-800',
  tools: 'bg-purple-100 text-purple-800',
  electrical: 'bg-yellow-100 text-yellow-800',
  mechanical: 'bg-orange-100 text-orange-800',
  consumables: 'bg-green-100 text-green-800',
  other: 'bg-gray-100 text-gray-700',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const LIMIT = 20

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1'))
  const search = sp.search ?? ''
  const category = sp.category ?? ''

  const query = new URLSearchParams({ limit: String(LIMIT), page: String(page) })
  if (search) query.set('search', search)
  if (category) query.set('category', category)

  let res: PaginatedResponse<InventoryItem> = { data: [], total: 0, page: 1, limit: LIMIT }
  let error: string | null = null

  try {
    res = await api.get<PaginatedResponse<InventoryItem>>(`/inventory?${query}`)
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar inventario'
  }

  const totalPages = Math.max(1, Math.ceil(res.total / LIMIT))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventario</h1>
          <p className="text-muted-foreground text-sm">
            {res.total} {res.total === 1 ? 'ítem' : 'ítems'} en total
          </p>
        </div>
        <NuevoItemDialog />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3">
            <form method="GET" className="flex gap-2">
              <Input
                name="search"
                defaultValue={search}
                placeholder="Buscar por nombre o SKU..."
                className="w-64 h-8 text-sm"
              />
              {category && <input type="hidden" name="category" value={category} />}
              <button type="submit" className="sr-only">Buscar</button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <p className="text-destructive text-sm px-6 py-4">{error}</p>
          ) : res.data.length === 0 ? (
            <p className="text-muted-foreground text-sm px-6 py-8 text-center">
              No hay ítems registrados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {res.data.map((item) => {
                  const lowStock = item.minStock != null && item.quantity <= item.minStock
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.sku ?? '—'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[item.category]}`}>
                          {CATEGORY_LABELS[item.category]}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm ${lowStock ? 'text-destructive font-semibold' : ''}`}>
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.unit ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{DOP.format(item.cost)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{DOP.format(item.price)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.location ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? 'default' : 'secondary'}>
                          {item.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ItemActions item={item} />
                      </TableCell>
                    </TableRow>
                  )
                })}
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
