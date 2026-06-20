'use client'

import { useEffect, useState, useCallback } from 'react'

// Converte VAPID public key da base64url a Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding  = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData  = window.atob(base64)
  const output   = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

async function doSubscribe(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null

  const reg    = await navigator.serviceWorker.ready
  let sub      = await reg.pushManager.getSubscription()

  // Se la subscription esiste già la riusiamo
  if (!sub) {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) {
      console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY non configurata')
      return null
    }
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })
  }

  // Salva/aggiorna la subscription sul server
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  }).catch(() => {})

  // Registra Periodic Background Sync (Chrome/Android PWA installata)
  try {
    if ('periodicSync' in reg) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (reg as any).periodicSync.register('remind', { minInterval: 60_000 })
      console.log('[Push] Periodic Background Sync registrato')
    }
  } catch (e) { console.log('[Push] periodicSync non supportato:', e) }

  // Registra Background Sync (si attiva al reconnect)
  try {
    if ('sync' in reg) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (reg as any).sync.register('remind')
    }
  } catch { /* non supportato */ }

  return sub
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [subscribed, setSubscribed] = useState(false)

  // Auto-subscribe se il permesso è già stato concesso
  const tryAutoSubscribe = useCallback(async () => {
    if (typeof Notification === 'undefined') return
    const perm = Notification.permission
    setPermission(perm)
    if (perm !== 'granted') return
    try {
      const sub = await doSubscribe()
      setSubscribed(!!sub)
    } catch (err) {
      console.error('[Push] auto-subscribe error:', err)
    }
  }, [])

  useEffect(() => {
    tryAutoSubscribe()
  }, [tryAutoSubscribe])

  async function subscribe() {
    if (typeof Notification === 'undefined') return false
    if (!('serviceWorker' in navigator)) return false

    const perm = await Notification.requestPermission()
    setPermission(perm)
    if (perm !== 'granted') return false

    try {
      const sub = await doSubscribe()
      if (!sub) return false
      setSubscribed(true)
      return true
    } catch (err) {
      console.error('[Push] subscribe error:', err)
      return false
    }
  }

  async function unsubscribe() {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {})
          await sub.unsubscribe()
        }
      }
    } catch { /* ignora */ }
    setSubscribed(false)
  }

  return { permission, subscribed, subscribe, unsubscribe }
}
