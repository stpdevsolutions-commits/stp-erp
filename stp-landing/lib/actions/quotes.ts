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
  taxRate?: number
  items?: QuoteItemInput[]
}

export async function createQuote(input: CreateQuoteInput): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/quotes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al crear la cotización')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/cotizaciones')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function updateQuote(id: string, input: UpdateQuoteInput): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const body = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, v === '' ? null : v]),
  )

  const res = await fetch(`${API_URL}/quotes/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Error al actualizar la cotización')
    return { ok: false, error: msg }
  }

  revalidatePath('/dashboard/cotizaciones')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function deleteQuote(id: string): Promise<ActionResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: 'No autenticado' }

  const res = await fetch(`${API_URL}/quotes/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: err.message ?? 'Error al eliminar la cotización' }
  }

  revalidatePath('/dashboard/cotizaciones')
  revalidatePath('/dashboard')
  return { ok: true }
}
