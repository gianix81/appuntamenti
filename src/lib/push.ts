import webpush from 'web-push'
import { getAdminDb } from '@/lib/firebase/admin'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export async function sendPushToAll(payload: { title: string; body: string; url?: string }) {
  const db  = getAdminDb()
  const snap = await db.collection('push_subscriptions').get()
  if (snap.empty) return

  const data = JSON.stringify(payload)

  await Promise.allSettled(
    snap.docs.map(async doc => {
      try {
        await webpush.sendNotification(doc.data() as webpush.PushSubscription, data)
      } catch (err: unknown) {
        // Subscription scaduta o non valida: la rimuoviamo
        const status = (err as { statusCode?: number }).statusCode
        if (status === 410 || status === 404) {
          await doc.ref.delete()
        }
      }
    })
  )
}
