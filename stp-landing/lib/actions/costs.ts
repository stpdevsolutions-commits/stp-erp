'use server'

import { revalidatePath } from 'next/cache'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'
import type { Material, MaterialCategory, MaterialPrice, Unit } from '@/lib/types'

type Result = { ok: boolean; error?: string }

const MATERIALES = '/dashboard/costos/materiales'
const CATALOGO = '/dashboard/costos/catalogo'

async function mutate(path: string, init: RequestInit, revalidate: string[]): Promise<Result> {
  try {
    const res = await authFetch(path, init)
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: apiError(data, 'Error') }
    }
    for (const p of revalidate) revalidatePath(p)
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}

// ─── Materiales ───────────────────────────────────────────────────────────────

export async function createMaterial(input: Partial<Material>): Promise<Result> {
  return mutate('/costs/materials', { method: 'POST', body: JSON.stringify(input) }, [MATERIALES])
}

export async function updateMaterial(id: string, input: Partial<Material>): Promise<Result> {
  return mutate(`/costs/materials/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, [
    MATERIALES,
    `${MATERIALES}/${id}`,
  ])
}

export async function deleteMaterial(id: string): Promise<Result> {
  return mutate(`/costs/materials/${id}`, { method: 'DELETE' }, [MATERIALES])
}

// ─── Precios (append-only: solo crear y anular) ───────────────────────────────

export async function addMaterialPrice(
  materialId: string,
  input: Partial<MaterialPrice>,
): Promise<Result> {
  return mutate(
    `/costs/materials/${materialId}/prices`,
    { method: 'POST', body: JSON.stringify(input) },
    [MATERIALES, `${MATERIALES}/${materialId}`],
  )
}

/**
 * No existe editar ni borrar un precio: el historial es append-only. Anular deja la
 * fila con su motivo y saca el precio de las agregaciones.
 */
export async function voidMaterialPrice(
  priceId: string,
  materialId: string,
  reason: string,
): Promise<Result> {
  return mutate(
    `/costs/prices/${priceId}/void`,
    { method: 'POST', body: JSON.stringify({ reason }) },
    [MATERIALES, `${MATERIALES}/${materialId}`],
  )
}

// ─── Unidades ─────────────────────────────────────────────────────────────────

export async function createUnit(input: Partial<Unit>): Promise<Result> {
  return mutate('/costs/units', { method: 'POST', body: JSON.stringify(input) }, [CATALOGO])
}

export async function updateUnit(id: string, input: Partial<Unit>): Promise<Result> {
  return mutate(`/costs/units/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, [CATALOGO])
}

export async function deleteUnit(id: string): Promise<Result> {
  return mutate(`/costs/units/${id}`, { method: 'DELETE' }, [CATALOGO])
}

// ─── Categorías ───────────────────────────────────────────────────────────────

export async function createMaterialCategory(input: Partial<MaterialCategory>): Promise<Result> {
  return mutate('/costs/material-categories', { method: 'POST', body: JSON.stringify(input) }, [
    CATALOGO,
    MATERIALES,
  ])
}

export async function updateMaterialCategory(
  id: string,
  input: Partial<MaterialCategory>,
): Promise<Result> {
  return mutate(
    `/costs/material-categories/${id}`,
    { method: 'PATCH', body: JSON.stringify(input) },
    [CATALOGO, MATERIALES],
  )
}

export async function deleteMaterialCategory(id: string): Promise<Result> {
  return mutate(`/costs/material-categories/${id}`, { method: 'DELETE' }, [CATALOGO, MATERIALES])
}
