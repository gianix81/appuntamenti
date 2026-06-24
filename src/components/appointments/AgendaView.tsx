'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { isSameDay } from 'date-fns'
import type { AppointmentWithRelations, Staff } from '@/types/database'

type StaffDoc = Staff & { id: string }

const HOUR_PX    = 64
const START_HOUR = 8
const END_HOUR   = 20
const COL_W      = 148
const GUTTER_W   = 48

const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

function toMinutes(iso: string) {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

interface Column {
  id: string | null
  label: string
  color: string
  initials: string
}

interface Props {
  date: Date
  appointments: AppointmentWithRelations[]
  staff: StaffDoc[]
  hasStaff: boolean
  staffFilter: string | null
}

export function AgendaView({ date, appointments, staff, hasStaff, staffFilter }: Props) {
  const dayApts = useMemo(
    () => appointments.filter(a => isSameDay(new Date(a.start_time), date)),
    [appointments, date],
  )

  const columns = useMemo<Column[]>(() => {
    if (!hasStaff || staff.length === 0) {
      return [{ id: null, label: 'Tutti', color: '#3b82f6', initials: 'T' }]
    }
    return staff
      .filter(s => staffFilter === null || s.id === staffFilter)
      .map(s => ({ id: s.id ?? null, label: s.name, color: s.color, initials: s.initials }))
  }, [hasStaff, staff, staffFilter])

  const gridH = (END_HOUR - START_HOUR) * HOUR_PX

  return (
    <div className="overflow-x-auto -mx-4 md:-mx-6">
      <div style={{ minWidth: GUTTER_W + columns.length * COL_W }}>

        {/* Header: staff avatars */}
        <div
          className="flex sticky top-0 bg-white z-10 border-b border-slate-200"
          style={{ paddingLeft: GUTTER_W }}
        >
          {columns.map(col => (
            <div
              key={col.id ?? '__all'}
              className="flex flex-col items-center gap-1 py-2 border-l border-slate-100 first:border-l-0"
              style={{ width: COL_W }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow"
                style={{ backgroundColor: col.color }}
              >
                {col.initials}
              </div>
              <span className="text-xs font-semibold text-slate-700 truncate w-full text-center px-1">
                {col.label.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div className="flex relative" style={{ height: gridH }}>

          {/* Time gutter */}
          <div className="relative shrink-0" style={{ width: GUTTER_W }}>
            {HOURS.map((hour, i) => (
              <div
                key={hour}
                className="absolute right-2 text-slate-400 font-medium select-none"
                style={{ top: i * HOUR_PX - 7, fontSize: 10 }}
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Staff columns */}
          {columns.map(col => {
            const colApts = dayApts.filter(a =>
              col.id === null ? true : a.staff_id === col.id,
            )

            return (
              <div
                key={col.id ?? '__all'}
                className="relative border-l border-slate-100"
                style={{ width: COL_W, height: gridH }}
              >
                {/* Hour lines */}
                {HOURS.map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-slate-100"
                    style={{ top: i * HOUR_PX }}
                  />
                ))}
                {/* Half-hour lines */}
                {HOURS.map((_, i) => (
                  <div
                    key={`h${i}`}
                    className="absolute left-0 right-0 border-t border-slate-50"
                    style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
                  />
                ))}

                {/* Appointments */}
                {colApts.map(apt => {
                  const startMin = toMinutes(apt.start_time)
                  const endMin   = toMinutes(apt.end_time)
                  const top      = ((startMin - START_HOUR * 60) / 60) * HOUR_PX
                  const height   = Math.max(((endMin - startMin) / 60) * HOUR_PX, 22)
                  const color    = col.id !== null ? col.color : (apt.staff?.color ?? '#3b82f6')

                  if (top < 0 || top > gridH) return null

                  return (
                    <Link
                      key={apt.id}
                      href={`/appointments/${apt.id}/edit`}
                      className="absolute left-1 right-1 rounded-lg px-1.5 py-1 overflow-hidden hover:brightness-90 transition-all"
                      style={{
                        top: Math.max(top, 0),
                        height,
                        backgroundColor: color,
                        opacity: apt.status === 'cancelled' ? 0.35 : 1,
                      }}
                    >
                      <p className="text-white text-xs font-semibold leading-tight truncate">
                        {apt.clients?.first_name} {apt.clients?.last_name}
                      </p>
                      {height >= 38 && (
                        <p className="text-white/80 text-xs leading-tight truncate">
                          {apt.services?.name}
                        </p>
                      )}
                      {height >= 54 && (
                        <p className="text-white/60 text-xs">
                          {new Date(apt.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
