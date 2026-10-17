'use server'

import { revalidatePath } from 'next/cache'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'
import type {
  DgiiComprobante,
  DgiiRnc,
  ExpenseCandidate,
  Reconciliation,
  ScanResult,
  SupplierSuggestion,
} from '@/lib/fiscal-invoices'

export interface ActionResult {
  ok: boolean
  error?: string
  /** Id de la factura creada (para subir la foto justo después). */
  id?: string
}

export interface FiscalInvoiceInput {
  ncf: string
  supplierRnc: string
  supplierName: string
  baseAmount: number
  itbis?: number
  isc?: number
  tip?: number
  otherTax?: number
  paymentMethod?: string
  expenseType: string
  invoiceDate: string
  notes?: string
  securityCode?: string
  /** Destino del gasto: un proyecto (uuid), `null` = gasto general, sin indicar = sin gasto. */
  projectId?: string | null
  /** En vez de crear un gasto: vincular la factura a uno que ya estaba registrado a mano. */
  expenseId?: string
  /** Con `expenseId`: poner en el gasto el monto, la fecha y el proveedor de la factura. */
  syncExpense?: boolean
}

function refresh() {
  revalidatePath('/dashboard/facturas')
  revalidatePath('/dashboard/gastos')
}

export async function createFiscalInvoice(input: FiscalInvoiceInput): Promise<ActionResult> {
  const res = await authFetch('/fiscal-invoices', { method: 'POST', body: JSON.stringify(input) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al registrar la factura') }
  }
  const created = (await res.json()) as { id: string }
  refresh()
  return { ok: true, id: created.id }
}

export async function updateFiscalInvoice(
  id: string,
  // `notes: null` borra la nota; por eso se saca `notes` del tipo base antes de redefinirlo.
  input: Omit<Partial<FiscalInvoiceInput>, 'notes'> & { notes?: string | null },
): Promise<ActionResult> {
  const res = await authFetch(`/fiscal-invoices/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al actualizar la factura') }
  }
  refresh()
  return { ok: true, id }
}

export async function deleteFiscalInvoice(id: string): Promise<ActionResult> {
  const res = await authFetch(`/fiscal-invoices/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al eliminar la factura') }
  }
  refresh()
  return { ok: true }
}

/** Sube la foto o PDF del comprobante (campo `file`). Reemplaza la anterior. */
export async function uploadFiscalInvoicePhoto(id: string, form: FormData): Promise<ActionResult> {
  const res = await authFetch(`/fiscal-invoices/${id}/photo`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudo subir la foto') }
  }
  refresh()
  return { ok: true, id }
}

/** Consulta la factura en la DGII y guarda el resultado en ella. */
export async function validateFiscalInvoiceWithDgii(
  id: string,
  codigoSeguridad?: string,
): Promise<{ ok: boolean; error?: string; result?: DgiiComprobante }> {
  const res = await authFetch(`/fiscal-invoices/${id}/validate-dgii`, {
    method: 'POST',
    body: JSON.stringify(codigoSeguridad ? { codigoSeguridad } : {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudo consultar la DGII') }
  }
  const data = (await res.json()) as { result: DgiiComprobante }
  refresh()
  return { ok: true, result: data.result }
}

/** Busca un RNC o cédula en la DGII (para rellenar el nombre del emisor). */
export async function lookupRncInDgii(
  rnc: string,
): Promise<{ ok: boolean; error?: string; data?: DgiiRnc }> {
  const res = await authFetch(`/dgii/rnc/${encodeURIComponent(rnc)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudo consultar la DGII') }
  }
  return { ok: true, data: (await res.json()) as DgiiRnc }
}

/** Asigna varias facturas a un proyecto (uuid) o a gastos generales (null) de una vez. */
export async function assignFiscalInvoices(
  ids: string[],
  projectId: string | null,
): Promise<{ ok: boolean; error?: string; updated?: number; failed?: { id: string; error: string }[] }> {
  const res = await authFetch('/fiscal-invoices/assign', {
    method: 'POST',
    body: JSON.stringify({ ids, projectId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudieron asignar las facturas') }
  }
  const data = (await res.json()) as { updated: number; failed: { id: string; error: string }[] }
  refresh()
  revalidatePath('/dashboard/gastos')
  return { ok: true, ...data }
}

/** Lee una factura (foto o PDF, campo `file`) con IA y devuelve los campos sugeridos. No guarda nada. */
export async function scanFiscalInvoice(
  form: FormData,
): Promise<{ ok: boolean; error?: string; data?: ScanResult }> {
  const res = await authFetch('/fiscal-invoices/scan', { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudo leer la factura') }
  }
  return { ok: true, data: (await res.json()) as ScanResult }
}

/** Lee el texto del código QR de un e-CF y devuelve los campos del formulario. No guarda nada. */
export async function scanQrText(text: string): Promise<{ ok: boolean; error?: string; data?: ScanResult }> {
  const res = await authFetch('/fiscal-invoices/from-qr', { method: 'POST', body: JSON.stringify({ text }) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudo leer el código QR') }
  }
  return { ok: true, data: (await res.json()) as ScanResult }
}

/** Lo habitual de un proveedor (tipo de gasto, forma de pago y nombre) según sus facturas anteriores. */
export async function suggestForSupplier(
  rnc: string,
): Promise<{ ok: boolean; data?: SupplierSuggestion }> {
  const res = await authFetch(`/fiscal-invoices/suggest?rnc=${encodeURIComponent(rnc)}`)
  if (!res.ok) return { ok: false }
  return { ok: true, data: (await res.json()) as SupplierSuggestion }
}

export interface ValidatePendingResult {
  checked: number
  validated: number
  unresolved: { id: string; ncf: string; reason: string }[]
  pendingBefore: number
  remaining: number
}

/** Consulta en la DGII una tanda de facturas que nunca se han consultado. */
export async function validatePendingFiscalInvoices(
  exclude: string[],
): Promise<{ ok: boolean; error?: string; data?: ValidatePendingResult }> {
  const res = await authFetch('/fiscal-invoices/validate-pending', {
    method: 'POST',
    body: JSON.stringify({ limit: 10, exclude }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudo consultar la DGII') }
  }
  refresh()
  return { ok: true, data: (await res.json()) as ValidatePendingResult }
}

/** Gastos ya registrados a mano que se parecen a una factura (guardada o por guardar). */
export async function findExpenseCandidates(p: {
  supplierRnc: string
  supplierName: string
  totalAmount: number
  baseAmount: number
  invoiceDate: string
}): Promise<{ ok: boolean; data?: ExpenseCandidate[] }> {
  const q = new URLSearchParams({
    supplierRnc: p.supplierRnc,
    supplierName: p.supplierName,
    totalAmount: String(p.totalAmount),
    baseAmount: String(p.baseAmount),
    invoiceDate: p.invoiceDate,
  })
  const res = await authFetch(`/fiscal-invoices/expense-candidates?${q.toString()}`)
  if (!res.ok) return { ok: false }
  return { ok: true, data: (await res.json()) as ExpenseCandidate[] }
}

/** Gastos ya registrados que se parecen a una factura que ya está guardada. */
export async function findInvoiceExpenseCandidates(
  id: string,
): Promise<{ ok: boolean; error?: string; data?: ExpenseCandidate[] }> {
  const res = await authFetch(`/fiscal-invoices/${id}/expense-candidates`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudieron buscar los gastos') }
  }
  return { ok: true, data: (await res.json()) as ExpenseCandidate[] }
}

/** Vincula una factura a un gasto que ya existía (no se crea otro). */
export async function linkFiscalInvoiceToExpense(
  id: string,
  expenseId: string,
  syncExpense: boolean,
): Promise<ActionResult> {
  const res = await authFetch(`/fiscal-invoices/${id}/link-expense`, {
    method: 'POST',
    body: JSON.stringify({ expenseId, syncExpense }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudo vincular la factura') }
  }
  refresh()
  return { ok: true, id }
}

/**
 * Guarda el reparto de una factura entre proyectos (uuid) y gasto general (`null`). La suma debe ser el
 * total de la factura; con una sola línea la factura queda sin dividir, con ese destino.
 */
export async function setFiscalInvoiceSplits(
  id: string,
  splits: { projectId: string | null; amount: number; note?: string | null }[],
): Promise<ActionResult> {
  const res = await authFetch(`/fiscal-invoices/${id}/splits`, { method: 'PUT', body: JSON.stringify({ splits }) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudo guardar el reparto') }
  }
  refresh()
  return { ok: true, id }
}

/** Suelta el gasto de una factura; el gasto no se borra. */
export async function unlinkFiscalInvoiceExpense(id: string): Promise<ActionResult> {
  const res = await authFetch(`/fiscal-invoices/${id}/link-expense`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudo desvincular la factura') }
  }
  refresh()
  return { ok: true, id }
}

/** Para cada factura sin gasto, el gasto manual que más se le parece. */
export async function getReconciliation(): Promise<{ ok: boolean; error?: string; data?: Reconciliation }> {
  const res = await authFetch('/fiscal-invoices/reconcile')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudo preparar la conciliación') }
  }
  return { ok: true, data: (await res.json()) as Reconciliation }
}

/** Confirma varias vinculaciones propuestas por la conciliación. */
export async function applyReconciliation(
  pairs: { invoiceId: string; expenseId: string; syncExpense?: boolean }[],
): Promise<{ ok: boolean; error?: string; linked?: number; failed?: { invoiceId: string; error: string }[] }> {
  const res = await authFetch('/fiscal-invoices/reconcile/apply', {
    method: 'POST',
    body: JSON.stringify({ pairs }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'No se pudieron vincular las facturas') }
  }
  const data = (await res.json()) as { linked: number; failed: { invoiceId: string; error: string }[] }
  refresh()
  return { ok: true, ...data }
}
