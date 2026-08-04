import type { AcuItemKind, AcuLaborBasis, AcuTrade } from '@/lib/types'

export const TRADE_LABELS: Record<AcuTrade, string> = {
  electrical: 'Eléctrico',
  civil: 'Civil',
  mechanical: 'Mecánico',
  other: 'Otro',
}

export const KIND_LABELS: Record<AcuItemKind, string> = {
  material: 'Material',
  labor: 'Mano de obra',
  equipment: 'Equipo',
}

export const KIND_BADGE: Record<AcuItemKind, string> = {
  material: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  labor: 'bg-green-600/10 text-green-700 dark:text-green-400',
  equipment: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

export const BASIS_LABELS: Record<AcuLaborBasis, string> = {
  yield: 'Rendimiento × tarifa',
  pct_materials: '% sobre materiales',
}

/** De dónde salió el costo unitario de una línea. */
export const SOURCE_LABELS = {
  catalog: 'Precio vigente del catálogo',
  manual: 'Escrito en la receta',
  pct: 'Porcentaje sobre materiales',
} as const

const DOP2 = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Los importes de 4 decimales que devuelve la API se presentan con 2: el cálculo
 * necesita la precisión, la lectura no. Los unitarios pequeños (un pie de cable) sí
 * se muestran con 4, porque a 2 decimales muchos se leerían como 0.00.
 */
export function fmtDOP(n: number): string {
  return DOP2.format(n)
}

export function fmtUnitCost(n: number): string {
  return n !== 0 && Math.abs(n) < 1
    ? `RD$ ${n.toFixed(4)}`
    : DOP2.format(n)
}

/** Cantidades con hasta 6 decimales, sin ceros de relleno (0.041700 → 0.0417). */
export function fmtQty(n: number): string {
  return String(Number(n.toFixed(6)))
}
