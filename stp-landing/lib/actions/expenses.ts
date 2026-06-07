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

export interface CreateExpenseInput {
  projectId: string
  description: string
  category?: string
  amount: number
  date: string
  supplierId?: string
  notes?: string
}

export interface UpdateExpenseInput {
  projectId?: string
  description?: string
  category?: string
  amount?: number
  date?: string
  supplierId?: string | null
  notes?: string | null
}

export async function createExpense(input: CreateExpenseInput): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al crear gasto')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/gastos')
  return { ok: true }
}

export async function updateExpense(id: string, input: UpdateExpenseInput): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await fetch(`${API_URL}/expenses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al actualizar gasto')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/gastos')
  return { ok: true }
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/expenses/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: err.message ?? 'Error al eliminar gasto' }
  }

  revalidatePath('/dashboard/gastos')
  return { ok: true }
}
