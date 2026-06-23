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
    const message = buildAppointmentMessage({
      kind: body.kind ?? 'confirmation',
      firstName: client.first_name,
      serviceName: service.name,
      start: new Date(appointment.start_time),
    })

    const result = await sendGigawaMessage({
      number: normalizeWhatsAppNumber(client.phone),
      message,
    })

    const now = new Date().toISOString()
    const notificationKey = body.kind === 'reminder' ? 'whatsapp_reminder' : 'whatsapp_confirmation'
    await Promise.all([
      aptSnap.ref.set({
        confirmation_status: body.kind === 'confirmation' ? 'pending' : appointment.confirmation_status,
        notifications_sent: {
          ...(appointment.notifications_sent ?? {}),
          [notificationKey]: now,
        },
        updated_at: now,
      }, { merge: true }),
      db.collection('message_logs').add({
        appointment_id: appointment.id,
        client_id: appointment.client_id,
        channel: 'whatsapp',
        message_body: message,
        provider_message_id: null,
        direction: 'outbound',
        status: 'sent',
        notification_type: body.kind ?? 'confirmation',
        interval_minutes: null,
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
