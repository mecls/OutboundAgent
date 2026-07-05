import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'

/** Validates the shared password and sets the gate cookie. */
export async function POST(req: NextRequest) {
  const password = env.accessPassword()
  const form = await req.formData()
  const supplied = String(form.get('password') ?? '')
  const next = String(form.get('next') ?? '/') || '/'

  if (!password || supplied !== password) {
    const url = req.nextUrl.clone()
    url.pathname = '/gate'
    url.searchParams.set('error', '1')
    url.searchParams.set('next', next)
    return NextResponse.redirect(url, { status: 303 })
  }

  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 })
  res.cookies.set('oa_gate', password, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
