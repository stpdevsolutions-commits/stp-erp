import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { api, loadMain, loadSafe, failedLabels } from '@/lib/api'
import { LoadErrorBanner } from '@/components/ui/load-error-banner'
import type { Client, PaginatedResponse, Project } from '@/lib/types'
import type { SalesInvoice } from '@/lib/sales-invoices'
import { Button } from '@/components/ui/button'
import { FacturaEmitidaForm } from '@/components/facturas/emitidas/factura-emitida-form'

export default async function EditarFacturaEmitidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const invoice = await loadMain(api.get<SalesInvoice>(`/sales-invoices/${id}`))
  // Solo el borrador se edita; una emitida ya no puede cambiar.
  if (invoice.status !== 'draft') redirect(`/dashboard/facturas/emitidas/${id}`)

  const [clientsR, projectsR] = await Promise.all([
    loadSafe(api.get<PaginatedResponse<Client>>('/clients?limit=200').then((r) => r.data), [] as Client[]),
    loadSafe(api.get<PaginatedResponse<Project>>('/projects?limit=200').then((r) => r.data), [] as Project[]),
  ])
  const clients = clientsR.data
  const projects = projectsR.data
  const loadErrors = failedLabels([
    ['clientes', clientsR.failed],
    ['proyectos', projectsR.failed],
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href={`/dashboard/facturas/emitidas/${id}`} />}>
          <ChevronLeft className="size-4" />
          {invoice.number}
        </Button>
      </div>
      <LoadErrorBanner failed={loadErrors} />
      <h1 className="text-2xl font-bold tracking-tight">Editar borrador {invoice.number}</h1>
      <FacturaEmitidaForm clients={clients} projects={projects} quotes={[]} invoice={invoice} />
    </div>
  )
}
