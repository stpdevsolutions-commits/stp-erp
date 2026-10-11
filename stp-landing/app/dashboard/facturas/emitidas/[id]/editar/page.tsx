import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { api } from '@/lib/api'
import type { Client, PaginatedResponse, Project } from '@/lib/types'
import type { SalesInvoice } from '@/lib/sales-invoices'
import { Button } from '@/components/ui/button'
import { FacturaEmitidaForm } from '@/components/facturas/emitidas/factura-emitida-form'

export default async function EditarFacturaEmitidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let invoice: SalesInvoice
  try {
    invoice = await api.get<SalesInvoice>(`/sales-invoices/${id}`)
  } catch {
    notFound()
  }
  // Solo el borrador se edita; una emitida ya no puede cambiar.
  if (invoice.status !== 'draft') redirect(`/dashboard/facturas/emitidas/${id}`)

  const [clients, projects] = await Promise.all([
    api.get<PaginatedResponse<Client>>('/clients?limit=200').then((r) => r.data).catch(() => [] as Client[]),
    api.get<PaginatedResponse<Project>>('/projects?limit=200').then((r) => r.data).catch(() => [] as Project[]),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href={`/dashboard/facturas/emitidas/${id}`} />}>
          <ChevronLeft className="size-4" />
          {invoice.number}
        </Button>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Editar borrador {invoice.number}</h1>
      <FacturaEmitidaForm clients={clients} projects={projects} quotes={[]} invoice={invoice} />
    </div>
  )
}
