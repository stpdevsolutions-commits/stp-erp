'use client'

import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ── Types ─────────────────────────────────────────────────────────────────────

export type IndirectRow = {
  id: string
  name: string
  pct: string
  taxable?: boolean // cuenta para la base "gravables" del ITBIS (ej.: Dirección Técnica)
  itbis?: boolean // entrada especial ITBIS
  baseMode?: 'gravables' | 'total' // solo aplica si itbis=true
}

// Como llega/sale del backend (amount lo recalcula el servidor).
export type IndirectCost = {
  name: string
  pct: number
  amount: number
  kind?: 'itbis'
  taxable?: boolean
  baseMode?: 'gravables' | 'total'
}

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

function genId() {
  return Math.random().toString(36).slice(2, 9)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Defaults (empresa dominicana de construcción/electromecánica) ─────────────

export function defaultIndirectRows(): IndirectRow[] {
  return [
    { id: genId(), name: 'Dirección Técnica', pct: '15', taxable: true },
    { id: genId(), name: 'Seguro y Fianza', pct: '3' },
    { id: genId(), name: 'Gastos Administrativos', pct: '3' },
    { id: genId(), name: 'Ley 6-86', pct: '1' },
    { id: genId(), name: 'Transporte', pct: '2' },
    { id: genId(), name: 'Imprevisto', pct: '5' },
    { id: genId(), name: 'CODIA', pct: '0.10' },
    { id: genId(), name: 'ITBIS', pct: '18', itbis: true, baseMode: 'gravables' },
  ]
}

export function rowsFromIndirect(costs: IndirectCost[]): IndirectRow[] {
  return costs.map((c) => ({
    id: genId(),
    name: c.name,
    pct: String(c.pct),
    taxable: c.taxable || undefined,
    itbis: c.kind === 'itbis' || undefined,
    baseMode: c.kind === 'itbis' ? c.baseMode ?? 'gravables' : undefined,
  }))
}

// ── Cálculo (espejo del backend, solo para mostrar en pantalla) ───────────────

export function computeIndirect(base: number, rows: IndirectRow[]) {
  const amounts: Record<string, number> = {}
  let taxBase = 0
  for (const r of rows) {
    if (r.itbis) continue
    const pct = parseFloat(r.pct) || 0
    const amount = round2(base * (pct / 100))
    amounts[r.id] = amount
    if (r.taxable) taxBase += amount
  }
  const sumOtherCosts = Object.values(amounts).reduce((s, a) => s + a, 0)
  const totalBase = base + sumOtherCosts

  let itbis = 0
  for (const r of rows) {
    if (!r.itbis) continue
    const pct = parseFloat(r.pct) || 0
    const effectiveBase = r.baseMode === 'total' ? totalBase : taxBase
    const amount = round2(effectiveBase * (pct / 100))
    amounts[r.id] = amount
    itbis += amount
  }
  const totalCosts = Object.values(amounts).reduce((s, a) => s + a, 0)
  return { amounts, itbis: round2(itbis), total: round2(base + totalCosts) }
}

export function indirectToPayload(rows: IndirectRow[]): IndirectCost[] {
  return rows.map((r) => ({
    name: r.name.trim() || 'Concepto',
    pct: parseFloat(r.pct) || 0,
    amount: 0, // el servidor lo recalcula
    ...(r.itbis ? { kind: 'itbis' as const, baseMode: r.baseMode ?? 'gravables' } : {}),
    ...(r.taxable ? { taxable: true } : {}),
  }))
}

export function makeIndirectRow(): IndirectRow {
  return { id: genId(), name: '', pct: '0' }
}

function makeItbisRow(): IndirectRow {
  return { id: genId(), name: 'ITBIS', pct: '18', itbis: true, baseMode: 'gravables' }
}

// ── Componente editable ───────────────────────────────────────────────────────

export function IndirectCostsSection({
  rows,
  setRows,
  base,
}: {
  rows: IndirectRow[]
  setRows: (updater: (prev: IndirectRow[]) => IndirectRow[]) => void
  base: number
}) {
  const { amounts } = computeIndirect(base, rows)
  const hasItbis = rows.some((r) => r.itbis)

  const update = (id: string, field: 'name' | 'pct', value: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  const toggleTaxable = (id: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, taxable: !r.taxable } : r)))
  const setItbisBaseMode = (id: string, baseMode: 'gravables' | 'total') =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, baseMode } : r)))
  const remove = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id))
  const add = () => setRows((prev) => [...prev, makeIndirectRow()])
  const addItbis = () => setRows((prev) => [...prev, makeItbisRow()])

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Concepto</th>
              <th className="px-2 py-2 text-center font-medium text-muted-foreground w-20">Gravable</th>
              <th className="px-2 py-2 text-right font-medium text-muted-foreground w-24">%</th>
              <th className="px-2 py-2 text-right font-medium text-muted-foreground w-36">Monto</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const amount = amounts[r.id] ?? 0
              if (r.itbis) {
                return (
                  <tr key={r.id} className="bg-muted/20">
                    <td className="px-3 py-1.5">
                      <span className="text-sm font-medium">{r.name || 'ITBIS'}</span>
                      <select
                        value={r.baseMode ?? 'gravables'}
                        onChange={(e) => setItbisBaseMode(r.id, e.target.value as 'gravables' | 'total')}
                        className="ml-2 h-6 rounded border border-input bg-transparent text-xs text-muted-foreground"
                      >
                        <option value="gravables">sobre gastos gravables</option>
                        <option value="total">sobre el total completo</option>
                      </select>
                    </td>
                    <td />
                    <td className="px-2 py-1.5">
                      <Input
                        type="number" min="0" max="100" step="0.01"
                        value={r.pct}
                        onChange={(e) => update(r.id, 'pct', e.target.value)}
                        className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right text-sm"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
                      {DOP.format(amount)}
                    </td>
                    <td className="px-1 py-1.5">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(r.id)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={r.id}>
                  <td className="px-3 py-1.5">
                    <Input
                      value={r.name}
                      onChange={(e) => update(r.id, 'name', e.target.value)}
                      className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-sm"
                      placeholder="Concepto"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={r.taxable ?? false}
                      onChange={() => toggleTaxable(r.id)}
                      className="size-4 rounded border-input"
                      title="Cuenta para la base de ITBIS 'gravables'"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number" min="0" max="100" step="0.01"
                      value={r.pct}
                      onChange={(e) => update(r.id, 'pct', e.target.value)}
                      className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-right text-sm"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-sm">{DOP.format(amount)}</td>
                  <td className="px-1 py-1.5">
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(r.id)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t p-2 flex gap-2">
        <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={add}>
          <Plus className="size-3.5 mr-1.5" />
          Agregar concepto
        </Button>
        {!hasItbis && (
          <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={addItbis}>
            <Plus className="size-3.5 mr-1.5" />
            Agregar ITBIS
          </Button>
        )}
      </div>
    </div>
  )
}
