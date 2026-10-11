'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BuscadorSelect } from '@/components/ui/buscador-select'
import type { Client, Project } from '@/lib/types'
import {
  RATE_LABELS,
  linesTotals,
  type QuoteInvoicePreview,
  type SalesInvoice,
  type SalesInvoiceLine,
} from '@/lib/sales-invoices'
import {
  createSalesInvoice,
  previewInvoiceFromQuote,
  updateSalesInvoice,
} from '@/lib/actions/sales-invoices'
import { todayRD } from '@/lib/utils'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

export interface ApprovedQuote {
  id: string
  number: string
  title: string
  clientId: string
  projectId: string | null
  total: number
}

const emptyLine = (): SalesInvoiceLine => ({
  description: '',
  quantity: 1,
  unit: null,
  unitPrice: 0,
  itbisRate: 18,
  goodOrService: 2,
})

/**
 * Crea (o edita, si llega `invoice`) una factura en borrador. Puede partir de una
 * cotización aprobada —con todo su monto o solo un porcentaje (avance)— y las líneas se
 * pueden ajustar antes de emitir. Emitir (el e-CF) se hace desde el detalle.
 */
export function FacturaEmitidaForm({
  clients,
  projects,
  quotes,
  initialQuoteId,
  invoice,
}: {
  clients: Client[]
  projects: Project[]
  quotes: ApprovedQuote[]
  initialQuoteId?: string
  invoice?: SalesInvoice
}) {
  const router = useRouter()
  const editing = !!invoice

  const initialQuote = quotes.find((q) => q.id === initialQuoteId)
  const [clientId, setClientId] = useState(invoice?.clientId ?? initialQuote?.clientId ?? '')
  const [projectId, setProjectId] = useState(invoice?.projectId ?? initialQuote?.projectId ?? '')
  const [quoteId, setQuoteId] = useState(invoice?.quoteId ?? initialQuote?.id ?? '')
  const [percent, setPercent] = useState(String(invoice?.quotePercent ?? 100))
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? todayRD())
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? '')
  const [notes, setNotes] = useState(invoice?.notes ?? '')
  const [lines, setLines] = useState<SalesInvoiceLine[]>(
    invoice?.lines?.length ? invoice.lines.map((l) => ({ ...l })) : [emptyLine()],
  )
  const [preview, setPreview] = useState<QuoteInvoicePreview | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totals = useMemo(() => linesTotals(lines), [lines])
  const clientQuotes = quotes.filter((q) => q.clientId === clientId)
  const clientProjects = projects.filter((p) => p.clientId === clientId)
  const pct = parseFloat(percent)

  async function loadFromQuote(id: string, p: number) {
    if (!id) return
    setLoadingQuote(true)
    setError(null)
    const r = await previewInvoiceFromQuote(id, p)
    setLoadingQuote(false)
    if (!r.ok || !r.data) {
      setError(r.error ?? 'No se pudo leer la cotización')
      return
    }
    setPreview(r.data)
    setLines(r.data.lines.map((l) => ({ ...l })))
    if (!projectId && r.data.quote.projectId) setProjectId(r.data.quote.projectId)
    if (!notes) {
      setNotes(
        p >= 100
          ? `Cotización ${r.data.quote.number}: ${r.data.quote.title}`
          : `Avance del ${p}% de la cotización ${r.data.quote.number}: ${r.data.quote.title}`,
      )
    }
  }

  // Llegar desde "Facturar" en una cotización: se cargan sus líneas de una vez.
  const autoLoaded = useRef(false)
  useEffect(() => {
    if (!editing && initialQuote && !autoLoaded.current) {
      autoLoaded.current = true
      void loadFromQuote(initialQuote.id, 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setLine(i: number, patch: Partial<SalesInvoiceLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function submit() {
    setError(null)
    if (!clientId) return setError('Elige el cliente')
    if (lines.some((l) => !l.description.trim() || !(Number(l.quantity) > 0))) {
      return setError('Cada línea necesita descripción y cantidad')
    }
    if (totals.total <= 0) return setError('El total debe ser mayor que cero')
    setSaving(true)
    const common = {
      projectId: projectId || undefined,
      issueDate,
      dueDate: dueDate || null,
      notes: notes || null,
      lines,
    }
    const r = editing
      ? await updateSalesInvoice(invoice!.id, { ...common, projectId: projectId || undefined })
      : await createSalesInvoice({
          ...common,
          clientId,
          quoteId: quoteId || undefined,
          quotePercent: quoteId && Number.isFinite(pct) ? pct : undefined,
        })
    setSaving(false)
    if (!r.ok || !r.data) {
      setError(r.error ?? 'No se pudo guardar')
      return
    }
    router.push(`/dashboard/facturas/emitidas/${r.data.id}`)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Cliente y origen</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Cliente <span className="text-destructive">*</span></Label>
            <BuscadorSelect
              opciones={clients.map((c) => ({ value: c.id, label: c.name, hint: c.rnc ?? undefined }))}
              value={clientId}
              onValueChange={(v) => {
                setClientId(v)
                setProjectId('')
                setQuoteId('')
                setPreview(null)
              }}
              placeholder="Buscar cliente…"
              disabled={editing}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Proyecto</Label>
            <Select value={projectId} onValueChange={(v) => setProjectId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— Sin proyecto —">
                  {projectId ? clientProjects.find((p) => p.id === projectId)?.name : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Sin proyecto —</SelectItem>
                {clientProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!editing && (
            <div className="space-y-1.5">
              <Label>Importar una cotización aprobada</Label>
              <Select
                value={quoteId}
                onValueChange={(v) => {
                  const id = v ?? ''
                  setQuoteId(id)
                  setPreview(null)
                  if (id) void loadFromQuote(id, Number.isFinite(pct) && pct > 0 ? pct : 100)
                }}
              >
                <SelectTrigger className="w-full" disabled={!clientId}>
                  <SelectValue placeholder={clientId ? '— Sin cotización —' : 'Primero elige el cliente'}>
                    {quoteId ? clientQuotes.find((q) => q.id === quoteId)?.number : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Sin cotización —</SelectItem>
                  {clientQuotes.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.number} — {q.title} ({DOP.format(q.total)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {quoteId && !editing && (
            <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pct">Porcentaje de la cotización a facturar</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="pct" type="number" min="1" max="100" step="0.01" className="w-28"
                      value={percent} onChange={(e) => setPercent(e.target.value)}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
                <Button
                  type="button" variant="outline" size="sm" disabled={loadingQuote || !(pct > 0 && pct <= 100)}
                  onClick={() => loadFromQuote(quoteId, pct)}
                >
                  <FileText className="size-4 mr-1.5" />
                  {loadingQuote ? 'Cargando…' : 'Cargar líneas'}
                </Button>
              </div>
              {preview && (
                <p className="text-xs text-muted-foreground">
                  Cotización de {DOP.format(preview.quote.total)}: ya facturado {DOP.format(preview.alreadyInvoiced)},
                  por facturar {DOP.format(preview.remaining)}.
                </p>
              )}
              {preview?.warnings.map((w) => (
                <p key={w} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">Líneas</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus className="size-4 mr-1" />
            Agregar línea
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-12 rounded-md border p-3">
              <div className="sm:col-span-12">
                <Input
                  placeholder="Descripción" value={l.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Cantidad</Label>
                <Input
                  type="number" min="0.01" step="0.01" value={l.quantity}
                  onChange={(e) => setLine(i, { quantity: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="sm:col-span-3">
                <Label className="text-xs text-muted-foreground">Precio (sin ITBIS)</Label>
                <Input
                  type="number" min="0" step="0.01" value={l.unitPrice}
                  onChange={(e) => setLine(i, { unitPrice: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="sm:col-span-3">
                <Label className="text-xs text-muted-foreground">ITBIS</Label>
                <Select value={String(l.itbisRate)} onValueChange={(v) => setLine(i, { itbisRate: Number(v) })}>
                  <SelectTrigger className="w-full"><SelectValue>{RATE_LABELS[String(l.itbisRate)]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RATE_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Tipo</Label>
                <Select value={String(l.goodOrService)} onValueChange={(v) => setLine(i, { goodOrService: Number(v) })}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{l.goodOrService === 1 ? 'Bien' : 'Servicio'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">Servicio</SelectItem>
                    <SelectItem value="1">Bien</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex items-end justify-between gap-2">
                <span className="text-sm tabular-nums font-medium pb-2">
                  {DOP.format((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}
                </span>
                {lines.length > 1 && (
                  <Button
                    type="button" variant="ghost" size="icon-sm" aria-label="Quitar línea"
                    onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{DOP.format(totals.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">ITBIS</span><span className="tabular-nums">{DOP.format(totals.itbis)}</span></div>
            <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Total</span><span className="tabular-nums">{DOP.format(totals.total)}</span></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Fechas y notas</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="issue">Fecha</Label>
            <Input id="issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Al emitir el comprobante se toma la fecha del día.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due">Fecha límite de cobro (opcional)</Label>
            <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Sirve para marcar la factura como vencida si no se cobra a tiempo.</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notas</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Aparece como comentario del comprador" />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={() => router.back()} disabled={saving}>Cancelar</Button>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear borrador'}
        </Button>
      </div>
    </div>
  )
}
