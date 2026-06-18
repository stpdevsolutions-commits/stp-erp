'use server'

import { revalidatePath } from 'next/cache'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { authFetch } from './utils'
import { apiError } from '@/lib/utils'

export async function uploadLogo(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch('/settings/logo', {
      method: 'POST',
      body: formData,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: apiError(data, 'Error al subir') }
    }
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
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
    const res = await authFetch('/settings/company')
    if (!res.ok) return null
    return res.json() as Promise<CompanyFormData>
  } catch (err) {
    if (isRedirectError(err)) throw err
    return null
  }
}

export async function updateCompanySettings(data: CompanyFormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch('/settings/company', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { ok: false, error: apiError(body, 'Error al guardar') }
    }
    revalidatePath('/dashboard/configuracion')
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}

export async function getDefaultTerms(): Promise<string> {
  try {
    const res = await authFetch('/settings/terms')
    if (!res.ok) return ''
    const body = await res.json() as { terms: string | null }
    return body.terms ?? ''
  } catch (err) {
    if (isRedirectError(err)) throw err
    return ''
  }
}

export async function updateDefaultTerms(terms: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch('/settings/terms', {
      method: 'PATCH',
      body: JSON.stringify({ terms }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { ok: false, error: apiError(body, 'Error al guardar') }
    }
    revalidatePath('/dashboard/configuracion')
    return { ok: true }
  } catch (err) {
    if (isRedirectError(err)) throw err
    return { ok: false, error: 'Error de conexión' }
  }
}
