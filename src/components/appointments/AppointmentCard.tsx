'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { AppointmentWithRelations } from '@/types/database'
import {
  Pencil, Trash2, CalendarPlus, Calendar, MessageCircle, Check,
  ChevronRight, Phone,
} from 'lucide-react'
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
  const days  = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const mins  = totalMinutes % 60
  if (days > 0)  return `${days}g ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

const AVATAR_COLORS = [
  'bg-rose-500',    'bg-violet-500', 'bg-blue-500',
  'bg-emerald-500', 'bg-amber-500',  'bg-cyan-500',
  'bg-pink-500',    'bg-indigo-500',
]

function avatarBg(name: string): string {
  let h = 0
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

const STATUS_META: Record<string, { label: string; dot: string; card: string }> = {
  scheduled: { label: 'Programmato', dot: 'bg-blue-400',    card: 'border-t-blue-400'    },
  confirmed:  { label: 'Confermato',  dot: 'bg-emerald-400', card: 'border-t-emerald-400' },
  cancelled:  { label: 'Annullato',   dot: 'bg-slate-300',   card: 'border-t-slate-300'   },
  completed:  { label: 'Completato',  dot: 'bg-slate-400',   card: 'border-t-slate-400'   },
  no_show:    { label: 'No-show',     dot: 'bg-orange-400',  card: 'border-t-orange-400'  },
}

const CONF_META: Record<string, { label: string; cls: string }> = {
  pending:     { label: 'In attesa',       cls: 'bg-amber-100 text-amber-700'   },
  confirmed:   { label: 'Confermato',      cls: 'bg-emerald-100 text-emerald-700' },
  declined:    { label: 'Rifiutato',       cls: 'bg-red-100 text-red-700'       },
  no_response: { label: 'Nessuna risposta',cls: 'bg-slate-100 text-slate-500'   },
}

export function AppointmentCard({ appointment, onDelete }: Props) {
  const hasConfirmedReminder     = Boolean(appointment.notifications_sent?.whatsapp_reminder_30 && appointment.reminder_sent_at)
  const hasConfirmedConfirmation = Boolean(appointment.notifications_sent?.whatsapp_confirmation)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [calAdded, setCalAdded]           = useState(false)
  const [calLoading, setCalLoading]       = useState(false)

  const [whatsAppSent, setWhatsAppSent]         = useState(false)
  const [whatsAppLoading, setWhatsAppLoading]   = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(hasConfirmedConfirmation)

  const [reminderSent, setReminderSent]       = useState(false)
  const [reminderLoading, setReminderLoading] = useState(false)

  const [autoReminderSent, setAutoReminderSent]         = useState(hasConfirmedReminder)
  const [autoReminderError, setAutoReminderError]       = useState<string | null>(null)
  const [autoReminderAttempted, setAutoReminderAttempted] = useState(false)

  const [now, setNow] = useState(() => Date.now())

  const start      = new Date(appointment.start_time)
  const end        = new Date(appointment.end_time)
  const msToStart  = start.getTime() - now
  const msToEnd    = end.getTime() - now
  const reminderMs = msToStart - 30 * 60_000

  const isActive    = msToStart <= 0 && msToEnd > 0
  const isDone      = msToEnd <= 0
  const isCancelled = appointment.status === 'cancelled'

  const statusM = STATUS_META[appointment.status] ?? STATUS_META.scheduled
  const confM   = CONF_META[appointment.confirmation_status] ?? CONF_META.pending

  const clientFullName = `${appointment.clients.first_name} ${appointment.clients.last_name}`
  const clientInitials = [appointment.clients.first_name[0], appointment.clients.last_name[0]].join('').toUpperCase()

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
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
          client_name:  clientFullName,
          client_phone: appointment.clients.phone,
          service_name: appointment.services.name,
          notes:        appointment.notes,
        },
        { offsets_minutes: offsets },
      )
      downloadICS(ics, clientFullName, start)
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
      if (!res.ok) throw new Error(body.error ?? 'Invio non riuscito')
      if (body.ok !== true || body.result?.success !== true) throw new Error(body.error ?? 'Invio non confermato')
      setWhatsAppSent(true)
      setConfirmationSent(true)
      setTimeout(() => setWhatsAppSent(false), 4000)
    } catch (err) {
      alert(`WhatsApp: ${err}`)
      window.open(buildWhatsAppUrl(appointment), '_blank', 'noopener,noreferrer')
    } finally {
      setWhatsAppLoading(false)
    }
  }

  async function handleSendReminder() {
    setReminderLoading(true)
    try {
      const res = await fetch('/api/whatsapp/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ appointmentId: appointment.id, kind: 'reminder' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Invio promemoria non riuscito')
      if (body.ok !== true || body.result?.success !== true) throw new Error(body.error ?? 'Invio non confermato')
      setReminderSent(true)
      setAutoReminderSent(true)
      setTimeout(() => setReminderSent(false), 4000)
    } catch (err) {
      alert(`Promemoria: ${err}`)
    } finally {
      setReminderLoading(false)
    }
  }

  function handleSendCalendarToClient() {
    const icsUrl      = `${window.location.origin}/api/appointments/${appointment.id}/ics`
    const firstName   = appointment.clients.first_name
    const serviceName = appointment.services.name
    const phone       = appointment.clients.phone.replace(/\s+/g, '').replace(/^\+/, '')
    const msg = `Ciao ${firstName}! Aggiungi il tuo appuntamento per ${serviceName} al calendario: ${icsUrl}`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  async function sendReminderWhatsApp() {
    try {
      const res = await fetch('/api/whatsapp/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ appointmentId: appointment.id, kind: 'reminder' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.ok !== true || body.result?.success !== true) {
        throw new Error(body.error ?? 'Reminder non riuscito')
      }
      setAutoReminderSent(true)
      setAutoReminderError(null)
      showReminderNotification()
    } catch (err) {
      setAutoReminderError(err instanceof Error ? err.message : String(err))
    }
  }

  function showReminderNotification() {
    const title = 'Reminder WhatsApp inviato'
    const body  = `${clientFullName} – ${appointment.services.name} alle ${format(start, 'HH:mm')}`
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-72.png', tag: `reminder-${appointment.id}` } as NotificationOptions))
        .catch(() => {})
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-192.png' } as NotificationOptions)
    }
  }

  useEffect(() => {
    queueMicrotask(() => setAutoReminderSent(hasConfirmedReminder))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment.notifications_sent?.whatsapp_reminder_30, hasConfirmedReminder])

  useEffect(() => {
    queueMicrotask(() => setConfirmationSent(hasConfirmedConfirmation))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment.notifications_sent?.whatsapp_confirmation, hasConfirmedConfirmation])

  useEffect(() => {
    if (isCancelled || appointment.status === 'completed') return
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
      'bg-white rounded-2xl shadow-sm overflow-hidden border-t-[3px] transition-all',
      statusM.card,
      isCancelled && 'opacity-60',
    )}>
      {/* ── Main body ─────────────────────────────────────────────── */}
      <div className="p-4">
        <div className="flex items-start gap-3">

          {/* Avatar cliente */}
          <div className={clsx(
            'w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm',
            avatarBg(clientFullName),
          )}>
            {clientInitials}
          </div>

          {/* Info principale */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-slate-800 text-base leading-tight truncate">
                  {clientFullName}
                </p>
                <p className="text-slate-500 text-sm truncate">
                  {appointment.services.name}
                  <span className="text-slate-300 mx-1">·</span>
                  {appointment.services.duration_minutes} min
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Link
                  href={`/appointments/${appointment.id}/edit`}
                  className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                  title="Modifica"
                >
                  <Pencil className="w-4 h-4" />
                </Link>
                {onDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    title="Elimina"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Orario + status in una riga */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="font-bold text-blue-600 text-lg tabular-nums">
                {format(start, 'HH:mm')}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <span className="text-slate-400 text-sm tabular-nums">
                {format(end, 'HH:mm')}
              </span>
              <span className={clsx(
                'ml-1 text-xs font-semibold px-2 py-0.5 rounded-full',
                isActive  ? 'bg-green-100 text-green-700' :
                isDone    ? 'bg-slate-100 text-slate-500' :
                            'bg-blue-50 text-blue-600',
              )}>
                {isActive ? 'In corso' : isDone ? 'Terminato' : `tra ${formatCountdown(msToStart)}`}
              </span>
            </div>

            {/* Badges riga */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', confM.cls)}>
                {confM.label}
              </span>
              {appointment.staff && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: appointment.staff.color }}
                >
                  {appointment.staff.initials} · {appointment.staff.name.split(' ')[0]}
                </span>
              )}
              {confirmationSent && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 flex items-center gap-0.5">
                  <Check className="w-3 h-3" /> Conf. inviata
                </span>
              )}
              {(autoReminderSent || reminderSent) && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 flex items-center gap-0.5">
                  <Check className="w-3 h-3" /> Prom. inviato
                </span>
              )}
              {autoReminderError && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-500">
                  Prom. non inviato
                </span>
              )}
            </div>

            {/* Note */}
            {appointment.notes && (
              <p className="text-xs text-slate-400 italic mt-2 truncate">{appointment.notes}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Action footer ─────────────────────────────────────────── */}
      {!isCancelled && (
        <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between gap-2 bg-slate-50/60 flex-wrap">
          {/* Telefono */}
          <a
            href={`tel:${appointment.clients.phone}`}
            className="flex items-center gap-1 text-blue-500 text-xs font-semibold hover:text-blue-700 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            {appointment.clients.phone}
          </a>

          {/* Azioni */}
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <button
              onClick={handleAddToCalendar}
              disabled={calLoading}
              title="Aggiungi al tuo calendario"
              className={clsx(
                'flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all',
                calAdded
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600',
              )}
            >
              {calAdded ? <><Check className="w-3 h-3" /> Ok!</> : <><CalendarPlus className="w-3 h-3" /> Cal</>}
            </button>

            <button
              type="button"
              onClick={handleSendCalendarToClient}
              title="Invia calendario al cliente via WhatsApp"
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold bg-white border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-600 transition-all"
            >
              <Calendar className="w-3 h-3" />
              <span>Cal →</span>
            </button>

            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={whatsAppLoading}
              title="Invia messaggio di conferma WhatsApp"
              className={clsx(
                'flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all',
                whatsAppSent
                  ? 'bg-emerald-500 text-white'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60',
              )}
            >
              {whatsAppSent
                ? <><Check className="w-3 h-3" /> Inviato</>
                : <><MessageCircle className="w-3 h-3" /> {whatsAppLoading ? '…' : 'Conferma'}</>}
            </button>

            <button
              type="button"
              onClick={handleSendReminder}
              disabled={reminderLoading}
              title="Invia promemoria WhatsApp"
              className={clsx(
                'flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all',
                reminderSent
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60',
              )}
            >
              {reminderSent
                ? <><Check className="w-3 h-3" /> Inviato</>
                : <><MessageCircle className="w-3 h-3" /> {reminderLoading ? '…' : 'Promemoria'}</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Confirm delete ────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="bg-red-50 border-t border-red-100 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-red-600 font-semibold">Eliminare questo appuntamento?</span>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium px-3 py-1.5 rounded-lg bg-white border border-slate-200 transition-colors"
            >
              Annulla
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              {deleting ? '…' : 'Elimina'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
