import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Client, FileUpload } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { ChevronLeft, FolderOpen } from 'lucide-react'
import { ArchivoViewer } from '@/components/files/archivo-viewer'

export default async function ClienteArchivosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let client: Client
  try {
    client = await api.get<Client>(`/clients/${id}`)
  } catch {
    notFound()
  }

  const files = await api.get<FileUpload[]>(`/files/clients/${id}`).catch(() => [] as FileUpload[])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href={`/dashboard/clientes/${id}`} />}>
          <ChevronLeft className="size-4" />
          {client.name}
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FolderOpen className="size-6" />
          Archivos
        </h1>
        <p className="text-muted-foreground text-sm">{client.name}</p>
      </div>

      <ArchivoViewer files={files} clientId={id} canDelete={true} />
    </div>
  )
}
