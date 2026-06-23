import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, isAdminConfigured } from '@/lib/firebase/admin'
import { exchangeGoogleCode, tokenToSettings } from '@/lib/googleCalendar'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const settingsUrl = new URL('/settings', request.nextUrl.origin)
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const expectedState = request.cookies.get('google_calendar_oauth_state')?.value

  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set('googleCalendar', 'state_error')
    return NextResponse.redirect(settingsUrl)
  }

  if (!isAdminConfigured()) {
    settingsUrl.searchParams.set('googleCalendar', 'firebase_error')
    return NextResponse.redirect(settingsUrl)
  }

  try {
    const db = getAdminDb()
    const settingsRef = db.collection('settings').doc('main')
    const settingsSnap = await settingsRef.get()
    const previous = settingsSnap.data()?.google_calendar
    const token = await exchangeGoogleCode(request.nextUrl.origin, code)

    await settingsRef.set({
      google_calendar: tokenToSettings(token, previous),
      updated_at: new Date().toISOString(),
    }, { merge: true })

    settingsUrl.searchParams.set('googleCalendar', 'connected')
  } catch (err) {
    console.error('[google-calendar callback]', err)
    settingsUrl.searchParams.set('googleCalendar', 'error')
  }

  const response = NextResponse.redirect(settingsUrl)
  response.cookies.delete('google_calendar_oauth_state')
  return response
}
