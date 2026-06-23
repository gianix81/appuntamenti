import { NextResponse } from 'next/server'
import { getAdminDb, isAdminConfigured } from '@/lib/firebase/admin'
import { isGoogleCalendarConfigured } from '@/lib/googleCalendar'

export const runtime = 'nodejs'

export async function GET() {
  if (!isAdminConfigured()) {
    return NextResponse.json({ configured: false, connected: false })
  }

  const snap = await getAdminDb().collection('settings').doc('main').get()
  const googleCalendar = snap.data()?.google_calendar

  return NextResponse.json({
    configured: isGoogleCalendarConfigured(),
    connected: Boolean(googleCalendar?.refresh_token),
    calendarId: googleCalendar?.calendar_id ?? 'primary',
    connectedAt: googleCalendar?.connected_at ?? null,
  })
}
