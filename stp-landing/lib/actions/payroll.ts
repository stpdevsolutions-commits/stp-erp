'use server'

import { revalidatePath } from 'next/cache'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'
import type { PayrollMethod, PayrollStatus } from '@/lib/types'

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface PayrollInput {
  collaboratorId: string
  projectId?: string | null
  periodStart: string
  periodEnd: string
  daysWorked?: number | null
  dailyRate?: number | null
  overtimeAmount?: number | null
  bonuses?: number | null
  deductions?: number | null
  status?: PayrollStatus
  method?: PayrollMethod
  paymentDate?: string | null
  reference?: string | null
  notes?: string | null
}

/** El gasto de mano de obra depende del pago, así que Gastos también se revalida. */
function revalidatePayroll() {
  revalidatePath('/dashboard/nomina')
  revalidatePath('/dashboard/gastos')
  revalidatePath('/dashboard')
}

export async function createPayrollEntry(input: PayrollInput): Promise<ActionResult> {
  try {
    const res = await authFetch('/payroll', {
      method: 'POST',
      body: JSON.stringify(clean(input)),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { ok: false, error: apiError(err, 'Error al registrar el pago') }
    }
    revalidatePayroll()
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}

export async function updatePayrollEntry(
  id: string,
  input: Partial<PayrollInput>,
): Promise<ActionResult> {
  try {
    const res = await authFetch(`/payroll/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(clean(input)),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { ok: false, error: apiError(err, 'Error al actualizar el pago') }
    }
    revalidatePayroll()
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}

export async function deletePayrollEntry(id: string): Promise<ActionResult> {
  try {
    const res = await authFetch(`/payroll/${id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}))
      return { ok: false, error: apiError(err, 'Error al eliminar el pago') }
    }
    revalidatePayroll()
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}

/**
 * Un `''` en un campo opcional (UUID, fecha, número) da 400 en class-validator,
 * así que se quita. El `null` SÍ se envía: `@IsOptional()` lo deja pasar y es la
 * única forma de vaciar un campo ya guardado (p. ej. desligar el proyecto).
 */
function clean(input: PayrollInput | Partial<PayrollInput>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined && v !== ''),
  )
}
