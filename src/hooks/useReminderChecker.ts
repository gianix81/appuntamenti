'use client'

import { useEffect, useRef } from 'react'
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore'
import { startOfDay, endOfDay } from 'date-fns'
import { auth, db } from '@/lib/firebase/client'
import { onAuthStateChanged } from 'firebase/auth'

// ── localStorage ──────────────────────────────────────────────
const KEY_PREFIX = 'notified_v2_'
function wasNotified(id: string) { return !!localStorage.getItem(`${KEY_PREFIX}${id}`) }
function markNotified(id: string) { localStorage.setItem(`${KEY_PREFIX}${id}`, '1') }
export function clearAllNotified() {
  Object.keys(localStorage).filter(k => k.startsWith('notified_')).forEach(k => localStorage.removeItem(k))
}

// ── Auth ──────────────────────────────────────────────────────
async function waitForAuthReady(): Promise<boolean> {
  if (!auth) return false
  if (auth.currentUser) return true
  return new Promise(resolve => {
    let done = false
    const unsub = onAuthStateChanged(auth, user => {
      if (done) return; done = true; unsub(); resolve(!!user)
    })
    setTimeout(() => { if (!done) { done = true; unsub(); resolve(false) } }, 5000)
  })
}

// ── Audio ─────────────────────────────────────────────────────
async function playAlarm() {
  try {
    const AudioCtxClass = window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtxClass()
    await ctx.resume()
    const bip = (t: number, freq = 880) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = freq
      gain.gain.setValueAtTime(0.6, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.35)
      osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.35)
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

function buildWhatsAppUrl(phone: string, msg: string) {
  const e164 = phone.replace(/[^\d+]/g, '').replace(/^\+/, '')
  return `https://wa.me/${e164}?text=${encodeURIComponent(msg)}`
}

async function showSwNotification(title: string, body: string, tag: string, whatsappUrl?: string) {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, {
      body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      tag, requireInteraction: true,
      data: { url: '/dashboard', whatsappUrl },
      ...({ vibrate: [300, 100, 300, 100, 300] } as object),
      ...({ actions: whatsappUrl ? [{ action: 'whatsapp', title: '📱 WhatsApp' }] : [] } as object),
    } as NotificationOptions)
  } catch (err) { console.error('[ReminderChecker] showNotification:', err) }
}

// ── Tipo riga appuntamento ────────────────────────────────────
interface AptRow { id: string; start_time: string; status: string; client_id: string; service_id: string }

// ── Lancia allarme per un appuntamento ───────────────────────
async function fireAlarm(apt: AptRow, reminderMinutes: number, centerName: string) {
  let client: Record<string, unknown>, service: Record<string, unknown>
  try {
    const [cSnap, sSnap] = await Promise.all([
      getDoc(doc(db, 'clients', apt.client_id)),
      getDoc(doc(db, 'services', apt.service_id)),
    ])
    if (!cSnap.exists() || !sSnap.exists()) return
    client = cSnap.data(); service = sSnap.data()
  } catch { return }

  const time = new Date(apt.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const clientName = `${client.first_name} ${client.last_name}`
  const serviceName = String(service.name)
  const clientPhone = client.phone as string | undefined

  const whatsappMsg = `Buongiorno ${String(client.first_name)}, la ricordiamo del suo appuntamento per ${serviceName} alle ${time}.${centerName ? ` Cordiali saluti, ${centerName}.` : ''}`
  const whatsappUrl = clientPhone ? buildWhatsAppUrl(clientPhone, whatsappMsg) : undefined

  await showSwNotification(`⏰ Appuntamento tra ${reminderMinutes} min`, `${clientName} — ${serviceName} alle ${time}`, apt.id, whatsappUrl)
  window.dispatchEvent(new CustomEvent('appointment-reminder', {
    detail: { appointmentId: apt.id, clientName, serviceName, time, reminderMinutes, whatsappUrl },
  }))
  playAlarm()
  setAppBadge(1)
}

// ── Check on-demand (usato da "Verifica ora" in impostazioni) ─
export interface CheckResult { ok: boolean; message: string; found: number; notified: number }

export async function runCheck(force = false): Promise<CheckResult> {
  if (typeof Notification === 'undefined')
    return { ok: false, message: 'Notification API non disponibile', found: 0, notified: 0 }
  if (Notification.permission !== 'granted')
    return { ok: false, message: `Permission: ${Notification.permission}`, found: 0, notified: 0 }

  const isAuthed = await waitForAuthReady()
  if (!isAuthed) return { ok: false, message: 'Utente non autenticato', found: 0, notified: 0 }

  let reminderMinutes = 30; let centerName = ''
  try {
    const s = await getDoc(doc(db, 'settings', 'main'))
    if (s.exists()) { reminderMinutes = s.data().reminder_minutes ?? 30; centerName = s.data().center_name ?? '' }
  } catch (err) { return { ok: false, message: `Errore settings: ${err}`, found: 0, notified: 0 } }

  const now = new Date()
  const from = now.toISOString()
  const to   = new Date(now.getTime() + reminderMinutes * 60_000 + 60_000).toISOString()

  let snap
  try {
    snap = await (await import('firebase/firestore')).getDocs(query(
      collection(db, 'appointments'),
      where('start_time', '>=', from),
      where('start_time', '<=', to),
    ))
  } catch (err) { return { ok: false, message: `Errore query: ${err}`, found: 0, notified: 0 } }

  const upcoming = snap.docs.filter(d => d.data().status !== 'cancelled')
  if (upcoming.length === 0)
    return { ok: true, message: `Nessun appuntamento nei prossimi ${reminderMinutes} min (UTC: ${from.slice(11,16)}–${to.slice(11,16)})`, found: 0, notified: 0 }

  const toNotify = force ? upcoming : upcoming.filter(d => !wasNotified(d.id))
  let notifiedCount = 0
  for (const d of toNotify) {
    await fireAlarm({ id: d.id, ...d.data() } as AptRow, reminderMinutes, centerName)
    markNotified(d.id)
    notifiedCount++
  }

  const skipped = upcoming.length - toNotify.length
  return {
    ok: true,
    message: notifiedCount > 0
      ? `✓ ${notifiedCount} notifica/e inviate`
      : `${skipped} già notificato/i. Premi di nuovo per forzare.`,
    found: upcoming.length,
    notified: notifiedCount,
  }
}

// ── Hook principale — sveglia basata sull'orologio ────────────
export function useReminderChecker() {
  const todayAptsRef     = useRef<AptRow[]>([])
  const reminderMinsRef  = useRef(30)
  const centerNameRef    = useRef('')
  const alarmFiredRef    = useRef<Set<string>>(new Set())

  // Carica impostazioni una volta sola
  useEffect(() => {
    waitForAuthReady().then(authed => {
      if (!authed) return
      getDoc(doc(db, 'settings', 'main')).then(snap => {
        if (snap.exists()) {
          reminderMinsRef.current = snap.data().reminder_minutes ?? 30
          centerNameRef.current   = snap.data().center_name ?? ''
        }
      }).catch(() => {})
    })
  }, [])

  // Sottoscrizione real-time agli appuntamenti di oggi
  useEffect(() => {
    let unsub: (() => void) | undefined
    waitForAuthReady().then(authed => {
      if (!authed) return
      const today = new Date()
      unsub = onSnapshot(
        query(
          collection(db, 'appointments'),
          where('start_time', '>=', startOfDay(today).toISOString()),
          where('start_time', '<=', endOfDay(today).toISOString()),
        ),
        snap => { todayAptsRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() } as AptRow)) },
        err  => console.error('[ReminderChecker] snapshot error:', err),
      )
    })
    return () => unsub?.()
  }, [])

  // ── SVEGLIA: controlla ogni secondo (sfrutta l'orologio) ────
  useEffect(() => {
    const tick = setInterval(() => {
      if (typeof Notification === 'undefined') return
      if (Notification.permission !== 'granted') return

      const now        = new Date()
      const reminderMs = reminderMinsRef.current * 60_000

      for (const apt of todayAptsRef.current) {
        if (apt.status === 'cancelled') continue
        if (alarmFiredRef.current.has(apt.id)) continue
        if (wasNotified(apt.id)) { alarmFiredRef.current.add(apt.id); continue }

        const msUntil = new Date(apt.start_time).getTime() - now.getTime()

        // Entra nella finestra → scatta la sveglia
        if (msUntil > 0 && msUntil <= reminderMs) {
          alarmFiredRef.current.add(apt.id)
          markNotified(apt.id)
          fireAlarm(apt, reminderMinsRef.current, centerNameRef.current)
            .catch(err => console.error('[ReminderChecker] fireAlarm:', err))
        }
      }
    }, 1000)

    return () => clearInterval(tick)
  }, []) // deps vuote: legge solo da ref, non ha stale closure

  // Azzera badge quando l'utente torna sull'app
  useEffect(() => {
    const onFocus = () => setAppBadge(0)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') setAppBadge(0)
    })
    return () => window.removeEventListener('focus', onFocus)
  }, [])
}
