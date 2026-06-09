import { cookies } from 'next/headers'
import { api } from '@/lib/api'
import type { Client, Project, FileUpload, PaginatedResponse } from '@/lib/types'
import { Separator } from '@/components/ui/separator'
import { ArchivoNav } from '@/components/files/archivo-nav'
import { ArchivoViewer } from '@/components/files/archivo-viewer'
import { FolderOpen } from 'lucide-react'

function getRole(token: string): string {
  try {
    return (JSON.parse(atob(token.split('.')[1])) as { role?: string }).role ?? 'user'
  } catch {
    return 'user'
  }
}

export default async function ArchivosPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; proyecto?: string }>
}) {
  const { cliente, proyecto } = await searchParams

  // User role — for showing/hiding delete buttons
  const store = await cookies()
  const token = store.get('stp-token')?.value ?? ''
  const role = getRole(token)
  const canDelete = role === 'admin' || role === 'manager'

  // Load selectors data
  const [clientsResult, projectsResult] = await Promise.allSettled([
    api.get<PaginatedResponse<Client>>('/clients?limit=200'),
    api.get<PaginatedResponse<Project>>('/projects?limit=200'),
  ])

  const clients =
    clientsResult.status === 'fulfilled' ? clientsResult.value.data : []
  const projects =
    projectsResult.status === 'fulfilled' ? projectsResult.value.data : []

  // Load files based on selection
  let files: FileUpload[] = []

  if (cliente && proyecto) {
    try {
      files = await api.get<FileUpload[]>(
        `/files/clients/${cliente}/projects/${proyecto}`,
      )
    } catch {}
  } else if (cliente) {
    try {
      files = await api.get<FileUpload[]>(`/files/clients/${cliente}/profile`)
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FolderOpen className="size-6" />
          Archivos
        </h1>
        <p className="text-muted-foreground text-sm">
          Fotos, documentos, comprobantes y cotizaciones por proyecto
        </p>
      </div>

      <ArchivoNav
        clients={clients}
        projects={projects}
        activeCliente={cliente}
        activeProyecto={proyecto}
      />

      <Separator />

      {!cliente ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="size-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-sm">
            Selecciona un cliente para ver sus archivos.
          </p>
        </div>
      ) : (
        <ArchivoViewer
          key={`${cliente}-${proyecto ?? 'profile'}`}
          files={files}
          clientId={cliente}
          projectId={proyecto}
          canDelete={canDelete}
        />
      )}
    </div>
  )
}
