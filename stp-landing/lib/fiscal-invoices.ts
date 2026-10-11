/** Facturas fiscales (comprobantes de compra del Formato 606) — tipos y catálogos (ERP-35/40). */

export interface FiscalInvoice {
  id: string
  ncf: string
  ncfType: string
  supplierRnc: string
  supplierName: string
  baseAmount: number
  itbis: number
  isc: number
  tip: number
  otherTax: number
  totalAmount: number
  /** Código del 606 (01–07). */
  paymentMethod: string
  /** Código del 606 (01–11); las migradas pueden traer otros. */
  expenseType: string
  invoiceDate: string
  notes: string | null
  photoPath: string | null
  photoMimetype: string | null
  /** Código de seguridad del e-CF (sale en el QR); lo pide la DGII para confirmarlo. */
  securityCode: string | null
  /** Vigente, Aceptado, Rechazado, No encontrado… o null si nunca se consultó. */
  dgiiEstado: string | null
  dgiiValidatedAt: string | null
  expenseId: string | null
  /** `false`: el gasto ya existía (tecleado a mano) y la factura solo se vinculó a él. */
  expenseOwned?: boolean
  /** El gasto enlazado lleva el proyecto; sin gasto o sin proyecto = gasto general. */
  expense?: {
    id: string
    projectId: string | null
    project?: { id: string; code: string; name: string } | null
  } | null
  createdAt: string
}

export const EXPENSE_TYPES_606: Record<string, string> = {
  '01': 'Gastos de personal',
  '02': 'Trabajos, suministros y servicios',
  '03': 'Arrendamientos',
  '04': 'Activos fijos',
  '05': 'Representación',
  '06': 'Otras deducciones admitidas',
  '07': 'Gastos financieros',
  '08': 'Gastos extraordinarios',
  '09': 'Costo de venta (compras)',
  '10': 'Adquisición de activos',
  '11': 'Seguros',
}

export const PAYMENT_METHODS_606: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Cheque / transferencia / depósito',
  '03': 'Tarjeta de crédito o débito',
  '04': 'Compra a crédito',
  '05': 'Permuta',
  '06': 'Notas de crédito',
  '07': 'Mixto',
}

/** Los códigos van ordenados: en JS "10" y "11" se enumerarían antes que "01". */
export const EXPENSE_TYPE_CODES = Object.keys(EXPENSE_TYPES_606).sort()
export const PAYMENT_METHOD_CODES = Object.keys(PAYMENT_METHODS_606).sort()

export function expenseTypeLabel(code: string): string {
  return EXPENSE_TYPES_606[code] ? `${code} · ${EXPENSE_TYPES_606[code]}` : code
}

/** Lo mismo que el servidor: sin espacios ni guiones, mayúsculas. */
export function normalizeNcf(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase()
}

export const NCF_REGEX = /^(B(01|02|03|04|11|13|14|15|16|17)\d{8}|E(31|32|33|34|41|43|44|45|46|47)\d{10})$/

export function normalizeRnc(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** Respuesta de la DGII al consultar un comprobante (ver stp-api/src/dgii/dgii-html.ts). */
export interface DgiiComprobante {
  verdict: 'valid' | 'rejected' | 'not-found' | 'needs-data' | 'unknown'
  estado: string | null
  message: string
  isEcf: boolean
  emisor?: string
  tipo?: string
  vigencia?: string
}

export interface DgiiRnc {
  found: boolean
  rnc: string
  name?: string
  tradeName?: string
  status?: string
  isElectronicBiller?: boolean
  message?: string
}

/** Un e-NCF empieza con E: solo esos llevan código de seguridad. */
export const isEcf = (ncf: string) => normalizeNcf(ncf).startsWith('E')

/** Lo que devuelve el escaneo con IA (ver stp-api/src/fiscal-invoices/invoice-scan.ts). */
export interface ScanResult {
  fields: {
    ncf: string
    supplierRnc: string
    supplierName: string
    invoiceDate: string | null
    baseAmount: number
    itbis: number
    isc: number
    tip: number
    otherTax: number
    paymentMethod: string
    expenseType: string | null
    securityCode: string | null
    notes: string
  }
  totalAmount: number | null
  confidence: 'high' | 'medium' | 'low'
  missing: string[]
  warnings: string[]
  duplicate: { id: string; ncf: string; supplierName: string; invoiceDate: string } | null
  /** Cómo se leyó: foto con IA o código QR del e-CF. */
  source: 'ia' | 'qr'
  /** Avisos buenos (no son problemas): p. ej. el tipo de gasto tomado de facturas anteriores. */
  hints: string[]
  /** Estado en la DGII si la lectura ya lo trajo (QR): Aceptado… */
  estadoDgii: string | null
}

/** Lo habitual de un proveedor, según sus facturas anteriores. */
export interface SupplierSuggestion {
  count: number
  supplierName: string | null
  expenseType: string | null
  expenseTypeShare: number | null
  paymentMethod: string | null
  paymentMethodShare: number | null
}

/** Un gasto ya registrado, tal como lo muestran la búsqueda y la conciliación. */
export interface ExpenseSummary {
  id: string
  description: string
  amount: number
  date: string
  notes: string | null
  supplierName: string | null
  projectId: string | null
  projectCode: string | null
  projectName: string | null
}

/** Qué tan probable es que un gasto ya registrado sea el de la factura (ERP-50). */
export interface ExpenseCandidate {
  expenseId: string
  score: number
  /** `strong`: mismo proveedor, monto y fecha cercana. `possible`: se parece, a revisar. */
  level: 'strong' | 'possible'
  reasons: string[]
  expense: ExpenseSummary
}

export interface ReconcileItem {
  invoice: {
    id: string
    ncf: string
    supplierName: string
    supplierRnc: string
    invoiceDate: string
    totalAmount: number
    baseAmount: number
  }
  best: ExpenseCandidate
  /** Hay otro gasto casi igual de probable: conviene revisar antes de confirmar. */
  ambiguous: boolean
  alternatives: ExpenseCandidate[]
}

export interface Reconciliation {
  unlinkedInvoices: number
  unlinkedExpenses: number
  items: ReconcileItem[]
}
