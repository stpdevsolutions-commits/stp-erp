'use client'

import { toast } from '@/lib/toast'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileX, Link2Off, Pencil, Receipt, RefreshCw, Send, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { canTransmit, type InvoicePayment, type SalesInvoice } from '@/lib/sales-invoices'
import {
  addInvoicePayment,
  applyInvoicePayment,
  createCreditNote,
  deleteSalesInvoice,
  emitSalesInvoice,
  listAvailablePayments,
  refreshInvoiceEcf,
  transmitInvoiceEcf,
  unlinkInvoicePayment,
  type AvailablePayment,
} from '@/lib/actions/sales-invoices'
import { todayRD } from '@/lib/utils'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })
const METHODS: Record<string, string> = {
  transfer: 'Transferencia',
  cash: 'Efectivo',
  check: 'Cheque',
  card: 'Tarjeta',
  other: 'Otro',
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p> : null
}

/** Botones del encabezado de la factura según su estado. */
export function AccionesFactura({ invoice, canManage }: { invoice: SalesInvoice; canManage: boolean }) {
  const router = useRouter()
  const [emitOpen, setEmitOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [creditOpen, setCreditOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!canManage) return null
  const draft = invoice.status === 'draft'
  const issued = invoice.status === 'issued'
  const isCreditNote = invoice.kind === 'credit_note'
  // Lo que todavía se puede acreditar de una factura emitida.
  const creditable = (invoice.total ?? 0) - (invoice.creditedAmount ?? 0) > 0.005

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true)
    setError(null)
    const r = await fn()
    setBusy(false)
    if (!r.ok) setError(r.error ?? 'Error')
    else router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {draft && (
        <>
          <Button variant="outline" size="sm" render={<Link href={`/dashboard/facturas/emitidas/${invoice.id}/editar`} />}>
            <Pencil className="size-4 mr-1.5" />
            Editar
          </Button>
          <Button size="sm" onClick={() => setEmitOpen(true)}>
            <Receipt className="size-4 mr-1.5" />
            Emitir e-CF
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Borrar borrador" onClick={() => setDelOpen(true)}>
            <Trash2 className="size-4" />
          </Button>
        </>
      )}
      {issued && (
        <>
          {!isCreditNote && (
            <Button size="sm" onClick={() => setPayOpen(true)} disabled={(invoice.balance ?? 0) <= 0.005}>
              <Wallet className="size-4 mr-1.5" />
              Registrar cobro
            </Button>
          )}
          {canTransmit(invoice.ecfEstado) && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => transmitInvoiceEcf(invoice.id))}>
              <Send className="size-4 mr-1.5" />
              Transmitir a la DGII
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => refreshInvoiceEcf(invoice.id))}>
            <RefreshCw className="size-4 mr-1.5" />
            Actualizar estado
          </Button>
          {!isCreditNote && creditable && invoice.ecfEncf && (
            <Button variant="outline" size="sm" onClick={() => setCreditOpen(true)}>
              <FileX className="size-4 mr-1.5" />
              Nota de crédito
            </Button>
          )}
        </>
      )}
      {error && <span className="basis-full"><ErrorLine error={error} /></span>}

      <EmitirDialog invoice={invoice} open={emitOpen} onOpenChange={setEmitOpen} />
      <BorrarDialog invoice={invoice} open={delOpen} onOpenChange={setDelOpen} />
      <CobroDialog invoice={invoice} open={payOpen} onOpenChange={setPayOpen} />
      <NotaCreditoDialog invoice={invoice} open={creditOpen} onOpenChange={setCreditOpen} />
    </div>
  )
}

function EmitirDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: SalesInvoice
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [transmitir, setTransmitir] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tipo =
    invoice.kind === 'credit_note'
      ? 'e-CF 34 · Nota de crédito'
      : (invoice.client?.rnc ?? '').replace(/\D/g, '').length >= 9
        ? 'e-CF 31 · Crédito fiscal'
        : 'e-CF 32 · Consumo'

  async function emitir() {
    setLoading(true)
    setError(null)
    const r = await emitSalesInvoice(invoice.id, transmitir)
    setLoading(false)
    if (!r.ok) return setError(r.error ?? 'No se pudo emitir')
    toast.success('Factura emitida')
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Emitir comprobante fiscal</DialogTitle>
          <DialogDescription>
            {invoice.number} · {invoice.client?.name} · {DOP.format(invoice.total)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            Se genera <b>{tipo}</b> con las líneas de esta factura. <b>Se emite una sola vez</b>: después no se puede
            editar ni borrar (se corrige con una nota de crédito).
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={transmitir} onChange={(e) => setTransmitir(e.target.checked)} />
            <span>
              Transmitir a la DGII ahora
              <span className="block text-xs text-muted-foreground">
                Sin marcar queda firmado y se puede transmitir después. La DGII solo acepta comprobantes de un RNC
                habilitado como facturador electrónico; si no lo está, la respuesta aparecerá como rechazo en la factura.
              </span>
            </span>
          </label>
          <ErrorLine error={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={emitir} disabled={loading}>{loading ? 'Emitiendo…' : 'Emitir comprobante'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NotaCreditoDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: SalesInvoice
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('18')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remaining = (invoice.total ?? 0) - (invoice.creditedAmount ?? 0)
  const hasPrevious = (invoice.creditedAmount ?? 0) > 0.005

  async function crear() {
    setLoading(true)
    setError(null)
    const r = await createCreditNote(invoice.id, {
      mode,
      reason: reason.trim(),
      amount: mode === 'partial' ? parseFloat(amount) : undefined,
      itbisRate: mode === 'partial' ? Number(rate) : undefined,
    })
    setLoading(false)
    if (!r.ok || !r.data) return setError(r.error ?? 'No se pudo crear')
    toast.success('Nota de crédito creada')
    onOpenChange(false)
    router.push(`/dashboard/facturas/emitidas/${r.data.id}`)
    router.refresh()
  }

  const total = mode === 'partial' ? (parseFloat(amount) || 0) * (1 + Number(rate) / 100) : remaining

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nota de crédito</DialogTitle>
          <DialogDescription>
            {invoice.ecfEncf} · {invoice.client?.name} · por acreditar {DOP.format(remaining)}
          </DialogDescription>
        </DialogHeader>

        <div className="inline-flex rounded-lg bg-muted p-1 gap-1 self-start">
          <Button size="sm" variant={mode === 'full' ? 'default' : 'ghost'} onClick={() => setMode('full')} disabled={hasPrevious}>
            Anular la factura
          </Button>
          <Button size="sm" variant={mode === 'partial' ? 'default' : 'ghost'} onClick={() => setMode('partial')}>
            Acreditar un monto
          </Button>
        </div>
        {hasPrevious && mode === 'partial' && (
          <p className="text-xs text-muted-foreground">Ya tiene notas de crédito: solo se puede acreditar por el saldo.</p>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nc-reason">Motivo (aparece en el comprobante, máx. 90)</Label>
            <Input id="nc-reason" maxLength={90} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: Error de facturación" />
          </div>
          {mode === 'partial' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nc-amount">Monto antes de ITBIS (RD$)</Label>
                <Input id="nc-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>ITBIS</Label>
                <Select value={rate} onValueChange={(v) => setRate(v ?? '18')}>
                  <SelectTrigger className="w-full"><SelectValue>{rate === '0' ? 'Exento' : `ITBIS ${rate}%`}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="18">ITBIS 18%</SelectItem>
                    <SelectItem value="16">ITBIS 16%</SelectItem>
                    <SelectItem value="0">Exento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <p className="text-sm">
            Total de la nota: <b>{DOP.format(total)}</b>. Se crea en borrador; la emites después, como una factura.
          </p>
          <ErrorLine error={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={crear} disabled={loading || reason.trim().length < 3 || (mode === 'partial' && !(parseFloat(amount) > 0))}>
            {loading ? 'Creando…' : 'Crear nota de crédito'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BorrarDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: SalesInvoice
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function borrar() {
    setLoading(true)
    const r = await deleteSalesInvoice(invoice.id)
    setLoading(false)
    if (!r.ok) return setError(r.error ?? 'No se pudo borrar')
    toast.success('Factura emitida eliminada')
    router.push('/dashboard/facturas/emitidas')
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Borrar borrador</DialogTitle>
          <DialogDescription>¿Borrar {invoice.number}? No ha sido emitida y no se puede deshacer.</DialogDescription>
        </DialogHeader>
        <ErrorLine error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button variant="destructive" onClick={borrar} disabled={loading}>{loading ? 'Borrando…' : 'Borrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CobroDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: SalesInvoice
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const balance = invoice.balance ?? invoice.total
  const [mode, setMode] = useState<'nuevo' | 'existente'>('nuevo')
  const [amount, setAmount] = useState(String(balance))
  const [method, setMethod] = useState('transfer')
  const [date, setDate] = useState(todayRD())
  const [reference, setReference] = useState('')
  const [available, setAvailable] = useState<AvailablePayment[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openExisting() {
    setMode('existente')
    setError(null)
    if (available) return
    const r = await listAvailablePayments(invoice.id)
    if (!r.ok) return setError(r.error ?? 'No se pudieron leer los cobros')
    setAvailable(r.data ?? [])
  }

  async function guardar() {
    setLoading(true)
    setError(null)
    const r = await addInvoicePayment(invoice.id, {
      amount: parseFloat(amount),
      method,
      date,
      reference: reference || undefined,
    })
    setLoading(false)
    if (!r.ok) return setError(r.error ?? 'No se pudo registrar')
    toast.success('Cobro de la factura agregado')
    onOpenChange(false)
    router.refresh()
  }

  async function aplicar(paymentId: string) {
    setLoading(true)
    setError(null)
    const r = await applyInvoicePayment(invoice.id, paymentId)
    setLoading(false)
    if (!r.ok) return setError(r.error ?? 'No se pudo aplicar')
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cobro de la factura</DialogTitle>
          <DialogDescription>
            Saldo pendiente: <b>{DOP.format(balance)}</b>. El cobro se aplica a esta factura; no genera otro comprobante.
          </DialogDescription>
        </DialogHeader>

        <div className="inline-flex rounded-lg bg-muted p-1 gap-1 self-start">
          <Button size="sm" variant={mode === 'nuevo' ? 'default' : 'ghost'} onClick={() => setMode('nuevo')}>Cobro nuevo</Button>
          <Button size="sm" variant={mode === 'existente' ? 'default' : 'ghost'} onClick={openExisting}>Aplicar uno de Pagos</Button>
        </div>

        {mode === 'nuevo' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-amount">Monto (RD$)</Label>
              <Input id="c-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-date">Fecha</Label>
              <Input id="c-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de pago</Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? 'transfer')}>
                <SelectTrigger className="w-full"><SelectValue>{METHODS[method]}</SelectValue></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHODS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-ref">Referencia</Label>
              <Input id="c-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N.º de transferencia…" />
            </div>
          </div>
        ) : (
          <div className="max-h-64 overflow-auto rounded-md border divide-y">
            {available === null && !error && <p className="p-3 text-sm text-muted-foreground">Cargando…</p>}
            {available?.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">Este cliente no tiene cobros sueltos (sin factura) en Pagos.</p>
            )}
            {available?.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.description}</p>
                  <p className="text-xs text-muted-foreground">{p.date} · {METHODS[p.method] ?? p.method}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="tabular-nums">{DOP.format(p.amount)}</span>
                  <Button size="sm" variant="outline" disabled={loading || p.amount > balance + 0.01} onClick={() => aplicar(p.id)}>
                    Aplicar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <ErrorLine error={error} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cerrar</Button>
          {mode === 'nuevo' && (
            <Button onClick={guardar} disabled={loading || !(parseFloat(amount) > 0)}>
              {loading ? 'Guardando…' : 'Registrar cobro'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Lista de cobros aplicados, con opción de soltar uno. */
export function CobrosAplicados({
  invoiceId,
  payments,
  canManage,
}: {
  invoiceId: string
  payments: InvoicePayment[]
  canManage: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function soltar(paymentId: string) {
    setBusy(paymentId)
    setError(null)
    const r = await unlinkInvoicePayment(invoiceId, paymentId)
    setBusy(null)
    if (!r.ok) setError(r.error ?? 'No se pudo quitar')
    else {
      toast.success('Cobro desvinculado de la factura')
      router.refresh()
    }
  }

  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay cobros aplicados a esta factura.</p>
  }
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-md border">
        {payments.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{p.description}</p>
              <p className="text-xs text-muted-foreground">
                {p.date} · {METHODS[p.method] ?? p.method}
                {p.reference ? ` · ${p.reference}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="tabular-nums font-medium">{DOP.format(p.amount)}</span>
              {canManage && (
                <Button
                  variant="ghost" size="icon-sm" aria-label="Quitar de la factura" title="Quitar de la factura (el cobro sigue en Pagos)"
                  disabled={busy === p.id} onClick={() => soltar(p.id)}
                >
                  <Link2Off className="size-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <ErrorLine error={error} />
    </div>
  )
}
