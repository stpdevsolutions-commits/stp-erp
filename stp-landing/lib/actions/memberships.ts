'use server'

import { revalidatePath } from 'next/cache'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'
import type { ActionResult } from './users'

/** Usuario asignado a un proyecto o cliente. */
export interface Member {
  userId: string
  email: string
  firstName: string
  lastName: string
  role: 'admin' | 'manager' | 'user'
  /** true = viene del responsable del proyecto, no se puede quitar desde aquí. */
  implicit: boolean
  createdAt: string | null
}

async function mutate(
  path: string,
  method: 'POST' | 'DELETE',
  body: unknown,
  revalidate: string,
  fallback: string,
): Promise<ActionResult> {
  const res = await authFetch(path, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, fallback) }
  }

  revalidatePath(revalidate)
  return { ok: true }
}

// ── Proyectos ────────────────────────────────────────────────────────────────

export async function addProjectMember(projectId: string, userId: string): Promise<ActionResult> {
  return mutate(
    `/projects/${projectId}/members`,
    'POST',
    { userId },
    `/dashboard/proyectos/${projectId}`,
    'Error al asignar el usuario al proyecto',
  )
}

export async function removeProjectMember(
  projectId: string,
  userId: string,
): Promise<ActionResult> {
  return mutate(
    `/projects/${projectId}/members/${userId}`,
    'DELETE',
    null,
    `/dashboard/proyectos/${projectId}`,
    'Error al quitar el acceso',
  )
}

// ── Clientes ─────────────────────────────────────────────────────────────────

export async function addClientMember(clientId: string, userId: string): Promise<ActionResult> {
  return mutate(
    `/clients/${clientId}/members`,
    'POST',
    { userId },
    `/dashboard/clientes/${clientId}`,
    'Error al asignar el usuario al cliente',
  )
}

export async function removeClientMember(clientId: string, userId: string): Promise<ActionResult> {
  return mutate(
    `/clients/${clientId}/members/${userId}`,
    'DELETE',
    null,
    `/dashboard/clientes/${clientId}`,
    'Error al quitar el acceso',
  )
}
