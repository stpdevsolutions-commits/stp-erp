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
  /** Opcional si se manda el desglose: el servidor calcula cantidad × unitario. */
  amount?: number
  date: string
  supplierId?: string
  notes?: string
  /** Desglose que alimenta la base de precios del módulo de Costos. */
  quantity?: number
  unitPrice?: number
  unitId?: string
  materialId?: string
  itbisIncluded?: boolean
}

export interface UpdateExpenseInput {
  projectId?: string
  description?: string
  category?: string
  amount?: number
  date?: string
  supplierId?: string | null
  notes?: string | null
  quantity?: number | null
  unitPrice?: number | null
  unitId?: string | null
  materialId?: string | null
  itbisIncluded?: boolean
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
  // Un gasto con material y desglose crea o anula un precio derivado.
  revalidatePath('/dashboard/costos/materiales')
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
  // Un gasto con material y desglose crea o anula un precio derivado.
  revalidatePath('/dashboard/costos/materiales')
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
  // Un gasto con material y desglose crea o anula un precio derivado.
  revalidatePath('/dashboard/costos/materiales')
  return { ok: true }
}
