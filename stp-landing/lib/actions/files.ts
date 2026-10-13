'use server'

import { revalidatePath } from 'next/cache'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UUID_RE = new RegExp(`^${UUID}$`, 'i')

/**
 * Rutas de subida legítimas (las que arma components/files/archivo-viewer.tsx).
 * uploadFile es una Server Action: llega desde el cliente y por tanto es input
 * no confiable; sin esta lista cualquiera podría hacer un POST autenticado a
 * un endpoint arbitrario del API.
 */
const UPLOAD_PATHS = [
  new RegExp(`^/files/clients/${UUID}/(profile|documents|quotes|payments)$`, 'i'),
  new RegExp(`^/files/clients/${UUID}/projects/${UUID}/(photos|documents|expenses|quotes|payments)$`, 'i'),
]

export async function uploadFile(
  uploadPath: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  if (!UPLOAD_PATHS.some((re) => re.test(uploadPath))) {
    return { ok: false, error: 'Destino de subida no válido' }
  }
  try {
    const res = await authFetch(uploadPath, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: apiError(data, 'Error al subir') }
    }

    revalidatePath('/dashboard', 'layout')
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: err instanceof Error ? err.message : 'Error al subir' }
  }
}

export async function deleteFile(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!UUID_RE.test(id)) return { ok: false, error: 'Archivo no válido' }
  try {
    const res = await authFetch(`/files/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { ok: false, error: apiError(err, 'Error al eliminar') }
    }
    revalidatePath('/dashboard', 'layout')
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: err instanceof Error ? err.message : 'Error al eliminar' }
  }
}
