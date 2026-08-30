'use server'

import { revalidatePath } from 'next/cache'
import { apiError } from '@/lib/utils'
import type { Project, Ticket, TicketPriority, TicketStatus, TicketType } from '@/lib/types'

// Server-only: nunca llega al navegador. Sin sistema de login (el servicio
// entero queda gateado por red — Caddy remote_ip para la web, red interna de
// Docker para el API) — este secreto es solo para que el API distinga
// escrituras legítimas (esta web, o Claude vía curl directo) de cualquier
// otra cosa que ande en la red interna.
const API_URL = process.env.TICKETS_API_URL || 'http://stp-tickets-api:3003/api'
const AGENT_KEY = process.env.TICKETS_AGENT_KEY || ''

export interface ActionResult {
  ok: boolean
  error?: string
}

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

export async function getProjects(): Promise<Project[]> {
  const res = await apiFetch('/projects')
  if (!res.ok) return []
  return res.json()
}

export async function getTickets(): Promise<Ticket[]> {
  const res = await apiFetch('/tickets')
  if (!res.ok) return []
  return res.json()
}

export interface CreateTicketInput {
  projectId: string
  title: string
  description?: string
  type: TicketType
  priority?: TicketPriority
  reportedBy?: string
}

export async function createTicket(input: CreateTicketInput): Promise<ActionResult> {
  const body = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined),
  )
  const res = await apiFetch('/tickets', { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al crear el ticket') }
  }
  revalidatePath('/')
  return { ok: true }
}

export interface UpdateTicketInput {
  projectId?: string
  title?: string
  description?: string | null
  type?: TicketType
  status?: TicketStatus
  priority?: TicketPriority
}

export async function updateTicket(id: string, input: UpdateTicketInput): Promise<ActionResult> {
  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )
  const res = await apiFetch(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar el ticket') }
  }
  revalidatePath('/')
  return { ok: true }
}

export async function deleteTicket(id: string): Promise<ActionResult> {
  const res = await apiFetch(`/tickets/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al eliminar el ticket') }
  }
  revalidatePath('/')
  return { ok: true }
}
