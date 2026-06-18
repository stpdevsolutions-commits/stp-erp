'use server'

import { revalidatePath } from 'next/cache'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'

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
  const res = await authFetch('/expenses', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al crear gasto') }
  }

  revalidatePath('/dashboard/gastos')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function updateExpense(id: string, input: UpdateExpenseInput): Promise<ActionResult> {
  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await authFetch(`/expenses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar gasto') }
  }

  revalidatePath('/dashboard/gastos')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const res = await authFetch(`/expenses/${id}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al eliminar gasto') }
  }

  revalidatePath('/dashboard/gastos')
  revalidatePath('/dashboard')
  return { ok: true }
}
