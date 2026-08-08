'use server'

import { revalidatePath } from 'next/cache'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'
import type { ActionResult } from './users'

/**
 * Informes de proyecto. Dos tipos, ambos con parte editable.
 *
 * `interno` lleva toda la economía (gastos, nómina, balance, margen) y exige
 * MANAGER o ADMIN. `cliente` es el documento que se entrega: avance, tareas,
 * fichas, fotos y cronología de pagos — sin gastos, sin nómina y sin margen. La
 * separación la hace el servidor: el informe de cliente ni siquiera consulta
 * esos datos, así que no hay nada que ocultar aquí.
 */
export type TipoInforme = 'interno' | 'cliente'

export interface SeccionInforme {
  id?: string
  title: string
  body: string
}

export interface ConceptoManual {
  id?: string
  description: string
  amount: number
  notes?: string
}

export interface CasillasInforme {
  detalleGastos: boolean
  nomina: boolean
  tareas: boolean
  fichas: boolean
  fotos: boolean
  cronologia: boolean
  conceptosManuales: boolean
}

/** Lo único editable de un informe. Las cifras NO están aquí a propósito. */
export interface AjustesInforme {
  title?: string
  intro?: string
  observations?: string
  conclusions?: string
  sections: SeccionInforme[]
  manualItems: ConceptoManual[]
  include: CasillasInforme
}

interface CabeceraProyecto {
  code: string
  name: string
  status: string
  startDate?: string
  endDate?: string
  location?: string
  client?: { name: string }
}

/** Respuesta de `GET /reports/projects/:id/informe/interno`. */
export interface InformeInterno {
  tipo: 'interno'
  project: CabeceraProyecto & { budget?: number }
  settings: AjustesInforme
  tasks: Record<string, number>
  expenses: {
    total: number
    byCategory: Record<string, number>
    budgetUsed: number | null
    detail: {
      date: string
      description: string
      category: string
      supplier?: string
      amount: number
    }[]
  }
  payroll: {
    total: number
    entries: {
      number: string
      collaborator: string
      periodStart: string
      periodEnd: string
      days: number | null
      gross: number
    }[]
  }
  payments: {
    total: number
    detail: { date: string; description: string; method: string; amount: number }[]
  }
  balance: number
}

/**
 * Respuesta de `GET /reports/projects/:id/informe/cliente`.
 * Fíjate en lo que NO tiene: gastos, nómina, presupuesto, balance ni margen.
 */
export interface InformeCliente {
  tipo: 'cliente'
  project: CabeceraProyecto & { description?: string }
  settings: AjustesInforme
  progress: { total: number; done: number; percent: number }
  tasks: { title: string; status: string; dueDate?: string; completedAt?: string }[]
  fichas: { code: string; type: string; status: string; date?: string }[]
  photos: { name: string; date?: string }[]
  receipts: { date: string; description: string; method: string; amount: number }[]
}

export type Informe = InformeInterno | InformeCliente

/**
 * Guarda la parte editable del informe. Se persiste una fila por proyecto ×
 * tipo, así que reimprimir no obliga a reescribir las observaciones.
 */
export async function guardarInforme(
  projectId: string,
  tipo: TipoInforme,
  data: Partial<AjustesInforme>,
): Promise<ActionResult> {
  const res = await authFetch(`/reports/projects/${projectId}/informe/${tipo}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al guardar el informe') }
  }

  revalidatePath(`/dashboard/proyectos/${projectId}/informe`)
  return { ok: true }
}

/**
 * Archiva el PDF del informe como archivo del proyecto.
 *
 * Distinto de exportar: exportar te enseña el PDF, esto lo deja guardado. El
 * archivo aparece en la pestaña Archivos del proyecto y, en el siguiente ciclo
 * del sync (≤15 min), en Nextcloud bajo "ERP/Informes".
 *
 * Cada guardado añade un archivo fechado en vez de sustituir al anterior: así
 * queda constancia de lo que se entregó en cada momento, aunque las cifras del
 * proyecto cambien después.
 *
 * Revalida también la pestaña de archivos, que es donde el usuario va a
 * comprobar que se guardó.
 */
export async function archivarInforme(
  projectId: string,
  tipo: TipoInforme,
): Promise<ActionResult & { nombre?: string }> {
  const res = await authFetch(`/reports/projects/${projectId}/informe/${tipo}/archivar`, {
    method: 'POST',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, error: apiError(err, 'Error al guardar el informe en el proyecto') }
  }

  const data = (await res.json().catch(() => ({}))) as { nombre?: string }

  revalidatePath(`/dashboard/proyectos/${projectId}/informe`)
  revalidatePath(`/dashboard/proyectos/${projectId}`)
  return { ok: true, nombre: data.nombre }
}
