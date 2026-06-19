'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { collection, getDocs, query, where, getDoc, doc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/client'
import { onAuthStateChanged } from 'firebase/auth'
import { startOfDay, endOfDay } from 'date-fns'

// v2 → invalida chiavi vecchie (prefisso v1 era solo "notified_")
const KEY_PREFIX = 'notified_v2_'
function notifiedKey(id: string) { return `${KEY_PREFIX}${id}` }
function wasNotified(id: string) { return !!localStorage.getItem(notifiedKey(id)) }
function markNotified(id: string) { localStorage.setItem(notifiedKey(id), '1') }

export function clearAllNotified() {
  Object.keys(localStorage)
    .filter(k => k.startsWith('notified_'))
    .forEach(k => localStorage.removeItem(k))
}

async function waitForAuthReady(): Promise<boolean> {
  if (!auth) return false
  if (auth.currentUser) return true
  return new Promise(resolve => {
    let done = false
    const unsub = onAuthStateChanged(auth, user => {
      if (done) return
      done = true; unsub(); resolve(!!user)
    })
    setTimeout(() => { if (!done) { done = true; unsub(); resolve(false) } }, 5000)
  })
}

async function playAlarm() {
  try {
    const AudioCtxClass = window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtxClass()
    await ctx.resume()
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
  } catch { /* audio bloccato */ }
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
      icon:               '/icons/icon-192.png',
      badge:              '/icons/icon-192.png',
      tag,
      requireInteraction: true,
      data:               { url: '/dashboard', whatsappUrl },
      ...({ vibrate: [300, 100, 300, 100, 300] } as object),
      ...({ actions: whatsappUrl ? [{ action: 'whatsapp', title: '📱 WhatsApp' }] : [] } as object),
    } as NotificationOptions)
  } catch (err) {
    console.error('[ReminderChecker] showNotification fallita:', err)
  }
}

export interface CheckResult {
  ok: boolean
  message: string
  found: number
  notified: number
}

export async function runCheck(force = false): Promise<CheckResult> {
  if (typeof Notification === 'undefined')
    return { ok: false, message: 'Notification API non disponibile', found: 0, notified: 0 }
  if (Notification.permission !== 'granted')
    return { ok: false, message: `Permission: ${Notification.permission} (vai in Impostazioni e attiva le notifiche)`, found: 0, notified: 0 }

  const isAuthed = await waitForAuthReady()
  if (!isAuthed)
    return { ok: false, message: 'Utente non autenticato', found: 0, notified: 0 }

  let reminderMinutes = 30
  let centerName = ''
  try {
    const settingsSnap = await getDoc(doc(db, 'settings', 'main'))
    if (settingsSnap.exists()) {
      reminderMinutes = settingsSnap.data().reminder_minutes ?? 30
      centerName = settingsSnap.data().center_name ?? ''
    }
  } catch (err) {
    return { ok: false, message: `Errore lettura impostazioni: ${err}`, found: 0, notified: 0 }
  }

  const now = new Date()
  const from = now.toISOString()
  const to = new Date(now.getTime() + reminderMinutes * 60_000 + 60_000).toISOString()

  let snap
  try {
    snap = await getDocs(query(
      collection(db, 'appointments'),
      where('start_time', '>=', from),
      where('start_time', '<=', to),
    ))
  } catch (err) {
    return { ok: false, message: `Errore query Firestore: ${err}`, found: 0, notified: 0 }
  }

  const upcoming = snap.docs.filter(d => d.data().status !== 'cancelled')

  if (upcoming.length === 0)
    return { ok: true, message: `Nessun appuntamento nei prossimi ${reminderMinutes} min (finestra: ${from.slice(11,16)} – ${to.slice(11,16)} UTC)`, found: 0, notified: 0 }

  const unnotified = force ? upcoming : upcoming.filter(d => !wasNotified(d.id))
  await setAppBadge(unnotified.length)

  let alarmPlayed = false
  let notifiedCount = 0

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
      client = cSnap.data(); service = sSnap.data()
    } catch { continue }

    const time = new Date(apt.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    const clientName = `${client.first_name} ${client.last_name}`
    const serviceName = String(service.name)
    const clientPhone = client.phone as string | undefined

    const whatsappMsg = `Buongiorno ${String(client.first_name)}, la ricordiamo del suo appuntamento per ${serviceName} alle ${time}.${centerName ? ` Cordiali saluti, ${centerName}.` : ''}`
    const whatsappUrl = clientPhone ? buildWhatsAppUrl(clientPhone, whatsappMsg) : undefined

    await showSwNotification(
      `⏰ Appuntamento tra ${reminderMinutes} min`,
      `${clientName} — ${serviceName} alle ${time}`,
      docSnap.id,
      whatsappUrl,
    )

    window.dispatchEvent(new CustomEvent('appointment-reminder', {
      detail: { appointmentId: docSnap.id, clientName, serviceName, time, reminderMinutes, whatsappUrl },
    }))

    if (!alarmPlayed) { playAlarm(); alarmPlayed = true }
    markNotified(docSnap.id)
    notifiedCount++
  }

  const skipped = upcoming.length - unnotified.length
  const msg = notifiedCount > 0
    ? `✓ ${notifiedCount} notifica/e inviate`
    : skipped > 0
      ? `${skipped} appuntamento/i già notificati (localStorage). Premi "Forza" per reinviare.`
      : `0 da notificare`

  return { ok: true, message: msg, found: upcoming.length, notified: notifiedCount }
}

export function useReminderChecker() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [lastResult, setLastResult] = useState<CheckResult | null>(null)

  const check = useCallback(async (force = false) => {
    const result = await runCheck(force)
    setLastResult(result)
    return result
  }, [])

  useEffect(() => {
    const onFocus = () => setAppBadge(0)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') setAppBadge(0)
    })

    check().catch(err => console.error('[ReminderChecker]', err))
    intervalRef.current = setInterval(() => {
      check().catch(err => console.error('[ReminderChecker]', err))
    }, 60_000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('focus', onFocus)
    }
  }, [check])

  return { lastResult, forceCheck: () => check(true) }
}
