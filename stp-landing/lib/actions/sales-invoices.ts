'use server'

import { revalidatePath } from 'next/cache'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'
import type { QuoteInvoicePreview, SalesInvoice, SalesInvoiceLine } from '@/lib/sales-invoices'

export interface ActionResult<T = unknown> {
  ok: boolean
  error?: string
  data?: T
}

function refresh(id?: string) {
  revalidatePath('/dashboard/facturas/emitidas')
  if (id) revalidatePath(`/dashboard/facturas/emitidas/${id}`)
  revalidatePath('/dashboard/pagos')
}

async function fail(res: Response, fallback: string): Promise<{ ok: false; error: string }> {
  const err = await res.json().catch(() => ({}))
  return { ok: false, error: apiError(err, fallback) }
}

export interface SalesInvoiceInput {
  clientId: string
  projectId?: string
  quoteId?: string
  quotePercent?: number
  issueDate?: string
  dueDate?: string | null
  notes?: string | null
  lines?: SalesInvoiceLine[]
}

const lineBody = (l: SalesInvoiceLine) => ({
  description: l.description,
  quantity: Number(l.quantity),
  unit: l.unit || null,
  unitPrice: Number(l.unitPrice),
  itbisRate: Number(l.itbisRate),
  goodOrService: l.goodOrService,
})

export async function createSalesInvoice(input: SalesInvoiceInput): Promise<ActionResult<SalesInvoice>> {
  const body = { ...input, lines: input.lines?.map(lineBody) }
  const res = await authFetch('/sales-invoices', { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) return fail(res, 'No se pudo crear la factura')
  const data = (await res.json()) as SalesInvoice
  refresh(data.id)
  return { ok: true, data }
}

export async function updateSalesInvoice(
  id: string,
  input: Omit<SalesInvoiceInput, 'clientId' | 'quoteId' | 'quotePercent'>,
): Promise<ActionResult<SalesInvoice>> {
  const body = { ...input, lines: input.lines?.map(lineBody) }
  const res = await authFetch(`/sales-invoices/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  if (!res.ok) return fail(res, 'No se pudo guardar la factura')
  refresh(id)
  return { ok: true, data: (await res.json()) as SalesInvoice }
}

export async function deleteSalesInvoice(id: string): Promise<ActionResult> {
  const res = await authFetch(`/sales-invoices/${id}`, { method: 'DELETE' })
  if (!res.ok) return fail(res, 'No se pudo borrar la factura')
  refresh()
  return { ok: true }
}

export async function previewInvoiceFromQuote(
  quoteId: string,
  percent: number,
): Promise<ActionResult<QuoteInvoicePreview>> {
  const q = new URLSearchParams({ quoteId, percent: String(percent) })
  const res = await authFetch(`/sales-invoices/from-quote?${q.toString()}`)
  if (!res.ok) return fail(res, 'No se pudo leer la cotización')
  return { ok: true, data: (await res.json()) as QuoteInvoicePreview }
}

export async function emitSalesInvoice(id: string, transmitir: boolean): Promise<ActionResult<SalesInvoice>> {
  const res = await authFetch(`/sales-invoices/${id}/emit`, {
    method: 'POST',
    body: JSON.stringify({ transmitir }),
  })
  if (!res.ok) return fail(res, 'No se pudo emitir el comprobante')
  refresh(id)
  return { ok: true, data: (await res.json()) as SalesInvoice }
}

export async function refreshInvoiceEcf(id: string): Promise<ActionResult<SalesInvoice>> {
  const res = await authFetch(`/sales-invoices/${id}/refresh-ecf`, { method: 'POST' })
  if (!res.ok) return fail(res, 'No se pudo consultar el estado del comprobante')
  refresh(id)
  return { ok: true, data: (await res.json()) as SalesInvoice }
}

export async function transmitInvoiceEcf(id: string): Promise<ActionResult<SalesInvoice>> {
  const res = await authFetch(`/sales-invoices/${id}/transmit`, { method: 'POST' })
  if (!res.ok) return fail(res, 'No se pudo transmitir el comprobante')
  refresh(id)
  return { ok: true, data: (await res.json()) as SalesInvoice }
}

export interface InvoicePaymentInput {
  amount: number
  method: string
  date: string
  reference?: string
  notes?: string
}

export async function addInvoicePayment(id: string, input: InvoicePaymentInput): Promise<ActionResult<SalesInvoice>> {
  const res = await authFetch(`/sales-invoices/${id}/payments`, { method: 'POST', body: JSON.stringify(input) })
  if (!res.ok) return fail(res, 'No se pudo registrar el cobro')
  refresh(id)
  return { ok: true, data: (await res.json()) as SalesInvoice }
}

export async function applyInvoicePayment(id: string, paymentId: string): Promise<ActionResult<SalesInvoice>> {
  const res = await authFetch(`/sales-invoices/${id}/apply-payment`, {
    method: 'POST',
    body: JSON.stringify({ paymentId }),
  })
  if (!res.ok) return fail(res, 'No se pudo aplicar el cobro')
  refresh(id)
  return { ok: true, data: (await res.json()) as SalesInvoice }
}

export async function unlinkInvoicePayment(id: string, paymentId: string): Promise<ActionResult<SalesInvoice>> {
  const res = await authFetch(`/sales-invoices/${id}/payments/${paymentId}`, { method: 'DELETE' })
  if (!res.ok) return fail(res, 'No se pudo quitar el cobro')
  refresh(id)
  return { ok: true, data: (await res.json()) as SalesInvoice }
}

export interface AvailablePayment {
  id: string
  description: string
  amount: number
  date: string
  method: string
}

export async function listAvailablePayments(id: string): Promise<ActionResult<AvailablePayment[]>> {
  const res = await authFetch(`/sales-invoices/${id}/available-payments`)
  if (!res.ok) return fail(res, 'No se pudieron leer los cobros')
  return { ok: true, data: (await res.json()) as AvailablePayment[] }
}

export interface CreditNoteInput {
  mode: 'full' | 'partial'
  reason: string
  amount?: number
  itbisRate?: number
}

/** Crea (en borrador) una nota de crédito contra una factura emitida. */
export async function createCreditNote(id: string, input: CreditNoteInput): Promise<ActionResult<SalesInvoice>> {
  const res = await authFetch(`/sales-invoices/${id}/credit-note`, { method: 'POST', body: JSON.stringify(input) })
  if (!res.ok) return fail(res, 'No se pudo crear la nota de crédito')
  refresh(id)
  return { ok: true, data: (await res.json()) as SalesInvoice }
}
