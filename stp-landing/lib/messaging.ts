// Tipos y utilidades de la bandeja de WhatsApp (ERP-57). Sin 'use server': se usa desde componentes de cliente.

export type LeadStage = 'new' | 'qualifying' | 'visit_pending' | 'visit_done' | 'quote_sent' | 'won' | 'lost'

export const STAGE_LABELS: Record<LeadStage, string> = {
  new: 'Nuevo',
  qualifying: 'En calificación',
  visit_pending: 'Visita por coordinar',
  visit_done: 'Visita hecha',
  quote_sent: 'Cotización enviada',
  won: 'Ganado',
  lost: 'Perdido',
}

export const STAGES = Object.keys(STAGE_LABELS) as LeadStage[]

export interface WaContactView {
  id: string
  phone: string
  name: string | null
  stage: LeadStage
  service: string | null
  notes: string | null
  client: { id: string; name: string } | null
  assignedTo: { id: string; name: string } | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
  awaitingReply: boolean
  windowEndsAt: string | null
  windowOpen: boolean
  createdAt: string
}

export interface WaMessageView {
  id: string
  direction: 'in' | 'out'
  type: string
  body: string | null
  hasMedia: boolean
  mime: string | null
  filename: string | null
  status: string
  error: string | null
  templateName: string | null
  sentById: string | null
  sentAt: string
}

export interface WaTemplateView {
  name: string
  label: string
  params: string[]
  preview: string
}

export interface WaAgent {
  id: string
  name: string
  role: string
}

export interface ContactsPage {
  data: WaContactView[]
  total: number
}

export interface MessagingSummary {
  queue: number
  mine: number
  waiting: number
}

const RELOAD_KEY = 'stp-msg-session-reload-at'
const RELOAD_EVERY_MS = 60_000

/**
 * Sesión vencida: recarga la página (el proxy de sesión renueva el token o manda al login), pero UNA sola
 * vez por minuto. Si el 401 no es de sesión, recargar en bucle no arregla nada. Devuelve si recargó.
 */
export function reloadOnceForSession(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Date.now() - last < RELOAD_EVERY_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    return false // Sin sessionStorage no hay forma de limitar las recargas: mejor no recargar.
  }
  window.location.reload()
  return true
}

/** Llamada al proxy autenticado /api/messaging. Lanza con el mensaje del servidor si falla. */
export async function mFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/messaging${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  if (res.status === 401) {
    // Sesión vencida: recargar pasa por el proxy de sesión, que renueva el token o manda al login.
    reloadOnceForSession()
    throw new Error('Sesión expirada: vuelve a iniciar sesión si el problema sigue.')
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string | string[] }
    const msg = Array.isArray(err.message) ? err.message.join(', ') : err.message
    if (res.status === 403) throw new Error('Tu rol no tiene acceso a la bandeja de mensajes.')
    throw new Error(msg ?? 'Error de conexión')
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

const TZ = 'America/Santo_Domingo'

export function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-DO', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
}

function dayKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

/** "Hoy", "Ayer" o "mar 14 oct" para el separador de días del hilo. */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (dayKey(d) === dayKey(now)) return 'Hoy'
  if (dayKey(d) === dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return 'Ayer'
  return d.toLocaleDateString('es-DO', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
}

export function sameDay(a: string, b: string): boolean {
  return dayKey(new Date(a)) === dayKey(new Date(b))
}

/** Hora si es de hoy, "ayer" o dd/mm: la columna de la derecha en la lista de conversaciones. */
export function formatListTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (dayKey(d) === dayKey(now)) return formatHour(iso)
  if (dayKey(d) === dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return 'Ayer'
  return d.toLocaleDateString('es-DO', { timeZone: TZ, day: 'numeric', month: 'numeric' })
}

/** "18094208567" → "+1 809 420 8567". Otros largos se dejan con el signo +. */
export function formatPhone(phone: string): string {
  if (phone.length === 11 && phone.startsWith('1')) return `+1 ${phone.slice(1, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`
  return `+${phone}`
}

/** "5 h 12 min" restantes de la ventana de 24 h, o null si ya cerró. */
export function windowLeft(windowEndsAt: string | null, now: number): string | null {
  if (!windowEndsAt) return null
  const ms = new Date(windowEndsAt).getTime() - now
  if (ms <= 0) return null
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export function contactTitle(c: Pick<WaContactView, 'name' | 'client' | 'phone'>): string {
  return c.client?.name ?? c.name ?? formatPhone(c.phone)
}
