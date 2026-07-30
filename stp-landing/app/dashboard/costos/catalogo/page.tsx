import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { api, pageError } from '@/lib/api'
import type { MaterialCategory, Unit, UnitKind } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { NuevaUnidadDialog } from '@/components/costos/nueva-unidad-dialog'
import { NuevaCategoriaDialog } from '@/components/costos/nueva-categoria-dialog'
import { CatalogoRowActions } from '@/components/costos/catalogo-row-actions'

const KIND_LABELS: Record<UnitKind, string> = {
  count: 'Conteo',
  length: 'Longitud',
  area: 'Área',
  volume: 'Volumen',
  mass: 'Masa',
  time: 'Tiempo',
  other: 'Otro',
}

export default async function CatalogoPage() {
  let units: Unit[] = []
  let categories: MaterialCategory[] = []
  let error: string | null = null

  try {
    ;[units, categories] = await Promise.all([
      api.get<Unit[]>('/costs/units'),
      api.get<MaterialCategory[]>('/costs/material-categories'),
    ])
  } catch (e) {
    error = pageError(e, 'Error al cargar el catálogo')
  }

  const unitByfId = new Map(units.map((u) => [u.id, u]))
  const categoryById = new Map(categories.map((c) => [c.id, c]))

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/costos/materiales"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" />
          Materiales
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Unidades y categorías</h1>
        <p className="text-muted-foreground text-sm">
          La base del catálogo de materiales. Las unidades vienen cargadas con sus conversiones.
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* ── Categorías ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Categorías</CardTitle>
            <p className="text-muted-foreground text-sm">
              {categories.length} registradas. Admiten jerarquía: 02 Eléctrico → 0201 Canalización.
            </p>
          </div>
          <NuevaCategoriaDialog categories={categories} />
        </CardHeader>
        <CardContent className="p-0">
          {categories.length === 0 ? (
            <p className="text-muted-foreground px-6 pb-6 text-sm">
              Sin categorías. Los códigos de partida los define STP, así que no se cargó ninguna por
              defecto.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Pertenece a</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.code}</TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {c.parentId ? (categoryById.get(c.parentId)?.name ?? '—') : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.isActive ? 'default' : 'secondary'}>
                          {c.isActive ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <CatalogoRowActions
                          kind="category"
                          id={c.id}
                          label={`${c.code} — ${c.name}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Unidades ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Unidades de medida</CardTitle>
            <p className="text-muted-foreground text-sm">
              {units.length} registradas. El factor permite convertir a la unidad base de su tipo.
            </p>
          </div>
          <NuevaUnidadDialog units={units} />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Equivale a</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.code}</TableCell>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {KIND_LABELS[u.kind]}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {u.baseUnitId && u.factor != null
                        ? `${u.factor} ${unitByfId.get(u.baseUnitId)?.code ?? ''}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? 'default' : 'secondary'}>
                        {u.isActive ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <CatalogoRowActions kind="unit" id={u.id} label={`${u.code} — ${u.name}`} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
