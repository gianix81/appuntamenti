import { NextRequest, NextResponse } from 'next/server'
import { isAdminConfigured, getAdminAuth } from '@/lib/firebase/admin'

const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1000

export async function POST(request: NextRequest) {
  const { idToken } = await request.json()
  if (!idToken) return NextResponse.json({ error: 'Token mancante' }, { status: 400 })

  let sessionValue: string

  if (isAdminConfigured()) {
    try {
      sessionValue = await getAdminAuth().createSessionCookie(idToken, { expiresIn: SESSION_DURATION_MS })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: msg }, { status: 401 })
    }
  } else {
    // Fallback locale: usa l'idToken direttamente (valido 1h, ok per sviluppo)
    sessionValue = idToken
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('__session', sessionValue, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   SESSION_DURATION_MS / 1000,
    path:     '/',
  })
  return response
}
