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
  createdAt: string
}

export interface QuoteItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface Quote {
  id: string
  number: string
  title: string
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired'
  validUntil?: string
  total: number
  notes?: string
  projectId?: string
  project?: Pick<Project, 'id' | 'name' | 'code'>
  clientId: string
  client?: Pick<Client, 'id' | 'name' | 'email'>
  items: QuoteItem[]
  createdAt: string
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
  | 'project-photos'
  | 'project-documents'
  | 'project-expenses'
  | 'project-quotes'

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
