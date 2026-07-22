'use server'

import { revalidatePath } from 'next/cache'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { authFetch } from './utils'
import { API_URL } from './config'
import { apiError } from '@/lib/utils'
import type { Collaborator, CollaboratorStatus, PaginatedResponse } from '@/lib/types'
import { cookies } from 'next/headers'

export async function getColaboradores(params?: {
  search?: string
  status?: CollaboratorStatus
  page?: number
  limit?: number
}): Promise<PaginatedResponse<Collaborator>> {
  const qs = new URLSearchParams()
  if (params?.search) qs.set('search', params.search)
  if (params?.status) qs.set('status', params.status)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))

  const store = await cookies()
  const token = store.get('stp-token')?.value
  const res = await fetch(`${API_URL}/collaborators?${qs}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) return { data: [], total: 0, page: 1, limit: 20 }
  return res.json()
}

export async function createColaborador(input: Partial<Collaborator>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch('/collaborators', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: apiError(data, 'Error') }
    }
    revalidatePath('/dashboard/colaboradores')
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}

export async function updateColaborador(id: string, input: Partial<Collaborator>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch(`/collaborators/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: apiError(data, 'Error') }
    }
    revalidatePath('/dashboard/colaboradores')
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}

export async function deleteColaborador(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch(`/collaborators/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({})) as { message?: string }
      return { ok: false, error: data.message ?? 'Error al eliminar' }
    }
    revalidatePath('/dashboard/colaboradores')
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}
