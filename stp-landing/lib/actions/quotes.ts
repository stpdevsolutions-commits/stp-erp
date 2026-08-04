'use server'

import { revalidatePath } from 'next/cache'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'
import type { AcuRefreshResult } from '@/lib/types'

export interface ActionResult {
  ok: boolean
  error?: string
}

/**
 * Nodo del árbol de partidas. Recursivo: una partida (`kind: 'group'`) lleva sus
 * subpartidas o líneas en `children` y no tiene cantidad ni precio propios; el
 * servidor calcula su total sumando lo que cuelga de ella.
 */
export interface QuoteItemInput {
  kind?: 'group' | 'item'
  description: string
  unit?: string
  quantity?: number
  unitPrice?: number
  discountPct?: number
  /**
   * Origen del unitario: partida de costos (ACU). Con `acuId` y sin `acuUnitCost` el
   * servidor valora la receta hoy y congela el resultado; con `acuUnitCost` conserva el
   * congelado que ya había (ver `lib/quote-tree.ts`, `toPayload`).
   */
  acuId?: string
  acuMarkupPct?: number
  acuUnitCost?: number
  acuPricedAt?: string
  acuIncomplete?: boolean
  allowIncompleteAcu?: boolean
  children?: QuoteItemInput[]
}

export interface IndirectCostInput {
  name: string
  pct: number
  amount?: number
  kind?: 'itbis'
  taxable?: boolean
}

export interface CreateQuoteInput {
  title: string
  projectId?: string
  clientId: string
  status?: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired'
  validUntil?: string
  notes?: string
  terms?: string
  taxRate?: number
  items: QuoteItemInput[]
  indirectCosts?: IndirectCostInput[]
}

export interface UpdateQuoteInput {
  title?: string
  projectId?: string | null
  clientId?: string
  status?: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired'
  validUntil?: string | null
  notes?: string | null
  terms?: string | null
  taxRate?: number
  items?: QuoteItemInput[]
  indirectCosts?: IndirectCostInput[] | null
}

export async function createQuote(input: CreateQuoteInput): Promise<ActionResult> {
  const res = await authFetch('/quotes', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al crear la cotización') }
  }

  revalidatePath('/dashboard/cotizaciones')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function updateQuote(id: string, input: UpdateQuoteInput): Promise<ActionResult> {
  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await authFetch(`/quotes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar la cotización') }
  }

  revalidatePath('/dashboard/cotizaciones')
  revalidatePath(`/dashboard/cotizaciones/${id}`)
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function sendQuoteEmail(id: string): Promise<ActionResult> {
  const res = await authFetch(`/quotes/${id}/send`, {
    method: 'POST',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al enviar la cotización') }
  }

  revalidatePath('/dashboard/cotizaciones')
  return { ok: true }
}

export async function deleteQuote(id: string): Promise<ActionResult> {
  const res = await authFetch(`/quotes/${id}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al eliminar la cotización') }
  }

  revalidatePath('/dashboard/cotizaciones')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function reviseQuote(id: string): Promise<ActionResult & { quoteId?: string }> {
  const res = await authFetch(`/quotes/${id}/revise`, {
    method: 'POST',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al crear la revisión') }
  }

  const quote = await res.json().catch(() => ({}))
  revalidatePath('/dashboard/cotizaciones')
  revalidatePath(`/dashboard/cotizaciones/${id}`)
  revalidatePath('/dashboard')
  return { ok: true, quoteId: quote.id }
}

/**
 * Vuelve a congelar los unitarios que salen de un ACU con los costos de hoy.
 *
 * Nunca es automático: el aviso (`GET /quotes/:id/acu-drift`) informa y esto decide. Las
 * líneas que no se deben pisar por las bravas —ACU incompleto, unitario escrito a mano—
 * se saltan y vuelven en `skipped` con su motivo, salvo que se confirmen expresamente.
 */
export async function refreshAcuPrices(
  id: string,
  input: { itemIds?: string[]; allowIncomplete?: boolean; overrideManual?: boolean } = {},
): Promise<ActionResult & { result?: AcuRefreshResult }> {
  const res = await authFetch(`/quotes/${id}/acu-refresh`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar los precios') }
  }

  const result = (await res.json().catch(() => null)) as AcuRefreshResult | null
  revalidatePath('/dashboard/cotizaciones')
  revalidatePath(`/dashboard/cotizaciones/${id}`)
  return { ok: true, result: result ?? undefined }
}

export async function convertQuoteToProject(id: string): Promise<ActionResult & { projectId?: string }> {
  const res = await authFetch(`/quotes/${id}/convert-to-project`, {
    method: 'POST',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al convertir la cotización') }
  }

  const project = await res.json().catch(() => ({}))
  revalidatePath('/dashboard/cotizaciones')
  revalidatePath(`/dashboard/cotizaciones/${id}`)
  revalidatePath('/dashboard/proyectos')
  revalidatePath('/dashboard')
  return { ok: true, projectId: project.id }
}
