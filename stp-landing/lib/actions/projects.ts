'use server'

import { revalidatePath } from 'next/cache'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'

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
  const body = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined),
  )

  const res = await authFetch('/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al crear el proyecto') }
  }

  revalidatePath('/dashboard/proyectos')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<ActionResult> {
  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await authFetch(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar el proyecto') }
  }

  revalidatePath('/dashboard/proyectos')
  revalidatePath(`/dashboard/proyectos/${id}`)
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const res = await authFetch(`/projects/${id}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al eliminar el proyecto') }
  }

  revalidatePath('/dashboard/proyectos')
  revalidatePath('/dashboard')
  return { ok: true }
}
