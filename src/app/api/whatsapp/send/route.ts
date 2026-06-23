import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, isAdminConfigured } from '@/lib/firebase/admin'
import { buildAppointmentMessage, type AppointmentMessageKind } from '@/lib/appointmentMessages'
import { normalizeWhatsAppNumber, sendGigawaMessage } from '@/lib/gigawa'
import type { Appointment } from '@/types/database'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Firebase Admin non configurato' }, { status: 503 })
  }

  let body: { appointmentId?: string; kind?: AppointmentMessageKind } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  if (!body.appointmentId) {
    return NextResponse.json({ error: 'appointmentId mancante' }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const aptSnap = await db.collection('appointments').doc(body.appointmentId).get()
    if (!aptSnap.exists) return NextResponse.json({ error: 'Appuntamento non trovato' }, { status: 404 })

    const appointment = { id: aptSnap.id, ...aptSnap.data() } as Appointment
    const [clientSnap, serviceSnap] = await Promise.all([
      db.collection('clients').doc(appointment.client_id).get(),
      db.collection('services').doc(appointment.service_id).get(),
    ])

    if (!clientSnap.exists || !serviceSnap.exists) {
      return NextResponse.json({ error: 'Cliente o servizio non trovato' }, { status: 404 })
    }

    const client = clientSnap.data() as { first_name: string; last_name: string; phone: string }
    const service = serviceSnap.data() as { name: string }
    const number = normalizeWhatsAppNumber(client.phone)
    const message = buildAppointmentMessage({
      kind: body.kind ?? 'confirmation',
      firstName: client.first_name,
      serviceName: service.name,
      start: new Date(appointment.start_time),
    })

    const result = await sendGigawaMessage({
      number,
      message,
    })

    const kind = body.kind ?? 'confirmation'
    const now = new Date().toISOString()
    const notificationKey = kind === 'reminder' ? 'whatsapp_reminder_30' : 'whatsapp_confirmation'
    const appointmentUpdate = {
      confirmation_status: body.kind === 'confirmation' ? 'pending' : appointment.confirmation_status,
      notifications_sent: {
        ...(appointment.notifications_sent ?? {}),
        [notificationKey]: now,
      },
      ...(kind === 'reminder' ? { reminder_sent_at: now } : {}),
      updated_at: now,
    }

    await Promise.all([
      aptSnap.ref.set(appointmentUpdate, { merge: true }),
      db.collection('message_logs').add({
        appointment_id: appointment.id,
        client_id: appointment.client_id,
        channel: 'whatsapp',
        message_body: message,
        provider_message_id: null,
        direction: 'outbound',
        status: 'sent',
        provider_response: result,
        recipient_number: number,
        notification_type: kind,
        interval_minutes: kind === 'reminder' ? 30 : null,
        received_response: false,
        created_at: now,
      }),
    ])

    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('[whatsapp send]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
