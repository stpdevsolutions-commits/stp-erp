﻿import { api, pageError } from '@/lib/api'
import type { Payment, Client, Project, PaginatedResponse } from '@/lib/types'
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
import { NuevoPagoDialog } from '@/components/payments/nuevo-pago-dialog'
import { PagoActions } from '@/components/payments/pago-actions'
import { FiltrosPagos } from '@/components/pagos/filtros-pagos'
import { Paginacion } from '@/components/ui/paginacion'
import { ExportCsvButton } from '@/components/ui/export-csv-button'

const METHOD_LABELS: Record<Payment['method'], string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  check: 'Cheque',
  card: 'Tarjeta',
  other: 'Otro',
}

const STATUS_VARIANTS: Record<Payment['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  pending: 'outline',
  failed: 'destructive',
  refunded: 'secondary',
}

const STATUS_LABELS: Record<Payment['status'], string> = {
  completed: 'Completado',
  pending: 'Pendiente',
  failed: 'Fallido',
  refunded: 'Reembolsado',
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const LIMIT = 20

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1'))
  const status = sp.status ?? ''
  const method = sp.method ?? ''
  const dateFrom = sp.dateFrom ?? ''
  const dateTo = sp.dateTo ?? ''

  const query = new URLSearchParams({ limit: String(LIMIT), page: String(page) })
  if (status) query.set('status', status)
  if (method) query.set('method', method)
  if (dateFrom) query.set('dateFrom', dateFrom)
  if (dateTo) query.set('dateTo', dateTo)

  let pagosRes: PaginatedResponse<Payment> = { data: [], total: 0, page: 1, limit: LIMIT }
  let clients: Client[] = []
  let projects: Project[] = []
  let error: string | null = null

  try {
    const [res, clientesRes, proyRes] = await Promise.all([
      api.get<PaginatedResponse<Payment>>(`/payments?${query}`),
      api.get<PaginatedResponse<Client>>('/clients?limit=200'),
      api.get<PaginatedResponse<Project>>('/projects?limit=200'),
    ])
    pagosRes = res
    clients = clientesRes.data
    projects = proyRes.data
  } catch (e) {
    error = pageError(e, 'Error al cargar pagos')
  }

  const pagos = pagosRes.data

  const totalRecibido = pagos
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0)

  const totalPendiente = pagos
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pagos</h1>
          <p className="text-muted-foreground text-sm">Pagos recibidos de clientes</p>
        </div>
        <div className="flex gap-2">
          <ExportCsvButton href={`/api/export/pagos?${query.toString()}`} label="Exportar CSV" />
          <NuevoPagoDialog clients={clients} projects={projects} />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total registros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pagosRes.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Monto recibido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{DOP.format(totalRecibido)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{DOP.format(totalPendiente)}</div>
          </CardContent>
        </Card>
      </div>

      <FiltrosPagos />

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No hay pagos registrados
                    </TableCell>
                  </TableRow>
                ) : (
                  pagos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <div>{p.description}</div>
                        {p.reference && (
                          <div className="text-xs text-muted-foreground font-mono">{p.reference}</div>
                        )}
                      </TableCell>
                      <TableCell>{p.client?.name ?? '—'}</TableCell>
                      <TableCell>
                        {p.project ? (
                          <div className="text-xs font-mono text-muted-foreground">{p.project.code}</div>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{METHOD_LABELS[p.method]}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {DOP.format(p.amount)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(p.date).toLocaleDateString('es-DO')}
                      </TableCell>
                      <TableCell>
                        <PagoActions pago={p} clients={clients} projects={projects} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Paginacion total={pagosRes.total} page={page} limit={LIMIT} />
        </>
      )}
    </div>
  )
}
