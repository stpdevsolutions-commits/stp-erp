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

export interface CreateProjectInput {
  name: string
  clientId: string
  description?: string
  status?: 'draft' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  startDate?: string
  endDate?: string
  budget?: number
}

export interface UpdateProjectInput {
  name?: string
  clientId?: string
  description?: string | null
  status?: 'draft' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  startDate?: string | null
  endDate?: string | null
  budget?: number | null
}

export async function createProject(input: CreateProjectInput): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const body = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined),
  )

  const res = await fetch(`${API_URL}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al crear el proyecto')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/proyectos')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await fetch(`${API_URL}/projects/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al actualizar el proyecto')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/proyectos')
  revalidatePath(`/dashboard/proyectos/${id}`)
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/projects/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: err.message ?? 'Error al eliminar el proyecto' }
  }

  revalidatePath('/dashboard/proyectos')
  revalidatePath('/dashboard')
  return { ok: true }
}
