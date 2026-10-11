'use client'

import { Badge } from '@/components/ui/badge'
import type { ExpenseCandidate } from '@/lib/fiscal-invoices'
import { formatDate } from '@/lib/utils'

const DOP = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' })

/** Etiqueta de qué tan probable es: la fuerte es la que cuadra en proveedor, monto y fecha. */
export function NivelBadge({ level, ambiguous }: { level: ExpenseCandidate['level']; ambiguous?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge className={level === 'strong' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'}>
        {level === 'strong' ? 'Muy probable' : 'Posible'}
      </Badge>
      {ambiguous && <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400">Hay otro parecido</Badge>}
    </span>
  )
}

/**
 * Pregunta "¿ya registraste este gasto a mano?": lista los gastos parecidos y deja elegir uno para
 * vincular la factura a él (no se crea otro gasto), o decir que es un gasto nuevo (ERP-50).
 */
export function GastoCandidatos({
  candidates,
  value,
  onChange,
  sync,
  onSyncChange,
  name = 'gasto-candidato',
}: {
  candidates: ExpenseCandidate[]
  value: string | null
  onChange: (id: string | null) => void
  sync: boolean
  onSyncChange: (v: boolean) => void
  /** Distinto por instancia para que dos paneles en pantalla no compartan los radios. */
  name?: string
}) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 dark:bg-amber-950/20">
      <div>
        <p className="text-sm font-medium">¿Ya registraste este gasto a mano?</p>
        <p className="text-xs text-muted-foreground">
          Hay {candidates.length === 1 ? 'un gasto parecido' : `${candidates.length} gastos parecidos`} sin factura. Si es
          uno de estos, vincúlalo y no se crea otro.
        </p>
      </div>

      <div className="space-y-1.5">
        {candidates.map((c) => (
          <label
            key={c.expenseId}
            className={`flex cursor-pointer items-start gap-2 rounded-md border bg-background p-2 text-sm ${value === c.expenseId ? 'border-primary ring-1 ring-primary' : ''}`}
          >
            <input
              type="radio"
              name={name}
              className="mt-1"
              checked={value === c.expenseId}
              onChange={() => onChange(c.expenseId)}
            />
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.expense.description}</span>
                <NivelBadge level={c.level} />
              </span>
              <span className="block text-xs text-muted-foreground">
                {DOP.format(c.expense.amount)} · {formatDate(c.expense.date)} ·{' '}
                {c.expense.projectCode ? `${c.expense.projectCode} — ${c.expense.projectName}` : 'Gasto general'}
              </span>
              {c.reasons.length > 0 && <span className="block text-xs text-muted-foreground">{c.reasons.join(' · ')}</span>}
            </span>
          </label>
        ))}
        <label className={`flex cursor-pointer items-center gap-2 rounded-md border bg-background p-2 text-sm ${value === null ? 'border-primary ring-1 ring-primary' : ''}`}>
          <input type="radio" name={name} checked={value === null} onChange={() => onChange(null)} />
          No, es un gasto nuevo
        </label>
      </div>

      {value && (
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="mt-0.5" checked={sync} onChange={(e) => onSyncChange(e.target.checked)} />
          <span>
            Poner en el gasto los datos de la factura (monto con ITBIS, fecha, proveedor y descripción). Si no, el gasto
            se queda tal como está.
          </span>
        </label>
      )}
    </div>
  )
}
