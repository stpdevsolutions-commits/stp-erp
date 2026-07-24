/**
 * Tipos del endpoint GET /reports/analytics (stp-api, módulo reports).
 * Se declaran aquí y no en lib/types.ts para no pisar ese archivo compartido.
 */

export type ProjectStatusKey =
  | 'draft'
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'cancelled'

export type ProjectTypeKey =
  | 'electrical'
  | 'mechanical'
  | 'construction'
  | 'maintenance'
  | 'other'

export interface CashflowMonth {
  month: string
  label: string
  year: number
  income: number
  expenses: number
  balance: number
}

export interface FunnelStage {
  key: string
  label: string
  count: number
  amount: number
}

export interface AgingBucket {
  key: string
  label: string
  count: number
  amount: number
}

export interface AnalyticsReport {
  generatedAt: string
  window: { months: number; from: string; to: string }
  cashflow: {
    months: CashflowMonth[]
    totals: { income: number; expenses: number; balance: number }
    hasData: boolean
  }
  quotes: {
    stages: FunnelStage[]
    breakdown: Record<string, { count: number; total: number }>
    conversion: {
      sentToApproved: number | null
      createdToApproved: number | null
      decidedToApproved: number | null
    }
    response: { avgDays: number | null; sampleSize: number }
    hasData: boolean
  }
  quotesAging: {
    buckets: AgingBucket[]
    total: number
    amount: number
    oldest: {
      id: string
      number: string
      client: string | null
      amount: number
      reminders: number
      ageDays: number
    } | null
    stale: number
    hasData: boolean
  }
  projects: {
    byType: {
      type: ProjectTypeKey
      total: number
      byStatus: { status: ProjectStatusKey; count: number }[]
    }[]
    byStatus: { status: ProjectStatusKey; count: number }[]
    total: number
    hasData: boolean
  }
  expenses: {
    byCategory: { category: string; count: number; total: number }[]
    total: number
    hasData: boolean
  }
  receivables: {
    approved: number
    approvedCount: number
    collected: number
    collectedCount: number
    pending: number
    collectedPct: number | null
    unconfirmed: number
    unconfirmedCount: number
    hasData: boolean
  }
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatusKey, string> = {
  draft: 'Pendiente',
  active: 'En curso',
  on_hold: 'En pausa',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

export const PROJECT_TYPE_LABELS: Record<ProjectTypeKey, string> = {
  electrical: 'Eléctrico',
  mechanical: 'Mecánico',
  construction: 'Construcción',
  maintenance: 'Mantenimiento',
  other: 'Otro',
}

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  subcontract: 'Subcontratos',
  travel: 'Transporte',
  other: 'Otros',
}
