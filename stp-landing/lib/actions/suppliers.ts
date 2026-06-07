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
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/suppliers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al crear proveedor')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/proveedores')
  revalidatePath('/dashboard/gastos')
  return { ok: true }
}

export async function updateSupplier(id: string, input: UpdateSupplierInput): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await fetch(`${API_URL}/suppliers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al actualizar proveedor')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/proveedores')
  revalidatePath('/dashboard/gastos')
  return { ok: true }
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/suppliers/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: err.message ?? 'Error al eliminar proveedor' }
  }

  revalidatePath('/dashboard/proveedores')
  revalidatePath('/dashboard/gastos')
  return { ok: true }
}
