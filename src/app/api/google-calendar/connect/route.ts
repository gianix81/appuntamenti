import { NextRequest, NextResponse } from 'next/server'
import { buildGoogleAuthUrl, isGoogleCalendarConfigured } from '@/lib/googleCalendar'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!isGoogleCalendarConfigured()) {
    return new NextResponse('Google Calendar non configurato', { status: 503 })
  }

  const state = crypto.randomUUID()
  const response = NextResponse.redirect(buildGoogleAuthUrl(request.nextUrl.origin, state))
  response.cookies.set('google_calendar_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: '/',
  })
  return response
}
