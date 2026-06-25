import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, isAdminConfigured } from '@/lib/firebase/admin'
import { normalizeWhatsAppNumber, sendGigawaMessage, isGigawaConfigured } from '@/lib/gigawa'

export const runtime = 'nodejs'

interface PromoBody {
  clientId:   string
  firstName:  string
  phone:      string
  message:    string   // may contain {nome}
}

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Firebase Admin non configurato' }, { status: 503 })
  }
  if (!isGigawaConfigured()) {
    return NextResponse.json({ error: 'Gigawa non configurato' }, { status: 503 })
  }

  let body: PromoBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { clientId, firstName, phone, message } = body
  if (!clientId || !phone || !message?.trim()) {
    return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })
  }

  const personalizedMessage = message.replace(/\{nome\}/gi, firstName ?? '')
  const number = normalizeWhatsAppNumber(phone)

  try {
    const result = await sendGigawaMessage({ number, message: personalizedMessage })

    await getAdminDb().collection('message_logs').add({
      appointment_id:      null,
      client_id:           clientId,
      channel:             'whatsapp',
      message_body:        personalizedMessage,
      provider_message_id: null,
      direction:           'outbound',
      status:              'sent',
      provider_response:   result,
      recipient_number:    number,
      notification_type:   'promo',
      interval_minutes:    null,
      received_response:   false,
      created_at:          new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
