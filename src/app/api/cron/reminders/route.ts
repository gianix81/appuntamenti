import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { sendPushToAll } from '@/lib/push'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

// Chiamato da Vercel Cron (vercel.json) oppure manualmente.
// Controlla gli appuntamenti in finestre corrispondenti agli intervalli configurati
// e invia push notification all'operatore per quelli non ancora notificati.
export async function GET() {
  const db = getAdminDb()

  // Carica impostazioni
  const settingsSnap = await db.collection('settings').doc('main').get()
  const settings     = settingsSnap.exists ? settingsSnap.data()! : {}
  const intervals: number[] = settings.reminder_intervals
    ?? (settings.reminder_minutes ? [settings.reminder_minutes] : [1440, 120])

  const now        = new Date()
  const maxInterval = Math.max(...intervals)
  const windowEnd  = new Date(now.getTime() + maxInterval * 60_000 + 60_000)

  const snap = await db.collection('appointments')
    .where('start_time', '>=', now.toISOString())
    .where('start_time', '<=', windowEnd.toISOString())
    .where('status', '!=', 'cancelled')
    .get()

  if (snap.empty) return NextResponse.json({ sent: 0 })

  let sent = 0
  for (const docSnap of snap.docs) {
    const apt      = docSnap.data()
    const msUntil  = new Date(apt.start_time).getTime() - now.getTime()

    // Controlla se almeno uno degli intervalli è applicabile
    const applicableInterval = intervals.find(interval => msUntil > 0 && msUntil <= interval * 60_000)
    if (!applicableInterval) continue

    // Evita duplicati usando push_notified_at (per ora un singolo flag)
    if (apt.push_notified_at) continue

    const [clientSnap, serviceSnap] = await Promise.all([
      db.collection('clients').doc(apt.client_id).get(),
      db.collection('services').doc(apt.service_id).get(),
    ])
    if (!clientSnap.exists || !serviceSnap.exists) continue

    const client  = clientSnap.data()!
    const service = serviceSnap.data()!
    const time    = format(new Date(apt.start_time), 'HH:mm', { locale: it })
    const date    = format(new Date(apt.start_time), 'EEEE d MMMM', { locale: it })

    await sendPushToAll({
      title: `Appuntamento: ${client.first_name} ${client.last_name}`,
      body:  `${service.name} — ${date} alle ${time}`,
      url:   `/appointments/${docSnap.id}/edit`,
    })

    await docSnap.ref.update({ push_notified_at: now.toISOString() })
    sent++
  }

  return NextResponse.json({ sent })
}

