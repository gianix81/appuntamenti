'use client'

import { useEffect, useRef } from 'react'
import { collection, getDocs, query, where, getDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'

// Chiave localStorage per tracciare le notifiche già inviate (evita duplicati)
function notifiedKey(id: string) { return `notified_${id}` }
function wasNotified(id: string) { return !!localStorage.getItem(notifiedKey(id)) }
function markNotified(id: string) { localStorage.setItem(notifiedKey(id), '1') }

async function checkUpcomingAppointments() {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  // Legge l'anticipo dalle impostazioni (default 30 min)
  let reminderMinutes = 30
  try {
    const settingsSnap = await getDoc(doc(db, 'settings', 'main'))
    if (settingsSnap.exists()) {
      reminderMinutes = settingsSnap.data().reminder_minutes ?? 30
    }
  } catch { /* ignora */ }

  const now      = new Date()
  const windowMs = reminderMinutes * 60 * 1000
  // Cerca appuntamenti nella finestra [ora, ora + anticipo + 1 min]
  const from = now.toISOString()
  const to   = new Date(now.getTime() + windowMs + 60_000).toISOString()

  const snap = await getDocs(query(
    collection(db, 'appointments'),
    where('start_time', '>=', from),
    where('start_time', '<=', to),
    where('status', '!=', 'cancelled'),
  ))

  for (const docSnap of snap.docs) {
    const apt = docSnap.data()
    if (wasNotified(docSnap.id)) continue

    const [clientSnap, serviceSnap] = await Promise.all([
      getDoc(doc(db, 'clients', apt.client_id)),
      getDoc(doc(db, 'services', apt.service_id)),
    ])
    if (!clientSnap.exists() || !serviceSnap.exists()) continue

    const client  = clientSnap.data()
    const service = serviceSnap.data()
    const time    = new Date(apt.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

    new Notification(`Appuntamento tra ${reminderMinutes} min`, {
      body: `${client.first_name} ${client.last_name} — ${service.name} alle ${time}`,
      icon: '/icons/icon-192.png',
      tag:  docSnap.id,
    })

    markNotified(docSnap.id)
  }
}

export function useReminderChecker() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Primo controllo subito
    checkUpcomingAppointments().catch(() => {})
    // Poi ogni minuto
    intervalRef.current = setInterval(() => {
      checkUpcomingAppointments().catch(() => {})
    }, 60_000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])
}
