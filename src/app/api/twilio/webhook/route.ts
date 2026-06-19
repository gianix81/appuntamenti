import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { parseClientReply } from '@/lib/reminders'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const from = formData.get('From') as string
  const body = formData.get('Body') as string
  const sid  = formData.get('MessageSid') as string

  const TwiMLEmpty = new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } })
  if (!from || !body) return TwiMLEmpty

  const db    = getAdminDb()
  const phone = from.replace(/\s/g, '')
  const now   = new Date().toISOString()

  const clientSnap = await db.collection('clients').where('phone', '==', phone).limit(1).get()

  if (clientSnap.empty) {
    await db.collection('message_logs').add({
      client_id: null, appointment_id: null, channel: 'sms',
      message_body: body, provider_message_id: sid,
      direction: 'inbound', status: 'received', received_response: true, created_at: now,
    })
    return TwiMLEmpty
  }

  const clientDoc = clientSnap.docs[0]

  const aptSnap = await db.collection('appointments')
    .where('client_id', '==', clientDoc.id)
    .where('confirmation_status', '==', 'pending')
    .where('start_time', '>=', now)
    .orderBy('start_time')
    .limit(1)
    .get()

  const appointment = aptSnap.empty ? null : aptSnap.docs[0]
  const intent = parseClientReply(body)

  await db.collection('message_logs').add({
    client_id:      clientDoc.id,
    appointment_id: appointment?.id ?? null,
    channel: 'sms', message_body: body, provider_message_id: sid,
    direction: 'inbound', status: 'received', received_response: true, created_at: now,
  })

  if (appointment && intent) {
    await db.collection('appointments').doc(appointment.id).update({
      confirmation_status: intent,
      status:              intent === 'confirmed' ? 'confirmed' : 'cancelled',
      confirmed_at:        intent === 'confirmed' ? now : null,
      cancelled_at:        intent === 'declined'  ? now : null,
    })
  }

  return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } })
}
