import { api } from '@/lib/api'
import type { Project, Quote, PaginatedResponse } from '@/lib/types'
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
import { NuevaCotizacionDialog } from '@/components/quotes/nueva-cotizacion-dialog'
import { QuoteActions } from '@/components/quotes/quote-actions'

const STATUS_LABELS: Record<Quote['status'], string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Expirada',
}

const STATUS_VARIANTS: Record<Quote['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  sent: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  expired: 'secondary',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

export default async function CotizacionesPage() {
  let cotizaciones: Quote[] = []
  let projects: Project[] = []
  let error: string | null = null

  try {
    const [quotesRes, proyRes] = await Promise.all([
      api.get<PaginatedResponse<Quote>>('/quotes?limit=100'),
      api.get<PaginatedResponse<Project>>('/projects?limit=200'),
    ])
    cotizaciones = quotesRes.data
    projects = proyRes.data
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar cotizaciones'
  }

  const totalAprobado = cotizaciones
    .filter((q) => q.status === 'approved')
    .reduce((sum, q) => sum + q.total, 0)

  const totalPendiente = cotizaciones
    .filter((q) => q.status === 'sent')
    .reduce((sum, q) => sum + q.total, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cotizaciones</h1>
          <p className="text-muted-foreground text-sm">Gestión de cotizaciones y propuestas</p>
        </div>
        <NuevaCotizacionDialog projects={projects} />
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total cotizaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cotizaciones.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Monto aprobado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{DOP.format(totalAprobado)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Monto pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{DOP.format(totalPendiente)}</div>
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
                <TableHead>Número</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Válida hasta</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cotizaciones.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No hay cotizaciones registradas
                  </TableCell>
                </TableRow>
              ) : (
                cotizaciones.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-sm">{q.number}</TableCell>
                    <TableCell className="font-medium">
                      <div>{q.title}</div>
                      {q.project && (
                        <div className="text-xs text-muted-foreground">{q.project.code}</div>
                      )}
                    </TableCell>
                    <TableCell>{q.client?.name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[q.status]}>{STATUS_LABELS[q.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {DOP.format(q.total)}
                    </TableCell>
                    <TableCell>
                      {q.validUntil ? new Date(q.validUntil).toLocaleDateString('es-DO') : '—'}
                    </TableCell>
                    <TableCell>
                      <QuoteActions cotizacion={q} projects={projects} />
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
