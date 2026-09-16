'use server'

import { revalidatePath } from 'next/cache'
import { apiError } from '@/lib/utils'
import type { Sprint, SprintStatus } from '@/lib/types'

export interface ActionResult {
  ok: boolean
  error?: string
}

// Mismo criterio que lib/actions/tickets.ts: server-only, sin login (el
// servicio entero queda gateado por red), el x-agent-key solo distingue
// escrituras legítimas del resto del tráfico de la red interna de Docker.
const API_URL = process.env.TICKETS_API_URL || 'http://stp-tickets-api:3003/api'
const AGENT_KEY = process.env.TICKETS_AGENT_KEY || ''

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-agent-key': AGENT_KEY,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
}

export async function getSprints(): Promise<Sprint[]> {
  const res = await apiFetch('/sprints')
  if (!res.ok) return []
  return res.json()
}

export interface SprintInput {
  name: string
  goal?: string | null
  startDate: string
  endDate: string
  status?: SprintStatus
  projectId?: string | null
}

export async function createSprint(input: SprintInput): Promise<ActionResult> {
  const res = await apiFetch('/sprints', { method: 'POST', body: JSON.stringify(cleanCreate(input)) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al crear la etapa') }
  }
  revalidatePath('/roadmap')
  return { ok: true }
}

export async function updateSprint(id: string, input: Partial<SprintInput>): Promise<ActionResult> {
  // '' -> null para poder limpiar el objetivo o desasignar el proyecto.
  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )
  const res = await apiFetch(`/sprints/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar la etapa') }
  }
  revalidatePath('/roadmap')
  return { ok: true }
}

export async function deleteSprint(id: string): Promise<ActionResult> {
  const res = await apiFetch(`/sprints/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al eliminar la etapa') }
  }
  revalidatePath('/roadmap')
  return { ok: true }
}

/** Mete o saca un ticket de una etapa. sprintId=null lo saca sin borrarlo.
 * Usa el mismo endpoint PATCH /tickets/:id que el resto de ediciones. */
export async function setTicketSprint(ticketId: string, sprintId: string | null): Promise<ActionResult> {
  const res = await apiFetch(`/tickets/${ticketId}`, {
    method: 'PATCH',
    body: JSON.stringify({ sprintId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al mover el ticket') }
  }
  revalidatePath('/roadmap')
  revalidatePath('/')
  return { ok: true }
}

function cleanCreate(input: SprintInput) {
  const out: Record<string, unknown> = {
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
  }
  if (input.goal) out.goal = input.goal
  if (input.status) out.status = input.status
  if (input.projectId) out.projectId = input.projectId
  return out
}
