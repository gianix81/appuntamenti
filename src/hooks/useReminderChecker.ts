'use client'

import { useEffect, useRef } from 'react'
import { collection, getDocs, query, where, getDoc, doc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/client'

function notifiedKey(id: string) { return `notified_${id}` }
function wasNotified(id: string) { return !!localStorage.getItem(notifiedKey(id)) }
function markNotified(id: string) { localStorage.setItem(notifiedKey(id), '1') }

// Aspetta che Firebase Auth sia pronto (necessario per Firestore rules)
async function waitForAuthReady(): Promise<boolean> {
  if (!auth) return false
  return new Promise(resolve => {
    let done = false
    const unsub = auth.onAuthStateChanged(user => {
      if (done) return
      done = true
      unsub()
      resolve(!!user)
    })
    setTimeout(() => { if (!done) { done = true; unsub(); resolve(false) } }, 5000)
  })
}

// Suono allarme via Web Audio API
async function playAlarm() {
  try {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtxClass()
    await ctx.resume() // sblocca il contesto (richiesto da browser moderni)
    const bip = (startAt: number, freq = 880) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = freq
      gain.gain.setValueAtTime(0.6, ctx.currentTime + startAt)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + 0.35)
      osc.start(ctx.currentTime + startAt)
      osc.stop(ctx.currentTime + startAt + 0.35)
    }
    bip(0); bip(0.45); bip(0.9)
  } catch { /* audio bloccato o non supportato */ }
}

async function setAppBadge(n: number) {
  if (!('setAppBadge' in navigator)) return
  try {
    if (n > 0) await (navigator as Navigator & { setAppBadge(n: number): Promise<void> }).setAppBadge(n)
    else await (navigator as Navigator & { clearAppBadge(): Promise<void> }).clearAppBadge()
  } catch { /* non supportato */ }
}

function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  const e164 = digits.startsWith('+') ? digits.slice(1) : digits
  return `https://wa.me/${e164}?text=${encodeURIComponent(message)}`
}

async function showSwNotification(title: string, body: string, tag: string, whatsappUrl?: string) {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag,
      requireInteraction: true,
      data: { url: '/dashboard', whatsappUrl },
      ...({ vibrate: [300, 100, 300, 100, 300] } as object),
      ...({ actions: whatsappUrl ? [{ action: 'whatsapp', title: '📱 WhatsApp' }] : [] } as object),
    } as NotificationOptions)
  } catch (err) {
    console.error('[ReminderChecker] showNotification failed:', err)
  }
}

async function checkUpcomingAppointments() {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  // Aspetta auth prima di interrogare Firestore (evita "permission denied")
  const isAuthed = await waitForAuthReady()
  if (!isAuthed) return

  let reminderMinutes = 30
  let centerName = ''
  try {
    const settingsSnap = await getDoc(doc(db, 'settings', 'main'))
    if (settingsSnap.exists()) {
      reminderMinutes = settingsSnap.data().reminder_minutes ?? 30
      centerName = settingsSnap.data().center_name ?? ''
    }
  } catch (err) {
    console.error('[ReminderChecker] Lettura settings fallita:', err)
    return
  }

  const now = new Date()
  const from = now.toISOString()
  const to = new Date(now.getTime() + reminderMinutes * 60_000 + 60_000).toISOString()

  // IMPORTANTE: non usare where('status','!=') insieme al range su start_time
  // → Firestore non permette inequality su campi multipli. Filtriamo client-side.
  let snap
  try {
    snap = await getDocs(query(
      collection(db, 'appointments'),
      where('start_time', '>=', from),
      where('start_time', '<=', to),
    ))
  } catch (err) {
    console.error('[ReminderChecker] Query appuntamenti fallita:', err)
    return
  }

  const upcoming = snap.docs.filter(d => d.data().status !== 'cancelled')
  const unnotified = upcoming.filter(d => !wasNotified(d.id))

  await setAppBadge(unnotified.length)

  let alarmPlayed = false

  for (const docSnap of unnotified) {
    const apt = docSnap.data()

    let client: Record<string, unknown> | null = null
    let service: Record<string, unknown> | null = null
    try {
      const [cSnap, sSnap] = await Promise.all([
        getDoc(doc(db, 'clients', apt.client_id)),
        getDoc(doc(db, 'services', apt.service_id)),
      ])
      if (!cSnap.exists() || !sSnap.exists()) continue
      client = cSnap.data()
      service = sSnap.data()
    } catch {
      continue
    }

    const time = new Date(apt.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    const clientName = `${client.first_name} ${client.last_name}`
    const serviceName = String(service.name)
    const clientPhone = client.phone as string | undefined

    const whatsappMsg = `Buongiorno ${String(client.first_name)}, la ricordiamo del suo appuntamento per ${serviceName} alle ${time}.${centerName ? ` Cordiali saluti, ${centerName}.` : ''}`
    const whatsappUrl = clientPhone ? buildWhatsAppUrl(clientPhone, whatsappMsg) : undefined

    // Notifica sistema (visibile anche con app in background)
    await showSwNotification(
      `⏰ Appuntamento tra ${reminderMinutes} min`,
      `${clientName} — ${serviceName} alle ${time}`,
      docSnap.id,
      whatsappUrl,
    )

    // Popup in-app (visibile quando l'utente è attivo nell'app)
    window.dispatchEvent(new CustomEvent('appointment-reminder', {
      detail: { appointmentId: docSnap.id, clientName, serviceName, time, reminderMinutes, whatsappUrl },
    }))

    if (!alarmPlayed) { playAlarm(); alarmPlayed = true }

    markNotified(docSnap.id)
  }
}

export function useReminderChecker() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const onFocus = () => setAppBadge(0)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') setAppBadge(0)
    })

    checkUpcomingAppointments().catch(err => console.error('[ReminderChecker] Errore iniziale:', err))
    intervalRef.current = setInterval(() => {
      checkUpcomingAppointments().catch(err => console.error('[ReminderChecker] Errore periodico:', err))
    }, 60_000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
}
