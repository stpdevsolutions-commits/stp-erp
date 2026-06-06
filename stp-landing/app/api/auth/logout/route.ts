import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete('stp-token')
  cookieStore.delete('stp-user')
  return NextResponse.json({ ok: true })
}
