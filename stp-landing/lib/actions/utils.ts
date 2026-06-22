'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

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

  const res = await fetch(`${API_URL}${path}`, { ...init, headers: fetchHeaders })

  if (res.status === 401) {
    store.delete('stp-token')
    store.delete('stp-refresh-token')
    store.delete('stp-user')
    store.delete('stp-last-activity')
    redirect('/login')
  }

  return res
}

