'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, isToday } from 'date-fns'
import { it } from 'date-fns/locale'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { AppointmentWithRelations } from '@/types/database'
import { AppointmentStatusBadge, ConfirmationStatusBadge } from '@/components/ui/StatusBadge'
import { Clock, Phone, Scissors, Pencil, MessageCircle, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  appointment: AppointmentWithRelations
  now?: Date
  reminderMins?: number
  onDelete?: (id: string) => void
}

function buildWhatsAppUrl(appointment: AppointmentWithRelations): string {
  const client  = appointment.clients
  const service = appointment.services
  const time    = format(new Date(appointment.start_time), 'HH:mm', { locale: it })
  const date    = format(new Date(appointment.start_time), 'EEEE d MMMM', { locale: it })
  const msg = `Ciao ${client.first_name}! Ti ricordiamo il tuo appuntamento di ${service.name} ${date} alle ${time}. Sei disponibile? Rispondici per confermare.`
  const phone = client.phone.replace(/\s+/g, '').replace(/^\+/, '')
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
}

function Countdown({ start, now, reminderMins = 30 }: { start: Date; now: Date; reminderMins?: number }) {
  const ms = start.getTime() - now.getTime()
  if (ms < -5 * 60_000) return null

  const isNow      = ms <= 0
  const sec        = Math.max(0, Math.floor(ms / 1000))
  const hh         = Math.floor(sec / 3600)
  const mm         = Math.floor((sec % 3600) / 60)
  const ss         = sec % 60
  const timeStr    = isNow     ? '⚡ ADESSO!'
                   : hh > 0   ? `${hh}h ${String(mm).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`
                   :             `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

  const isVeryClose = !isNow && ms < 5 * 60_000
  const isClose     = !isNow && ms < reminderMins * 60_000

  const bg   = isNow ? 'bg-red-500 animate-pulse' : isVeryClose ? 'bg-red-400' : isClose ? 'bg-amber-400' : 'bg-blue-50'
  const text = isNow || isVeryClose || isClose ? 'text-white' : 'text-blue-600'

  return (
    <div className={`${bg} rounded-b-2xl px-4 py-2 flex items-center justify-between`}>
      <span className={`text-xs font-medium ${text} opacity-80`}>⏰ tra</span>
      <span className={`text-sm font-bold tabular-nums tracking-tight ${text}`}>{timeStr}</span>
    </div>
  )
}

export function AppointmentCard({ appointment, now, reminderMins, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)

  const isPending     = appointment.confirmation_status === 'pending'
  const start         = new Date(appointment.start_time)
  const end           = new Date(appointment.end_time)
  const showCountdown = !!now && isToday(start) && appointment.status !== 'cancelled'

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'appointments', appointment.id))
      onDelete?.(appointment.id)
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className={clsx(
      'bg-white rounded-2xl border overflow-hidden',
      isPending ? 'border-yellow-200 ring-1 ring-yellow-100' : 'border-slate-100'
    )}>
      <div className="p-4 flex gap-4">
        {/* Colonna orario */}
        <div className="flex flex-col items-center justify-center w-14 shrink-0">
          <span className="text-xl font-bold text-blue-600">{format(start, 'HH:mm')}</span>
          <span className="text-xs text-slate-400">{format(end, 'HH:mm')}</span>
        </div>

        {/* Contenuto */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 truncate">
                {appointment.clients.first_name} {appointment.clients.last_name}
              </p>
              <div className="flex items-center gap-1 text-slate-500 text-xs mt-0.5">
                <Scissors className="w-3 h-3 shrink-0" />
                <span className="truncate">{appointment.services.name}</span>
              </div>
              <div className="flex items-center gap-1 text-slate-500 text-xs mt-0.5">
                <Clock className="w-3 h-3 shrink-0" />
                <span>{appointment.services.duration_minutes} min</span>
              </div>
            </div>

            {/* Azioni modifica / elimina */}
            <div className="flex items-center gap-1 shrink-0">
              <Link
                href={`/appointments/${appointment.id}/edit`}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Modifica"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Link>
              {onDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Elimina"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <AppointmentStatusBadge status={appointment.status} />
            <ConfirmationStatusBadge status={appointment.confirmation_status} />
          </div>

          {appointment.notes && (
            <p className="text-xs text-slate-400 mt-2 italic truncate">{appointment.notes}</p>
          )}

          <div className="flex items-center justify-between mt-3 gap-2">
            <a
              href={`tel:${appointment.clients.phone}`}
              className="flex items-center gap-1 text-blue-600 text-xs font-medium hover:underline"
            >
              <Phone className="w-3 h-3" />
              {appointment.clients.phone}
            </a>

            {appointment.status !== 'cancelled' && (
              <a
                href={buildWhatsAppUrl(appointment)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-full font-medium transition-colors"
              >
                <MessageCircle className="w-3 h-3" />
                WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Strip countdown o conferma eliminazione */}
      {confirmDelete ? (
        <div className="bg-red-50 border-t border-red-100 rounded-b-2xl px-4 py-2.5 flex items-center justify-between gap-3">
          <span className="text-xs text-red-600 font-medium">Eliminare questo appuntamento?</span>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1"
            >
              Annulla
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 font-medium px-3 py-1 rounded-lg transition-colors"
            >
              {deleting ? '…' : 'Sì, elimina'}
            </button>
          </div>
        </div>
      ) : showCountdown ? (
        <Countdown start={start} now={now!} reminderMins={reminderMins} />
      ) : null}
    </div>
  )
}
