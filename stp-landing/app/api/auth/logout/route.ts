import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://stp-api:3001'

async function clearSession() {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('stp-refresh-token')?.value

  if (refreshToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {})
  }

  cookieStore.delete('stp-token')
  cookieStore.delete('stp-refresh-token')
  cookieStore.delete('stp-user')
  cookieStore.delete('stp-last-activity')
}

export async function GET(request: Request) {
  await clearSession()
  return NextResponse.redirect(new URL('/login', request.url))
}

export async function POST() {
  await clearSession()
  return NextResponse.json({ ok: true })
}
