'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { api } from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function uploadFile(
  uploadPath: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const store = await cookies()
    const token = store.get('stp-token')?.value
    if (!token) return { ok: false, error: 'No autorizado' }

    const res = await fetch(`${API_URL}${uploadPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { message?: string | string[] }
      const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? 'Error al subir')
      return { ok: false, error: msg }
    }

    revalidatePath('/dashboard/archivos')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al subir' }
  }
}

export async function deleteFile(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await api.delete(`/files/${id}`)
    revalidatePath('/dashboard/archivos')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al eliminar' }
  }
}
