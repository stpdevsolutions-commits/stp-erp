'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function getToken() {
  const store = await cookies()
  return store.get('stp-token')?.value
}

export interface ActionResult {
  ok: boolean
  error?: string
}

export async function updateMe(input: {
  firstName?: string
  lastName?: string
}): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const body = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined),
  )

  const res = await fetch(`${API_URL}/users/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al actualizar el perfil')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/perfil')
  return { ok: true }
}

export async function changePassword(input: {
  password: string
}): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/users/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al cambiar la contraseña')
    return { ok: false, error: msg }
  }

  return { ok: true }
}
