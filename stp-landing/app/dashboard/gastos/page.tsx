﻿import { api, pageError } from '@/lib/api'
import type { Expense, Project, Supplier, PaginatedResponse } from '@/lib/types'
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
import { NuevoGastoDialog } from '@/components/expenses/nuevo-gasto-dialog'
import { GastoActions } from '@/components/expenses/gasto-actions'
import { FiltrosGastos } from '@/components/gastos/filtros-gastos'
import { Paginacion } from '@/components/ui/paginacion'
import { ExportExcelButton } from '@/components/ui/export-excel-button'

const CATEGORY_LABELS: Record<Expense['category'], string> = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  subcontract: 'Subcontrato',
  travel: 'Transporte',
  other: 'Otro',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const LIMIT = 20

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1))

  const q = new URLSearchParams({ limit: String(LIMIT), page: String(page) })
  if (sp.category) q.set('category', sp.category)
  if (sp.dateFrom) q.set('dateFrom', sp.dateFrom)
  if (sp.dateTo) q.set('dateTo', sp.dateTo)

  let gastosRes: PaginatedResponse<Expense> = { data: [], total: 0, page, limit: LIMIT }
  let projects: Project[] = []
  let suppliers: Supplier[] = []
  let error: string | null = null

  try {
    const [gr, proyRes, provRes] = await Promise.all([
      api.get<PaginatedResponse<Expense>>(`/expenses?${q.toString()}`),
      api.get<PaginatedResponse<Project>>('/projects?limit=200'),
      api.get<PaginatedResponse<Supplier>>('/suppliers?limit=200&isActive=true'),
    ])
    gastosRes = gr
    projects = proyRes.data
    suppliers = provRes.data
  } catch (e) {
    error = pageError(e, 'Error al cargar gastos')
  }

  const gastos = gastosRes.data
  const totalMonto = gastos.reduce((sum, g) => sum + g.amount, 0)
  const mesActual = new Date().toISOString().slice(0, 7)
  const totalEsteMes = gastos
    .filter((g) => g.date.startsWith(mesActual))
    .reduce((sum, g) => sum + g.amount, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
          <p className="text-muted-foreground text-sm">Gastos operativos por proyecto</p>
        </div>
        <div className="flex gap-2">
          <ExportExcelButton href={`/api/export/gastos?${q.toString()}`} label="Exportar Excel" />
          <NuevoGastoDialog projects={projects} suppliers={suppliers} />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total registros</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{gastosRes.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Monto (página actual)</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{DOP.format(totalMonto)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Este mes (página actual)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{DOP.format(totalEsteMes)}</div>
          </CardContent>
        </Card>
      </div>

      <FiltrosGastos />

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {gastos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No hay gastos que coincidan con los filtros
                    </TableCell>
                  </TableRow>
                ) : (
                  gastos.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.description}</TableCell>
                      <TableCell>
                        {g.project ? (
                          <div>
                            <div className="text-sm">{g.project.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{g.project.code}</div>
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{CATEGORY_LABELS[g.category]}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{g.supplier?.name ?? '—'}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {DOP.format(g.amount)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(g.date).toLocaleDateString('es-DO')}
                      </TableCell>
                      <TableCell>
                        <GastoActions gasto={g} projects={projects} suppliers={suppliers} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Paginacion total={gastosRes.total} page={page} limit={LIMIT} />
        </>
      )}
    </div>
  )
}
