'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function getToken() {
  const store = await cookies()
  return store.get('stp-token')?.value
}

export interface CreateClientInput {
  name: string
  type?: 'company' | 'individual'
  rnc?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  contactName?: string
  contactPhone?: string
  notes?: string
}

export interface ActionResult {
  ok: boolean
  error?: string
}

export async function createClient(input: CreateClientInput): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  // Strip empty strings so API doesn't receive "" for optional fields
  const body = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined),
  )

  const res = await fetch(`${API_URL}/clients`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al crear el cliente')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/clientes')
  return { ok: true }
}

export interface UpdateClientInput {
  name?: string
  type?: 'company' | 'individual'
  rnc?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  contactName?: string | null
  contactPhone?: string | null
  notes?: string | null
  isActive?: boolean
}

export async function updateClient(id: string, input: UpdateClientInput): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  // Convert empty strings to null so the API clears nullable fields
  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await fetch(`${API_URL}/clients/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al actualizar el cliente')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/clientes')
  return { ok: true }
}

export async function deleteClient(id: string): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/clients/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: err.message ?? 'Error al eliminar el cliente' }
  }

  revalidatePath('/dashboard/clientes')
  return { ok: true }
}
