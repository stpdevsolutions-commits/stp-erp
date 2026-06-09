'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { InventoryItem, InventoryCategory, PaginatedResponse } from '@/lib/types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://stp-api:3001'

async function authHeaders() {
  const jar = await cookies()
  const token = jar.get('stp-token')?.value
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function getInventory(params?: {
  search?: string
  category?: InventoryCategory
  page?: number
  limit?: number
}): Promise<PaginatedResponse<InventoryItem>> {
  const qs = new URLSearchParams()
  if (params?.search) qs.set('search', params.search)
  if (params?.category) qs.set('category', params.category)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))

  const res = await fetch(`${API}/inventory?${qs}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) return { data: [], total: 0, page: 1, limit: 20 }
  return res.json()
}

export async function createInventoryItem(input: Partial<InventoryItem>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/inventory`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({})) as { message?: string | string[] }
    if (!res.ok) {
      const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? 'Error')
      return { ok: false, error: msg }
    }
    revalidatePath('/dashboard/inventario')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}

export async function updateInventoryItem(id: string, input: Partial<InventoryItem>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/inventory/${id}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({})) as { message?: string | string[] }
    if (!res.ok) {
      const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? 'Error')
      return { ok: false, error: msg }
    }
    revalidatePath('/dashboard/inventario')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}

export async function deleteInventoryItem(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/inventory/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({})) as { message?: string }
      return { ok: false, error: data.message ?? 'Error al eliminar' }
    }
    revalidatePath('/dashboard/inventario')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}
