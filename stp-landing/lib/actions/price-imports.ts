'use server'

import { revalidatePath } from 'next/cache'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'
import type { ApprovePriceImportResult, PriceImportLineUpdate } from '@/lib/types'

type Result = { ok: boolean; error?: string }

const IMPORTS = '/dashboard/costos/importar'
const MATERIALES = '/dashboard/costos/materiales'

/**
 * Sube el PDF de una cotización de proveedor. La respuesta llega en cuanto el archivo
 * está guardado: la extracción corre después en la cola, así que la página consultará
 * el estado del lote.
 */
export async function uploadPriceImport(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    // Sin Content-Type a propósito: fetch pone el boundary del multipart.
    const res = await authFetch('/costs/price-imports', { method: 'POST', body: formData })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: apiError(data, 'Error al subir el documento') }

    revalidatePath(IMPORTS)
    return { ok: true, id: (data as { id?: string }).id }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}

/** Correcciones de la revisión (asignar material, ajustar precio, descartar la línea). */
export async function updatePriceImportLine(
  importId: string,
  lineId: string,
  input: PriceImportLineUpdate,
): Promise<Result> {
  try {
    const res = await authFetch(`/costs/price-imports/${importId}/lines/${lineId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: apiError(data, 'Error al guardar la línea') }
    }
    revalidatePath(`${IMPORTS}/${importId}`)
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}

/**
 * Convierte en precios las líneas aprobadas. Devuelve también las que se saltaron y por
 * qué: aprobar 20 líneas y que entren 18 sin decir cuáles faltaron sería peor que fallar.
 */
export async function approvePriceImport(
  importId: string,
  lineIds: string[],
  date?: string,
): Promise<{ ok: boolean; error?: string; result?: ApprovePriceImportResult }> {
  try {
    const res = await authFetch(`/costs/price-imports/${importId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ lineIds, ...(date ? { date } : {}) }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: apiError(data, 'Error al aprobar') }

    revalidatePath(`${IMPORTS}/${importId}`)
    revalidatePath(IMPORTS)
    revalidatePath(MATERIALES)
    return { ok: true, result: data as ApprovePriceImportResult }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}

/** Borra el lote y su PDF. Los precios ya aprobados no se tocan: son append-only. */
export async function deletePriceImport(importId: string): Promise<Result> {
  try {
    const res = await authFetch(`/costs/price-imports/${importId}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: apiError(data, 'Error al borrar') }
    }
    revalidatePath(IMPORTS)
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}
