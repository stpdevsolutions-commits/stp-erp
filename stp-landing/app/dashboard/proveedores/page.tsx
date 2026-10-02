﻿import { api, pageError } from '@/lib/api'
import type { Supplier, PaginatedResponse } from '@/lib/types'
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
import { NuevoProveedorDialog } from '@/components/suppliers/nuevo-proveedor-dialog'
import { ProveedorActions } from '@/components/suppliers/proveedor-actions'
import { FiltrosProveedores } from '@/components/proveedores/filtros-proveedores'
import { Paginacion } from '@/components/ui/paginacion'

const CATEGORY_LABELS: Record<Supplier['category'], string> = {
  materials: 'Materiales',
  equipment: 'Equipos',
  services: 'Servicios',
  subcontract: 'Subcontrato',
  other: 'Otro',
}

const LIMIT = 20

export default async function ProveedoresPage({
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

  let res: PaginatedResponse<Supplier> = { data: [], total: 0, page: 1, limit: LIMIT }
  let error: string | null = null

  try {
    res = await api.get<PaginatedResponse<Supplier>>(`/suppliers?${query}`)
  } catch (e) {
    error = pageError(e, 'Error al cargar proveedores')
  }

  const proveedores = res.data
  const activos = proveedores.filter((p) => p.isActive).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proveedores</h1>
          <p className="text-muted-foreground text-sm">Materiales, equipos y servicios</p>
        </div>
        <NuevoProveedorDialog />
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{res.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Activos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{activos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Inactivos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{proveedores.length - activos}</div>
          </CardContent>
        </Card>
      </div>

      <FiltrosProveedores />

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">Categoría</TableHead>
                  <TableHead className="hidden lg:table-cell">RNC</TableHead>
                  <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                  <TableHead className="hidden lg:table-cell">Ciudad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {proveedores.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No hay proveedores registrados
                    </TableCell>
                  </TableRow>
                ) : (
                  proveedores.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium whitespace-normal min-w-[160px]">
                        <div>{p.name}</div>
                        {p.email && <div className="text-xs text-muted-foreground break-all">{p.email}</div>}
                        <div className="text-xs font-normal text-muted-foreground md:hidden">
                          {[CATEGORY_LABELS[p.category], p.phone].filter(Boolean).join(' · ')}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{CATEGORY_LABELS[p.category]}</TableCell>
                      <TableCell className="hidden lg:table-cell font-mono text-sm">{p.rnc ?? '—'}</TableCell>
                      <TableCell className="hidden md:table-cell">{p.phone ?? '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell">{p.city ?? '—'}</TableCell>
                      <TableCell>
                        <Badge className={p.isActive ? 'bg-green-600/10 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}>
                          {p.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ProveedorActions proveedor={p} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Paginacion total={res.total} page={page} limit={LIMIT} />
        </>
      )}
    </div>
  )
}
