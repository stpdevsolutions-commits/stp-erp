import { api, pageError } from '@/lib/api'
import type { PaginatedResponse, Project } from '@/lib/types'
import { EscanearFlow } from '@/components/facturas/escanear-flow'

/** Pantalla móvil de "STP Facturas" (la que abre la PWA instalada): escanear, revisar y guardar. */
export default async function EscanearPage() {
  let projects: Project[] = []
  let modules: Record<string, string> | undefined
  let error: string | null = null

  try {
    const [proyRes, me] = await Promise.all([
      api.get<PaginatedResponse<Project>>('/projects?limit=200'),
      api.get<{ modules?: Record<string, string> }>('/users/me'),
    ])
    projects = proyRes.data
    modules = me.modules
  } catch (e) {
    error = pageError(e, 'No se pudo cargar la pantalla de escaneo')
  }

  if (error) {
    return <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
  }
  if (modules?.facturas !== 'manage') {
    return (
      <div className="mx-auto max-w-lg rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
        Tu usuario no tiene permiso para registrar facturas. Pídelo a un administrador.
      </div>
    )
  }
  return <EscanearFlow projects={projects} />
}
