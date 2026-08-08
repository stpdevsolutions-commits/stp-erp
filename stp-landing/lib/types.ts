export type UserRole = 'admin' | 'manager' | 'user'

export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
}

export interface LoginResponse {
  access_token: string
  user: AuthUser
}

export type ClientType = 'company' | 'individual'

export interface Client {
  id: string
  name: string
  type: ClientType
  rnc?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  contactName?: string
  contactPhone?: string
  notes?: string
  isActive: boolean
  createdAt: string
}

export interface Project {
  id: string
  code: string
  name: string
  description?: string
  status: 'draft' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  startDate?: string
  endDate?: string
  budget?: number
  clientId: string
  client?: Pick<Client, 'id' | 'name'>
  createdAt: string
}

export interface Task {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'review' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: string
  projectId: string
  project?: Pick<Project, 'id' | 'name' | 'code'>
  assignedTo?: Pick<AuthUser, 'id' | 'firstName' | 'lastName'>
  /** Colaborador (personal de campo, sin cuenta de usuario) que ejecuta la tarea. */
  collaboratorId?: string
  collaborator?: Pick<Collaborator, 'id' | 'firstName' | 'lastName' | 'position'>
  createdAt: string
}

export interface QuoteItem {
  id: string
  description: string
  quantity: number
  unit?: string
  unitPrice: number
  discountPct?: number
  /** Línea = cantidad × unitario − descuento; partida = suma de sus descendientes. */
  total: number
  /**
   * Árbol de partidas: `group` agrupa (sin cantidad ni precio propios) e `item`
   * es la línea. `parentId` null = está en la raíz; `sortOrder` ordena entre
   * hermanos, no globalmente. Ver `lib/quote-tree.ts`.
   */
  kind?: 'group' | 'item'
  parentId?: string | null
  sortOrder?: number

  /**
   * Origen del unitario cuando la línea nace de una partida de costos (ACU).
   *
   * Lo guardado es el CONGELADO, no un enlace vivo: `acuUnitCost` es el costo directo
   * del día en que se cotizó. Una cotización ya enviada no cambia de precio sola; el
   * desfase contra el costo de hoy se consulta aparte (`GET /quotes/:id/acu-drift`).
   */
  acuId?: string | null
  /** La partida enlazada, para poder nombrarla. Solo viene en el detalle de la cotización. */
  acu?: Pick<Acu, 'id' | 'code' | 'name'> | null
  acuUnitCost?: number | null
  acuMarkupPct?: number | null
  acuPricedAt?: string | null
  /** El ACU estaba incompleto al congelar: el unitario es un piso, no el costo real. */
  acuIncomplete?: boolean | null
}

// ─── Desfase de precios ACU en una cotización ────────────────────────────────

/** Por qué una línea entra en el aviso. Ninguna es excluyente de las otras. */
export interface AcuDriftFlags {
  costChanged: boolean
  currentIncomplete: boolean
  frozenIncomplete: boolean
  aged: boolean
  /** El unitario se escribió a mano tras congelar: no se pisa sin confirmarlo. */
  manualOverride: boolean
  /** No hay costo congelado con el que comparar (o el ACU ya no existe). */
  noBaseline: boolean
}

export interface AcuDriftLine {
  itemId: string
  description: string
  acuId: string
  /** Numeración jerárquica de la línea en el árbol ("1.2.3"). */
  label?: string
  acuCode?: string
  acuName?: string
  quantity: number
  discountPct: number
  frozenUnitCost: number | null
  currentUnitCost: number | null
  unitCostDelta: number | null
  unitCostDeltaPct: number | null
  markupPct: number
  currentUnitPrice: number
  suggestedUnitPrice: number | null
  unitPriceDelta: number | null
  currentLineTotal: number
  suggestedLineTotal: number | null
  lineTotalDelta: number | null
  direction: 'up' | 'down' | 'same' | 'unknown'
  pricedAt: string | null
  ageDays: number | null
  stale: boolean
  flags: AcuDriftFlags
}

/** Respuesta de `GET /quotes/:id/acu-drift`. */
export interface AcuDriftReport {
  linkedLines: number
  staleLines: number
  incompleteLines: number
  /** Suma de las líneas enlazadas a un ACU, no el subtotal de la cotización. */
  currentTotal: number
  suggestedTotal: number
  totalDelta: number
  totalDeltaPct: number | null
  maxDeltaPct: number | null
  lines: AcuDriftLine[]
  generatedAt: string
}

/** Motivo por el que una línea no se re-congeló. */
export type AcuRefreshSkipReason =
  | 'acu-not-found'
  | 'no-cost'
  | 'incomplete'
  | 'manual-override'

/** Respuesta de `POST /quotes/:id/acu-refresh`. */
export interface AcuRefreshResult {
  updated: {
    itemId: string
    description: string
    previousUnitCost: number | null
    unitCost: number
    previousUnitPrice: number
    unitPrice: number
  }[]
  skipped: {
    itemId: string
    description: string
    reason: AcuRefreshSkipReason
    detail: string
  }[]
}

export interface QuoteRevisionSummary {
  id: string
  number: string
  revision: number
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired'
  total: number
  createdAt: string
  supersededById: string | null
}

export interface Quote {
  id: string
  number: string
  baseNumber: string
  revision: number
  supersededById?: string | null
  revisions?: QuoteRevisionSummary[]
  title: string
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired'
  validUntil?: string
  taxRate: number
  subtotal: number
  discount?: number
  taxAmount: number
  total: number
  notes?: string
  terms?: string
  projectId?: string
  project?: Pick<Project, 'id' | 'name' | 'code'>
  clientId: string
  client?: Pick<Client, 'id' | 'name' | 'email'>
  items: QuoteItem[]
  createdAt: string
  sentAt?: string
  reminderCount?: number
  lastReminderAt?: string
  decidedAt?: string
  decisionIp?: string
  decisionUserAgent?: string
}

export type SupplierCategory = 'materials' | 'equipment' | 'services' | 'subcontract' | 'other'

export interface Supplier {
  id: string
  name: string
  rnc?: string
  category: SupplierCategory
  email?: string
  phone?: string
  address?: string
  city?: string
  contactName?: string
  contactPhone?: string
  notes?: string
  isActive: boolean
  createdAt: string
}

export type ExpenseCategory = 'materials' | 'labor' | 'equipment' | 'subcontract' | 'travel' | 'other'

export interface Expense {
  id: string
  projectId: string
  project?: Pick<Project, 'id' | 'name' | 'code'>
  description: string
  category: ExpenseCategory
  amount: number
  date: string
  supplierId?: string
  supplier?: Pick<Supplier, 'id' | 'name'>
  notes?: string
  createdAt: string
  /** Desglose opcional; con `materialId` alimenta la base de precios. */
  quantity?: number
  unitPrice?: number
  unitId?: string
  unit?: Unit
  materialId?: string
  material?: Pick<Material, 'id' | 'code' | 'name'>
  itbisIncluded?: boolean
}

export type PaymentMethod = 'cash' | 'transfer' | 'check' | 'card' | 'other'
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded'

export interface Payment {
  id: string
  clientId: string
  client?: Pick<Client, 'id' | 'name'>
  projectId?: string
  project?: Pick<Project, 'id' | 'name' | 'code'>
  quoteId?: string
  quote?: Pick<Quote, 'id' | 'number'>
  description: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  date: string
  reference?: string
  notes?: string
  createdAt: string
}

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  isActive: boolean
  createdAt: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface ApiError {
  message: string
  statusCode: number
}

export type FileContext =
  | 'client-profile'
  | 'client-documents'
  | 'client-quotes'
  | 'client-payments'
  | 'project-photos'
  | 'project-documents'
  | 'project-expenses'
  | 'project-quotes'
  | 'project-payments'
  | 'project-reports'

export interface FileUpload {
  id: string
  originalName: string
  filename: string
  path: string
  mimetype: string
  size: number
  context: FileContext
  clientId: string
  projectId?: string
  uploadedById?: string
  createdAt: string
}

export interface DashboardReport {
  clients: { total: number }
  projects: Partial<Record<Project['status'], number>>
  quotes: Partial<Record<Quote['status'], { count: number; amount: number }>>
  expenses: { thisMonth: number }
  payments: { thisMonth: number }
  tasks: { overdue: number }
}

export interface ProjectReport {
  project: {
    id: string
    code: string
    name: string
    status: Project['status']
    budget?: number
    startDate?: string
    endDate?: string
    client?: Pick<Client, 'id' | 'name'>
  }
  tasks: Record<string, number>
  expenses: {
    total: number
    byCategory: Partial<Record<ExpenseCategory, number>>
    budgetUsed: number | null
  }
  payments: { total: number }
  balance: number
}

export interface ClientReportProject {
  id: string
  code: string
  name: string
  status: Project['status']
  budget: number | null
  startDate: string | null
  endDate: string | null
}

export interface ClientReport {
  client: Client
  projects: ClientReportProject[]
  projectsBudget: number
  quotes: Partial<Record<Quote['status'], { count: number; amount: number }>>
  approvedAmount: number
  totalPaid: number
  totalExpenses: number
  outstanding: number
}

export type InventoryCategory = 'materials' | 'equipment' | 'tools' | 'electrical' | 'mechanical' | 'consumables' | 'other'

export interface InventoryItem {
  id: string
  name: string
  sku?: string
  category: InventoryCategory
  description?: string
  quantity: number
  unit?: string
  cost: number
  price: number
  location?: string
  minStock?: number
  notes?: string
  isActive: boolean
  createdAt: string
}

export type CollaboratorStatus = 'active' | 'inactive'

export interface Collaborator {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  position?: string
  cedula?: string
  dailyRate?: number
  status: CollaboratorStatus
  notes?: string
  createdAt: string
}

export type FichaType = 'electrico' | 'civil' | 'electromecanico' | 'levantamiento' | 'evaluacion_danos'
export type FichaStatus = 'borrador' | 'en_progreso' | 'enviada'

export interface Ficha {
  id: string
  code: string
  type: FichaType
  status: FichaStatus
  projectId: string
  project?: Pick<Project, 'id' | 'name' | 'code'>
  technicianId: string
  technician?: Pick<AuthUser, 'id' | 'firstName' | 'lastName'>
  data: Record<string, unknown>
  latitude?: number | null
  longitude?: number | null
  photos?: string[] | null
  signature?: string | null
  submittedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface IncomeReport {
  period: { from: string; to: string }
  summary: {
    total: number
    count: number
    quotesApproved: { total: number; count: number }
    pendingPayments: { total: number; count: number }
  }
  byMethod: { method: PaymentMethod; count: number; total: number }[]
  payments: { id: string; amount: number; date: string; method: PaymentMethod; project?: string; client?: string }[]
}

export interface ExpensesReport {
  period: { from: string; to: string }
  summary: { total: number; count: number }
  byCategory: { category: ExpenseCategory; count: number; total: number }[]
  byProject: { projectId?: string; project: string; count: number; total: number }[]
  topSuppliers: { supplier: string; count: number; total: number }[]
}

export interface FichasReport {
  period: { from: string; to: string }
  summary: { total: number; enviadas: number; tasaEnvio: number }
  byType: { type: FichaType; count: number }[]
  byStatus: { status: FichaStatus; count: number }[]
  byTechnician: { userId: string; name: string; total: number; enviadas: number }[]
}

/**
 * Reporte general del negocio en un período.
 * `payroll` llega en `null` para un USER: la nómina es MANAGER+ incluso en
 * lectura, así que el bloque no se pinta (no es que valga cero).
 */
export interface GeneralReport {
  period: { from: string; to: string }
  previousPeriod: { from: string; to: string } | null
  finance: {
    income: number
    incomeCount: number
    expenses: number
    expenseCount: number
    profit: number
    margin: number | null
    previous: { income: number; expenses: number; profit: number } | null
    variation: { income: number | null; expenses: number | null; profit: number | null } | null
  }
  quotes: {
    emitted: { count: number; amount: number }
    approved: { count: number; amount: number }
    rejected: { count: number; amount: number }
    decidedCount: number
    conversionRate: number | null
  }
  payroll: { count: number; gross: number; net: number; imputedToExpenses: number } | null
  projects: {
    active: number
    completedInPeriod: number
    budgetCommitted: number
    spent: number
    budgetUsed: number | null
  }
  fichas: { total: number; enviadas: number; tasaEnvio: number }
}

// ─── Módulo Costos ────────────────────────────────────────────────────────────

export type UnitKind = 'count' | 'length' | 'area' | 'volume' | 'mass' | 'time' | 'other'

export interface Unit {
  id: string
  code: string
  name: string
  kind: UnitKind
  baseUnitId?: string
  factor?: number
  isActive: boolean
}

export interface MaterialCategory {
  id: string
  code: string
  name: string
  description?: string
  parentId?: string
  isActive: boolean
}

/** Resumen de precios que devuelve la API con `withPrices=true`. */
export interface PriceSummary {
  count: number
  current: number | null
  currentDate: string | null
  min: number | null
  max: number | null
  avg: number | null
  /** Variación % del vigente contra el anterior. */
  changePct: number | null
  /** Días desde la fecha del precio vigente. Alto = precio viejo. */
  ageDays: number | null
}

export interface Material {
  id: string
  code: string
  name: string
  normalizedName: string
  description?: string
  categoryId?: string
  category?: MaterialCategory
  unitId: string
  unit?: Unit
  brand?: string
  model?: string
  barcode?: string
  specs?: Record<string, unknown>
  notes?: string
  isActive: boolean
  createdAt: string
  priceSummary?: PriceSummary
}

export type PriceCurrency = 'DOP' | 'USD'
export type PriceRegion =
  | 'santo_domingo'
  | 'santiago_cibao'
  | 'este_punta_cana'
  | 'norte'
  | 'sur'
  | 'otra'
export type PriceSource = 'manual' | 'supplier_quote' | 'expense' | 'import' | 'external_ref'

export interface MaterialPrice {
  id: string
  materialId: string
  supplierId?: string
  supplier?: Pick<Supplier, 'id' | 'name'>
  /** Precio tal como se recibió, en su moneda y con sus impuestos. */
  price: number
  currency: PriceCurrency
  exchangeRate?: number
  itbisIncluded: boolean
  itbisRate: number
  discountPct: number
  /** Comparable: DOP, con descuento, sin ITBIS. Es el que se debe graficar. */
  netUnitPrice: number
  minQuantity?: number
  region: PriceRegion
  date: string
  leadTimeDays?: number
  source: PriceSource
  documentId?: string
  expenseId?: string
  notes?: string
  registeredById?: string
  voidedAt?: string
  voidedById?: string
  voidReason?: string
  createdAt: string
}

export interface MaterialPriceReport {
  material: { id: string; code: string; name: string; unit: string | null }
  summary: PriceSummary
  bySupplier: {
    supplierId: string | null
    supplierName: string | null
    netUnitPrice: number
    date: string
    leadTimeDays: number | null
  }[]
}

// ── ACU (Análisis de Costos Unitarios) ────────────────────────────────────────

// ─── Importación de precios desde PDF de proveedor (Costos, Fase 4) ───────────

export type PriceImportStatus = 'pending' | 'processing' | 'review' | 'done' | 'failed'
export type PriceImportLineStatus = 'pending' | 'approved' | 'rejected'

/**
 * Una línea extraída del PDF: **un borrador**, no un precio. Solo llega a
 * `material_prices` cuando alguien la aprueba, y entonces trae `createdPriceId`.
 */
export interface PriceImportLine {
  id: string
  importId: string
  position: number
  /** Lo que decía el PDF, sin normalizar: es contra esto que se revisa. */
  rawDescription: string
  rawUnit?: string
  rawCode?: string
  price: number
  currency: PriceCurrency
  itbisIncluded: boolean
  discountPct: number
  materialId?: string
  material?: Material
  /** Candidatos del catálogo que encajaban: 1 = propuesto, >1 = ambiguo, 0 = nuevo. */
  matchCount: number
  status: PriceImportLineStatus
  createdPriceId?: string
  notes?: string
}

export interface PriceImport {
  id: string
  originalName: string
  size: number
  status: PriceImportStatus
  supplierId?: string
  supplier?: Pick<Supplier, 'id' | 'name'>
  documentDate?: string
  model?: string
  inputTokens: number
  outputTokens: number
  error?: string
  notes?: string
  createdById?: string
  createdBy?: Pick<User, 'id' | 'firstName' | 'lastName'>
  lines?: PriceImportLine[]
  createdAt: string
  updatedAt: string
}

/**
 * Correcciones de la revisión. `materialId: null` desasigna a propósito, y por eso el
 * campo admite null explícito y no solo ausencia.
 */
export type PriceImportLineUpdate = Partial<
  Pick<PriceImportLine, 'price' | 'currency' | 'itbisIncluded' | 'discountPct' | 'notes'>
> & {
  materialId?: string | null
  status?: Extract<PriceImportLineStatus, 'pending' | 'rejected'>
}

export interface ApprovePriceImportResult {
  created: number
  skipped: { lineId: string; reason: string }[]
}

export type AcuTrade = 'electrical' | 'civil' | 'mechanical' | 'other'
export type AcuItemKind = 'material' | 'labor' | 'equipment'

/**
 * Cómo se valora una línea de mano de obra o equipo:
 * `yield` = rendimiento × tarifa · `pct_materials` = % sobre el costo de materiales.
 */
export type AcuLaborBasis = 'yield' | 'pct_materials'

export interface AcuItem {
  id: string
  acuId: string
  kind: AcuItemKind
  materialId?: string
  material?: Material
  description?: string
  /** Unidad del INSUMO (pie de cable, día de electricista), no la de la partida. */
  unitId?: string
  unit?: Unit
  quantity: number
  /** En materiales, vacío = usar el precio vigente del catálogo. */
  unitCost?: number
  basis?: AcuLaborBasis
  pct?: number
  /** Desperdicio en %: sube la cantidad, no el precio. */
  wastePct: number
  sortOrder: number
  notes?: string
}

export interface AcuCostLine {
  itemId: string
  kind: AcuItemKind
  description: string
  /** Cantidad ya con el desperdicio aplicado. */
  effectiveQuantity: number
  unitCost: number
  subtotal: number
  costSource: 'catalog' | 'manual' | 'pct'
  /** El material no tiene precio vigente: la línea vale 0. */
  missingPrice: boolean
}

export interface AcuCost {
  lines: AcuCostLine[]
  materialCost: number
  laborCost: number
  equipmentCost: number
  /** Costo directo de UNA unidad de la partida. */
  directCost: number
  /** Falta el precio de algún material: el total es un piso, no el costo real. */
  incomplete: boolean
  missingMaterialIds: string[]
}

export interface Acu {
  id: string
  code: string
  name: string
  normalizedName: string
  description?: string
  unitId: string
  unit?: Unit
  trade: AcuTrade
  chapter?: string
  notes?: string
  isActive: boolean
  items?: AcuItem[]
  createdAt: string
  updatedAt: string
  /** Solo viene en el listado con `withCost=true`. */
  cost?: AcuCost
}

/** Respuesta de `GET /costs/acus/:id/cost`. */
export interface AcuCostResponse {
  acu: Acu
  cost: AcuCost
}

/**
 * Cuerpo de una línea de receta al crearla o editarla.
 *
 * `null` explícito donde `undefined` no vale: al editar, la API fusiona la línea guardada
 * con lo que llega, y un campo ausente conserva el valor viejo. Para BORRAR el material o
 * la tarifa de una línea hay que mandar `null` (la API lo acepta y lo limpia).
 */
export interface AcuItemPayload {
  kind: AcuItemKind
  materialId?: string | null
  description?: string
  unitId?: string
  quantity?: number
  unitCost?: number | null
  basis?: AcuLaborBasis
  pct?: number
  wastePct?: number
  sortOrder?: number
  notes?: string
}

/** Cuerpo de la cabecera de un ACU. */
export interface AcuPayload {
  name?: string
  description?: string
  unitId?: string
  trade?: AcuTrade
  chapter?: string
  notes?: string
  isActive?: boolean
  items?: AcuItemPayload[]
}

// ── Nómina ────────────────────────────────────────────────────────────────────

export type PayrollStatus = 'pending' | 'paid' | 'cancelled'
export type PayrollMethod = 'cash' | 'transfer' | 'check' | 'other'

export interface PayrollEntry {
  id: string
  number: string
  collaboratorId: string
  collaborator?: Pick<Collaborator, 'id' | 'firstName' | 'lastName' | 'position' | 'cedula'>
  projectId?: string
  project?: Pick<Project, 'id' | 'name' | 'code'>
  periodStart: string
  periodEnd: string
  daysWorked?: number
  dailyRate?: number
  overtimeAmount: number
  bonuses: number
  deductions: number
  /** Calculados por el servidor: días × tarifa + extras + bonos, menos descuentos. */
  grossAmount: number
  netAmount: number
  status: PayrollStatus
  method: PayrollMethod
  paymentDate?: string
  reference?: string
  notes?: string
  /** Gasto de mano de obra generado al marcar el pago como pagado. */
  expenseId?: string
  createdAt: string
}

export interface PayrollSummary {
  pendingCount: number
  pendingAmount: number
  paidThisMonth: number
  paidThisMonthCount: number
  paidThisYear: number
}
