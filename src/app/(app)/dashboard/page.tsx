'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  format, isToday, isSameDay, startOfDay, endOfDay, addMonths, subMonths,
} from 'date-fns'
import { it } from 'date-fns/locale'
import { collection, getDocs, getDoc, doc, query, where, orderBy } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase/client'
import type { AppointmentWithRelations, Client, Service } from '@/types/database'
import { AppointmentCard } from '@/components/appointments/AppointmentCard'
import { wasSlotNotified, markSlotNotified, wasNowNotified, markNowNotified } from '@/hooks/useReminderChecker'
import { buildSmsUrl, buildSmsBody } from '@/lib/sms'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { CalendarDays, Plus, ChevronLeft, ChevronRight, Bell, BellOff } from 'lucide-react'
import Link from 'next/link'

async function waitForAuth(): Promise<boolean> {
  try {
    // authStateReady() attende che Firebase ripristini la sessione da IndexedDB
    // Disponibile da Firebase 10.1+ — molto più affidabile su mobile
    await (auth as typeof auth & { authStateReady(): Promise<void> }).authStateReady()
    return !!auth.currentUser
  } catch {
    // Fallback per ambienti senza authStateReady
    if (auth.currentUser) return true
    return new Promise(resolve => {
      let done = false
      const unsub = onAuthStateChanged(auth, user => {
        if (done) return
        done = true; unsub(); resolve(!!user)
      })
      setTimeout(() => { if (!done) { done = true; unsub(); resolve(false) } }, 12000)
    })
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: Firestore non risponde. Hai creato il database in Firebase Console?')), ms)
    ),
  ])
}

async function fetchDayAppointments(date: Date): Promise<AppointmentWithRelations[]> {
  const snap = await withTimeout(getDocs(query(
    collection(db, 'appointments'),
    where('start_time', '>=', startOfDay(date).toISOString()),
    where('start_time', '<=', endOfDay(date).toISOString()),
    orderBy('start_time'),
  )), 8000)

  const apts = snap.docs.map(d => ({ id: d.id, ...d.data() })) as (AppointmentWithRelations & { client_id: string; service_id: string })[]
  const active = apts.filter(a => a.status !== 'cancelled')

  const clientIds  = [...new Set(active.map(a => a.client_id))]
  const serviceIds = [...new Set(active.map(a => a.service_id))]

  const [cSnaps, sSnaps] = await Promise.all([
    Promise.all(clientIds.map(id => getDoc(doc(db, 'clients', id)))),
    Promise.all(serviceIds.map(id => getDoc(doc(db, 'services', id)))),
  ])

  const clientMap  = Object.fromEntries(cSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Client]))
  const serviceMap = Object.fromEntries(sSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Service]))

  return active.map(a => ({ ...a, clients: clientMap[a.client_id], services: serviceMap[a.service_id] }))
}

// Genera le celle del calendario (lunedì-prima); null = cella vuota di padding
function getMonthCells(month: Date): (Date | null)[] {
  const year = month.getFullYear()
  const m    = month.getMonth()
  const firstDay = new Date(year, m, 1)
  const lastDay  = new Date(year, m + 1, 0)
  const dow = firstDay.getDay()
  const padding = dow === 0 ? 6 : dow - 1 // Mon=0 … Sun=6
  const cells: (Date | null)[] = Array(padding).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(new Date(year, m, d))
  }
  return cells
}

const WEEK_LABELS = ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do']

export default function DashboardPage() {
  const router = useRouter()
  const [date, setDate]               = useState(new Date())
  const [calMonth, setCalMonth]       = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [stats, setStats]             = useState({ total: 0, pending: 0, confirmed: 0 })
  const [notificationSlots, setNotificationSlots] = useState<Array<{ interval: number; type: 'confirmation' | 'reminder' }>>([])
  const [centerName, setCenterName]     = useState('')

  // Refs per deduplicazione allarmi (questa sessione)
  const alarmFiredRef    = useRef<Set<string>>(new Set())
  const nowAlarmFiredRef = useRef<Set<string>>(new Set())
  // AudioContext creato solo dopo un gesto utente (policy browser anti-autoplay)
  const audioCtxRef = useRef<AudioContext | null>(null)
  useEffect(() => {
    const init = () => {
      if (audioCtxRef.current) return
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audioCtxRef.current = new AC()
      } catch { /* non supportato */ }
    }
    document.addEventListener('click', init)
    document.addEventListener('touchstart', init)
    return () => { document.removeEventListener('click', init); document.removeEventListener('touchstart', init) }
  }, [])

  // Allarmi attivi mostrati inline nella pagina
  type ActiveAlarm = {
    key: string
    clientName: string
    serviceName: string
    time: string
    phone: string
    isNow: boolean
    slotType: 'confirmation' | 'reminder'
    intervalMinutes: number
  }
  const [activeAlarms, setActiveAlarms] = useState<ActiveAlarm[]>([])
  function dismissAlarm(key: string) { setActiveAlarms(p => p.filter(a => a.key !== key)) }

  // Orologio live — null server-side per evitare hydration mismatch (server=UTC, client=IT)
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Stato campanello
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default')
  useEffect(() => {
    if (typeof Notification !== 'undefined') setNotifPerm(Notification.permission)
  }, [])

  // Sincronizza app badge (numeretto sull'icona PWA) con gli allarmi attivi
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    const n = activeAlarms.length
    if (n > 0) {
      (navigator as Navigator & { setAppBadge(n: number): Promise<void> }).setAppBadge(n).catch(() => {})
    } else {
      (navigator as Navigator & { clearAppBadge(): Promise<void> }).clearAppBadge().catch(() => {})
    }
  }, [activeAlarms])

  // Punti del calendario: date del mese corrente che hanno appuntamenti
  const [monthDates, setMonthDates] = useState<Set<string>>(new Set())
  const loadMonthDates = useCallback(async (month: Date) => {
    try {
      await waitForAuth()
      const start = new Date(month.getFullYear(), month.getMonth(), 1)
      const end   = new Date(month.getFullYear(), month.getMonth() + 1, 0)
      const snap  = await getDocs(query(
        collection(db, 'appointments'),
        where('start_time', '>=', startOfDay(start).toISOString()),
        where('start_time', '<=', endOfDay(end).toISOString()),
      ))
      const dates = new Set<string>()
      snap.docs.forEach(d => {
        const data = d.data()
        if (data.status !== 'cancelled') dates.add(format(new Date(data.start_time), 'yyyy-MM-dd'))
      })
      setMonthDates(dates)
    } catch { /* silenzioso */ }
  }, [])

  useEffect(() => { loadMonthDates(calMonth) }, [calMonth, loadMonthDates])

  // Appuntamenti del giorno selezionato
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const authed = await waitForAuth()
      if (!authed) { router.replace('/login'); return }
      await auth.currentUser?.getIdToken()
      const [list, settingsSnap] = await Promise.all([
        fetchDayAppointments(date),
        getDoc(doc(db, 'settings', 'main')),
      ])
      if (settingsSnap.exists()) {
        const d = settingsSnap.data()
        setNotificationSlots(d.notification_slots ??
          ((d.reminder_intervals ?? (d.reminder_minutes ? [d.reminder_minutes] : [30]))
            .map((i: number) => ({ interval: i, type: 'reminder' as const }))))
        setCenterName(d.center_name ?? '')
      }
      setAppointments(list)
      setStats({
        total:     list.length,
        pending:   list.filter(a => a.confirmation_status === 'pending').length,
        confirmed: list.filter(a => a.confirmation_status === 'confirmed').length,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento.')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  // ── Allarme sveglia: gira ogni secondo con i dati già caricati ──
  useEffect(() => {
    if (!now || !appointments.length || !isToday(date)) return

    for (const apt of appointments) {
      if (apt.status === 'cancelled') continue
      if (!apt.clients || !apt.services) continue
      const msUntil = new Date(apt.start_time).getTime() - now.getTime()
      const time = new Date(apt.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      const clientName = `${apt.clients.first_name ?? ''} ${apt.clients.last_name ?? ''}`.trim() || 'Cliente'

      for (const slot of notificationSlots) {
        const alarmKey   = `${apt.id}_${slot.interval}_${slot.type}`
        const reminderMs = slot.interval * 60_000

        if (!alarmFiredRef.current.has(alarmKey)) {
          if (wasSlotNotified(apt.id, slot.interval, slot.type)) {
            alarmFiredRef.current.add(alarmKey)
          } else if (msUntil > 0 && msUntil <= reminderMs) {
            alarmFiredRef.current.add(alarmKey)
            markSlotNotified(apt.id, slot.interval, slot.type)
            setActiveAlarms(p => p.some(a => a.key === alarmKey) ? p : [...p, {
              key: alarmKey, clientName, serviceName: apt.services.name ?? '',
              time, phone: apt.clients.phone ?? '',
              isNow: false, slotType: slot.type, intervalMinutes: slot.interval,
            }])
            playBeep(false)
          }
        }
      }

      if (!nowAlarmFiredRef.current.has(apt.id)) {
        if (wasNowNotified(apt.id)) {
          nowAlarmFiredRef.current.add(apt.id)
        } else if (msUntil <= 0 && msUntil > -30_000) {
          nowAlarmFiredRef.current.add(apt.id)
          markNowNotified(apt.id)
          const key = `${apt.id}_now`
          setActiveAlarms(p => p.some(a => a.key === key) ? p : [...p, {
            key, clientName, serviceName: apt.services.name ?? '',
            time, phone: apt.clients.phone ?? '',
            isNow: true, slotType: 'reminder', intervalMinutes: 0,
          }])
          playBeep(true)
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, appointments, notificationSlots, centerName, date])

  function selectDay(day: Date) {
    setDate(day)
    // Se il giorno selezionato è in un mese diverso, porta il calendario lì
    if (day.getMonth() !== calMonth.getMonth() || day.getFullYear() !== calMonth.getFullYear()) {
      setCalMonth(new Date(day.getFullYear(), day.getMonth(), 1))
    }
  }

  function playBeep(intense: boolean) {
    const ctx = audioCtxRef.current
    if (!ctx) return
    ctx.resume().then(() => {
      try {
        const bip = (t: number, f = 880, dur = 0.4) => {
          const o = ctx.createOscillator(); const g = ctx.createGain()
          o.connect(g); g.connect(ctx.destination)
          o.type = 'square'; o.frequency.value = f
          g.gain.setValueAtTime(0.8, ctx.currentTime + t)
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur)
          o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + dur + 0.05)
        }
        if (intense) { bip(0, 1046); bip(0.5, 880); bip(1.0, 1046); bip(1.5, 1318) }
        else { bip(0); bip(0.5); bip(1.0) }
      } catch { /* audio bloccato */ }
    }).catch(() => {})
  }

  function testAlarm() {
    const apt = appointments[0]
    if (!apt) { alert('Nessun appuntamento oggi per testare'); return }
    const time = new Date(apt.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    const key = apt.id + '_test_' + Date.now()
    const clientName = apt.clients
      ? `${apt.clients.first_name ?? ''} ${apt.clients.last_name ?? ''}`.trim() || 'Cliente'
      : 'Cliente'
    const serviceName = apt.services?.name ?? 'Servizio'

    // 1. Banner inline
    setActiveAlarms(p => [...p, { key, clientName, serviceName, time, phone: apt.clients?.phone ?? '', isNow: false, slotType: 'reminder', intervalMinutes: 60 }])

    // 2. Suono
    playBeep(false)

    // 3. Notifica OS ("tendina") — desktop: new Notification, mobile: SW
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(`⏰ TEST — ${clientName}`, {
          body: `${serviceName} alle ${time}`,
          icon: '/icons/icon-192.png',
          requireInteraction: true,
          tag: key,
        })
      } catch {
        navigator.serviceWorker?.ready
          .then(reg => reg.showNotification(`⏰ TEST — ${clientName}`, {
            body: `${serviceName} alle ${time}`,
            icon: '/icons/icon-192.png',
            requireInteraction: true,
            tag: key,
          } as NotificationOptions))
          .catch(() => {})
      }
    } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => {
        if (p === 'granted') alert('Notifiche attivate! Premi di nuovo 🔔 per testare.')
      })
    }
  }

  const cells = getMonthCells(calMonth)

  return (
    <>
      {/* ── ALLARMI ATTIVI ── fuori da qualsiasi container per garantire fixed viewport-level ── */}
      {activeAlarms.map(alarm => {
        const smsBody = buildSmsBody(alarm.slotType, {
          firstName: alarm.clientName.split(' ')[0],
          lastName: alarm.clientName.split(' ').slice(1).join(' '),
          serviceName: alarm.serviceName,
          startTime: (() => { const d = new Date(); const [h, m] = alarm.time.split(':'); d.setHours(+h, +m, 0); return d.toISOString() })(),
          centerName,
          intervalMinutes: alarm.intervalMinutes,
        })
        const smsUrl = alarm.phone ? buildSmsUrl(alarm.phone, smsBody) : null
        const waUrl  = alarm.phone ? `https://wa.me/${alarm.phone.replace(/\D/g, '')}?text=${encodeURIComponent(smsBody)}` : null
        return (
          <div key={alarm.key} className={`fixed inset-x-0 top-0 z-[9999] p-3 ${alarm.isNow ? 'bg-red-600' : 'bg-blue-700'}`}>
            <div className="max-w-lg mx-auto">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-white font-bold text-sm">
                  {alarm.isNow ? '⚡ ADESSO!' : `⏰ Tra ${alarm.intervalMinutes} min`}
                  {' — '}{alarm.clientName} · {alarm.serviceName} alle {alarm.time}
                </p>
                <button onClick={() => dismissAlarm(alarm.key)} className="text-white/70 hover:text-white text-xl leading-none shrink-0">✕</button>
              </div>
              <div className="flex gap-2">
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noopener noreferrer"
                    className="flex-1 text-center bg-[#25D366] text-white text-xs font-bold py-2 rounded-lg">
                    💬 WhatsApp
                  </a>
                )}
                {smsUrl && (
                  <a href={smsUrl}
                    className={`flex-1 text-center text-white text-xs font-bold py-2 rounded-lg ${alarm.slotType === 'confirmation' ? 'bg-sky-400' : 'bg-amber-400'}`}>
                    📱 {alarm.slotType === 'confirmation' ? 'SMS Conferma' : 'SMS Promemoria'}
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}

    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full space-y-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 capitalize">
            {isToday(date) ? 'Oggi' : format(date, 'EEEE', { locale: it })}
          </h1>
          <p className="text-slate-400 text-sm capitalize">
            {format(date, 'd MMMM yyyy', { locale: it })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Campanella: click = test allarme, tasto impostazioni separato */}
          <button
            onClick={testAlarm}
            title={notifPerm === 'granted' ? 'Test allarme' : 'Attiva notifiche'}
            className={`relative p-2.5 rounded-xl transition-colors ${
              notifPerm === 'granted'
                ? 'bg-green-50 text-green-600 hover:bg-green-100'
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
            }`}
          >
            {notifPerm === 'granted' ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            {activeAlarms.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none ring-2 ring-white">
                {activeAlarms.length}
              </span>
            )}
          </button>
          <Link
            href="/appointments/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuovo
          </Link>
        </div>
      </div>

      {/* ── Orologio ── now=null sul server (SSR) per evitare hydration mismatch UTC vs IT */}
      <div className="bg-blue-950 rounded-2xl px-6 py-5 flex items-center justify-center gap-1 select-none">
        <span suppressHydrationWarning className="text-5xl font-bold text-white tabular-nums tracking-tight">
          {now ? format(now, 'HH') : '--'}
        </span>
        <span className="text-4xl font-light text-blue-400 pb-0.5">:</span>
        <span suppressHydrationWarning className="text-5xl font-bold text-white tabular-nums tracking-tight">
          {now ? format(now, 'mm') : '--'}
        </span>
        <span suppressHydrationWarning className="text-2xl font-light text-blue-400 pb-0.5 ml-1">
          :{now ? format(now, 'ss') : '--'}
        </span>
      </div>

      {/* ── Mini calendario ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        {/* Navigazione mese */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setCalMonth(m => subMonths(m, 1))}
            className="p-2 hover:bg-slate-50 rounded-xl transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => { setCalMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); selectDay(new Date()) }}
            className="text-sm font-semibold text-slate-700 capitalize hover:text-blue-600 transition-colors"
          >
            {format(calMonth, 'MMMM yyyy', { locale: it })}
          </button>
          <button
            onClick={() => setCalMonth(m => addMonths(m, 1))}
            className="p-2 hover:bg-slate-50 rounded-xl transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Intestazione giorni settimana */}
        <div className="grid grid-cols-7 mb-1">
          {WEEK_LABELS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
          ))}
        </div>

        {/* Celle giorni */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={`pad-${i}`} className="py-1" />
            const dateStr    = format(day, 'yyyy-MM-dd')
            const isSelected = isSameDay(day, date)
            const isTod      = isToday(day)
            const hasDot     = monthDates.has(dateStr)

            return (
              <button
                key={dateStr}
                onClick={() => selectDay(day)}
                className="flex flex-col items-center gap-0.5 py-1 rounded-xl transition-colors hover:bg-slate-50"
              >
                <span className={`text-xs w-7 h-7 flex items-center justify-center rounded-full font-medium transition-colors
                  ${isSelected ? (isTod ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-800') : ''}
                  ${!isSelected && isTod ? 'text-blue-600 font-bold ring-1 ring-blue-400' : ''}
                  ${!isSelected && !isTod ? 'text-slate-700' : ''}
                `}>
                  {day.getDate()}
                </span>
                <span className={`w-1 h-1 rounded-full ${hasDot ? (isSelected ? 'bg-white/70' : 'bg-blue-500') : 'invisible'}`} />
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Statistiche giorno ── */}
      {!loading && !error && appointments.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 p-3 text-center">
            <p className="text-xl font-bold text-slate-800">{stats.total}</p>
            <p className="text-xs text-slate-400">Totali</p>
          </div>
          <div className="bg-white rounded-2xl border border-yellow-100 p-3 text-center">
            <p className="text-xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-xs text-slate-400">In attesa</p>
          </div>
          <div className="bg-white rounded-2xl border border-green-100 p-3 text-center">
            <p className="text-xl font-bold text-green-600">{stats.confirmed}</p>
            <p className="text-xs text-slate-400">Confermati</p>
          </div>
        </div>
      )}

      {/* ── Lista appuntamenti ── */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-red-600 text-sm font-medium mb-1">Errore di connessione</p>
          <p className="text-red-500 text-xs">{error}</p>
          <button onClick={load} className="mt-4 text-sm text-blue-600 hover:text-blue-700 underline">
            Riprova
          </button>
        </div>
      ) : appointments.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nessun appuntamento"
          description={`Nessun appuntamento per ${isToday(date) ? 'oggi' : format(date, 'd MMMM', { locale: it })}.`}
          action={
            <div className="flex flex-col items-center gap-3">
              <Link
                href="/appointments/new"
                className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Aggiungi appuntamento
              </Link>
              <Link href="/appointments" className="text-sm text-blue-500 hover:underline">
                Vai all&apos;Agenda →
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {appointments.map(apt => (
            <AppointmentCard
              key={apt.id}
              appointment={apt}
              now={isToday(date) && now ? now : undefined}
              reminderMins={notificationSlots.length > 0 ? Math.min(...notificationSlots.map(s => s.interval)) : 30}
              onDelete={id => setAppointments(prev => prev.filter(a => a.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
    </>
  )
}
