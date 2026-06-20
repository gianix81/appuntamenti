import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { sendPushToAll } from '@/lib/push'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

// Chiamato da Vercel Cron ogni minuto (vercel.json).
// Invia push notification all'operatore quando si avvicina un appuntamento.
// L'SMS viene inviato manualmente dall'operatore tramite l'app Messaggi del telefono.
export async function GET() {
  const db = getAdminDb()

  const settingsSnap = await db.collection('settings').doc('main').get()
  const settings     = settingsSnap.exists ? settingsSnap.data()! : {}

  if (!settings.reminder_enabled) return NextResponse.json({ sent: 0, skipped: 'disabled' })

  type Slot = { interval: number; type: 'confirmation' | 'reminder' }
  const slots: Slot[] = settings.notification_slots ??
    ((settings.reminder_intervals ?? (settings.reminder_minutes ? [settings.reminder_minutes] : [1440, 120]))
      .map((i: number) => ({ interval: i, type: 'reminder' as const })))

  if (slots.length === 0) return NextResponse.json({ sent: 0 })

  const now         = new Date()
  const maxInterval = Math.max(...slots.map(s => s.interval))
  const windowEnd   = new Date(now.getTime() + maxInterval * 60_000 + 60_000)

  const snap = await db.collection('appointments')
    .where('start_time', '>=', now.toISOString())
    .where('start_time', '<=', windowEnd.toISOString())
    .where('status', '!=', 'cancelled')
    .get()

  if (snap.empty) return NextResponse.json({ pushSent: 0 })

  let pushSent = 0

  for (const docSnap of snap.docs) {
    const apt     = docSnap.data()
    const msUntil = new Date(apt.start_time).getTime() - now.getTime()
    const notificationsSent: Record<string, string> = apt.notifications_sent ?? {}
    let pushed = false

    for (const slot of slots) {
      if (!(msUntil > 0 && msUntil <= slot.interval * 60_000)) continue
      const key = `${slot.type}_${slot.interval}`
      if (notificationsSent[key]) continue

      // ── Push all'operatore (una volta per appuntamento) ───
      if (!pushed) {
        try {
          const [clientSnap, serviceSnap] = await Promise.all([
            db.collection('clients').doc(apt.client_id).get(),
            db.collection('services').doc(apt.service_id).get(),
          ])
          if (clientSnap.exists && serviceSnap.exists) {
            const client  = clientSnap.data()!
            const service = serviceSnap.data()!
            const time    = format(new Date(apt.start_time), 'HH:mm', { locale: it })
            const date    = format(new Date(apt.start_time), 'EEEE d MMMM', { locale: it })
            await sendPushToAll({
              title: `⏰ ${client.first_name} ${client.last_name}`,
              body:  `${service.name} — ${date} alle ${time}`,
              url:   `/appointments/${docSnap.id}/edit`,
            })
            pushSent++
            pushed = true
          }
        } catch (err) {
          console.error('[Cron] push:', err)
        }
      }
    }
  }

  return NextResponse.json({ pushSent })
}

// Chiamato da Vercel Cron ogni minuto (vercel.json).
// 1. Invia SMS automaticamente ai clienti per ogni slot configurato
// 2. Invia push notification all'operatore
export async function GET() {
  const db = getAdminDb()

  const settingsSnap = await db.collection('settings').doc('main').get()
  const settings     = settingsSnap.exists ? settingsSnap.data()! : {}

  if (!settings.reminder_enabled) return NextResponse.json({ sent: 0, skipped: 'disabled' })

  type Slot = { interval: number; type: 'confirmation' | 'reminder' }
  const slots: Slot[] = settings.notification_slots ??
    ((settings.reminder_intervals ?? (settings.reminder_minutes ? [settings.reminder_minutes] : [1440, 120]))
      .map((i: number) => ({ interval: i, type: 'reminder' as const })))

  if (slots.length === 0) return NextResponse.json({ sent: 0 })

  const now         = new Date()
  const maxInterval = Math.max(...slots.map(s => s.interval))
  const windowEnd   = new Date(now.getTime() + maxInterval * 60_000 + 60_000)

  const snap = await db.collection('appointments')
    .where('start_time', '>=', now.toISOString())
    .where('start_time', '<=', windowEnd.toISOString())
    .where('status', '!=', 'cancelled')
    .get()

  if (snap.empty) return NextResponse.json({ smsSent: 0, pushSent: 0 })

  let smsSent  = 0
  let pushSent = 0

  for (const docSnap of snap.docs) {
    const apt     = docSnap.data()
    const msUntil = new Date(apt.start_time).getTime() - now.getTime()
    const notificationsSent: Record<string, string> = apt.notifications_sent ?? {}
    let pushSentForThis = false

    for (const slot of slots) {
      if (!(msUntil > 0 && msUntil <= slot.interval * 60_000)) continue

      const key = `${slot.type}_${slot.interval}`
      if (notificationsSent[key]) continue // già inviato

      // ── Invia SMS al cliente ──────────────────────────────
      const result = slot.type === 'confirmation'
        ? await sendConfirmationMessage(docSnap.id, slot.interval)
        : await sendAppointmentReminder(docSnap.id, slot.interval)

      if (result.success) {
        smsSent++
      } else {
        console.error(`[Cron] SMS ${slot.type} ${slot.interval}min per ${docSnap.id}: ${result.error}`)
      }

      // ── Push all'operatore (una volta per appuntamento) ───
      if (!pushSentForThis) {
        try {
          const [clientSnap, serviceSnap] = await Promise.all([
            db.collection('clients').doc(apt.client_id).get(),
            db.collection('services').doc(apt.service_id).get(),
          ])
          if (clientSnap.exists && serviceSnap.exists) {
            const client  = clientSnap.data()!
            const service = serviceSnap.data()!
            const time    = format(new Date(apt.start_time), 'HH:mm', { locale: it })
            const date    = format(new Date(apt.start_time), 'EEEE d MMMM', { locale: it })
            await sendPushToAll({
              title: `Appuntamento: ${client.first_name} ${client.last_name}`,
              body:  `${service.name} — ${date} alle ${time}`,
              url:   `/appointments/${docSnap.id}/edit`,
            })
            pushSent++
            pushSentForThis = true
          }
        } catch (err) {
          console.error('[Cron] push:', err)
        }
      }
    }
  }

  return NextResponse.json({ smsSent, pushSent })
}

