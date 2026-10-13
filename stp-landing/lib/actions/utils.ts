'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { API_URL } from './config'

export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const store = await cookies()
  const headerStore = await headers()

  // El middleware puede haber refrescado el token y lo pasa via header
  const token = headerStore.get('x-stp-token') ?? store.get('stp-token')?.value
  if (!token) redirect('/login')

  const isFormData = init?.body instanceof FormData
  const fetchHeaders: HeadersInit = {
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
    ...(init?.headers ?? {}),
  }

  // Las subidas (FormData) llevan fotos de varios MB: más margen que una consulta normal.
  const timeoutMs = isFormData ? 120_000 : 30_000
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: fetchHeaders,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new Error('El servidor tardó demasiado en responder. Intenta de nuevo.')
    }
    throw e
  }

  if (res.status === 401) {
    const domain = process.env.COOKIE_DOMAIN
    for (const name of ['stp-token', 'stp-refresh-token', 'stp-user', 'stp-last-activity']) {
      store.delete(name)
      if (domain) {
        store.set(name, '', {
          maxAge: 0,
          path: '/',
          domain,
          secure: true,
          sameSite: 'lax',
        })
      }
    }
    redirect('/login')
  }

  return res
}

