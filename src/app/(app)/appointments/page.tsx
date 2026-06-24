'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  isToday, isSameDay, startOfDay, endOfDay,
} from 'date-fns'
import { it } from 'date-fns/locale'
import { collection, getDocs, getDoc, doc, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { AppointmentWithRelations, Client, Service, Staff } from '@/types/database'
import { AppointmentCard } from '@/components/appointments/AppointmentCard'
import { AgendaView } from '@/components/appointments/AgendaView'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState } from '@/components/ui/EmptyState'
import { CalendarDays, Plus, ChevronLeft, ChevronRight, List, LayoutGrid } from 'lucide-react'
import { clsx } from 'clsx'
import { useBusinessLevel } from '@/hooks/useBusinessLevel'
import { useUserRole } from '@/hooks/useUserRole'

type StaffDoc = Staff & { id: string }

export default function AppointmentsPage() {
  const { hasStaff } = useBusinessLevel()
  const { role, staffId: myStaffId } = useUserRole()
  const isStaff = role === 'staff'

  const [weekStart, setWeekStart]       = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [staffList, setStaffList]       = useState<StaffDoc[]>([])
  const [staffFilter, setStaffFilter]   = useState<string | null>(null)  // null = tutte
  const [viewMode, setViewMode]         = useState<'list' | 'agenda'>('list')
  const [loading, setLoading]           = useState(true)

  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) })

  // Lock filter to own staff ID for operatrici
  useEffect(() => {
    if (isStaff && myStaffId) setStaffFilter(myStaffId)
  }, [isStaff, myStaffId])

  // Carica staff una volta
  useEffect(() => {
    if (!hasStaff) return
    getDocs(query(collection(db, 'staff'), orderBy('name')))
      .then(snap => setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() }) as StaffDoc)))
      .catch(() => {})
  }, [hasStaff])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
      const snap = await getDocs(query(
        collection(db, 'appointments'),
        where('start_time', '>=', startOfDay(weekStart).toISOString()),
        where('start_time', '<=', endOfDay(wEnd).toISOString()),
        orderBy('start_time'),
      ))

      const apts = snap.docs.map(d => ({ id: d.id, ...d.data() })) as (AppointmentWithRelations & { client_id: string; service_id: string; staff_id?: string | null })[]

      const clientIds  = [...new Set(apts.map(a => a.client_id))]
      const serviceIds = [...new Set(apts.map(a => a.service_id))]

      const [cSnaps, sSnaps] = await Promise.all([
        Promise.all(clientIds.map(id  => getDoc(doc(db, 'clients',  id)))),
        Promise.all(serviceIds.map(id => getDoc(doc(db, 'services', id)))),
      ])

      const cMap = Object.fromEntries(cSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Client]))
      const sMap = Object.fromEntries(sSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Service]))

      // Usa staffList già caricata per join locale (evita N+1 reads extra)
      const stMap = Object.fromEntries(staffList.map(s => [s.id, s]))

      setAppointments(apts.map(a => ({
        ...a,
        clients:  cMap[a.client_id],
        services: sMap[a.service_id],
        staff:    a.staff_id ? (stMap[a.staff_id] ?? null) : null,
      })).filter(a => a.clients != null && a.services != null))
    } catch (err) {
      console.error('[Appointments] load:', err)
    } finally {
      setLoading(false)
    }
  }, [weekStart, staffList])

  useEffect(() => { load() }, [load])

  function prevWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n }) }
  function nextWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n }) }

  // Filtra appuntamenti per giorno selezionato + filtro staff
  const dayAppointments = appointments.filter(a => {
    if (!isSameDay(new Date(a.start_time), selectedDate)) return false
    if (staffFilter && a.staff_id !== staffFilter) return false
    return true
  })

  return (
    <div className={clsx('flex-1 overflow-y-auto p-4 md:p-6 w-full', viewMode === 'list' && 'max-w-3xl mx-auto')}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">Appuntamenti</h1>
        <div className="flex items-center gap-2">
          {/* Toggle lista / agenda */}
          <div className="flex bg-slate-100 rounded-xl p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600',
              )}
              title="Vista lista"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                viewMode === 'agenda' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600',
              )}
              title="Vista agenda"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <Link
            href="/appointments/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuovo
          </Link>
        </div>
      </div>

      {/* Navigatore settimanale */}
      <div className="bg-white rounded-2xl border border-slate-100 p-3 mb-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevWeek} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <span className="text-sm font-medium text-slate-700 capitalize">
            {format(weekStart, 'MMMM yyyy', { locale: it })}
          </span>
          <button onClick={nextWeek} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(day => {
            const hasAppts   = appointments.some(a =>
              isSameDay(new Date(a.start_time), day) &&
              (!staffFilter || a.staff_id === staffFilter),
            )
            const isSelected = isSameDay(day, selectedDate)
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={clsx(
                  'flex flex-col items-center py-2 rounded-xl transition-colors text-xs relative',
                  isSelected    ? 'bg-blue-600 text-white'
                  : isToday(day) ? 'bg-blue-50 text-blue-600'
                  : 'hover:bg-slate-50 text-slate-600',
                )}
              >
                <span className="uppercase font-medium">{format(day, 'EEE', { locale: it }).slice(0, 3)}</span>
                <span className="font-bold mt-0.5">{format(day, 'd')}</span>
                {hasAppts && !isSelected && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Filtro staff — nascosto per le operatrici (vedono solo i propri) */}
      {hasStaff && staffList.length > 0 && !isStaff && (
        <div className="overflow-x-auto pb-1 mb-4 scrollbar-none">
          <div className="flex gap-2 w-max">
            <button
              onClick={() => setStaffFilter(null)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                staffFilter === null
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300',
              )}
            >
              Tutte
            </button>
            {staffList.map(s => (
              <button
                key={s.id}
                onClick={() => setStaffFilter(staffFilter === s.id ? null : s.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                  staffFilter === s.id
                    ? 'text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300',
                )}
                style={staffFilter === s.id ? { backgroundColor: s.color } : {}}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                {s.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-sm font-medium text-slate-500 mb-3 capitalize">
        {isToday(selectedDate) ? 'Oggi' : format(selectedDate, 'EEEE d MMMM', { locale: it })}
        {' — '}{dayAppointments.length} appuntament{dayAppointments.length === 1 ? 'o' : 'i'}
        {staffFilter && staffList.length > 0 && (
          <> · {staffList.find(s => s.id === staffFilter)?.name.split(' ')[0]}</>
        )}
      </p>

      {loading ? (
        <LoadingState />
      ) : viewMode === 'agenda' ? (
        <AgendaView
          date={selectedDate}
          appointments={appointments}
          staff={staffList}
          hasStaff={hasStaff}
          staffFilter={staffFilter}
        />
      ) : dayAppointments.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nessun appuntamento"
          description="Nessun appuntamento per questo giorno."
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
          {dayAppointments.map(apt => (
            <AppointmentCard
              key={apt.id}
              appointment={apt}
              onDelete={id => setAppointments(prev => prev.filter(a => a.id !== id))}
              hideClientDetails={isStaff}
            />
          ))}
        </div>
      )}
    </div>
  )
}
