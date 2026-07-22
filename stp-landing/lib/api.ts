import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export class UnauthorizedError extends Error {
  constructor() {
    super('Sesión expirada')
    this.name = 'UnauthorizedError'
  }
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
  return e instanceof Error ? e.message : fallback
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

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  })

  if (res.status === 401) throw new UnauthorizedError()

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message ?? 'Error de conexión')
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
