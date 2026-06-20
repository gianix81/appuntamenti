'use client'

import { useEffect, useRef, useCallback } from 'react'
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore'
import { startOfDay, endOfDay } from 'date-fns'
import { auth, db } from '@/lib/firebase/client'
import { onAuthStateChanged } from 'firebase/auth'
import { buildSmsUrl } from '@/lib/sms'

// ── localStorage ──────────────────────────────────────────────
const KEY_NOW      = (id: string) => `now_v2_${id}`
const KEY_INTERVAL = (id: string, interval: number) => `notified_r${interval}_${id}`
const KEY_SLOT     = (id: string, interval: number, type: string) => `notified_${type}_${interval}_${id}`
// mantenuti per retrocompatibilità (usati anche dal dashboard)
export const wasNotified          = (id: string) => !!localStorage.getItem(`notified_v2_${id}`)
export const markNotified         = (id: string) => localStorage.setItem(`notified_v2_${id}`, '1')
export const wasNowNotified       = (id: string) => !!localStorage.getItem(KEY_NOW(id))
export const markNowNotified      = (id: string) => localStorage.setItem(KEY_NOW(id), '1')
export const wasIntervalNotified  = (id: string, interval: number) => !!localStorage.getItem(KEY_INTERVAL(id, interval))
export const markIntervalNotified = (id: string, interval: number) => localStorage.setItem(KEY_INTERVAL(id, interval), '1')
export const wasSlotNotified      = (id: string, interval: number, type: string) => !!localStorage.getItem(KEY_SLOT(id, interval, type))
export const markSlotNotified     = (id: string, interval: number, type: string) => localStorage.setItem(KEY_SLOT(id, interval, type), '1')
export function clearAllNotified() {
  Object.keys(localStorage).filter(k => k.startsWith('notified_') || k.startsWith('now_v2_')).forEach(k => localStorage.removeItem(k))
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
    setTimeout(() => { if (!done) { done = true; unsub(); resolve(false) } }, 6000)
  })
}

// ── Badge ─────────────────────────────────────────────────────
async function setAppBadge(n: number) {
  if (!('setAppBadge' in navigator)) return
  try {
    if (n > 0) await (navigator as Navigator & { setAppBadge(n: number): Promise<void> }).setAppBadge(n)
    else        await (navigator as Navigator & { clearAppBadge(): Promise<void> }).clearAppBadge()
  } catch { /* non supportato */ }
}

// ── Suono ─────────────────────────────────────────────────────
async function playAlarm(intense = false) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    await ctx.resume()
    const bip = (t: number, f = 880, vol = 0.7, dur = 0.35) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.type = 'square'; o.frequency.value = f
      g.gain.setValueAtTime(vol, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur)
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + dur)
    }
    if (intense) {
      // suono urgente: 5 beep acuti alternati
      bip(0,    1046, 0.9, 0.4)
      bip(0.5,  880,  0.9, 0.4)
      bip(1.0,  1046, 0.9, 0.4)
      bip(1.5,  880,  0.9, 0.4)
      bip(2.0,  1318, 0.9, 0.6) // nota finale più alta e lunga
    } else {
      bip(0); bip(0.45); bip(0.9)
    }
  } catch { /* audio bloccato */ }
}

// ── WhatsApp ──────────────────────────────────────────────────
function buildWhatsAppUrl(phone: string, msg: string) {
  return `https://wa.me/${phone.replace(/[^\d+]/g, '').replace(/^\+/, '')}?text=${encodeURIComponent(msg)}`
}

// ── SW notification (fire-and-forget, 3s timeout) ────────────
function showSwNotification(
  title: string,
  body: string,
  tag: string,
  whatsappUrl?: string,
  vibrate = [500, 100, 500, 100, 500, 100, 500],
) {
  if (!('serviceWorker' in navigator)) return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

  const timeout = new Promise<ServiceWorkerRegistration>((_, reject) =>
    setTimeout(() => reject(new Error('SW timeout')), 3000)
  )
  Promise.race([navigator.serviceWorker.ready, timeout])
    .then(reg => reg.showNotification(title, {
      body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      tag, requireInteraction: true, silent: false,
      data: { url: '/dashboard', whatsappUrl },
      ...({ vibrate } as object),
      ...({ renotify: true } as object),
      ...({ actions: whatsappUrl ? [{ action: 'whatsapp', title: '📱 WhatsApp' }] : [] } as object),
    } as NotificationOptions))
    .catch(err => console.warn('[Reminder] SW push:', err))
}

// ── Tipo ─────────────────────────────────────────────────────
interface AptRow { id: string; start_time: string; status: string; client_id: string; service_id: string }

// ── Allarme con dati già risolti (usato dal dashboard) ────────
export async function triggerAlarm(
  aptId: string,
  clientName: string,
  serviceName: string,
  startTime: string,
  phone: string | undefined,
  centerName: string,
  isNow: boolean,
  mins: number,
  slotType: 'confirmation' | 'reminder' = 'reminder',
) {
  const time = new Date(startTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const firstName = clientName.split(' ')[0]
  const msg = `Buongiorno ${firstName}, la ricordiamo del suo appuntamento per ${serviceName} alle ${time}.${centerName ? ` Cordiali saluti, ${centerName}.` : ''}`
  const whatsappUrl = phone ? buildWhatsAppUrl(phone, msg) : undefined
  const smsUrl      = phone ? buildSmsUrl(phone, msg) : undefined

  const title   = isNow ? `⚡ Appuntamento ADESSO!` : `⏰ Appuntamento tra ${mins} min`
  const body    = isNow ? `${clientName} — ${serviceName} · ore ${time}` : `${clientName} — ${serviceName} alle ${time}`
  const tag     = isNow ? `${aptId}_now` : aptId
  const vibrate = isNow ? [1000, 200, 1000, 200, 1000, 200, 1000, 200, 1000] : [500, 100, 500, 100, 500, 100, 500]

  // 1. Popup in-app + suono IMMEDIATAMENTE (nessun await)
  window.dispatchEvent(new CustomEvent('appointment-reminder', {
    detail: { appointmentId: aptId, clientName, serviceName, time, reminderMinutes: mins, intervalMinutes: mins, slotType, whatsappUrl, smsUrl },
  }))
  playAlarm(isNow)
  setAppBadge(1)

  // 2. Push SW (fire-and-forget)
  showSwNotification(title, body, tag, whatsappUrl, vibrate)
}

// ── Lancia allarme per un singolo appuntamento ────────────────
async function fireAlarm(apt: AptRow, mins: number, centerName: string, isNow = false, slotType: 'confirmation' | 'reminder' = 'reminder') {
  let client: Record<string, unknown>, service: Record<string, unknown>
  try {
    const [c, s] = await Promise.all([
      getDoc(doc(db, 'clients',  apt.client_id)),
      getDoc(doc(db, 'services', apt.service_id)),
    ])
    if (!c.exists() || !s.exists()) return
    client = c.data(); service = s.data()
  } catch { return }

  const time        = new Date(apt.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const clientName  = `${client.first_name} ${client.last_name}`
  const serviceName = String(service.name)
  const phone       = client.phone as string | undefined
  const msg         = `Buongiorno ${String(client.first_name)}, la ricordiamo del suo appuntamento per ${serviceName} alle ${time}.${centerName ? ` Cordiali saluti, ${centerName}.` : ''}`
  const whatsappUrl = phone ? buildWhatsAppUrl(phone, msg) : undefined
  const smsUrl      = phone ? buildSmsUrl(phone, msg) : undefined

  const title   = isNow ? `⚡ Appuntamento ADESSO!` : `⏰ Appuntamento tra ${mins} min`
  const body    = isNow ? `${clientName} — ${serviceName} · ore ${time}` : `${clientName} — ${serviceName} alle ${time}`
  const tag     = isNow ? `${apt.id}_now` : apt.id
  const vibrate = isNow
    ? [1000, 200, 1000, 200, 1000, 200, 1000, 200, 1000]
    : [500,  100,  500,  100,  500,  100,  500]

  // 1. Popup in-app + suono IMMEDIATAMENTE
  window.dispatchEvent(new CustomEvent('appointment-reminder', {
    detail: { appointmentId: apt.id, clientName, serviceName, time, reminderMinutes: mins, intervalMinutes: mins, slotType, whatsappUrl, smsUrl },
  }))
  playAlarm(isNow)
  setAppBadge(1)

  // 2. Push SW (fire-and-forget)
  showSwNotification(title, body, tag, whatsappUrl, vibrate)
}

// ── Check on-demand per "Verifica ora" ────────────────────────
export interface CheckResult { ok: boolean; message: string; found: number; notified: number }

export async function runCheck(force = false): Promise<CheckResult> {
  if (typeof Notification === 'undefined')
    return { ok: false, message: 'Notification API non disponibile', found: 0, notified: 0 }
  if (Notification.permission !== 'granted')
    return { ok: false, message: `Permesso: ${Notification.permission}`, found: 0, notified: 0 }

  const authed = await waitForAuthReady()
  if (!authed) return { ok: false, message: 'Utente non autenticato', found: 0, notified: 0 }

  let slots: Array<{ interval: number; type: 'confirmation' | 'reminder' }> = [{ interval: 30, type: 'reminder' }]
  let centerName = ''
  try {
    const s = await getDoc(doc(db, 'settings', 'main'))
    if (s.exists()) {
      const d = s.data()
      slots = d.notification_slots ??
        ((d.reminder_intervals ?? (d.reminder_minutes ? [d.reminder_minutes] : [30]))
          .map((i: number) => ({ interval: i, type: 'reminder' as const })))
      centerName = d.center_name ?? ''
    }
  } catch (err) { return { ok: false, message: `Errore settings: ${err}`, found: 0, notified: 0 } }

  const maxInterval = slots.length > 0 ? Math.max(...slots.map(s => s.interval)) : 30
  const now  = new Date()
  const from = now.toISOString()
  const to   = new Date(now.getTime() + maxInterval * 60_000 + 60_000).toISOString()

  let snap
  try {
    snap = await getDocs(query(collection(db, 'appointments'), where('start_time', '>=', from), where('start_time', '<=', to)))
  } catch (err) { return { ok: false, message: `Errore query Firestore: ${err}`, found: 0, notified: 0 } }

  const upcoming = snap.docs.filter(d => d.data().status !== 'cancelled')
  if (upcoming.length === 0)
    return { ok: true, message: `Nessun app. nei prossimi ${maxInterval} min (UTC ${from.slice(11,16)}–${to.slice(11,16)})`, found: 0, notified: 0 }

  let count = 0
  for (const d of upcoming) {
    const msUntil = new Date(d.data().start_time).getTime() - now.getTime()
    for (const slot of slots) {
      if (msUntil > 0 && msUntil <= slot.interval * 60_000) {
        if (force || !wasSlotNotified(d.id, slot.interval, slot.type)) {
          await fireAlarm({ id: d.id, ...d.data() } as AptRow, slot.interval, centerName, false, slot.type)
          markSlotNotified(d.id, slot.interval, slot.type)
          count++
        }
      }
    }
  }

  return {
    ok: true,
    message: count > 0 ? `✓ ${count} notifica/e inviate` : `${upcoming.length} già notificato/i`,
    found: upcoming.length, notified: count,
  }
}

// ── Hook principale ───────────────────────────────────────────
export function useReminderChecker() {
  const todayAptsRef         = useRef<AptRow[]>([])
  const notificationSlotsRef = useRef<Array<{ interval: number; type: 'confirmation' | 'reminder' }>>([])
  const centerNameRef        = useRef('')
  const alarmFiredRef   = useRef<Set<string>>(new Set())
  const nowFiredRef     = useRef<Set<string>>(new Set())
  const loadedRef       = useRef(false)

  // ── Logica allarme estratta (usata sia dal tick che da loadData) ─────────
  const runAlarmCheck = useCallback(() => {
    if (!loadedRef.current) return
    const now = new Date()

    for (const apt of todayAptsRef.current) {
      if (apt.status === 'cancelled') continue
      const msUntil = new Date(apt.start_time).getTime() - now.getTime()

      for (const slot of notificationSlotsRef.current) {
        const alarmKey   = `${apt.id}_${slot.interval}_${slot.type}`
        const reminderMs = slot.interval * 60_000
        if (!alarmFiredRef.current.has(alarmKey)) {
          if (wasSlotNotified(apt.id, slot.interval, slot.type)) {
            alarmFiredRef.current.add(alarmKey)
          } else if (msUntil > 0 && msUntil <= reminderMs) {
            alarmFiredRef.current.add(alarmKey)
            markSlotNotified(apt.id, slot.interval, slot.type)
            fireAlarm(apt, slot.interval, centerNameRef.current, false, slot.type)
              .catch(err => console.error('[Reminder] fireAlarm:', err))
          }
        }
      }

      if (!nowFiredRef.current.has(apt.id)) {
        if (wasNowNotified(apt.id)) {
          nowFiredRef.current.add(apt.id)
        } else if (msUntil <= 0 && msUntil > -30_000) {
          nowFiredRef.current.add(apt.id)
          markNowNotified(apt.id)
          fireAlarm(apt, 0, centerNameRef.current, true, 'reminder')
            .catch(err => console.error('[Reminder] fireAlarm now:', err))
        }
      }
    }
  }, [])

  // Carica impostazioni + appuntamenti di oggi
  const loadData = useCallback(async () => {
    const authed = await waitForAuthReady()
    if (!authed) return
    try {
      const s = await getDoc(doc(db, 'settings', 'main'))
      if (s.exists()) {
        const d = s.data()
        notificationSlotsRef.current = d.notification_slots ??
          ((d.reminder_intervals ?? (d.reminder_minutes ? [d.reminder_minutes] : [30]))
            .map((i: number) => ({ interval: i, type: 'reminder' as const })))
        centerNameRef.current = d.center_name ?? ''
      }
    } catch { /* ignora */ }
    try {
      const today = new Date()
      const snap  = await getDocs(query(
        collection(db, 'appointments'),
        where('start_time', '>=', startOfDay(today).toISOString()),
        where('start_time', '<=', endOfDay(today).toISOString()),
      ))
      todayAptsRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() } as AptRow))
      loadedRef.current = true
      // Controlla subito dopo il caricamento, senza aspettare il prossimo tick
      runAlarmCheck()
    } catch (err) { console.error('[Reminder] caricamento appuntamenti:', err) }
  }, [runAlarmCheck])

  // Carica subito + ricarica ogni 5 minuti
  useEffect(() => {
    loadData()
    const refresh = setInterval(loadData, 5 * 60_000)
    return () => clearInterval(refresh)
  }, [loadData])

  // ── SVEGLIA: un tick ogni secondo ────────────────────────────
  useEffect(() => {
    const tick = setInterval(runAlarmCheck, 1000)
    return () => clearInterval(tick)
  }, [runAlarmCheck])

  // Azzera badge quando l'app torna in primo piano
  useEffect(() => {
    const onVisible = () => setAppBadge(0)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onVisible()
    })
    return () => window.removeEventListener('focus', onVisible)
  }, [])
}
