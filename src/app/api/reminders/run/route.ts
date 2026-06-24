import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb, isAdminConfigured } from '@/lib/firebase/admin'
import { buildAppointmentMessage } from '@/lib/appointmentMessages'
import { normalizeWhatsAppNumber, sendGigawaMessage } from '@/lib/gigawa'
import type { Appointment } from '@/types/database'

export const runtime = 'nodejs'

const REMINDER_MINUTES = 30
const SENT_KEY = `whatsapp_reminder_${REMINDER_MINUTES}`

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Firebase Admin non configurato' }, { status: 503 })
  }

  try {
    const db = getAdminDb()
    const settings = (await db.collection('settings').doc('main').get()).data() ?? {}
    const templates = settings.notification_messages as { confirmation?: string; reminder?: string } | undefined
    const remindersEnabled = settings.reminder_enabled !== false
    const alarmOffsets = settings.alarm_offsets_minutes as number[] | undefined

    if (!remindersEnabled || (alarmOffsets?.length && !alarmOffsets.includes(REMINDER_MINUTES))) {
      return NextResponse.json({ ok: true, skipped: 'reminders_disabled', sent: 0 })
    }

    const now = Date.now()
    const upper = new Date(now + REMINDER_MINUTES * 60_000).toISOString()
    const lower = new Date(now - 2 * 60_000).toISOString()
    const snap = await db.collection('appointments')
      .where('start_time', '>=', lower)
      .where('start_time', '<=', upper)
      .orderBy('start_time')
      .get()

    const results: Array<{ appointmentId: string; status: 'sent' | 'skipped' | 'error'; error?: string }> = []

    for (const docSnap of snap.docs) {
      const appointment = { id: docSnap.id, ...docSnap.data() } as Appointment
      const startMs = new Date(appointment.start_time).getTime()
      const minutesToStart = Math.round((startMs - now) / 60_000)

      if (appointment.status === 'cancelled' || appointment.status === 'completed') {
        results.push({ appointmentId: appointment.id, status: 'skipped' })
        continue
      }
      if (minutesToStart < 0 || minutesToStart > REMINDER_MINUTES) {
        results.push({ appointmentId: appointment.id, status: 'skipped' })
        continue
      }
      if (appointment.notifications_sent?.[SENT_KEY]) {
        results.push({ appointmentId: appointment.id, status: 'skipped' })
        continue
      }

      try {
        const [clientSnap, serviceSnap] = await Promise.all([
          db.collection('clients').doc(appointment.client_id).get(),
          db.collection('services').doc(appointment.service_id).get(),
        ])

        if (!clientSnap.exists || !serviceSnap.exists) {
          results.push({ appointmentId: appointment.id, status: 'skipped' })
          continue
        }

        const client = clientSnap.data() as { first_name: string; last_name: string; phone: string }
        const service = serviceSnap.data() as { name: string }
        const message = buildAppointmentMessage({
          kind: 'reminder',
          firstName: client.first_name,
          serviceName: service.name,
          start: new Date(appointment.start_time),
          templates,
        })

        const result = await sendGigawaMessage({
          number: normalizeWhatsAppNumber(client.phone),
          message,
        })

        const sentAt = new Date().toISOString()
        await Promise.all([
          docSnap.ref.set({
            notifications_sent: {
              ...(appointment.notifications_sent ?? {}),
              [SENT_KEY]: sentAt,
            },
            reminder_sent_at: sentAt,
            updated_at: sentAt,
          }, { merge: true }),
          db.collection('message_logs').add({
            appointment_id: appointment.id,
            client_id: appointment.client_id,
            channel: 'whatsapp',
            message_body: message,
            provider_message_id: null,
            direction: 'outbound',
            status: 'sent',
            provider_response: result,
            recipient_number: normalizeWhatsAppNumber(client.phone),
            notification_type: 'reminder',
            interval_minutes: REMINDER_MINUTES,
            received_response: false,
            created_at: sentAt,
          }),
        ])

        results.push({ appointmentId: appointment.id, status: 'sent' })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[reminders run]', appointment.id, message)
        results.push({ appointmentId: appointment.id, status: 'error', error: message })
      }
    }

    return NextResponse.json({
      ok: true,
      checked: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      results,
    })
  } catch (err) {
    console.error('[reminders run]', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) return true

  const session = request.cookies.get('__session')?.value
  if (!session || !isAdminConfigured()) return false

  try {
    await getAdminAuth().verifySessionCookie(session)
    return true
  } catch {
    try {
      await getAdminAuth().verifyIdToken(session)
      return true
    } catch {
      return false
    }
  }
}
