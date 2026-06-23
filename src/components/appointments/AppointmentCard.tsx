'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { AppointmentWithRelations } from '@/types/database'
import { AppointmentStatusBadge, ConfirmationStatusBadge } from '@/components/ui/StatusBadge'
import { Clock, Phone, Scissors, Pencil, MessageCircle, Trash2, CalendarPlus, Check } from 'lucide-react'
import { clsx } from 'clsx'
import { getAlarmSettings } from '@/lib/alarmDB'
import { generateICS, downloadICS } from '@/lib/icsGenerator'

interface Props {
  appointment: AppointmentWithRelations
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

function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}g ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function AppointmentCard({ appointment, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [calAdded, setCalAdded]           = useState(false)
  const [calLoading, setCalLoading]       = useState(false)
  const [whatsAppSent, setWhatsAppSent]   = useState(false)
  const [whatsAppLoading, setWhatsAppLoading] = useState(false)
  const [autoReminderSent, setAutoReminderSent] = useState(Boolean(appointment.notifications_sent?.whatsapp_reminder_30))
  const [autoReminderError, setAutoReminderError] = useState<string | null>(null)
  const [autoReminderAttempted, setAutoReminderAttempted] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const isPending = appointment.confirmation_status === 'pending'
  const start     = new Date(appointment.start_time)
  const end       = new Date(appointment.end_time)
  const msToStart = start.getTime() - now
  const msToEnd = end.getTime() - now
  const reminderMs = msToStart - 30 * 60_000

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  async function handleDelete() {
    setDeleting(true)
    try {
      const syncRes = await fetch('/api/google-calendar/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ appointmentId: appointment.id, action: 'delete' }),
      })
      if (!syncRes.ok && syncRes.status !== 409) {
        const body = await syncRes.json().catch(() => ({}))
        throw new Error(body.error ?? 'Sincronizzazione Google Calendar non riuscita')
      }
      await deleteDoc(doc(db, 'appointments', appointment.id))
      onDelete?.(appointment.id)
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleAddToCalendar() {
    setCalLoading(true)
    try {
      const settings = await getAlarmSettings()
      const offsets  = settings?.offsets_minutes ?? [120, 30]

      const ics = generateICS(
        {
          id:           appointment.id,
          start_time:   appointment.start_time,
          end_time:     appointment.end_time,
          client_name:  `${appointment.clients.first_name} ${appointment.clients.last_name}`,
          client_phone: appointment.clients.phone,
          service_name: appointment.services.name,
          notes:        appointment.notes,
        },
        { offsets_minutes: offsets },
      )

      downloadICS(
        ics,
        `${appointment.clients.first_name} ${appointment.clients.last_name}`,
        start,
      )

      setCalAdded(true)
      setTimeout(() => setCalAdded(false), 4000)
    } catch {
      alert('Errore generazione calendario.')
    } finally {
      setCalLoading(false)
    }
  }

  async function handleSendWhatsApp() {
    setWhatsAppLoading(true)
    try {
      const res = await fetch('/api/whatsapp/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ appointmentId: appointment.id, kind: 'confirmation' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Invio WhatsApp non riuscito')

      setWhatsAppSent(true)
      setTimeout(() => setWhatsAppSent(false), 4000)
    } catch (err) {
      alert(`WhatsApp: ${err}`)
      window.open(buildWhatsAppUrl(appointment), '_blank', 'noopener,noreferrer')
    } finally {
      setWhatsAppLoading(false)
    }
  }

  async function sendReminderWhatsApp() {
    try {
      const res = await fetch('/api/whatsapp/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ appointmentId: appointment.id, kind: 'reminder' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Reminder WhatsApp non riuscito')

      setAutoReminderSent(true)
      setAutoReminderError(null)
      showReminderNotification()
    } catch (err) {
      setAutoReminderError(err instanceof Error ? err.message : String(err))
    }
  }

  function showReminderNotification() {
    const title = 'Reminder WhatsApp inviato'
    const body = `${appointment.clients.first_name} ${appointment.clients.last_name} - ${appointment.services.name} alle ${format(start, 'HH:mm')}`

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-72.png',
          tag: `reminder-${appointment.id}`,
        } as NotificationOptions))
        .catch(() => {})
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-72.png' } as NotificationOptions)
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      setAutoReminderSent(Boolean(appointment.notifications_sent?.whatsapp_reminder_30))
    })
  }, [appointment.notifications_sent?.whatsapp_reminder_30])

  useEffect(() => {
    if (appointment.status === 'cancelled' || appointment.status === 'completed') return
    if (autoReminderSent || autoReminderAttempted) return
    if (msToStart <= 0 || msToStart > 30 * 60_000) return

    queueMicrotask(() => {
      setAutoReminderAttempted(true)
      sendReminderWhatsApp()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment.status, autoReminderAttempted, autoReminderSent, msToStart])

  return (
    <div className={clsx(
      'bg-white rounded-2xl border overflow-hidden',
      isPending ? 'border-yellow-200 ring-1 ring-yellow-100' : 'border-slate-100'
    )}>
      <div className="p-3 sm:p-4 flex gap-3 sm:gap-4">
        {/* Orario */}
        <div className="flex flex-col items-center justify-center w-12 sm:w-14 shrink-0">
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
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs mt-1">
                {msToStart > 0 ? (
                  <span className="font-medium text-blue-600">Inizia tra {formatCountdown(msToStart)}</span>
                ) : msToEnd > 0 ? (
                  <span className="font-medium text-green-600">In corso</span>
                ) : (
                  <span className="font-medium text-slate-400">Terminato</span>
                )}
                {appointment.status !== 'cancelled' && msToStart > 0 && (
                  autoReminderSent ? (
                    <span className="text-green-600">Reminder WhatsApp inviato</span>
                  ) : autoReminderError ? (
                    <span className="text-red-500">Reminder WhatsApp non inviato</span>
                  ) : (
                    <span className="text-slate-400">
                      Reminder WhatsApp {reminderMs > 0 ? `tra ${formatCountdown(reminderMs)}` : autoReminderAttempted ? 'in invio' : 'ora'}
                    </span>
                  )
                )}
              </div>
            </div>

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
            {appointment.staff && (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: appointment.staff.color }}
              >
                {appointment.staff.initials}
                <span className="hidden sm:inline opacity-90">· {appointment.staff.name.split(' ')[0]}</span>
              </span>
            )}
          </div>

          {appointment.notes && (
            <p className="text-xs text-slate-400 mt-2 italic truncate">{appointment.notes}</p>
          )}

          <div className="flex items-center justify-between mt-3 gap-2 flex-wrap min-w-0">
            <a
              href={`tel:${appointment.clients.phone}`}
              className="flex items-center gap-1 text-blue-600 text-xs font-medium hover:underline"
            >
              <Phone className="w-3 h-3" />
              {appointment.clients.phone}
            </a>

            <div className="flex items-center gap-2">
              {/* Aggiungi al calendario nativo — sveglie offline */}
              {appointment.status !== 'cancelled' && (
                <button
                  onClick={handleAddToCalendar}
                  disabled={calLoading}
                  title="Aggiungi sveglie al calendario del telefono"
                  className={clsx(
                    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-colors',
                    calAdded
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700',
                  )}
                >
                  {calAdded
                    ? <><Check className="w-3 h-3" /> Aggiunto!</>
                    : <><CalendarPlus className="w-3 h-3" /> Calendario</>}
                </button>
              )}

              {appointment.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  disabled={whatsAppLoading}
                  className={clsx(
                    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-colors',
                    whatsAppSent
                      ? 'bg-green-100 text-green-700'
                      : 'bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-60',
                  )}
                >
                  {whatsAppSent
                    ? <><Check className="w-3 h-3" /> Inviato</>
                    : <><MessageCircle className="w-3 h-3" /> {whatsAppLoading ? 'Invio…' : 'WhatsApp'}</>}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmDelete && (
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
      )}
    </div>
  )
}
