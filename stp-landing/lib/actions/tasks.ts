'use server'

import { revalidatePath } from 'next/cache'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface CreateTaskInput {
  title: string
  projectId: string
  description?: string
  status?: 'pending' | 'in_progress' | 'review' | 'done' | 'cancelled'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: string
  assignedToId?: string
}

export interface UpdateTaskInput {
  title?: string
  projectId?: string
  description?: string | null
  status?: 'pending' | 'in_progress' | 'review' | 'done' | 'cancelled'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: string | null
  assignedToId?: string | null
}

export async function createTask(input: CreateTaskInput): Promise<ActionResult> {
  const body = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined),
  )

  const res = await authFetch('/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al crear la tarea') }
  }

  revalidatePath('/dashboard/tareas')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<ActionResult> {
  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await authFetch(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar la tarea') }
  }

  revalidatePath('/dashboard/tareas')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const res = await authFetch(`/tasks/${id}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al eliminar la tarea') }
  }

  revalidatePath('/dashboard/tareas')
  revalidatePath('/dashboard')
  return { ok: true }
}
