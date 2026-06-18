'use server'

import { revalidatePath } from 'next/cache'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'

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
  const res = await authFetch('/payments', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al crear pago') }
  }

  revalidatePath('/dashboard/pagos')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function updatePayment(id: string, input: UpdatePaymentInput): Promise<ActionResult> {
  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await authFetch(`/payments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar pago') }
  }

  revalidatePath('/dashboard/pagos')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function deletePayment(id: string): Promise<ActionResult> {
  const res = await authFetch(`/payments/${id}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al eliminar pago') }
  }

  revalidatePath('/dashboard/pagos')
  revalidatePath('/dashboard')
  return { ok: true }
}
