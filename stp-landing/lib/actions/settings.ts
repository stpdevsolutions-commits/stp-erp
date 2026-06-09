'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://stp-api:3001'

async function authToken() {
  const jar = await cookies()
  return jar.get('stp-token')?.value
}

export async function uploadLogo(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await authToken()
    const res = await fetch(`${API}/settings/logo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    const data = await res.json().catch(() => ({})) as { message?: string | string[] }
    if (!res.ok) {
      const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? 'Error al subir')
      return { ok: false, error: msg }
    }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}
