import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, isAdminConfigured } from '@/lib/firebase/admin'
import {
  buildCalendarEvent,
  deleteGoogleCalendarEvent,
  getValidAccessToken,
  upsertGoogleCalendarEvent,
} from '@/lib/googleCalendar'
import type { Appointment } from '@/types/database'

export const runtime = 'nodejs'

type SyncResult = { appointmentId: string; status: 'created' | 'updated' | 'deleted' | 'skipped'; eventId?: string }

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Firebase Admin non configurato' }, { status: 503 })
  }

  let body: { appointmentId?: string; action?: 'delete' } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  try {
    const db = getAdminDb()
    const settingsRef = db.collection('settings').doc('main')
    const settingsSnap = await settingsRef.get()
    const settings = settingsSnap.data() ?? {}
    const googleCalendar = settings.google_calendar
    const accessToken = await getValidAccessToken(googleCalendar, async refreshed => {
      await settingsRef.set({
        google_calendar: refreshed,
        updated_at: new Date().toISOString(),
      }, { merge: true })
    })

    if (!accessToken) {
      return NextResponse.json({ ok: false, connected: false, error: 'Google Calendar non collegato' }, { status: 409 })
    }

    const calendarId = googleCalendar?.calendar_id ?? 'primary'
    const results: SyncResult[] = []

    if (body.appointmentId) {
      results.push(await syncAppointment(body.appointmentId, accessToken, calendarId, settings, body.action))
    } else {
      const now = new Date().toISOString()
      const snap = await db.collection('appointments')
        .where('start_time', '>=', now)
        .orderBy('start_time')
        .get()

      for (const docSnap of snap.docs) {
        results.push(await syncAppointment(docSnap.id, accessToken, calendarId, settings))
      }
    }

    return NextResponse.json({ ok: true, connected: true, results })
  } catch (err) {
    console.error('[google-calendar sync]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function syncAppointment(
  appointmentId: string,
  accessToken: string,
  calendarId: string,
  settings: Record<string, unknown>,
  action?: 'delete',
): Promise<SyncResult> {
  const db = getAdminDb()
  const aptRef = db.collection('appointments').doc(appointmentId)
  const aptSnap = await aptRef.get()
  if (!aptSnap.exists) return { appointmentId, status: 'skipped' }

  const appointment = { id: aptSnap.id, ...aptSnap.data() } as Appointment & {
    google_calendar_event_id?: string | null
    google_calendar_html_link?: string | null
  }

  if (action === 'delete' || appointment.status === 'cancelled') {
    if (appointment.google_calendar_event_id) {
      await deleteGoogleCalendarEvent({
        accessToken,
        calendarId,
        eventId: appointment.google_calendar_event_id,
      })
    }
    await aptRef.set({
      google_calendar_event_id: FieldValue.delete(),
      google_calendar_html_link: FieldValue.delete(),
      google_calendar_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { merge: true })
    return { appointmentId, status: 'deleted' }
  }

  const [clientSnap, serviceSnap] = await Promise.all([
    db.collection('clients').doc(appointment.client_id).get(),
    db.collection('services').doc(appointment.service_id).get(),
  ])

  if (!clientSnap.exists || !serviceSnap.exists) {
    return { appointmentId, status: 'skipped' }
  }

  const event = buildCalendarEvent({
    appointment,
    client: clientSnap.data() as { first_name: string; last_name: string; phone: string; email?: string | null },
    service: serviceSnap.data() as { name: string; duration_minutes?: number },
    settings: settings as { center_name?: string; address?: string | null; city?: string | null },
  })

  const previousEventId = appointment.google_calendar_event_id ?? null
  let savedEvent: { id: string; htmlLink?: string }
  try {
    savedEvent = await upsertGoogleCalendarEvent({
      accessToken,
      calendarId,
      eventId: previousEventId,
      event,
    })
  } catch (err) {
    if (!previousEventId || !(err instanceof Error) || !err.message.includes('Not Found')) throw err
    savedEvent = await upsertGoogleCalendarEvent({ accessToken, calendarId, event })
  }

  await aptRef.set({
    google_calendar_event_id: savedEvent.id,
    google_calendar_html_link: savedEvent.htmlLink ?? null,
    google_calendar_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { merge: true })

  return {
    appointmentId,
    status: previousEventId ? 'updated' : 'created',
    eventId: savedEvent.id,
  }
}
