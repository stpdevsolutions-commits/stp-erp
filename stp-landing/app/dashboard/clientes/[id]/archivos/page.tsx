import Link from 'next/link'
import { api, loadMain, loadSafe, failedLabels } from '@/lib/api'
import { LoadErrorBanner } from '@/components/ui/load-error-banner'
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

  const client = await loadMain(api.get<Client>(`/clients/${id}`))

  const filesR = await loadSafe(api.get<FileUpload[]>(`/files/clients/${id}`), [] as FileUpload[])
  const files = filesR.data
  const loadErrors = failedLabels([['archivos del cliente', filesR.failed]])

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

      <LoadErrorBanner failed={loadErrors} />

      <ArchivoViewer files={files} clientId={id} canDelete={true} />
    </div>
  )
}
