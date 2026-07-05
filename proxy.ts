import { NextResponse, type NextRequest } from 'next/server'

/**
 * Optional shared-password gate (single-tenant). Disabled entirely when
 * ACCESS_PASSWORD is unset. The Inngest worker endpoint is always exempt so the
 * Inngest platform can reach it without a session cookie.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/inngest).*)'],
}

const COOKIE = 'oa_gate'

export default function proxy(req: NextRequest) {
  const password = process.env.ACCESS_PASSWORD ?? ''
  if (!password) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (pathname === '/gate' || pathname === '/api/gate') {
    return NextResponse.next()
  }

  const cookie = req.cookies.get(COOKIE)?.value
  if (cookie && cookie === password) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/gate'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}
