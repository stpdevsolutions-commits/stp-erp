'use server'

import { revalidatePath } from 'next/cache'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { authFetch, apiError, API_URL } from './utils'
import type { InventoryItem, InventoryCategory, PaginatedResponse } from '@/lib/types'
import { cookies } from 'next/headers'

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

  const store = await cookies()
  const token = store.get('stp-token')?.value
  const res = await fetch(`${API_URL}/inventory?${qs}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) return { data: [], total: 0, page: 1, limit: 20 }
  return res.json()
}

export async function createInventoryItem(input: Partial<InventoryItem>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch('/inventory', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: apiError(data, 'Error') }
    }
    revalidatePath('/dashboard/inventario')
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}

export async function updateInventoryItem(id: string, input: Partial<InventoryItem>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch(`/inventory/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: apiError(data, 'Error') }
    }
    revalidatePath('/dashboard/inventario')
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}

export async function deleteInventoryItem(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch(`/inventory/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({})) as { message?: string }
      return { ok: false, error: data.message ?? 'Error al eliminar' }
    }
    revalidatePath('/dashboard/inventario')
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}
