import { api } from '@/lib/api'
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

const CATEGORY_LABELS: Record<Expense['category'], string> = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  subcontract: 'Subcontrato',
  travel: 'Transporte',
  other: 'Otro',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

export default async function GastosPage() {
  let gastos: Expense[] = []
  let projects: Project[] = []
  let suppliers: Supplier[] = []
  let error: string | null = null

  try {
    const [gastosRes, proyRes, provRes] = await Promise.all([
      api.get<PaginatedResponse<Expense>>('/expenses?limit=200'),
      api.get<PaginatedResponse<Project>>('/projects?limit=200'),
      api.get<PaginatedResponse<Supplier>>('/suppliers?limit=200&isActive=true'),
    ])
    gastos = gastosRes.data
    projects = proyRes.data
    suppliers = provRes.data
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar gastos'
  }

  const totalMonto = gastos.reduce((sum, g) => sum + g.amount, 0)
  const totalEstemes = gastos
    .filter((g) => g.date.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((sum, g) => sum + g.amount, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
          <p className="text-muted-foreground text-sm">Gastos operativos por proyecto</p>
        </div>
        <NuevoGastoDialog projects={projects} suppliers={suppliers} />
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total registros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{gastos.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Monto total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{DOP.format(totalMonto)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Este mes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{DOP.format(totalEstemes)}</div>
          </CardContent>
        </Card>
      </div>

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <div className="rounded-md border">
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
                    No hay gastos registrados
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
      )}
    </div>
  )
}
