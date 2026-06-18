'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const store = await cookies()
  const token = store.get('stp-token')?.value
  if (!token) redirect('/login')

  const isFormData = init?.body instanceof FormData
  const headers: HeadersInit = {
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
    ...(init?.headers ?? {}),
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers })

  if (res.status === 401) {
    store.delete('stp-token')
    store.delete('stp-user')
    redirect('/login')
  }

  return res
}

export function apiError(err: unknown, fallback: string): string {
  const obj = err as { message?: string | string[] }
  if (Array.isArray(obj?.message)) return obj.message.join(', ')
  return (obj?.message as string | undefined) ?? fallback
}
