'use server'

import { revalidatePath } from 'next/cache'
import { authFetch, apiError } from './utils'

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface QuoteItemInput {
  description: string
  unit?: string
  quantity: number
  unitPrice: number
  discountPct?: number
  sectionName?: string
  sortOrder?: number
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
