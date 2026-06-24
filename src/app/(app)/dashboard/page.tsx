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
import type { AppointmentWithRelations, Client, Service, Staff } from '@/types/database'
import { AppointmentCard } from '@/components/appointments/AppointmentCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight,
  Users, Scissors, Settings, UserCog, BarChart3, Package,
} from 'lucide-react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { useBusinessLevel } from '@/hooks/useBusinessLevel'

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

async function fetchDayAppointments(
  date: Date,
  staffMap: Record<string, Staff & { id: string }>,
): Promise<AppointmentWithRelations[]> {
  const snap = await getDocs(query(
    collection(db, 'appointments'),
    where('start_time', '>=', startOfDay(date).toISOString()),
    where('start_time', '<=', endOfDay(date).toISOString()),
    orderBy('start_time'),
  ))

  const apts   = snap.docs.map(d => ({ id: d.id, ...d.data() })) as (AppointmentWithRelations & { client_id: string; service_id: string; staff_id?: string | null })[]
  const active = apts.filter(a => a.status !== 'cancelled')

  const clientIds  = [...new Set(active.map(a => a.client_id))]
  const serviceIds = [...new Set(active.map(a => a.service_id))]

  const [cSnaps, sSnaps] = await Promise.all([
    Promise.all(clientIds.map(id => getDoc(doc(db, 'clients', id)))),
    Promise.all(serviceIds.map(id => getDoc(doc(db, 'services', id)))),
  ])

  const clientMap  = Object.fromEntries(cSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Client]))
  const serviceMap = Object.fromEntries(sSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Service]))

  return active.map(a => ({
    ...a,
    clients:  clientMap[a.client_id],
    services: serviceMap[a.service_id],
    staff:    a.staff_id ? (staffMap[a.staff_id] ?? null) : null,
  }))
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

function getGreeting(date: Date): string {
  const h = date.getHours()
  if (h < 12) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

const WEEK_LABELS = ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do']

const TILES = [
  { href: '/appointments', label: 'Appuntamenti', icon: CalendarDays, from: 'from-orange-400', to: 'to-rose-500',    show: true          },
  { href: '/clients',      label: 'Clienti',      icon: Users,        from: 'from-violet-500', to: 'to-purple-700',  show: true          },
  { href: '/staff',        label: 'Staff',         icon: UserCog,      from: 'from-sky-400',    to: 'to-blue-600',    show: 'staff'       },
  { href: '/services',     label: 'Servizi',       icon: Scissors,     from: 'from-emerald-400',to: 'to-teal-600',    show: true          },
  { href: '/reports',      label: 'Statistiche',   icon: BarChart3,    from: 'from-amber-400',  to: 'to-orange-600',  show: 'marketing'   },
  { href: '/inventory',    label: 'Magazzino',     icon: Package,      from: 'from-pink-400',   to: 'to-rose-600',    show: 'warehouse'   },
  { href: '/settings',     label: 'Impostazioni',  icon: Settings,     from: 'from-slate-500',  to: 'to-slate-700',   show: true          },
] as const

export default function DashboardPage() {
  const router = useRouter()
  const { hasStaff, hasMarketing, hasWarehouse } = useBusinessLevel()

  const [date, setDate]         = useState(new Date())
  const [calMonth, setCalMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [staffMap, setStaffMap] = useState<Record<string, Staff & { id: string }>>({})
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [stats, setStats]       = useState({ total: 0, pending: 0, confirmed: 0 })
  const [monthDates, setMonthDates] = useState<Set<string>>(new Set())
  const [now, setNow]           = useState<Date | null>(null)

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

  useEffect(() => {
    getDocs(query(collection(db, 'staff'), orderBy('name')))
      .then(snap => {
        const map: Record<string, Staff & { id: string }> = {}
        snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() } as Staff & { id: string } })
        setStaffMap(map)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const authed = await waitForAuth()
      if (!authed) { router.replace('/login'); return }
      await auth.currentUser?.getIdToken()
      const list = await fetchDayAppointments(date, staffMap)
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
  }, [date, router, staffMap])

  useEffect(() => { load() }, [load])

  function selectDay(day: Date) {
    setDate(day)
    if (day.getMonth() !== calMonth.getMonth() || day.getFullYear() !== calMonth.getFullYear()) {
      setCalMonth(new Date(day.getFullYear(), day.getMonth(), 1))
    }
  }

  const visibleTiles = TILES.filter(t => {
    if (t.show === true)        return true
    if (t.show === 'staff')     return hasStaff
    if (t.show === 'marketing') return hasMarketing
    if (t.show === 'warehouse') return hasWarehouse
    return false
  })

  return (
    <div className="min-h-full bg-slate-50">

      {/* ── Hero gradient ───────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 px-4 pt-8 pb-24 overflow-hidden">
        {/* Decorazioni sfondo */}
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-white/10 translate-x-24 -translate-y-24 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-56 h-56 rounded-full bg-white/10 -translate-x-16 translate-y-20 pointer-events-none" />

        <div className="relative max-w-lg mx-auto">
          {/* Saluto + data */}
          <div className="flex items-start justify-between">
            <div>
              <p suppressHydrationWarning className="text-white/70 text-sm font-medium">
                {now ? getGreeting(now) : ''}
              </p>
              <h1 className="text-white text-2xl font-bold mt-0.5 capitalize">
                {isToday(date) ? 'Oggi' : format(date, 'EEEE', { locale: it })}
                <span className="text-white/60 font-normal text-lg ml-2 capitalize">
                  {format(date, 'd MMM', { locale: it })}
                </span>
              </h1>
            </div>

            {/* Orologio digitale */}
            <div className="text-right">
              <p suppressHydrationWarning className="text-white text-2xl font-bold tabular-nums tracking-tight">
                {now ? format(now, 'HH:mm') : '--:--'}
              </p>
              <p suppressHydrationWarning className="text-white/50 text-xs tabular-nums">
                {now ? format(now, 'ss') + 's' : ''}
              </p>
            </div>
          </div>

          {/* Stat pills */}
          <div className="flex gap-2 mt-5">
            <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-2xl px-3 py-2.5 text-center border border-white/10">
              <p className="text-white text-2xl font-bold">{loading ? '—' : stats.total}</p>
              <p className="text-white/60 text-xs font-medium mt-0.5">Totali</p>
            </div>
            <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-2xl px-3 py-2.5 text-center border border-white/10">
              <p className="text-amber-300 text-2xl font-bold">{loading ? '—' : stats.pending}</p>
              <p className="text-white/60 text-xs font-medium mt-0.5">In attesa</p>
            </div>
            <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-2xl px-3 py-2.5 text-center border border-white/10">
              <p className="text-emerald-300 text-2xl font-bold">{loading ? '—' : stats.confirmed}</p>
              <p className="text-white/60 text-xs font-medium mt-0.5">Confermati</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Contenuto (sovrapposto all'hero) ────────────────────────── */}
      <div className="relative -mt-14 max-w-lg mx-auto px-4 pb-8 space-y-4">

        {/* Tile accesso rapido */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Accesso Rapido</p>
          <div className="grid grid-cols-3 gap-3">
            {visibleTiles.map(tile => (
              <Link
                key={tile.href}
                href={tile.href}
                className="group flex flex-col items-center gap-2 p-2 rounded-2xl hover:bg-slate-50 transition-colors"
              >
                <div className={clsx(
                  'w-14 h-14 rounded-2xl flex items-center justify-center shadow-md bg-gradient-to-br transition-transform group-hover:scale-105',
                  tile.from, tile.to,
                )}>
                  <tile.icon className="w-6 h-6 text-white" strokeWidth={1.8} />
                </div>
                <span className="text-xs font-semibold text-slate-600 text-center leading-tight">
                  {tile.label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Calendario */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setCalMonth(m => subMonths(m, 1))}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <button
              onClick={() => { setCalMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); selectDay(new Date()) }}
              className="text-sm font-bold text-slate-700 capitalize hover:text-blue-600 transition-colors"
            >
              {format(calMonth, 'MMMM yyyy', { locale: it })}
            </button>
            <button
              onClick={() => setCalMonth(m => addMonths(m, 1))}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEK_LABELS.map(l => (
              <div key={l} className="text-center text-xs font-semibold text-slate-300 py-1">{l}</div>
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
                  className={clsx(
                    'relative flex items-center justify-center h-9 rounded-xl text-sm font-semibold transition-all',
                    isSelected
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-200'
                      : today
                      ? 'bg-blue-50 text-blue-600'
                      : 'hover:bg-slate-50 text-slate-700',
                  )}
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

        {/* Sezione agenda del giorno */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-700 capitalize">
              {isToday(date)
                ? 'Agenda di oggi'
                : format(date, "EEEE d MMMM", { locale: it })}
              {!loading && (
                <span className="ml-2 text-slate-400 font-normal">
                  · {appointments.length} appuntament{appointments.length === 1 ? 'o' : 'i'}
                </span>
              )}
            </h2>
          </div>

          {loading ? (
            <LoadingState />
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
              <p className="text-red-600 text-sm font-semibold mb-1">Errore di connessione</p>
              <p className="text-red-400 text-xs mb-3">{error}</p>
              <button
                onClick={load}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium underline"
              >
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
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity shadow-md shadow-blue-200"
                >
                  <Plus className="w-4 h-4" /> Nuovo appuntamento
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
      </div>

      {/* FAB — Nuovo appuntamento */}
      <Link
        href="/appointments/new"
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-300 hover:scale-105 transition-transform z-50"
        title="Nuovo appuntamento"
      >
        <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
      </Link>
    </div>
  )
}
