'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { NivelBadge } from '@/components/facturas/gasto-candidatos'
import { applyReconciliation } from '@/lib/actions/fiscal-invoices'
import type { ExpenseCandidate, ReconcileItem, Reconciliation } from '@/lib/fiscal-invoices'
import { formatDate } from '@/lib/utils'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

const proyecto = (c: ExpenseCandidate) =>
  c.expense.projectCode ? `${c.expense.projectCode} — ${c.expense.projectName}` : 'Gasto general'

/**
 * Conciliación de las facturas sin gasto con los gastos que se registraron a mano (ERP-50).
 * Lo claro (mismo proveedor, monto y fecha, sin rival parecido) viene marcado; lo dudoso hay que
 * marcarlo a conciencia. Nada se vincula hasta pulsar el botón.
 */
export function ConciliarClient({ data }: { data: Reconciliation }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  /** Gasto elegido por factura (el propuesto o una de sus alternativas). */
  const [choice, setChoice] = useState<Record<string, string>>(
    () => Object.fromEntries(data.items.map((i) => [i.invoice.id, i.best.expenseId])),
  )
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(data.items.filter((i) => i.best.level === 'strong' && !i.ambiguous).map((i) => i.invoice.id)),
  )
  const [sync, setSync] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const candidatesOf = (i: ReconcileItem) => [i.best, ...i.alternatives]
  const chosen = (i: ReconcileItem) => candidatesOf(i).find((c) => c.expenseId === choice[i.invoice.id]) ?? i.best

  // Un mismo gasto elegido para dos facturas seleccionadas: no se puede vincular a las dos.
  const repeated = useMemo(() => {
    const seen = new Map<string, number>()
    for (const i of data.items) {
      if (!selected.has(i.invoice.id)) continue
      const e = choice[i.invoice.id]
      seen.set(e, (seen.get(e) ?? 0) + 1)
    }
    return new Set([...seen].filter(([, n]) => n > 1).map(([e]) => e))
  }, [data.items, selected, choice])

  const strong = data.items.filter((i) => i.best.level === 'strong' && !i.ambiguous)
  const toLink = data.items.filter((i) => selected.has(i.invoice.id))

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirm() {
    setMessage(null)
    startTransition(async () => {
      const res = await applyReconciliation(
        toLink.map((i) => ({ invoiceId: i.invoice.id, expenseId: choice[i.invoice.id], syncExpense: sync })),
      )
      if (!res.ok) {
        setMessage({ ok: false, text: res.error ?? 'No se pudo vincular' })
        return
      }
      const failed = res.failed?.length ?? 0
      setMessage({
        ok: failed === 0,
        text:
          `${res.linked} factura${res.linked === 1 ? '' : 's'} vinculada${res.linked === 1 ? '' : 's'}.` +
          (failed ? ` ${failed} no se pudo${failed === 1 ? '' : 'ieron'} vincular: ${res.failed!.map((f) => f.error).join(' · ')}` : ''),
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Facturas sin gasto</p>
          <p className="text-2xl font-bold tabular-nums">{data.unlinkedInvoices}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Gastos sin factura</p>
          <p className="text-2xl font-bold tabular-nums">{data.unlinkedExpenses}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Coincidencias encontradas</p>
          <p className="text-2xl font-bold tabular-nums">
            {data.items.length} <span className="text-sm font-normal text-muted-foreground">({strong.length} muy probables)</span>
          </p>
        </CardContent></Card>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-md bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          No hay facturas con un gasto parecido por vincular.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set(strong.map((i) => i.invoice.id)))}>
                Marcar las muy probables
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Quitar todas</Button>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} />
                Poner en cada gasto los datos de su factura
              </label>
            </div>
            <Button onClick={confirm} disabled={pending || toLink.length === 0 || repeated.size > 0} className="gap-2">
              <Link2 className="size-4" />
              {pending ? 'Vinculando…' : `Vincular ${toLink.length} seleccionada${toLink.length === 1 ? '' : 's'}`}
            </Button>
          </div>

          {repeated.size > 0 && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              Hay dos facturas marcadas con el mismo gasto. Cambia una de las dos antes de vincular.
            </p>
          )}
          {message && (
            <p className={`rounded-md px-3 py-2 text-sm ${message.ok ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-destructive/10 text-destructive'}`}>
              {message.text}
            </p>
          )}

          <div className="space-y-2">
            {data.items.map((i) => {
              const c = chosen(i)
              const dup = repeated.has(c.expenseId) && selected.has(i.invoice.id)
              return (
                <div
                  key={i.invoice.id}
                  className={`grid gap-3 rounded-lg border p-3 text-sm md:grid-cols-[auto_1fr_1fr] ${dup ? 'border-amber-400' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={selected.has(i.invoice.id)}
                    onChange={() => toggle(i.invoice.id)}
                    aria-label={`Vincular la factura ${i.invoice.ncf}`}
                  />
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Factura</p>
                    <p className="font-medium">{i.invoice.supplierName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{i.invoice.ncf}</p>
                    <p className="text-xs text-muted-foreground">
                      {DOP.format(i.invoice.totalAmount)} · {formatDate(i.invoice.invoiceDate)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Gasto ya registrado</p>
                    <p className="font-medium">{c.expense.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {DOP.format(c.expense.amount)} · {formatDate(c.expense.date)} · {proyecto(c)}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <NivelBadge level={c.level} ambiguous={i.ambiguous && c.expenseId === i.best.expenseId} />
                      <span className="text-xs text-muted-foreground">{c.reasons.join(' · ')}</span>
                    </div>
                    {i.alternatives.length > 0 && (
                      <select
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-xs"
                        value={choice[i.invoice.id]}
                        onChange={(e) => setChoice((cur) => ({ ...cur, [i.invoice.id]: e.target.value }))}
                        aria-label="Elegir otro gasto"
                      >
                        {candidatesOf(i).map((a) => (
                          <option key={a.expenseId} value={a.expenseId}>
                            {a.expense.description} · {DOP.format(a.expense.amount)} · {formatDate(a.expense.date)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
