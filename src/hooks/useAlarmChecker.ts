'use client'

import { useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { getPendingAlarms, markAlarmFired } from '@/lib/alarmDB'

function alarmTitle(offsetMs: number): string {
  const mins = Math.round(offsetMs / 60000)
  if (mins === 0) return 'Appuntamento ora!'
  if (mins < 60)  return `Appuntamento tra ${mins} min`
  const hours = Math.round(mins / 60)
  return `Appuntamento tra ${hours}${hours === 1 ? ' ora' : ' ore'}`
}

async function fireAlarms() {
  const alarms = await getPendingAlarms()
  for (const alarm of alarms) {
    const offsetMs  = alarm.appointment_time - alarm.alarm_time
    const title     = alarmTitle(offsetMs)
    const apptTime  = format(new Date(alarm.appointment_time), 'HH:mm', { locale: it })
    const body      = `${alarm.client_name} — ${alarm.service_name} alle ${apptTime}`

    // System notification (shown even in background)
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, {
        body,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        tag:   alarm.id,
        data:  alarm,
        // action buttons only work in SW notifications, not window Notification
      } as NotificationOptions)
      n.onclick = () => {
        window.focus()
        n.close()
      }
    }

    // Also show via SW (gets action buttons on Android)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, {
          body,
          icon:    '/icons/icon-192.png',
          badge:   '/icons/icon-72.png',
          tag:     alarm.id,
          renotify: true,
          vibrate: [200, 100, 200, 100, 200],
          actions: [
            { action: 'whatsapp', title: 'WhatsApp' },
            { action: 'sms',      title: 'Invia SMS' },
          ],
          data: alarm,
        } as NotificationOptions)
      }).catch(() => {})
    }

    await markAlarmFired(alarm.id)
  }
}

async function runServerReminders() {
  await fetch('/api/reminders/run', { method: 'GET' }).catch(() => {})
}

export function useAlarmChecker() {
  const permissionRef  = useRef(false)
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const reminderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const requestPermission = useCallback(async () => {
    if (permissionRef.current) return
    if (!('Notification' in window)) return
    if (Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    permissionRef.current = true
  }, [])

  useEffect(() => {
    requestPermission()

    // Register periodic sync for background checks (Chrome Android)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(async reg => {
        if ('periodicSync' in reg) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (reg as any).periodicSync.register('alarm-check', { minInterval: 15 * 60 * 1000 })
          } catch {
            // Not supported or permission denied
          }
        }
      }).catch(() => {})
    }

    // In-app check every 60 seconds
    intervalRef.current = setInterval(() => {
      if (Notification.permission === 'granted') {
        fireAlarms().catch(() => {})
      }
    }, 60_000)

    reminderIntervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        runServerReminders().catch(() => {})
      }
    }, 60_000)

    // Immediate check on mount
    if (Notification.permission === 'granted') {
      fireAlarms().catch(() => {})
    }
    runServerReminders().catch(() => {})

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (reminderIntervalRef.current) clearInterval(reminderIntervalRef.current)
    }
  }, [requestPermission])
}
