'use client'

import { useEffect, useState } from 'react'

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (typeof Notification === 'undefined') return
    const perm = Notification.permission
    setPermission(perm)
    // Se già concessa in sessioni precedenti → mostra "Notifiche attive"
    if (perm === 'granted') setSubscribed(true)
  }, [])

  async function subscribe() {
    if (typeof Notification === 'undefined') return false
    if (!('serviceWorker' in navigator)) return false

    const result = await Notification.requestPermission()
    setPermission(result)
    if (result !== 'granted') return false
    setSubscribed(true)
    return true
  }

  function unsubscribe() {
    setSubscribed(false)
    // La permission del browser non si può revocare via JS — solo dalle impostazioni browser
  }

  return { permission, subscribed, subscribe, unsubscribe }
}
