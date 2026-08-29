'use server'

import { revalidatePath } from 'next/cache'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'

export interface ActionResult {
  ok: boolean
  error?: string
}

export async function updateMe(input: {
  firstName?: string
  lastName?: string
  phone?: string
}): Promise<ActionResult> {
  const body = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined),
  )

  const res = await authFetch('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar el perfil') }
  }

  revalidatePath('/dashboard/perfil')
  return { ok: true }
}

export async function changePassword(input: {
  password: string
}): Promise<ActionResult> {
  const res = await authFetch('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al cambiar la contraseña') }
  }

  return { ok: true }
}
