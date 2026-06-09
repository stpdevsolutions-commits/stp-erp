'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { Collaborator, CollaboratorStatus, PaginatedResponse } from '@/lib/types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://stp-api:3001'

async function authHeaders() {
  const jar = await cookies()
  const token = jar.get('stp-token')?.value
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

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

  const res = await fetch(`${API}/collaborators?${qs}`, {
    headers: await authHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) return { data: [], total: 0, page: 1, limit: 20 }
  return res.json()
}

export async function createColaborador(input: Partial<Collaborator>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/collaborators`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({})) as { message?: string | string[] }
    if (!res.ok) {
      const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? 'Error')
      return { ok: false, error: msg }
    }
    revalidatePath('/dashboard/colaboradores')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}

export async function updateColaborador(id: string, input: Partial<Collaborator>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/collaborators/${id}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({})) as { message?: string | string[] }
    if (!res.ok) {
      const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? 'Error')
      return { ok: false, error: msg }
    }
    revalidatePath('/dashboard/colaboradores')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}

export async function deleteColaborador(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/collaborators/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({})) as { message?: string }
      return { ok: false, error: data.message ?? 'Error al eliminar' }
    }
    revalidatePath('/dashboard/colaboradores')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}
