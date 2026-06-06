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
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al crear el usuario')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/usuarios')
  return { ok: true }
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  // Strip empty password so the server doesn't try to hash an empty string
  const body = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined),
  )

  const res = await fetch(`${API_URL}/users/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al actualizar el usuario')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/usuarios')
  return { ok: true }
}

export async function deleteUser(id: string): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: err.message ?? 'Error al eliminar el usuario' }
  }

  revalidatePath('/dashboard/usuarios')
  return { ok: true }
}
