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

export interface CreatePaymentInput {
  clientId: string
  projectId?: string
  description: string
  amount: number
  method?: string
  status?: string
  date: string
  reference?: string
  notes?: string
}

export interface UpdatePaymentInput {
  clientId?: string
  projectId?: string | null
  description?: string
  amount?: number
  method?: string
  status?: string
  date?: string
  reference?: string | null
  notes?: string | null
}

export async function createPayment(input: CreatePaymentInput): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al crear pago')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/pagos')
  return { ok: true }
}

export async function updatePayment(id: string, input: UpdatePaymentInput): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await fetch(`${API_URL}/payments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al actualizar pago')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/pagos')
  return { ok: true }
}

export async function deletePayment(id: string): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/payments/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: err.message ?? 'Error al eliminar pago' }
  }

  revalidatePath('/dashboard/pagos')
  return { ok: true }
}
