'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, subWeeks, isToday, isSameDay, startOfDay, endOfDay,
} from 'date-fns'
import { it } from 'date-fns/locale'
import { collection, getDocs, getDoc, doc, query, where, orderBy } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase/client'
import type { AppointmentWithRelations, Client, Service, Staff } from '@/types/database'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { useBusinessLevel } from '@/hooks/useBusinessLevel'

/* ── Constants ──────────────────────────────────────────────── */
const HOUR_PX    = 60
const START_HOUR = 8
const END_HOUR   = 20
const GRID_H     = (END_HOUR - START_HOUR) * HOUR_PX   // 720px
const GRID_MINS  = (END_HOUR - START_HOUR) * 60         // 720 min
const GUTTER_W   = 40
const HOURS      = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

function minsFromMidnight(iso: string) {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}
function apptTop(iso: string)    { return ((minsFromMidnight(iso) - START_HOUR * 60) / GRID_MINS) * GRID_H }
function apptHeight(s: string, e: string) {
  const mins = (minsFromMidnight(e) - minsFromMidnight(s))
  return Math.max((mins / GRID_MINS) * GRID_H, 24)
}
function nowTop() {
  const d = new Date()
  return ((d.getHours() * 60 + d.getMinutes() - START_HOUR * 60) / GRID_MINS) * GRID_H
}

async function waitForAuth(): Promise<boolean> {
  try {
    await (auth as typeof auth & { authStateReady(): Promise<void> }).authStateReady()
    return !!auth.currentUser
  } catch {
    if (auth.currentUser) return true
    return new Promise(resolve => {
      let done = false
      const unsub = onAuthStateChanged(auth, user => {
        if (done) return; done = true; unsub(); resolve(!!user)
      })
      setTimeout(() => { if (!done) { done = true; unsub(); resolve(false) } }, 12000)
    })
  }
}

/* ── Page ───────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter()
  const { hasStaff } = useBusinessLevel()

  const [weekRef, setWeekRef]           = useState(() => new Date())
  const [staff, setStaff]               = useState<(Staff & { id: string })[]>([])
  const [staffFilter, setStaffFilter]   = useState<string | null>(null)
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [loading, setLoading]           = useState(true)
  const [liveTop, setLiveTop]           = useState(nowTop)
  const gridRef = useRef<HTMLDivElement>(null)

  const weekStart = startOfWeek(weekRef, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(weekRef,   { weekStartsOn: 1 })
  const weekDays  = eachDayOfInterval({ start: weekStart, end: weekEnd })

  /* Active lanes per day column */
  const activeLanes = useMemo(() => {
    if (!hasStaff || staff.length === 0)
      return [{ id: null as string | null, name: '', color: '#6366f1', initials: 'T' }]
    if (staffFilter !== null) {
      const s = staff.find(s => s.id === staffFilter)
      return s ? [{ ...s, id: s.id as string | null }] : []
    }
    return staff.map(s => ({ ...s, id: s.id as string | null }))
  }, [hasStaff, staff, staffFilter])

  /* Display density based on lane count */
  const laneCount   = activeLanes.length
  // dot = only color block, init = initials only, name = first name
  const aptDisplay  = laneCount >= 5 ? 'dot' : laneCount >= 4 ? 'init' : 'name'
  const circleSize  = laneCount >= 4 ? 16 : 20  // px

  /* Live clock line */
  useEffect(() => {
    const t = setInterval(() => setLiveTop(nowTop()), 60_000)
    return () => clearInterval(t)
  }, [])

  /* Scroll to current time */
  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = Math.max(0, liveTop - 80)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Load staff */
  useEffect(() => {
    if (!hasStaff) return
    getDocs(query(collection(db, 'staff'), orderBy('name')))
      .then(snap => setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Staff & { id: string })))
      .catch(() => {})
  }, [hasStaff])

  /* Load week */
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

      const raw = snap.docs.map(d => ({ id: d.id, ...d.data() })) as (AppointmentWithRelations & {
        client_id: string; service_id: string; staff_id?: string | null
      })[]
      const active = raw.filter(a => a.status !== 'cancelled')

      const cIds = [...new Set(active.map(a => a.client_id))]
      const sIds = [...new Set(active.map(a => a.service_id))]
      const [cs, ss] = await Promise.all([
        Promise.all(cIds.map(id => getDoc(doc(db, 'clients',  id)))),
        Promise.all(sIds.map(id => getDoc(doc(db, 'services', id)))),
      ])

      const cMap = Object.fromEntries(cs.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Client]))
      const sMap = Object.fromEntries(ss.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Service]))
      const sfMap = Object.fromEntries(staff.map(s => [s.id, s]))

      setAppointments(active.map(a => ({
        ...a,
        clients:  cMap[a.client_id],
        services: sMap[a.service_id],
        staff:    a.staff_id ? (sfMap[a.staff_id] ?? null) : null,
      })))
    } catch (e) { console.error('[dash]', e) }
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.toISOString(), weekEnd.toISOString(), staff.length, router])

  useEffect(() => { loadWeek() }, [loadWeek])

  const visible      = staffFilter ? appointments.filter(a => a.staff_id === staffFilter) : appointments
  const isThisWeek   = weekDays.some(d => isToday(d))

  return (
    <div className="flex flex-col bg-white overflow-hidden h-full">

      {/* ── Controls bar ──────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-100 bg-white px-3 py-2 flex items-center gap-3 flex-wrap">

        {/* Week nav */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => setWeekRef(d => subWeeks(d, 1))} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <span className="text-sm font-bold text-slate-800 px-2 capitalize whitespace-nowrap">
            {format(weekStart, 'd MMM', { locale: it })} – {format(weekEnd, 'd MMM yyyy', { locale: it })}
          </span>
          <button onClick={() => setWeekRef(d => addWeeks(d, 1))} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Staff filter pills */}
        {hasStaff && staff.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto flex-1">
            <button
              onClick={() => setStaffFilter(null)}
              className={clsx(
                'shrink-0 text-xs font-bold px-2.5 py-1 rounded-full transition-all',
                staffFilter === null ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
              )}
            >
              Tutte
            </button>
            {staff.map(s => (
              <button
                key={s.id}
                onClick={() => setStaffFilter(p => p === s.id ? null : s.id)}
                className={clsx(
                  'shrink-0 flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full transition-all',
                  staffFilter === s.id ? 'text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                )}
                style={staffFilter === s.id ? { backgroundColor: s.color } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: staffFilter === s.id ? 'rgba(255,255,255,0.6)' : s.color }} />
                {s.name.split(' ')[0]}
              </button>
            ))}
          </div>
        )}

        {/* Right: counter + today + new */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-300 font-medium">{loading ? '…' : `${visible.length}`}</span>
          <button
            onClick={() => setWeekRef(new Date())}
            className={clsx(
              'text-xs font-bold px-2.5 py-1 rounded-lg transition-colors',
              isThisWeek ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600',
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

      {/* ── Calendar area ─────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">

        {/* Static header: day names + date + staff circles */}
        <div className="shrink-0 flex border-b border-slate-200 bg-white">
          {/* Gutter placeholder */}
          <div style={{ width: GUTTER_W, minWidth: GUTTER_W }} className="shrink-0" />

          {weekDays.map((day, dayIdx) => {
            const today = isToday(day)
            return (
              <div key={dayIdx} className="flex-1 border-l border-slate-200 first:border-l-0 flex flex-col items-stretch">
                {/* Day label */}
                <div className={clsx(
                  'flex flex-col items-center py-1.5 shrink-0',
                  laneCount > 1 && 'border-b border-slate-100',
                )}>
                  <p className={clsx('font-semibold uppercase tracking-wide', today ? 'text-blue-600' : 'text-slate-400', laneCount >= 4 ? 'text-[9px]' : 'text-[10px]')}>
                    {format(day, laneCount >= 5 ? 'EEEEE' : 'EEE', { locale: it })}
                  </p>
                  <div className={clsx('rounded-full flex items-center justify-center mt-0.5', today ? 'bg-blue-600' : '',
                    laneCount >= 4 ? 'w-6 h-6' : 'w-7 h-7',
                  )}>
                    <p className={clsx('font-bold', today ? 'text-white' : 'text-slate-700', laneCount >= 4 ? 'text-xs' : 'text-sm')}>
                      {format(day, 'd')}
                    </p>
                  </div>
                </div>

                {/* Staff lane sub-headers */}
                {laneCount > 1 && (
                  <div className="flex justify-around items-center py-1 shrink-0">
                    {activeLanes.map(lane => (
                      <div
                        key={lane.id ?? '__'}
                        className="flex-1 flex items-center justify-center"
                        title={lane.name}
                      >
                        <div
                          className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
                          style={{
                            width:  circleSize,
                            height: circleSize,
                            fontSize: circleSize <= 16 ? 7 : 8,
                            backgroundColor: lane.color ?? '#6366f1',
                          }}
                        >
                          {lane.initials}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Scrollable time grid (vertical only) */}
        <div ref={gridRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="flex" style={{ height: GRID_H }}>

            {/* Time gutter */}
            <div className="relative shrink-0" style={{ width: GUTTER_W }}>
              {HOURS.map((hour, i) => (
                <div key={hour} className="absolute right-1.5 text-slate-300 select-none font-semibold"
                  style={{ top: i * HOUR_PX - 7, fontSize: 9 }}>
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day, dayIdx) => {
              const today   = isToday(day)
              const dayApts = visible.filter(a => isSameDay(new Date(a.start_time), day))

              return (
                <div
                  key={dayIdx}
                  className={clsx('relative flex-1 border-l border-slate-100 first:border-l-0', today && 'bg-blue-50/25')}
                  style={{ height: GRID_H }}
                >
                  {/* Horizontal hour lines */}
                  {HOURS.map((_, i) => (
                    <div key={i} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: i * HOUR_PX }} />
                  ))}
                  {HOURS.map((_, i) => (
                    <div key={`h${i}`} className="absolute left-0 right-0 border-t border-slate-50" style={{ top: i * HOUR_PX + HOUR_PX / 2 }} />
                  ))}

                  {/* Current-time line */}
                  {today && liveTop >= 0 && liveTop <= GRID_H && (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: liveTop }}>
                      <div className="flex items-center">
                        <div className="w-2 h-2 rounded-full bg-blue-500 -ml-1 shadow-sm shrink-0" />
                        <div className="flex-1 border-t-2 border-blue-500" />
                      </div>
                    </div>
                  )}

                  {/* Lanes flex container — fills the column */}
                  <div className="absolute inset-0 flex">
                    {activeLanes.map((lane, laneIdx) => {
                      const laneApts = dayApts.filter(a =>
                        lane.id === null ? true : a.staff_id === lane.id,
                      )
                      return (
                        <div
                          key={lane.id ?? '__'}
                          className={clsx('relative flex-1 h-full', laneIdx > 0 && 'border-l border-slate-100')}
                        >
                          {laneApts.map(apt => {
                            const top    = apptTop(apt.start_time)
                            const height = apptHeight(apt.start_time, apt.end_time)
                            const color  = lane.id !== null ? (lane.color ?? '#6366f1') : (apt.staff?.color ?? '#6366f1')

                            if (top < 0 || top > GRID_H) return null

                            return (
                              <Link
                                key={apt.id}
                                href={`/appointments/${apt.id}/edit`}
                                className="absolute rounded-md overflow-hidden hover:brightness-90 active:brightness-75 transition-all shadow-sm"
                                style={{ top, height, left: 1, right: 1, backgroundColor: color, zIndex: 1 }}
                              >
                                <div className="px-1 py-0.5 h-full overflow-hidden">
                                  {aptDisplay === 'dot' ? (
                                    /* 5 operators: just colored block, no text */
                                    null
                                  ) : aptDisplay === 'init' ? (
                                    /* 4 operators: initial only */
                                    <p className="text-white font-bold leading-tight" style={{ fontSize: 9 }}>
                                      {apt.clients?.first_name?.[0]}{apt.clients?.last_name?.[0]}
                                    </p>
                                  ) : (
                                    /* 1-3 operators: full info adaptive */
                                    <>
                                      <p className="text-white font-bold leading-tight truncate" style={{ fontSize: 10 }}>
                                        {apt.clients?.first_name} {apt.clients?.last_name?.[0]}.
                                      </p>
                                      {height >= 34 && (
                                        <p className="text-white/75 leading-tight truncate" style={{ fontSize: 9 }}>
                                          {apt.services?.name}
                                        </p>
                                      )}
                                      {height >= 48 && (
                                        <p className="text-white/60 tabular-nums" style={{ fontSize: 9 }}>
                                          {new Date(apt.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                      )}
                                    </>
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
              )
            })}
          </div>
        </div>
      </div>

      {/* FAB */}
      <Link
        href="/appointments/new"
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-300 hover:scale-105 transition-transform z-50"
      >
        <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
      </Link>
    </div>
  )
}
