import { StatCard } from '@/components/ui/stat-card'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { api, pageError } from '@/lib/api'
import type { Client, PaginatedResponse, Project } from '@/lib/types'
import type { SalesInvoice } from '@/lib/sales-invoices'
import { PAYMENT_BADGE, PAYMENT_LABEL, STATUS_BADGE, STATUS_LABEL } from '@/lib/sales-invoices'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Paginacion } from '@/components/ui/paginacion'
import { FiltrosEmitidas } from '@/components/facturas/emitidas/filtros-emitidas'
import { formatDate } from '@/lib/utils'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const LIMIT = 20
const KEYS = ['search', 'clientId', 'projectId', 'status', 'payment', 'ecfEstado', 'kind', 'dateFrom', 'dateTo']

interface ListResponse extends PaginatedResponse<SalesInvoice> {
  summary?: { invoiced: number; collected: number; receivable: number }
}

export default async function FacturasEmitidasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1))
  const q = new URLSearchParams({ limit: String(LIMIT), page: String(page) })
  for (const k of KEYS) if (sp[k]) q.set(k, sp[k])

  let res: ListResponse = { data: [], total: 0, page, limit: LIMIT }
  let clients: Client[] = []
  let projects: Project[] = []
  let error: string | null = null
  try {
    const [list, c, p] = await Promise.all([
      api.get<ListResponse>(`/sales-invoices?${q.toString()}`),
      api.get<PaginatedResponse<Client>>('/clients?limit=200'),
      api.get<PaginatedResponse<Project>>('/projects?limit=200'),
    ])
    res = list
    clients = c.data
    projects = p.data
  } catch (e) {
    error = pageError(e, 'Error al cargar las facturas emitidas')
  }
  const hayFiltros = KEYS.some((k) => sp[k])
  const s = res.summary

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturas emitidas</h1>
          <p className="text-muted-foreground text-sm">
            Facturas de venta con comprobante fiscal electrónico (e-CF). Los cobros de los clientes se aplican a cada factura.
          </p>
        </div>
        <Button render={<Link href="/dashboard/facturas/emitidas/nueva" />}>
          <Plus className="size-4 mr-1.5" />
          Nueva factura
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard label={<>{hayFiltros ? 'Facturado (filtrado)' : 'Facturado'}</>}><div className="text-2xl font-bold">{DOP.format(s?.invoiced ?? 0)}</div></StatCard>
        <StatCard label="Cobrado"><div className="text-2xl font-bold text-green-700 dark:text-green-400">{DOP.format(s?.collected ?? 0)}</div></StatCard>
        <StatCard label="Por cobrar"><div className="text-2xl font-bold">{DOP.format(s?.receivable ?? 0)}</div></StatCard>
      </div>

      <FiltrosEmitidas clients={clients} projects={projects} />

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : res.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {hayFiltros
            ? 'Ninguna factura coincide con los filtros.'
            : 'Todavía no hay facturas emitidas. Crea una desde una cotización aprobada o desde cero.'}
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden lg:table-cell">Proyecto</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden lg:table-cell">Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {res.data.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Link href={`/dashboard/facturas/emitidas/${f.id}`} className="font-medium hover:underline">
                        {f.number}
                      </Link>
                      {f.ecfEncf && <div className="font-mono text-xs text-muted-foreground">{f.ecfEncf}</div>}
                      {f.kind === 'credit_note' && f.relatedInvoice && (
                        <div className="text-xs text-muted-foreground">de {f.relatedInvoice.ecfEncf ?? f.relatedInvoice.number}</div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 truncate">{f.client?.name ?? '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {f.project ? `${f.project.code} · ${f.project.name}` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${f.kind === 'credit_note' ? 'text-orange-700 dark:text-orange-400' : ''}`}>
                      {f.kind === 'credit_note' ? '-' : ''}{DOP.format(f.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden md:table-cell">
                      {f.status !== 'issued' || f.kind !== 'invoice'
                        ? '—'
                        : (f.balance ?? 0) < -0.005
                          ? <span className="text-orange-700 dark:text-orange-400">A devolver {DOP.format(-(f.balance ?? 0))}</span>
                          : DOP.format(f.balance ?? 0)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {f.kind === 'credit_note' && (
                          <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400">Nota de crédito</Badge>
                        )}
                        <Badge className={STATUS_BADGE[f.status]}>{STATUS_LABEL[f.status]}</Badge>
                        {f.paymentStatus && (
                          <Badge className={PAYMENT_BADGE[f.paymentStatus]}>{PAYMENT_LABEL[f.paymentStatus]}</Badge>
                        )}
                        {f.overdue && <Badge className="bg-destructive/10 text-destructive">Vencida</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{formatDate(f.issueDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Paginacion total={res.total} page={page} limit={LIMIT} />
        </>
      )}
    </div>
  )
}
