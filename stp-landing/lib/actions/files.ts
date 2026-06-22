'use server'

import { revalidatePath } from 'next/cache'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'

export async function uploadFile(
  uploadPath: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
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
