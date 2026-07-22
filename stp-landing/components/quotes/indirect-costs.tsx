'use client'

import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ── Types ─────────────────────────────────────────────────────────────────────

export type IndirectRow = {
  id: string
  name: string
  pct: string
  taxable?: boolean // base del ITBIS (por defecto: Dirección Técnica)
  itbis?: boolean // entrada especial ITBIS (18% de la base gravada)
}

// Como llega/sale del backend (amount lo recalcula el servidor).
export type IndirectCost = {
  name: string
  pct: number
  amount: number
  kind?: 'itbis'
  taxable?: boolean
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
    { id: genId(), name: 'ITBIS', pct: '18', itbis: true },
  ]
}

export function rowsFromIndirect(costs: IndirectCost[]): IndirectRow[] {
  return costs.map((c) => ({
    id: genId(),
    name: c.name,
    pct: String(c.pct),
    taxable: c.taxable || undefined,
    itbis: c.kind === 'itbis' || undefined,
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
  let itbis = 0
  for (const r of rows) {
    if (!r.itbis) continue
    const pct = parseFloat(r.pct) || 0
    const amount = round2(taxBase * (pct / 100))
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
    ...(r.itbis ? { kind: 'itbis' as const } : {}),
    ...(r.taxable ? { taxable: true } : {}),
  }))
}

export function makeIndirectRow(): IndirectRow {
  return { id: genId(), name: '', pct: '0' }
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

  const update = (id: string, field: 'name' | 'pct', value: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  const remove = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id))
  const add = () =>
    setRows((prev) => {
      // insertar antes de la fila ITBIS para mantenerla al final
      const itbisIdx = prev.findIndex((r) => r.itbis)
      const row = makeIndirectRow()
      if (itbisIdx === -1) return [...prev, row]
      return [...prev.slice(0, itbisIdx), row, ...prev.slice(itbisIdx)]
    })

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Concepto</th>
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
                      <span className="ml-1 text-xs text-muted-foreground">(18% de Dirección Técnica)</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
                      {r.pct}%
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
                      {DOP.format(amount)}
                    </td>
                    <td />
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
      <div className="border-t p-2">
        <Button type="button" variant="ghost" size="sm" className="w-full" onClick={add}>
          <Plus className="size-3.5 mr-1.5" />
          Agregar concepto
        </Button>
      </div>
    </div>
  )
}
