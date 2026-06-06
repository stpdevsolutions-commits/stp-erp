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
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled'
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
  projectId: string
  project?: Pick<Project, 'id' | 'name' | 'code'>
  clientId: string
  client?: Pick<Client, 'id' | 'name' | 'email'>
  items: QuoteItem[]
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
