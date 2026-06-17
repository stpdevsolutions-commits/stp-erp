'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://stp-api:3001'

async function authToken() {
  const jar = await cookies()
  return jar.get('stp-token')?.value
}

async function apiFetch(path: string, init?: RequestInit) {
  const token = await authToken()
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
}

export async function uploadLogo(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await authToken()
    const res = await fetch(`${API}/settings/logo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    const data = await res.json().catch(() => ({})) as { message?: string | string[] }
    if (!res.ok) {
      const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? 'Error al subir')
      return { ok: false, error: msg }
    }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}

export type CompanyFormData = {
  name: string; shortName: string; rnc: string
  address1: string; address2: string; phones: string
  email: string; website: string
}

export async function getCompanySettings(): Promise<CompanyFormData | null> {
  try {
    const res = await apiFetch('/settings/company')
    if (!res.ok) return null
    return res.json() as Promise<CompanyFormData>
  } catch {
    return null
  }
}

export async function updateCompanySettings(data: CompanyFormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch('/settings/company', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string | string[] }
      const msg = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Error al guardar')
      return { ok: false, error: msg }
    }
    revalidatePath('/dashboard/configuracion')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}

export async function getDefaultTerms(): Promise<string> {
  try {
    const res = await apiFetch('/settings/terms')
    if (!res.ok) return ''
    const body = await res.json() as { terms: string | null }
    return body.terms ?? ''
  } catch {
    return ''
  }
}

export async function updateDefaultTerms(terms: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch('/settings/terms', {
      method: 'PATCH',
      body: JSON.stringify({ terms }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string | string[] }
      const msg = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? 'Error al guardar')
      return { ok: false, error: msg }
    }
    revalidatePath('/dashboard/configuracion')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}
