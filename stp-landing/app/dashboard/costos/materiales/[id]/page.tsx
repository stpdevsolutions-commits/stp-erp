import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { api } from '@/lib/api'
import type {
  Material,
  MaterialPrice,
  MaterialPriceReport,
  PaginatedResponse,
  Supplier,
} from '@/lib/types'
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
import { PrecioVigente } from '@/components/costos/precio-vigente'
import { RegistrarPrecioDialog } from '@/components/costos/registrar-precio-dialog'
import { AnularPrecioButton } from '@/components/costos/anular-precio-button'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

const SOURCE_LABELS: Record<MaterialPrice['source'], string> = {
  manual: 'Manual',
  supplier_quote: 'Cotización',
  expense: 'Compra real',
  import: 'Importado',
  external_ref: 'Referencia externa',
}

const SOURCE_BADGE: Record<MaterialPrice['source'], string> = {
  manual: 'bg-muted text-muted-foreground',
  supplier_quote: 'bg-primary/10 text-primary',
  expense: 'bg-green-600/10 text-green-700 dark:text-green-400',
  import: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  external_ref: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

const REGION_LABELS: Record<MaterialPrice['region'], string> = {
  santo_domingo: 'Santo Domingo',
  santiago_cibao: 'Santiago / Cibao',
  este_punta_cana: 'Este / Punta Cana',
  norte: 'Norte',
  sur: 'Sur',
  otra: 'Otra',
}

function fmtDate(iso: string): string {
  // Fecha pura (YYYY-MM-DD): se formatea en UTC para que no retroceda un día en RD (UTC-4).
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default async function MaterialDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { id } = await params
  const sp = await searchParams
  const includeVoided = sp.anulados === '1'

  let material: Material
  try {
    material = await api.get<Material>(`/costs/materials/${id}`)
  } catch {
    notFound()
  }

  const pricesQuery = new URLSearchParams({ limit: '100' })
  if (includeVoided) pricesQuery.set('includeVoided', 'true')

  const [report, prices, suppliers] = await Promise.all([
    api.get<MaterialPriceReport>(`/costs/materials/${id}/prices/report`).catch(() => null),
    api
      .get<PaginatedResponse<MaterialPrice>>(`/costs/materials/${id}/prices?${pricesQuery}`)
      .catch(() => ({ data: [], total: 0, page: 1, limit: 100 }) as PaginatedResponse<MaterialPrice>),
    api
      .get<PaginatedResponse<Supplier>>('/suppliers?limit=200')
      .then((r) => r.data)
      .catch(() => [] as Supplier[]),
  ])

  const summary = report?.summary
  const unitCode = material.unit?.code

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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{material.name}</h1>
            <Badge variant={material.isActive ? 'default' : 'secondary'}>
              {material.isActive ? 'Activo' : 'Inactivo'}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            <span className="font-mono">{material.code}</span>
            {material.brand && ` · ${material.brand}`}
            {material.model && ` ${material.model}`}
            {unitCode && ` · se mide en ${unitCode}`}
            {material.category && ` · ${material.category.name}`}
          </p>
        </div>
        <RegistrarPrecioDialog
          materialId={material.id}
          materialName={material.name}
          unitCode={unitCode}
          suppliers={suppliers}
        />
      </div>

      {/* ── Resumen ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium">
              Precio vigente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-start">
              <PrecioVigente summary={summary} unit={unitCode} />
            </div>
            {summary?.currentDate && (
              <p className="text-muted-foreground mt-1 text-xs">{fmtDate(summary.currentDate)}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium">
              Rango histórico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm">
              {summary?.min != null && summary.max != null
                ? `${DOP.format(summary.min)} – ${DOP.format(summary.max)}`
                : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium">Promedio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm">
              {summary?.avg != null ? DOP.format(summary.avg) : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium">
              Precios registrados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm">{summary?.count ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <p className="text-muted-foreground text-xs">
        Todos los importes son netos comparables: en pesos, con descuento aplicado y sin ITBIS.
      </p>

      {/* ── Comparación de proveedores ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Precio vigente por proveedor</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!report || report.bySupplier.length === 0 ? (
            <p className="text-muted-foreground px-6 pb-6 text-sm">
              Aún no hay precios registrados para este material.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Precio neto</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Entrega</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.bySupplier.map((row, i) => {
                    const cheapest = report.bySupplier[0].netUnitPrice
                    const diff = row.netUnitPrice - cheapest
                    return (
                      <TableRow key={row.supplierId ?? 'sin-proveedor'}>
                        <TableCell className="font-medium">
                          {row.supplierName ?? 'Sin proveedor'}
                          {i === 0 && (
                            <span className="ml-2 rounded-full bg-green-600/10 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                              más barato
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {DOP.format(row.netUnitPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {diff === 0
                            ? '—'
                            : `+${DOP.format(diff)} (${((diff / cheapest) * 100).toFixed(1)}%)`}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {fmtDate(row.date)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {row.leadTimeDays != null ? `${row.leadTimeDays} d` : '—'}
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

      {/* ── Historial ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Historial de precios</CardTitle>
          <Link
            href={`/dashboard/costos/materiales/${id}${includeVoided ? '' : '?anulados=1'}`}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            {includeVoided ? 'Ocultar anulados' : 'Ver anulados'}
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {prices.data.length === 0 ? (
            <p className="text-muted-foreground px-6 pb-6 text-sm">
              Sin precios. Regístralos a mano, o anótalos como gasto del proyecto con cantidad y
              precio unitario y entrarán aquí solos como compra real.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Neto comparable</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Región</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prices.data.map((p) => {
                    const voided = Boolean(p.voidedAt)
                    return (
                      <TableRow key={p.id} className={voided ? 'opacity-60' : undefined}>
                        <TableCell className="text-sm">{fmtDate(p.date)}</TableCell>
                        <TableCell className="text-sm">{p.supplier?.name ?? '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {p.currency === 'USD' ? 'US$' : 'RD$'}
                          {p.price.toFixed(2)}
                          {(p.itbisIncluded || p.discountPct > 0) && (
                            <span className="text-muted-foreground block text-[10px] font-sans">
                              {p.itbisIncluded && 'ITBIS incl.'}
                              {p.itbisIncluded && p.discountPct > 0 && ' · '}
                              {p.discountPct > 0 && `−${p.discountPct}%`}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {voided ? (
                            <span className="line-through">{DOP.format(p.netUnitPrice)}</span>
                          ) : (
                            DOP.format(p.netUnitPrice)
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_BADGE[p.source]}`}
                          >
                            {SOURCE_LABELS[p.source]}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {REGION_LABELS[p.region]}
                        </TableCell>
                        <TableCell>
                          {voided ? (
                            <span
                              className="text-muted-foreground text-xs"
                              title={p.voidReason ?? ''}
                            >
                              Anulado
                            </span>
                          ) : (
                            <AnularPrecioButton
                              priceId={p.id}
                              materialId={material.id}
                              detail={`${DOP.format(p.netUnitPrice)} · ${fmtDate(p.date)}`}
                              fromExpense={Boolean(p.expenseId)}
                            />
                          )}
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

      {(material.description || material.notes) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ficha</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {material.description && <p>{material.description}</p>}
            {material.notes && <p className="text-muted-foreground">{material.notes}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
