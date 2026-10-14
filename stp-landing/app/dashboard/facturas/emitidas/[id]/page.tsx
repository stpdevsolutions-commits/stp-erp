import Link from 'next/link'
import { ChevronLeft, ExternalLink, FileText } from 'lucide-react'
import { api, loadMain, loadSafe, failedLabels } from '@/lib/api'
import { LoadErrorBanner } from '@/components/ui/load-error-banner'
import type { User } from '@/lib/types'
import {
  PAYMENT_BADGE,
  PAYMENT_LABEL,
  RATE_LABELS,
  ecfEstadoLabel,
  STATUS_BADGE,
  STATUS_LABEL,
  type InvoicePayment,
  type SalesInvoice,
} from '@/lib/sales-invoices'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AccionesFactura, CobrosAplicados } from '@/components/facturas/emitidas/detalle-acciones'
import { formatDate } from '@/lib/utils'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

export default async function FacturaEmitidaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const invoice = await loadMain(api.get<SalesInvoice>(`/sales-invoices/${id}`))
  const [paymentsR, me] = await Promise.all([
    loadSafe(api.get<InvoicePayment[]>(`/sales-invoices/${id}/payments`), [] as InvoicePayment[]),
    api.get<Pick<User, 'role'>>('/users/me').catch(() => ({ role: 'user' as const })),
  ])
  const payments = paymentsR.data
  const loadErrors = failedLabels([['cobros aplicados a la factura', paymentsR.failed]])
  const canManage = ['admin', 'finanza'].includes(String(me.role).toLowerCase())

  const issued = invoice.status === 'issued'
  const isCreditNote = invoice.kind === 'credit_note'
  const paid = invoice.paidAmount ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/dashboard/facturas/emitidas" />}>
          <ChevronLeft className="size-4" />
          Facturas emitidas
        </Button>
      </div>

      <LoadErrorBanner failed={loadErrors} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-mono text-sm text-muted-foreground">{invoice.number}</span>
            {isCreditNote && <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400">Nota de crédito</Badge>}
            <Badge className={STATUS_BADGE[invoice.status]}>{STATUS_LABEL[invoice.status]}</Badge>
            {invoice.paymentStatus && (
              <Badge className={PAYMENT_BADGE[invoice.paymentStatus]}>{PAYMENT_LABEL[invoice.paymentStatus]}</Badge>
            )}
            {invoice.overdue && <Badge className="bg-destructive/10 text-destructive">Vencida</Badge>}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{invoice.client?.name}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(invoice.issueDate)}
            {invoice.dueDate ? ` · vence ${formatDate(invoice.dueDate)}` : ''}
            {invoice.project ? ` · ${invoice.project.code} ${invoice.project.name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<a href={`/api/files/sales-invoice/${invoice.id}?v=${encodeURIComponent(invoice.ecfEstado ?? invoice.status)}-${invoice.paidAmount ?? 0}`} target="_blank" rel="noreferrer" />}
          >
            <FileText className="size-4 mr-1.5" />
            Ver PDF
          </Button>
          <AccionesFactura invoice={invoice} canManage={canManage} />
        </div>
      </div>

      {invoice.ecfError && (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">
          {invoice.status === 'draft' ? 'El último intento de emitir falló' : 'No se pudo transmitir a la DGII'}: {invoice.ecfError}
        </div>
      )}
      {isCreditNote && invoice.relatedInvoice && (
        <div className="rounded-md bg-orange-500/10 text-orange-800 dark:text-orange-300 px-4 py-3 text-sm">
          Modifica la factura{' '}
          <Link className="font-medium underline" href={`/dashboard/facturas/emitidas/${invoice.relatedInvoice.id}`}>
            {invoice.relatedInvoice.ecfEncf ?? invoice.relatedInvoice.number}
          </Link>
          {' · '}
          {invoice.modificationCode === 1 ? 'la anula' : 'corrige montos'}
          {invoice.reason ? ` · ${invoice.reason}` : ''}
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold tabular-nums">{DOP.format(invoice.total)}</p>
        </CardContent></Card>
        {(invoice.creditedAmount ?? 0) > 0 && (
          <Card><CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Notas de crédito</p>
            <p className="text-xl font-bold tabular-nums text-orange-700 dark:text-orange-400">-{DOP.format(invoice.creditedAmount ?? 0)}</p>
          </CardContent></Card>
        )}
        {!isCreditNote && (
        <>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Cobrado</p>
          <p className="text-xl font-bold tabular-nums text-green-700 dark:text-green-400">{DOP.format(paid)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          {issued && (invoice.balance ?? 0) < -0.005 ? (
            <>
              <p className="text-xs text-muted-foreground">A devolver al cliente</p>
              <p className="text-xl font-bold tabular-nums text-orange-700 dark:text-orange-400">{DOP.format(-(invoice.balance ?? 0))}</p>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Saldo</p>
              <p className="text-xl font-bold tabular-nums">{issued ? DOP.format(invoice.balance ?? invoice.total) : '—'}</p>
            </>
          )}
        </CardContent></Card>
        </>
        )}
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Cotización</p>
          {invoice.quote ? (
            <Link href={`/dashboard/cotizaciones/${invoice.quote.id}`} className="text-sm font-medium hover:underline">
              {invoice.quote.number}
              {invoice.quotePercent && invoice.quotePercent < 100 ? ` · ${invoice.quotePercent}%` : ''}
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </CardContent></Card>
      </div>

      {issued && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Comprobante fiscal electrónico</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">e-NCF</span><span className="font-mono font-semibold">{invoice.ecfEncf ?? '—'}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Estado</span><span className="font-medium">{ecfEstadoLabel(invoice.ecfEstado)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Tipo</span><span>{invoice.ecfTipo?.replace('_v_1_0', '').replace('e-CF_', 'e-CF ') ?? '—'}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Código de seguridad</span><span className="font-mono">{invoice.ecfCodigoSeguridad && invoice.ecfCodigoSeguridad !== '0' ? invoice.ecfCodigoSeguridad : '—'}</span></div>
            {invoice.ecfMensaje && (
              <p className={`sm:col-span-2 rounded-md px-3 py-2 text-xs ${invoice.ecfEstado === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                Respuesta de la DGII: {invoice.ecfMensaje}
              </p>
            )}
            {invoice.ecfQrUrl && (
              <a href={invoice.ecfQrUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-4 sm:col-span-2">
                Ver el comprobante en la DGII <ExternalLink className="size-3.5" />
              </a>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Líneas</CardTitle></CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="hidden sm:table-cell">ITBIS</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{DOP.format(l.unitPrice)}</TableCell>
                    <TableCell className="hidden sm:table-cell">{RATE_LABELS[String(l.itbisRate)]}</TableCell>
                    <TableCell className="text-right tabular-nums">{DOP.format(l.total ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="ml-auto mt-3 max-w-xs space-y-1 px-4 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{DOP.format(invoice.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">ITBIS</span><span className="tabular-nums">{DOP.format(invoice.itbis)}</span></div>
            <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Total</span><span className="tabular-nums">{DOP.format(invoice.total)}</span></div>
          </div>
        </CardContent>
      </Card>

      {invoice.notes && (
        <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Notas:</span> {invoice.notes}</p>
      )}

      {issued && !isCreditNote && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Cobros aplicados</CardTitle></CardHeader>
          <CardContent>
            <CobrosAplicados invoiceId={invoice.id} payments={payments} canManage={canManage} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
