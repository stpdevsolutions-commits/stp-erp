'use server'

import { revalidatePath } from 'next/cache'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'

export interface CreateClientInput {
  name: string
  type?: 'company' | 'individual'
  rnc?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  contactName?: string
  contactPhone?: string
  notes?: string
}

export interface ActionResult {
  ok: boolean
  error?: string
}

/** Igual que `ActionResult`, más el cliente recién creado (para dejarlo seleccionado). */
export interface CreateClientResult extends ActionResult {
  client?: { id: string; name: string }
}

export async function createClient(input: CreateClientInput): Promise<CreateClientResult> {
  // Strip empty strings so API doesn't receive "" for optional fields
  const body = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined),
  )

  const res = await authFetch('/clients', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al crear el cliente') }
  }

  // Se devuelve el cliente creado para poder dejarlo ya seleccionado en quien
  // llamó (p. ej. el formulario de cotización, que lo necesita al vuelo).
  const client = (await res.json().catch(() => null)) as { id: string; name: string } | null

  revalidatePath('/dashboard/clientes')
  return { ok: true, client: client ?? undefined }
}

export interface UpdateClientInput {
  name?: string
  type?: 'company' | 'individual'
  rnc?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  contactName?: string | null
  contactPhone?: string | null
  notes?: string | null
  isActive?: boolean
}

export async function updateClient(id: string, input: UpdateClientInput): Promise<ActionResult> {
  // Convert empty strings to null so the API clears nullable fields
  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await authFetch(`/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar el cliente') }
  }

  revalidatePath('/dashboard/clientes')
  return { ok: true }
}

export async function deleteClient(id: string): Promise<ActionResult> {
  const res = await authFetch(`/clients/${id}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al eliminar el cliente') }
  }

  revalidatePath('/dashboard/clientes')
  return { ok: true }
}

export interface RncLookup {
  found: boolean
  rnc: string
  name?: string
  tradeName?: string
  status?: string
  activity?: string
  message?: string
}

/** Consulta pública de la DGII para rellenar el alta de un cliente a partir de su RNC o cédula. */
export async function lookupClientRnc(
  rnc: string,
): Promise<{ ok: boolean; error?: string; data?: RncLookup }> {
  const res = await authFetch(`/clients/rnc-lookup/${encodeURIComponent(rnc)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudo consultar la DGII') }
  }
  return { ok: true, data: (await res.json()) as RncLookup }
}
