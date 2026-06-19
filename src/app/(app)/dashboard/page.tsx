'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  format, isToday, isSameDay, startOfDay, endOfDay, addMonths, subMonths,
} from 'date-fns'
import { it } from 'date-fns/locale'
import { collection, getDocs, getDoc, doc, query, where, orderBy } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase/client'
import type { AppointmentWithRelations, Client, Service } from '@/types/database'
import { AppointmentCard } from '@/components/appointments/AppointmentCard'
import {
  triggerAlarm, wasNotified, markNotified, wasNowNotified, markNowNotified,
} from '@/hooks/useReminderChecker'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { CalendarDays, Plus, ChevronLeft, ChevronRight, Bell, BellOff } from 'lucide-react'
import Link from 'next/link'

function waitForAuth() {
  return new Promise<boolean>(resolve => {
    const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(!!user) })
  })
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
  const [date, setDate]               = useState(new Date())
  const [calMonth, setCalMonth]       = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [stats, setStats]             = useState({ total: 0, pending: 0, confirmed: 0 })
  const [reminderMins, setReminderMins] = useState(30)
  const [centerName, setCenterName]     = useState('')

  // Refs per deduplicazione allarmi (questa sessione)
  const alarmFiredRef    = useRef<Set<string>>(new Set())
  const nowAlarmFiredRef = useRef<Set<string>>(new Set())

  // Orologio live
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Stato campanello
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default')
  useEffect(() => {
    if (typeof Notification !== 'undefined') setNotifPerm(Notification.permission)
  }, [])

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
      if (!authed) { setError('Sessione scaduta. Ricarica la pagina.'); return }
      await auth.currentUser?.getIdToken()
      const [list, settingsSnap] = await Promise.all([
        fetchDayAppointments(date),
        getDoc(doc(db, 'settings', 'main')),
      ])
      if (settingsSnap.exists()) {
        setReminderMins(settingsSnap.data().reminder_minutes ?? 30)
        setCenterName(settingsSnap.data().center_name ?? '')
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
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return
    if (!appointments.length) return

    const reminderMs = reminderMins * 60_000

    for (const apt of appointments) {
      if (apt.status === 'cancelled') continue
      const msUntil = new Date(apt.start_time).getTime() - now.getTime()

      // Allarme promemoria (N minuti prima)
      if (!alarmFiredRef.current.has(apt.id)) {
        if (wasNotified(apt.id)) {
          alarmFiredRef.current.add(apt.id)
        } else if (msUntil > 0 && msUntil <= reminderMs) {
          alarmFiredRef.current.add(apt.id)
          markNotified(apt.id)
          triggerAlarm(
            apt.id,
            `${apt.clients.first_name} ${apt.clients.last_name}`,
            apt.services.name,
            apt.start_time,
            apt.clients.phone,
            centerName,
            false,
            reminderMins,
          ).catch(console.error)
        }
      }

      // Allarme ADESSO (all'orario esatto, finestra 30 sec)
      if (!nowAlarmFiredRef.current.has(apt.id)) {
        if (wasNowNotified(apt.id)) {
          nowAlarmFiredRef.current.add(apt.id)
        } else if (msUntil <= 0 && msUntil > -30_000) {
          nowAlarmFiredRef.current.add(apt.id)
          markNowNotified(apt.id)
          triggerAlarm(
            apt.id,
            `${apt.clients.first_name} ${apt.clients.last_name}`,
            apt.services.name,
            apt.start_time,
            apt.clients.phone,
            centerName,
            true,
            0,
          ).catch(console.error)
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, appointments, reminderMins, centerName])

  function selectDay(day: Date) {
    setDate(day)
    // Se il giorno selezionato è in un mese diverso, porta il calendario lì
    if (day.getMonth() !== calMonth.getMonth() || day.getFullYear() !== calMonth.getFullYear()) {
      setCalMonth(new Date(day.getFullYear(), day.getMonth(), 1))
    }
  }

  const cells = getMonthCells(calMonth)

  return (
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
          {/* Campanello */}
          <Link
            href="/settings"
            title={notifPerm === 'granted' ? 'Notifiche attive' : 'Attiva notifiche'}
            className={`p-2.5 rounded-xl transition-colors ${
              notifPerm === 'granted'
                ? 'bg-green-50 text-green-600 hover:bg-green-100'
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
            }`}
          >
            {notifPerm === 'granted' ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </Link>
          <Link
            href="/appointments/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuovo
          </Link>
        </div>
      </div>

      {/* ── Orologio ── */}
      <div className="bg-blue-950 rounded-2xl px-6 py-5 flex items-center justify-center gap-1 select-none">
        <span className="text-5xl font-bold text-white tabular-nums tracking-tight">
          {format(now, 'HH')}
        </span>
        <span className="text-4xl font-light text-blue-400 pb-0.5">:</span>
        <span className="text-5xl font-bold text-white tabular-nums tracking-tight">
          {format(now, 'mm')}
        </span>
        <span className="text-2xl font-light text-blue-400 pb-0.5 ml-1">
          :{format(now, 'ss')}
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
            <Link
              href="/appointments/new"
              className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Aggiungi appuntamento
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {appointments.map(apt => (
            <AppointmentCard
              key={apt.id}
              appointment={apt}
              now={isToday(date) ? now : undefined}
              reminderMins={reminderMins}
              onDelete={id => setAppointments(prev => prev.filter(a => a.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
