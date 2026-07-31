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
  total: number
  sectionName?: string
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

export interface ClientReport {
  client: Client
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
