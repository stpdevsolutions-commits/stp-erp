'use server'

import { revalidatePath } from 'next/cache'
import { authFetch, apiError } from './utils'

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface CreateSupplierInput {
  name: string
  rnc?: string
  category?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  contactName?: string
  contactPhone?: string
  notes?: string
}

export interface UpdateSupplierInput extends CreateSupplierInput {
  isActive?: boolean
}

export async function createSupplier(input: CreateSupplierInput): Promise<ActionResult> {
  const res = await authFetch('/suppliers', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al crear proveedor') }
  }

  revalidatePath('/dashboard/proveedores')
  revalidatePath('/dashboard/gastos')
  return { ok: true }
}

export async function updateSupplier(id: string, input: UpdateSupplierInput): Promise<ActionResult> {
  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await authFetch(`/suppliers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar proveedor') }
  }

  revalidatePath('/dashboard/proveedores')
  revalidatePath('/dashboard/gastos')
  return { ok: true }
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  const res = await authFetch(`/suppliers/${id}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al eliminar proveedor') }
  }

  revalidatePath('/dashboard/proveedores')
  revalidatePath('/dashboard/gastos')
  return { ok: true }
}
