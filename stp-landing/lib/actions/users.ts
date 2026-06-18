'use server'

import { revalidatePath } from 'next/cache'
import { authFetch, apiError } from './utils'

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface CreateUserInput {
  firstName: string
  lastName: string
  email: string
  password: string
  role?: 'admin' | 'manager' | 'user'
  isActive?: boolean
}

export interface UpdateUserInput {
  firstName?: string
  lastName?: string
  email?: string
  password?: string
  role?: 'admin' | 'manager' | 'user'
  isActive?: boolean
}

export async function createUser(input: CreateUserInput): Promise<ActionResult> {
  const res = await authFetch('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al crear el usuario') }
  }

  revalidatePath('/dashboard/usuarios')
  return { ok: true }
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<ActionResult> {
  // Strip empty password so the server doesn't try to hash an empty string
  const body = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined),
  )

  const res = await authFetch(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar el usuario') }
  }

  revalidatePath('/dashboard/usuarios')
  return { ok: true }
}

export async function deleteUser(id: string): Promise<ActionResult> {
  const res = await authFetch(`/users/${id}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al eliminar el usuario') }
  }

  revalidatePath('/dashboard/usuarios')
  return { ok: true }
}
