'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, subWeeks, isToday, isSameDay, startOfDay, endOfDay,
} from 'date-fns'
import { it } from 'date-fns/locale'
import {
  collection, getDocs, getDoc, doc, query, where, orderBy,
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase/client'
import type { AppointmentWithRelations, Client, Service, Staff } from '@/types/database'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { useBusinessLevel } from '@/hooks/useBusinessLevel'

/* ── Calendar constants ──────────────────────────────────────── */
const HOUR_PX    = 64
const START_HOUR = 8
const END_HOUR   = 20
const GUTTER_W   = 44
const DAY_MIN_W  = 90       // minimum px per day column (mobile)
const GRID_H     = (END_HOUR - START_HOUR) * HOUR_PX
const HOURS      = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

function toMinutes(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/* ── Auth ────────────────────────────────────────────────────── */
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

/* ── Current-time indicator ──────────────────────────────────── */
function nowTop(): number {
  const d = new Date()
  return ((d.getHours() * 60 + d.getMinutes() - START_HOUR * 60) / 60) * HOUR_PX
}

/* ── Page ────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter()
  const { hasStaff } = useBusinessLevel()

  const [weekRef, setWeekRef]   = useState(() => new Date())
  const [staff, setStaff]       = useState<(Staff & { id: string })[]>([])
  const [staffFilter, setStaffFilter] = useState<string | null>(null)
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [loading, setLoading]   = useState(true)
  const [currentTop, setCurrentTop] = useState(nowTop)
  const gridRef = useRef<HTMLDivElement>(null)

  const weekStart = startOfWeek(weekRef, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(weekRef,   { weekStartsOn: 1 })
  const weekDays  = eachDayOfInterval({ start: weekStart, end: weekEnd })

  /* live current-time line */
  useEffect(() => {
    const t = setInterval(() => setCurrentTop(nowTop()), 60_000)
    return () => clearInterval(t)
  }, [])

  /* scroll to current time on mount */
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.scrollTop = Math.max(0, currentTop - 120)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* load staff once */
  useEffect(() => {
    if (!hasStaff) return
    getDocs(query(collection(db, 'staff'), orderBy('name')))
      .then(snap => setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Staff & { id: string })))
      .catch(() => {})
  }, [hasStaff])

  /* load week appointments */
  const loadWeek = useCallback(async () => {
    setLoading(true)
    try {
      const authed = await waitForAuth()
      if (!authed) { router.replace('/login'); return }

      const snap = await getDocs(query(
        collection(db, 'appointments'),
        where('start_time', '>=', startOfDay(weekStart).toISOString()),
        where('start_time', '<=', endOfDay(weekEnd).toISOString()),
        orderBy('start_time'),
      ))

      const raw = snap.docs
        .map(d => ({ id: d.id, ...d.data() })) as (AppointmentWithRelations & { client_id: string; service_id: string; staff_id?: string | null })[]
      const active = raw.filter(a => a.status !== 'cancelled')

      const clientIds  = [...new Set(active.map(a => a.client_id))]
      const serviceIds = [...new Set(active.map(a => a.service_id))]

      const [cSnaps, sSnaps] = await Promise.all([
        Promise.all(clientIds.map(id => getDoc(doc(db, 'clients', id)))),
        Promise.all(serviceIds.map(id => getDoc(doc(db, 'services', id)))),
      ])

      const clientMap  = Object.fromEntries(cSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Client]))
      const serviceMap = Object.fromEntries(sSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Service]))
      const staffMap   = Object.fromEntries(staff.map(s => [s.id, s]))

      setAppointments(active.map(a => ({
        ...a,
        clients:  clientMap[a.client_id],
        services: serviceMap[a.service_id],
        staff:    a.staff_id ? (staffMap[a.staff_id] ?? null) : null,
      })))
    } catch (err) {
      console.error('[dashboard]', err)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.toISOString(), weekEnd.toISOString(), staff.length, router])

  useEffect(() => { loadWeek() }, [loadWeek])

  const visible = staffFilter
    ? appointments.filter(a => a.staff_id === staffFilter)
    : appointments

  const isCurrentWeek = isToday(weekStart) || weekDays.some(d => isToday(d))

  return (
    <div className="flex flex-col bg-white" style={{ height: 'calc(100vh - 0px)', maxHeight: '100dvh' }}>

      {/* ── Top header ────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-100 px-3 pt-3 pb-2 space-y-2.5 bg-white">

        {/* Week navigation */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekRef(d => subWeeks(d, 1))}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>

            <h2 className="text-sm font-bold text-slate-800 px-1 capitalize">
              {format(weekStart, 'd MMM', { locale: it })}
              {' – '}
              {format(weekEnd, 'd MMM yyyy', { locale: it })}
            </h2>

            <button
              onClick={() => setWeekRef(d => addWeeks(d, 1))}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!loading && (
              <span className="text-xs text-slate-400 font-medium">
                {visible.length} app{visible.length === 1 ? '.' : 't.'}
              </span>
            )}
            {loading && <span className="text-xs text-slate-300">…</span>}
            <button
              onClick={() => setWeekRef(new Date())}
              className={clsx(
                'text-xs font-bold px-3 py-1.5 rounded-lg transition-colors',
                isCurrentWeek
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600',
              )}
            >
              Oggi
            </button>
            <Link
              href="/appointments/new"
              className="flex items-center gap-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" /> Nuovo
            </Link>
          </div>
        </div>

        {/* Staff filter pills */}
        {hasStaff && staff.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setStaffFilter(null)}
              className={clsx(
                'shrink-0 text-xs font-bold px-3 py-1.5 rounded-full transition-all',
                staffFilter === null
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
              )}
            >
              Tutte
            </button>
            {staff.map(s => (
              <button
                key={s.id}
                onClick={() => setStaffFilter(prev => prev === s.id ? null : s.id)}
                className={clsx(
                  'shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all',
                  staffFilter === s.id
                    ? 'text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                )}
                style={staffFilter === s.id ? { backgroundColor: s.color } : {}}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: staffFilter === s.id ? 'rgba(255,255,255,0.6)' : s.color }}
                />
                {s.name.split(' ')[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Calendar grid ──────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">

        {/* Sticky day header */}
        <div
          className="shrink-0 flex border-b border-slate-200 bg-white sticky top-0 z-20"
          style={{ paddingLeft: GUTTER_W }}
        >
          {weekDays.map((day, i) => {
            const today = isToday(day)
            return (
              <div
                key={i}
                className="flex flex-col items-center justify-center py-2 border-l border-slate-100 first:border-l-0"
                style={{ flex: 1, minWidth: DAY_MIN_W }}
              >
                <p className={clsx('text-xs font-semibold uppercase tracking-wide', today ? 'text-blue-600' : 'text-slate-400')}>
                  {format(day, 'EEE', { locale: it })}
                </p>
                <div className={clsx(
                  'w-7 h-7 rounded-full flex items-center justify-center mt-0.5',
                  today ? 'bg-blue-600' : 'bg-transparent',
                )}>
                  <p className={clsx('text-sm font-bold', today ? 'text-white' : 'text-slate-700')}>
                    {format(day, 'd')}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Scrollable grid body */}
        <div ref={gridRef} className="flex-1 overflow-auto">
          <div
            className="flex relative"
            style={{ height: GRID_H, minWidth: GUTTER_W + weekDays.length * DAY_MIN_W }}
          >
            {/* Time gutter */}
            <div className="relative shrink-0" style={{ width: GUTTER_W }}>
              {HOURS.map((hour, i) => (
                <div
                  key={hour}
                  className="absolute right-2 text-slate-300 select-none font-semibold"
                  style={{ top: i * HOUR_PX - 7, fontSize: 10 }}
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day, dayIdx) => {
              const dayApts = visible.filter(a => isSameDay(new Date(a.start_time), day))
              const today   = isToday(day)

              return (
                <div
                  key={dayIdx}
                  className={clsx('relative border-l border-slate-100 flex-1', today && 'bg-blue-50/20')}
                  style={{ minWidth: DAY_MIN_W, height: GRID_H }}
                >
                  {/* Hour grid lines */}
                  {HOURS.map((_, i) => (
                    <div key={i} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: i * HOUR_PX }} />
                  ))}
                  {HOURS.map((_, i) => (
                    <div key={`h${i}`} className="absolute left-0 right-0 border-t border-slate-50" style={{ top: i * HOUR_PX + HOUR_PX / 2 }} />
                  ))}

                  {/* Current time line */}
                  {today && currentTop >= 0 && currentTop <= GRID_H && (
                    <div
                      className="absolute left-0 right-0 z-10 pointer-events-none"
                      style={{ top: currentTop }}
                    >
                      <div className="relative flex items-center">
                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 -ml-1 shadow" />
                        <div className="flex-1 border-t-2 border-blue-500" />
                      </div>
                    </div>
                  )}

                  {/* Appointment blocks */}
                  {dayApts.map((apt, aptIdx) => {
                    const startMin = toMinutes(apt.start_time)
                    const endMin   = toMinutes(apt.end_time)
                    const top      = ((startMin - START_HOUR * 60) / 60) * HOUR_PX
                    const height   = Math.max(((endMin - startMin) / 60) * HOUR_PX, 26)
                    const color    = apt.staff?.color ?? '#6366f1'

                    if (top < 0 || top > GRID_H) return null

                    return (
                      <Link
                        key={apt.id}
                        href={`/appointments/${apt.id}/edit`}
                        className="absolute rounded-lg overflow-hidden hover:brightness-90 active:brightness-75 transition-all shadow-sm"
                        style={{
                          top,
                          height,
                          left: 2 + aptIdx * 2,
                          right: 2,
                          backgroundColor: color,
                          zIndex: aptIdx + 1,
                        }}
                      >
                        <div className="px-1.5 py-1 h-full">
                          <p className="text-white text-xs font-bold leading-tight truncate">
                            {apt.clients?.first_name} {apt.clients?.last_name?.[0]}.
                          </p>
                          {height >= 38 && (
                            <p className="text-white/75 text-xs leading-tight truncate">
                              {apt.services?.name}
                            </p>
                          )}
                          {height >= 52 && (
                            <p className="text-white/60 text-xs tabular-nums">
                              {new Date(apt.start_time).toLocaleTimeString('it-IT', {
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </p>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── FAB ───────────────────────────────────────────────────── */}
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
