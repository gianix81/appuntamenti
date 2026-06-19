import { NextRequest, NextResponse } from 'next/server'
import { isAdminConfigured, getAdminAuth } from '@/lib/firebase/admin'

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get('__session')?.value
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('__session')

  if (sessionCookie && isAdminConfigured()) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(sessionCookie)
      await getAdminAuth().revokeRefreshTokens(decoded.uid)
    } catch {
      // cookie non valido — lo cancelliamo comunque
    }
  }

  return response
}
