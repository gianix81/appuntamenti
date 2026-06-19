'use client'

import { useEffect, useRef } from 'react'
import { collection, getDocs, query, where, getDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'

function notifiedKey(id: string) { return `notified_${id}` }
function wasNotified(id: string) { return !!localStorage.getItem(notifiedKey(id)) }
function markNotified(id: string) { localStorage.setItem(notifiedKey(id), '1') }

// Suono allarme via Web Audio API (3 bip)
function playAlarm() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const bip = (startAt: number, freq = 880) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.6, ctx.currentTime + startAt)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + 0.35)
      osc.start(ctx.currentTime + startAt)
      osc.stop(ctx.currentTime + startAt + 0.35)
    }
    bip(0);  bip(0.45); bip(0.9)
  } catch { /* audio bloccato o non supportato */ }
}

// Badge sull'icona dell'app (API standard)
async function setAppBadge(n: number) {
  if (!('setAppBadge' in navigator)) return
  try {
    if (n > 0) await (navigator as Navigator & { setAppBadge(n: number): Promise<void> }).setAppBadge(n)
    else       await (navigator as Navigator & { clearAppBadge(): Promise<void> }).clearAppBadge()
  } catch { /* non supportato */ }
}

// Mostra notifica tramite service worker (funziona anche con app in background)
async function showNotification(title: string, body: string, tag: string) {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification(title, {
    body,
    icon:               '/icons/icon-192.png',
    badge:              '/icons/icon-192.png',
    tag,
    requireInteraction: true,
    data:               { url: '/dashboard' },
    // vibrate non è nei tipi TypeScript ma è supportato dai browser
    ...({ vibrate: [300, 100, 300, 100, 300] } as object),
  } as NotificationOptions)
}

async function checkUpcomingAppointments() {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  let reminderMinutes = 30
  try {
    const snap = await getDoc(doc(db, 'settings', 'main'))
    if (snap.exists()) reminderMinutes = snap.data().reminder_minutes ?? 30
  } catch { /* ignora */ }

  const now  = new Date()
  const from = now.toISOString()
  const to   = new Date(now.getTime() + reminderMinutes * 60_000 + 60_000).toISOString()

  // IMPORTANTE: non aggiungere where('status','!=','cancelled') — Firestore
  // non permette inequality su campi diversi nella stessa query (start_time è già range).
  // Filtriamo i cancellati lato client.
  let snap
  try {
    snap = await getDocs(query(
      collection(db, 'appointments'),
      where('start_time', '>=', from),
      where('start_time', '<=', to),
    ))
  } catch { return }

  const upcoming   = snap.docs.filter(d => d.data().status !== 'cancelled')
  const unnotified = upcoming.filter(d => !wasNotified(d.id))

  // Aggiorna badge icona con il numero di appuntamenti imminenti
  await setAppBadge(unnotified.length)

  let alarmPlayed = false

  for (const docSnap of unnotified) {
    const apt = docSnap.data()

    let client: Record<string, unknown> | null = null
    let service: Record<string, unknown> | null = null
    try {
      const [cSnap, sSnap] = await Promise.all([
        getDoc(doc(db, 'clients',  apt.client_id)),
        getDoc(doc(db, 'services', apt.service_id)),
      ])
      if (!cSnap.exists() || !sSnap.exists()) continue
      client  = cSnap.data()
      service = sSnap.data()
    } catch { continue }

    const time = new Date(apt.start_time).toLocaleTimeString('it-IT', {
      hour: '2-digit', minute: '2-digit',
    })

    await showNotification(
      `⏰ Appuntamento tra ${reminderMinutes} min`,
      `${client.first_name} ${client.last_name} — ${service.name} alle ${time}`,
      docSnap.id,
    )

    // Suono allarme (una sola volta per ciclo)
    if (!alarmPlayed) { playAlarm(); alarmPlayed = true }

    markNotified(docSnap.id)
  }
}

export function useReminderChecker() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Pulisce il badge quando l'utente torna sull'app
    const onFocus = () => setAppBadge(0)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') setAppBadge(0)
    })

    // Primo check immediato, poi ogni 60 secondi
    checkUpcomingAppointments().catch(() => {})
    intervalRef.current = setInterval(() => {
      checkUpcomingAppointments().catch(() => {})
    }, 60_000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
}
