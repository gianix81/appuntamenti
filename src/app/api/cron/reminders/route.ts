import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { sendPushToAll } from '@/lib/push'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

// Chiamato da Vercel Cron (vercel.json) oppure manualmente
// Controlla appuntamenti nelle prossime 24 ore senza notifica già inviata
export async function GET() {
  const db  = getAdminDb()
  const now = new Date()
  const in24 = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const snap = await db.collection('appointments')
    .where('start_time', '>=', now.toISOString())
    .where('start_time', '<=', in24.toISOString())
    .where('status', '!=', 'cancelled')
    .get()

  if (snap.empty) return NextResponse.json({ sent: 0 })

  let sent = 0
  for (const doc of snap.docs) {
    const apt = doc.data()
    if (apt.push_notified_at) continue

    const clientSnap = await db.collection('clients').doc(apt.client_id).get()
    const serviceSnap = await db.collection('services').doc(apt.service_id).get()
    if (!clientSnap.exists || !serviceSnap.exists) continue

    const client  = clientSnap.data()!
    const service = serviceSnap.data()!
    const time    = format(new Date(apt.start_time), 'HH:mm', { locale: it })
    const date    = format(new Date(apt.start_time), 'EEEE d MMMM', { locale: it })

    await sendPushToAll({
      title: `Appuntamento: ${client.first_name} ${client.last_name}`,
      body:  `${service.name} — ${date} alle ${time}`,
      url:   `/appointments/${doc.id}/edit`,
    })

    await doc.ref.update({ push_notified_at: now.toISOString() })
    sent++
  }

  return NextResponse.json({ sent })
}
