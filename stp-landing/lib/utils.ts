import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function apiError(err: unknown, fallback: string): string {
  const obj = err as { message?: string | string[] }
  if (Array.isArray(obj?.message)) return obj.message.join(', ')
  return (obj?.message as string | undefined) ?? fallback
}

/**
 * Fecha en formato dominicano (dd/m/aaaa) sin el salto de un día.
 *
 * Una fecha sin hora ("2026-09-09", columnas `date`) se lee como medianoche
 * UTC: en RD (UTC-4) eso cae el día anterior, así que en componentes de
 * cliente salía un día menos que en el resto del sistema. Se ancla al
 * mediodía. Un instante completo (`createdAt`) se muestra en hora de RD,
 * venga el render del servidor (UTC) o del navegador.
 */
export function formatDate(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  if (!value) return '—'
  const d =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00`)
      : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', ...options })
}
