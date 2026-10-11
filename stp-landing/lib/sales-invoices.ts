/** Facturas de venta con e-CF ("Emitidas") — tipos y utilidades (ERP-42). */

export interface SalesInvoiceLine {
  id?: string
  description: string
  quantity: number
  unit: string | null
  /** Antes de ITBIS. */
  unitPrice: number
  /** 18, 16 o 0 (exento). */
  itbisRate: number
  /** 1 = bien, 2 = servicio. */
  goodOrService: number
  total?: number
  itbisAmount?: number
}

export type SalesInvoiceStatus = 'draft' | 'emitting' | 'issued'
export type PaymentStatusKey = 'unpaid' | 'partial' | 'paid' | 'void'

export interface SalesInvoice {
  id: string
  number: string
  clientId: string
  client?: { id: string; name: string; rnc?: string | null; email?: string | null }
  projectId: string | null
  project?: { id: string; code: string; name: string } | null
  quoteId: string | null
  quote?: { id: string; number: string; title: string } | null
  quotePercent: number | null
  /** Factura o nota de crédito (e-CF 34). */
  kind: 'invoice' | 'credit_note'
  relatedInvoiceId: string | null
  relatedInvoice?: { id: string; number: string; ecfEncf: string | null } | null
  /** Nota de crédito: 1 anula la factura, 3 corrige montos. */
  modificationCode: number | null
  reason: string | null
  issueDate: string
  dueDate: string | null
  notes: string | null
  status: SalesInvoiceStatus
  subtotal: number
  itbis: number
  total: number
  lines: SalesInvoiceLine[]
  ecfId: string | null
  ecfEncf: string | null
  ecfTipo: string | null
  ecfEstado: string | null
  ecfCodigoSeguridad: string | null
  ecfQrUrl: string | null
  ecfError: string | null
  /** Último mensaje de la DGII sobre el comprobante (p. ej. el motivo de un rechazo). */
  ecfMensaje: string | null
  ecfEmitidoAt: string | null
  paidAmount?: number
  /** Notas de crédito emitidas contra la factura. */
  creditedAmount?: number
  /** Total menos notas de crédito. */
  netTotal?: number
  balance?: number
  paymentStatus?: PaymentStatusKey | null
  overdue?: boolean
  createdAt: string
}

export interface QuoteInvoicePreview {
  quote: { id: string; number: string; title: string; clientId: string; projectId: string | null; total: number }
  percent: number
  lines: SalesInvoiceLine[]
  totals: { subtotal: number; itbis: number; total: number }
  alreadyInvoiced: number
  remaining: number
  warnings: string[]
}

export interface InvoicePayment {
  id: string
  description: string
  amount: number
  method: string
  status: string
  date: string
  reference?: string | null
}

export const RATE_LABELS: Record<string, string> = { '18': 'ITBIS 18%', '16': 'ITBIS 16%', '0': 'Exento' }

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Mismo cálculo que el servidor: sirve para mostrar totales mientras se edita. */
export function linesTotals(lines: Pick<SalesInvoiceLine, 'quantity' | 'unitPrice' | 'itbisRate'>[]) {
  let subtotal = 0
  let itbis = 0
  for (const l of lines) {
    const t = round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))
    subtotal += t
    itbis += round2((t * (Number(l.itbisRate) || 0)) / 100)
  }
  subtotal = round2(subtotal)
  itbis = round2(itbis)
  return { subtotal, itbis, total: round2(subtotal + itbis) }
}

export const STATUS_LABEL: Record<SalesInvoiceStatus, string> = {
  draft: 'Borrador',
  emitting: 'Emitiendo…',
  issued: 'Emitida',
}

export const PAYMENT_LABEL: Record<PaymentStatusKey, string> = {
  unpaid: 'Sin cobrar',
  partial: 'Cobro parcial',
  paid: 'Cobrada',
  void: 'Anulada',
}

export const PAYMENT_BADGE: Record<PaymentStatusKey, string> = {
  unpaid: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  partial: 'bg-primary/10 text-primary',
  paid: 'bg-green-600/10 text-green-700 dark:text-green-400',
  void: 'bg-muted text-muted-foreground line-through',
}

export const STATUS_BADGE: Record<SalesInvoiceStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  emitting: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  issued: 'bg-green-600/10 text-green-700 dark:text-green-400',
}

/** Estados del comprobante en ecf-api (en inglés tal cual llegan). */
export const ECF_ESTADO_LABEL: Record<string, string> = {
  draft: 'Borrador',
  validated: 'Validado',
  signed: 'Firmado, sin transmitir',
  transmitted: 'Transmitido a la DGII',
  accepted: 'Aceptado por la DGII',
  rejected: 'Rechazado por la DGII',
  cancelled: 'Cancelado',
}

export const ecfEstadoLabel = (e: string | null | undefined) => (e ? (ECF_ESTADO_LABEL[e] ?? e) : '—')

/** Firmado pero todavía no enviado: se puede transmitir. */
export const canTransmit = (e: string | null | undefined) => e === 'signed' || e === 'validated'
