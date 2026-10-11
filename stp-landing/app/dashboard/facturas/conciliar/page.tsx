import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { api, pageError } from '@/lib/api'
import type { Reconciliation } from '@/lib/fiscal-invoices'
import { ConciliarClient } from '@/components/facturas/conciliar-client'

export default async function ConciliarPage() {
  let data: Reconciliation | null = null
  let error: string | null = null
  try {
    data = await api.get<Reconciliation>('/fiscal-invoices/reconcile')
  } catch (e) {
    error = pageError(e, 'No se pudo preparar la conciliación')
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/facturas"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Facturas recibidas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Conciliar facturas con gastos</h1>
        <p className="text-muted-foreground text-sm">
          Facturas que todavía no tienen gasto y gastos que ya registraste a mano: si son la misma compra, se vinculan y
          no se cuenta dos veces.
        </p>
      </div>

      {error ? (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      ) : (
        data && <ConciliarClient data={data} />
      )}
    </div>
  )
}
