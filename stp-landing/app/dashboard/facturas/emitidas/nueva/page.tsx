import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { api } from '@/lib/api'
import type { Client, PaginatedResponse, Project, Quote } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { FacturaEmitidaForm } from '@/components/facturas/emitidas/factura-emitida-form'

export default async function NuevaFacturaEmitidaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams

  const [clients, projects, quotes] = await Promise.all([
    api.get<PaginatedResponse<Client>>('/clients?limit=200').then((r) => r.data).catch(() => [] as Client[]),
    api.get<PaginatedResponse<Project>>('/projects?limit=200').then((r) => r.data).catch(() => [] as Project[]),
    // Solo las vigentes y aprobadas se pueden facturar.
    api
      .get<PaginatedResponse<Quote>>('/quotes?limit=200&status=approved')
      .then((r) => r.data.filter((q) => !q.supersededById))
      .catch(() => [] as Quote[]),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/dashboard/facturas/emitidas" />}>
          <ChevronLeft className="size-4" />
          Facturas emitidas
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nueva factura</h1>
        <p className="text-muted-foreground text-sm">
          Se crea como borrador. El comprobante fiscal (e-CF) se emite desde el detalle, una sola vez.
        </p>
      </div>
      <FacturaEmitidaForm
        clients={clients}
        projects={projects}
        quotes={quotes.map((q) => ({
          id: q.id,
          number: q.number,
          title: q.title,
          clientId: q.clientId,
          projectId: q.projectId ?? null,
          total: q.total,
        }))}
        initialQuoteId={sp.quoteId}
      />
    </div>
  )
}
