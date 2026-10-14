import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const API_TIMEOUT_MS = 30_000

export class UnauthorizedError extends Error {
  constructor() {
    super('Sesión expirada')
    this.name = 'UnauthorizedError'
  }
}

/** Error de la API con el código HTTP, para distinguir un 404 real de un fallo del servidor. */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Carga el recurso principal de una página de detalle. Un 404 (o 400 por id mal formado) es
 * "no encontrado"; un 401 redirige a login; cualquier otra falla (5xx, red, timeout) se relanza
 * para que `app/dashboard/error.tsx` muestre el error con reintento en vez de un falso 404.
 */
export async function loadMain<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/api/auth/logout')
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound()
    throw e
  }
}

/** Resultado de una carga secundaria: el dato (o su valor vacío) y si falló de verdad. */
export type Loaded<T> = { data: T; failed: boolean }

/**
 * Carga secundaria de una página (listas, pestañas, selects). Sustituye a
 * `.catch(() => lista vacía)`: devuelve el valor vacío pero marca `failed` cuando el servidor
 * falló (5xx, red, timeout), para que la página avise con <LoadErrorBanner>. Un 401 redirige a
 * login. Un 403 y un 404 NO cuentan como fallo: son "este rol no ve eso" / "no existe" y la página
 * ya los trata como vacío (p. ej. /users solo para admin).
 */
export async function loadSafe<T>(promise: Promise<T>, empty: T): Promise<Loaded<T>> {
  try {
    return { data: await promise, failed: false }
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/api/auth/logout')
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
      return { data: empty, failed: false }
    }
    if (e instanceof Error && /forbidden/i.test(e.message)) return { data: empty, failed: false }
    console.error('[api] carga secundaria fallida:', e)
    return { data: empty, failed: true }
  }
}

/** Etiquetas de las cargas fallidas, listas para <LoadErrorBanner failed={...}>. */
export function failedLabels(items: Array<[string, boolean]>): string[] {
  return items.filter(([, failed]) => failed).map(([label]) => label)
}

/**
 * Helper para los catch de las páginas de listado del dashboard.
 * Si el error es un 401 (UnauthorizedError) redirige a /api/auth/logout
 * (que limpia cookies y manda a /login) en vez de mostrar "Sesión expirada"
 * como texto y dejar al usuario atascado. Para cualquier otro error devuelve
 * su mensaje para pintarlo en pantalla.
 *
 * Nota: redirect() lanza internamente un error NEXT_REDIRECT que DEBE propagarse.
 * Si se llama dentro de un try/catch, ese catch debe re-lanzar el redirect
 * (ver isRedirectError).
 */
export function pageError(e: unknown, fallback: string): string {
  if (e instanceof UnauthorizedError) {
    redirect('/api/auth/logout')
  }
  if (e instanceof Error) {
    // El backend responde en inglés a un 403; quien llega por URL directa a algo que su rol no abre
    // debe leer qué pasa, no "Forbidden resource".
    if (/forbidden/i.test(e.message)) return 'Tu rol no tiene acceso a esta sección.'
    return e.message
  }
  return fallback
}

async function getToken(): Promise<string | undefined> {
  // El middleware puede haber refrescado el token y lo pasa via header
  const headerStore = await headers()
  const fresh = headerStore.get('x-stp-token')
  if (fresh) return fresh
  const store = await cookies()
  return store.get('stp-token')?.value
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers ?? {}),
  }

  // Sin timeout, una API colgada deja la página de Next esperando indefinidamente.
  // fetch() lanza TimeoutError (no es el 401 ni un redirect), así que se traduce a
  // un mensaje claro; el resto de errores de red se propagan como siempre.
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: init?.signal ?? AbortSignal.timeout(API_TIMEOUT_MS),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new Error('El servidor tardó demasiado en responder. Intenta de nuevo.')
    }
    throw e
  }

  if (res.status === 401) throw new UnauthorizedError()

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    const msg = Array.isArray(error.message) ? error.message.join(', ') : error.message
    throw new ApiError(msg ?? 'Error de conexión', res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}
