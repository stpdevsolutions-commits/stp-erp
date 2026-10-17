'use client'

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectItem } from '@/components/ui/select'
import { SelectBuscable } from '@/components/ui/select-buscable'
import { setFiscalInvoiceSplits } from '@/lib/actions/fiscal-invoices'
import type { FiscalInvoice } from '@/lib/fiscal-invoices'
import { GENERAL_EXPENSE } from '@/lib/general-expense'
import {
  amountsForPercents,
  checkSplit,
  describeDifference,
  fromCents,
  remainderFor,
  splitEqually,
  toCents,
} from '@/lib/invoice-split'
import type { Project } from '@/lib/types'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

/** Una línea en pantalla. Los números se guardan como texto para poder teclearlos a medias ("12."). */
interface Row {
  key: string
  /** '' = sin elegir, GENERAL_EXPENSE = gasto general, o el id de un proyecto. */
  dest: string
  amount: string
  pct: string
  note: string
}

let rowSeq = 0
const newRow = (over: Partial<Row> = {}): Row => ({ key: `fila-${++rowSeq}`, dest: '', amount: '', pct: '', note: '', ...over })

/** "1,250.5" → 1250.5. Vacío, negativo o texto → 0. */
function parseNumber(raw: string): number {
  const n = Number(raw.replace(/,/g, '').trim())
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Número a texto de campo: 0 queda vacío; 300.5 → "300.5". */
const toField = (n: number) => (n > 0 ? String(n) : '')

/** Con qué líneas abre el diálogo: el reparto guardado, o el destino actual de la factura más una línea vacía. */
function initialRows(invoice: FiscalInvoice): Row[] {
  if (invoice.splits && invoice.splits.length > 0) {
    return invoice.splits.map((s) =>
      newRow({ dest: s.projectId ?? GENERAL_EXPENSE, amount: String(s.amount), note: s.note ?? '' }),
    )
  }
  const current = invoice.expenseId ? (invoice.expense?.projectId ?? GENERAL_EXPENSE) : ''
  return [newRow({ dest: current, amount: String(invoice.totalAmount) }), newRow()]
}

/**
 * Dividir una factura entre varios proyectos y gasto general (ERP-81). La factura sigue entera para
 * el 606; cada línea genera su propio gasto, así cada proyecto ve en sus costos solo su parte.
 */
export function DividirFacturaDialog({
  invoice,
  projects,
  open,
  onOpenChange,
}: {
  invoice: FiscalInvoice
  projects: Project[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const total = invoice.totalAmount
  const [rows, setRows] = useState<Row[]>(() => initialRows(invoice))
  const [pctMode, setPctMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amounts = useMemo(() => rows.map((r) => parseNumber(r.amount)), [rows])
  const check = useMemo(() => checkSplit(total, amounts.map((amount) => ({ amount }))), [total, amounts])
  const allHaveDest = rows.every((r) => r.dest !== '')
  const allPositive = amounts.every((a) => toCents(a) > 0)
  const hasDuplicates = new Set(rows.map((r) => r.dest).filter(Boolean)).size < rows.filter((r) => r.dest).length
  const canSave = check.ok && allHaveDest && allPositive && !saving

  function patchRow(key: string, patch: Partial<Row>) {
    setError(null)
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  /** Recalcula los montos desde los porcentajes (solo en modo "Por porcentaje"). */
  function withPercentAmounts(list: Row[]): Row[] {
    const computed = amountsForPercents(total, list.map((r) => Number(r.pct.replace(/,/g, '')) || 0))
    return list.map((r, i) => ({ ...r, amount: toField(computed[i]) }))
  }

  function setPct(key: string, pct: string) {
    setError(null)
    setRows((prev) => withPercentAmounts(prev.map((r) => (r.key === key ? { ...r, pct } : r))))
  }

  function addRow() {
    setError(null)
    setRows((prev) => {
      const next = [...prev, newRow()]
      return pctMode ? withPercentAmounts(next) : next
    })
  }

  function removeRow(key: string) {
    setError(null)
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key)
      return pctMode ? withPercentAmounts(next) : next
    })
  }

  /** "Lo que falta va a esta línea": le pone el monto que cuadra la suma. */
  function fillRemainder(index: number) {
    const rest = remainderFor(total, amounts, index)
    if (rest <= 0) return
    patchRow(rows[index].key, { amount: toField(rest) })
  }

  function splitEvenly() {
    setError(null)
    setPctMode(false)
    const parts = splitEqually(total, rows.length)
    setRows((prev) => prev.map((r, i) => ({ ...r, amount: toField(parts[i]), pct: '' })))
  }

  function togglePctMode() {
    setError(null)
    if (pctMode) {
      setPctMode(false)
      return
    }
    // Al activarlo, cada % parte de lo que ya hay repartido.
    setPctMode(true)
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        pct: total > 0 && parseNumber(r.amount) > 0 ? String(Math.round((toCents(parseNumber(r.amount)) / toCents(total)) * 10000) / 100) : '',
      })),
    )
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    const res = await setFiscalInvoiceSplits(
      invoice.id,
      rows.map((r) => ({
        projectId: r.dest === GENERAL_EXPENSE ? null : r.dest,
        amount: fromCents(toCents(parseNumber(r.amount))),
        note: r.note.trim() || null,
      })),
    )
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'No se pudo guardar el reparto')
      return
    }
    toast.success(rows.length > 1 ? 'Factura dividida' : 'Factura asignada a un solo destino')
    onOpenChange(false)
  }

  const statusStyle = check.ok
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : check.difference > 0
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-destructive/10 text-destructive border-destructive/30'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dividir factura</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{invoice.ncf}</span> · {invoice.supplierName} · Total{' '}
            <span className="font-medium text-foreground">{DOP.format(total)}</span>. Cada línea crea su propio gasto: cada
            proyecto ve en sus costos solo su parte. Para el 606 la factura sigue entera.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={splitEvenly} disabled={saving}>
            Partes iguales
          </Button>
          <Button type="button" size="sm" variant={pctMode ? 'secondary' : 'outline'} onClick={togglePctMode} disabled={saving} aria-pressed={pctMode}>
            Por porcentaje
          </Button>
        </div>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.key} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label>Destino de la línea {i + 1}</Label>
                  <SelectBuscable
                    value={r.dest}
                    onValueChange={(v) => v && patchRow(r.key, { dest: v })}
                    placeholder="Elegir proyecto o gasto general"
                    className="w-full"
                  >
                    <SelectItem value={GENERAL_EXPENSE}>Gasto general (sin proyecto)</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </SelectItem>
                    ))}
                  </SelectBuscable>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="mt-6"
                  onClick={() => removeRow(r.key)}
                  disabled={rows.length === 1 || saving}
                >
                  <X className="size-4" />
                  <span className="sr-only">Quitar la línea {i + 1}</span>
                </Button>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-32 flex-1 space-y-1.5">
                  <Label htmlFor={`d-monto-${r.key}`}>Monto (RD$)</Label>
                  <Input
                    id={`d-monto-${r.key}`}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={r.amount}
                    readOnly={pctMode}
                    onChange={(e) => patchRow(r.key, { amount: e.target.value })}
                    className="tabular-nums"
                  />
                </div>
                {pctMode ? (
                  <div className="min-w-24 flex-1 space-y-1.5">
                    <Label htmlFor={`d-pct-${r.key}`}>Porcentaje (%)</Label>
                    <Input
                      id={`d-pct-${r.key}`}
                      inputMode="decimal"
                      placeholder="0"
                      value={r.pct}
                      onChange={(e) => setPct(r.key, e.target.value)}
                      className="tabular-nums"
                    />
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fillRemainder(i)}
                    disabled={saving || remainderFor(total, amounts, i) <= 0}
                  >
                    Lo que falta va a esta línea
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`d-nota-${r.key}`}>Nota (opcional)</Label>
                <Input
                  id={`d-nota-${r.key}`}
                  placeholder="Qué se compró para este destino…"
                  value={r.note}
                  maxLength={300}
                  onChange={(e) => patchRow(r.key, { note: e.target.value })}
                />
              </div>
            </div>
          ))}

          <Button type="button" size="sm" variant="outline" onClick={addRow} disabled={saving || rows.length >= 50}>
            <Plus className="size-4" />
            Agregar línea
          </Button>
        </div>

        <div role="status" aria-live="polite" className={`rounded-md border px-3 py-2 text-sm ${statusStyle}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span>
              Repartido {DOP.format(check.sum)} de {DOP.format(total)}
            </span>
            <span className="font-semibold tabular-nums">{describeDifference(check.difference)}</span>
          </div>
        </div>

        {hasDuplicates && (
          <p className="text-xs text-muted-foreground">Los destinos repetidos se juntan en una sola línea al guardar.</p>
        )}
        {rows.length === 1 && (
          <p className="text-xs text-muted-foreground">Con una sola línea la factura queda sin dividir, con ese destino.</p>
        )}
        {!allHaveDest && <p className="text-xs text-muted-foreground">Elige el destino de todas las líneas para guardar.</p>}
        {allHaveDest && !allPositive && (
          <p className="text-xs text-muted-foreground">Cada línea necesita un monto mayor que cero (quita las que no uses).</p>
        )}
        {error && <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!canSave}>
            {saving ? 'Guardando…' : 'Guardar reparto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
