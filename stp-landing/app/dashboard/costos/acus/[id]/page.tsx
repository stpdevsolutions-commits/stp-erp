import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ChevronLeft } from 'lucide-react'
import { api } from '@/lib/api'
import type { AcuCostResponse, Material, PaginatedResponse, Unit } from '@/lib/types'
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
import { AcuActions } from '@/components/costos/acu-actions'
import { AcuItemActions } from '@/components/costos/acu-item-actions'
import { AgregarInsumoButton } from '@/components/costos/acu-item-dialog'
import { CostoUnitario } from '@/components/costos/costo-unitario'
import {
  BASIS_LABELS,
  KIND_BADGE,
  KIND_LABELS,
  SOURCE_LABELS,
  TRADE_LABELS,
  fmtDOP,
  fmtQty,
  fmtUnitCost,
} from '@/components/costos/acu-labels'

export default async function AcuDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Un solo viaje: `/cost` devuelve la partida con su receta Y la valoración de hoy.
  let res: AcuCostResponse
  try {
    res = await api.get<AcuCostResponse>(`/costs/acus/${id}/cost`)
  } catch {
    notFound()
  }

  const { acu, cost } = res
  const items = acu.items ?? []

  const [units, materials] = await Promise.all([
    api.get<Unit[]>('/costs/units').catch(() => [] as Unit[]),
    api
      .get<PaginatedResponse<Material>>('/costs/materials?limit=300&isActive=true')
      .then((r) => r.data)
      .catch(() => [] as Material[]),
  ])

  const lineByItem = new Map(cost.lines.map((l) => [l.itemId, l]))
  const unitByfId = new Map(units.map((u) => [u.id, u]))

  // Nombres de los materiales sin precio vigente: el id suelto no le dice nada a nadie.
  const sinPrecio = cost.missingMaterialIds.map((materialId) => {
    const item = items.find((i) => i.materialId === materialId)
    return { id: materialId, name: item?.material?.name ?? 'Material', code: item?.material?.code }
  })

  const unitCode = acu.unit?.code

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/costos/acus"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" />
          Partidas (ACU)
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{acu.name}</h1>
            <Badge variant={acu.isActive ? 'default' : 'secondary'}>
              {acu.isActive ? 'Activa' : 'Inactiva'}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            <span className="font-mono">{acu.code}</span>
            {` · ${TRADE_LABELS[acu.trade]}`}
            {unitCode && ` · por ${unitCode}`}
            {acu.chapter && ` · ${acu.chapter}`}
          </p>
          {acu.description && <p className="mt-1 text-sm">{acu.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <AgregarInsumoButton acuId={acu.id} materials={materials} units={units} />
          <AcuActions acu={acu} units={units} showView={false} redirectOnDelete />
        </div>
      </div>

      {/* ── Aviso de unitario no fiable ─────────────────────────────────── */}
      {cost.incomplete && (
        <div className="border-destructive/40 bg-destructive/10 rounded-lg border p-4">
          <div className="text-destructive flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Este costo unitario NO es fiable</p>
              <p className="text-sm">
                {sinPrecio.length === 1
                  ? 'Un material de la receta no tiene precio vigente'
                  : `${sinPrecio.length} materiales de la receta no tienen precio vigente`}
                . Sus líneas se valoran en <strong>0</strong>, así que el total mostrado es un
                mínimo, no el costo real. No lo lleves a una cotización hasta registrar los precios
                que faltan.
              </p>
              {sinPrecio.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {sinPrecio.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/dashboard/costos/materiales/${m.id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        {m.code ? `${m.code} — ${m.name}` : m.name}
                      </Link>{' '}
                      <span className="text-muted-foreground">— registrar precio</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Resumen ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          className={cost.incomplete ? 'border-destructive/40' : undefined}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Costo directo{unitCode ? ` por ${unitCode}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-start">
              <CostoUnitario cost={cost} size="lg" />
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Con los precios vigentes de hoy. No se guarda: se recalcula en cada consulta.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">Materiales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xl font-semibold">{fmtDOP(cost.materialCost)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Mano de obra
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xl font-semibold">{fmtDOP(cost.laborCost)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">Equipos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xl font-semibold">{fmtDOP(cost.equipmentCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Receta ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Receta</CardTitle>
            <p className="text-muted-foreground text-sm">
              Lo que consume una unidad de la partida. {items.length}{' '}
              {items.length === 1 ? 'insumo' : 'insumos'}.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="px-6 pb-6 text-center">
              <p className="text-muted-foreground text-sm">
                La receta está vacía: sin insumos no hay costo unitario que calcular.
              </p>
              <div className="mt-4 flex justify-center">
                <AgregarInsumoButton acuId={acu.id} materials={materials} units={units} />
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Costo unitario</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const line = lineByItem.get(item.id)
                    const esPct = item.kind !== 'material' && item.basis === 'pct_materials'
                    const nombre = item.description || item.material?.name || '—'
                    const unidad = item.unitId ? unitByfId.get(item.unitId)?.code : null

                    return (
                      <TableRow key={item.id} className={line?.missingPrice ? 'bg-destructive/5' : undefined}>
                        <TableCell>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_BADGE[item.kind]}`}
                          >
                            {KIND_LABELS[item.kind]}
                          </span>
                        </TableCell>

                        <TableCell>
                          {item.materialId ? (
                            <Link
                              href={`/dashboard/costos/materiales/${item.materialId}`}
                              className="font-medium hover:underline underline-offset-4"
                            >
                              {nombre}
                            </Link>
                          ) : (
                            <span className="font-medium">{nombre}</span>
                          )}
                          {item.material?.code && (
                            <span className="text-muted-foreground block font-mono text-xs">
                              {item.material.code}
                            </span>
                          )}
                          {esPct && item.basis && (
                            <span className="text-muted-foreground block text-xs">
                              {BASIS_LABELS[item.basis]}
                            </span>
                          )}
                          {line?.missingPrice && (
                            <span className="text-destructive mt-0.5 inline-flex items-center gap-1 text-xs font-medium">
                              <AlertTriangle className="size-3" />
                              Sin precio vigente: esta línea se valora en 0
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-right font-mono text-sm">
                          {esPct ? (
                            `${fmtQty(item.pct ?? 0)} %`
                          ) : (
                            <>
                              {fmtQty(line?.effectiveQuantity ?? item.quantity)}
                              {item.wastePct > 0 && (
                                <span
                                  className="text-muted-foreground block text-[11px]"
                                  title="Cantidad instalada + desperdicio"
                                >
                                  {fmtQty(item.quantity)} +{fmtQty(item.wastePct)}%
                                </span>
                              )}
                            </>
                          )}
                        </TableCell>

                        <TableCell className="text-muted-foreground text-sm">
                          {esPct ? 'de materiales' : (unidad ?? '—')}
                        </TableCell>

                        <TableCell className="text-right font-mono text-sm">
                          {line ? (esPct ? fmtDOP(line.unitCost) : fmtUnitCost(line.unitCost)) : '—'}
                        </TableCell>

                        <TableCell className="text-muted-foreground text-xs">
                          {line ? SOURCE_LABELS[line.costSource] : '—'}
                        </TableCell>

                        <TableCell
                          className={`text-right font-mono text-sm ${
                            line?.missingPrice ? 'text-destructive' : 'font-medium'
                          }`}
                        >
                          {line ? fmtDOP(line.subtotal) : '—'}
                        </TableCell>

                        <TableCell>
                          <AcuItemActions
                            acuId={acu.id}
                            item={item}
                            label={nombre}
                            materials={materials}
                            units={units}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {acu.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{acu.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
