'use client'

import { useEffect, useState, useCallback } from 'react'
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
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { CalendarDays, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

async function waitForAuth(): Promise<boolean> {
  try {
    await (auth as typeof auth & { authStateReady(): Promise<void> }).authStateReady()
    return !!auth.currentUser
  } catch {
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

async function fetchDayAppointments(date: Date): Promise<AppointmentWithRelations[]> {
  const snap = await getDocs(query(
    collection(db, 'appointments'),
    where('start_time', '>=', startOfDay(date).toISOString()),
    where('start_time', '<=', endOfDay(date).toISOString()),
    orderBy('start_time'),
  ))

  const apts   = snap.docs.map(d => ({ id: d.id, ...d.data() })) as (AppointmentWithRelations & { client_id: string; service_id: string })[]
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

function getMonthCells(month: Date): (Date | null)[] {
  const year     = month.getFullYear()
  const m        = month.getMonth()
  const firstDay = new Date(year, m, 1)
  const lastDay  = new Date(year, m + 1, 0)
  const dow      = firstDay.getDay()
  const padding  = dow === 0 ? 6 : dow - 1
  const cells: (Date | null)[] = Array(padding).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, m, d))
  return cells
}

const WEEK_LABELS = ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do']

export default function DashboardPage() {
  const router = useRouter()
  const [date, setDate]         = useState(new Date())
  const [calMonth, setCalMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [stats, setStats]       = useState({ total: 0, pending: 0, confirmed: 0 })
  const [monthDates, setMonthDates] = useState<Set<string>>(new Set())

  // Orologio — null su server per evitare hydration mismatch (server=UTC, client=IT)
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const authed = await waitForAuth()
      if (!authed) { router.replace('/login'); return }
      await auth.currentUser?.getIdToken()
      const list = await fetchDayAppointments(date)
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
  }, [date, router])

  useEffect(() => { load() }, [load])

  function selectDay(day: Date) {
    setDate(day)
    if (day.getMonth() !== calMonth.getMonth() || day.getFullYear() !== calMonth.getFullYear()) {
      setCalMonth(new Date(day.getFullYear(), day.getMonth(), 1))
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 capitalize">
            {isToday(date) ? 'Oggi' : format(date, 'EEEE', { locale: it })}
          </h1>
          <p className="text-slate-400 text-sm capitalize">
            {format(date, 'd MMMM yyyy', { locale: it })}
          </p>
        </div>
        <Link
          href="/appointments/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuovo
        </Link>
      </div>

      {/* Orologio */}
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

      {/* Calendario */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCalMonth(m => subMonths(m, 1))} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => { setCalMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); selectDay(new Date()) }}
            className="text-sm font-semibold text-slate-700 capitalize hover:text-blue-600 transition-colors"
          >
            {format(calMonth, 'MMMM yyyy', { locale: it })}
          </button>
          <button onClick={() => setCalMonth(m => addMonths(m, 1))} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEK_LABELS.map(l => (
            <div key={l} className="text-center text-xs font-medium text-slate-400 py-1">{l}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {getMonthCells(calMonth).map((day, i) => {
            if (!day) return <div key={`e-${i}`} />
            const key        = format(day, 'yyyy-MM-dd')
            const isSelected = isSameDay(day, date)
            const hasAppts   = monthDates.has(key)
            const today      = isToday(day)
            return (
              <button
                key={key}
                onClick={() => selectDay(day)}
                className={`relative flex items-center justify-center h-9 rounded-xl text-sm font-medium transition-colors
                  ${isSelected ? 'bg-blue-600 text-white' : today ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                {day.getDate()}
                {hasAppts && !isSelected && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Stats */}
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

      {/* Lista appuntamenti */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-red-600 text-sm font-medium mb-1">Errore di connessione</p>
          <p className="text-red-500 text-xs">{error}</p>
          <button onClick={load} className="mt-4 text-sm text-blue-600 hover:text-blue-700 underline">Riprova</button>
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
              onDelete={id => setAppointments(prev => prev.filter(a => a.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
