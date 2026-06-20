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
import type { AppointmentWithRelations, Client, Service } from '@/types/database'
import { AppointmentCard } from '@/components/appointments/AppointmentCard'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState } from '@/components/ui/EmptyState'
import { CalendarDays, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

export default function AppointmentsPage() {
  const [weekStart, setWeekStart]       = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [loading, setLoading]           = useState(true)

  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) })

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

      const apts = snap.docs.map(d => ({ id: d.id, ...d.data() })) as (AppointmentWithRelations & { client_id: string; service_id: string })[]
      const clientIds  = [...new Set(apts.map(a => a.client_id))]
      const serviceIds = [...new Set(apts.map(a => a.service_id))]
      const [cSnaps, sSnaps] = await Promise.all([
        Promise.all(clientIds.map(id => getDoc(doc(db, 'clients', id)))),
        Promise.all(serviceIds.map(id => getDoc(doc(db, 'services', id)))),
      ])
      const cMap = Object.fromEntries(cSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Client]))
      const sMap = Object.fromEntries(sSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Service]))

      setAppointments(apts.map(a => ({ ...a, clients: cMap[a.client_id], services: sMap[a.service_id] })))
    } catch (err) {
      console.error('[Appointments] load:', err)
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { load() }, [load])

  function prevWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n }) }
  function nextWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n }) }

  const dayAppointments = appointments.filter(a => isSameDay(new Date(a.start_time), selectedDate))

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">Appuntamenti</h1>
        <Link
          href="/appointments/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuovo
        </Link>
      </div>

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
            const hasAppts   = appointments.some(a => isSameDay(new Date(a.start_time), day))
            const isSelected = isSameDay(day, selectedDate)
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={clsx(
                  'flex flex-col items-center py-2 rounded-xl transition-colors text-xs relative',
                  isSelected   ? 'bg-blue-600 text-white'
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

      <p className="text-sm font-medium text-slate-500 mb-3 capitalize">
        {isToday(selectedDate) ? 'Oggi' : format(selectedDate, 'EEEE d MMMM', { locale: it })}
        {' — '}{dayAppointments.length} appuntament{dayAppointments.length === 1 ? 'o' : 'i'}
      </p>

      {loading ? (
        <LoadingState />
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
