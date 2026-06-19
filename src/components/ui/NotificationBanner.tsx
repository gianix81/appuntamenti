'use client'

import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Bell, BellOff, X } from 'lucide-react'
import { useState } from 'react'

export function NotificationBanner() {
  const { permission, subscribed, subscribe } = usePushNotifications()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || subscribed || permission === 'denied') return null
  if (typeof Notification === 'undefined') return null

  return (
    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
      <Bell className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">Attiva le notifiche</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Ricevi un avviso per ogni appuntamento del giorno successivo.
        </p>
        <button
          onClick={subscribe}
          className="mt-2 text-xs bg-rose-500 hover:bg-rose-600 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          Attiva notifiche
        </button>
      </div>
      <button onClick={() => setDismissed(true)} className="text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export function NotificationStatus() {
  const { subscribed } = usePushNotifications()
  if (!subscribed) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-600">
      <Bell className="w-3 h-3" /> Notifiche attive
    </span>
  )
}
