'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { wsDoc } from '@/lib/firebase/workspace'
import type { AppointmentWithRelations } from '@/types/database'
import {
  Pencil, Trash2, MessageCircle, Check,
  ChevronRight, Phone,
} from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  appointment: AppointmentWithRelations
  onDelete?: (id: string) => void
  hideClientDetails?: boolean
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
  'bg-rose-500', 'bg-violet-500', 'bg-blue-500',
  'bg-emerald-500', 'bg-amber-500', 'bg-cyan-500',
  'bg-pink-500', 'bg-indigo-500',
]

function avatarBg(name: string): string {
  let h = 0
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

const STATUS_BORDER: Record<string, string> = {
  scheduled: 'border-l-blue-400',
  confirmed:  'border-l-emerald-400',
  cancelled:  'border-l-slate-300',
  completed:  'border-l-slate-400',
  no_show:    'border-l-orange-400',
}

const CONF_META: Record<string, { label: string; cls: string }> = {
  pending:     { label: 'In attesa',        cls: 'bg-amber-100 text-amber-700'     },
  confirmed:   { label: 'Confermato',       cls: 'bg-emerald-100 text-emerald-700' },
  declined:    { label: 'Rifiutato',        cls: 'bg-red-100 text-red-700'         },
  no_response: { label: 'Nessuna risposta', cls: 'bg-slate-100 text-slate-500'     },
}

export function AppointmentRow({ appointment, onDelete, hideClientDetails = false }: Props) {
  const { workspaceId } = useWorkspace()

  const hasConfirmedReminder     = Boolean(appointment.notifications_sent?.whatsapp_reminder_30 && appointment.reminder_sent_at)
  const hasConfirmedConfirmation = Boolean(appointment.notifications_sent?.whatsapp_confirmation)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)

  const [whatsAppSent, setWhatsAppSent]       = useState(false)
  const [whatsAppLoading, setWhatsAppLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(hasConfirmedConfirmation)

  const [reminderSent, setReminderSent]       = useState(false)
  const [reminderLoading, setReminderLoading] = useState(false)

  const [autoReminderSent, setAutoReminderSent]             = useState(hasConfirmedReminder)
  const [autoReminderError, setAutoReminderError]           = useState<string | null>(null)
  const [autoReminderAttempted, setAutoReminderAttempted]   = useState(false)

  const [now, setNow] = useState(() => Date.now())

  const start     = new Date(appointment.start_time)
  const end       = new Date(appointment.end_time)
  const msToStart = start.getTime() - now
  const msToEnd   = end.getTime() - now

  const isActive    = msToStart <= 0 && msToEnd > 0
  const isDone      = msToEnd <= 0
  const isCancelled = appointment.status === 'cancelled'

  const borderCls = STATUS_BORDER[appointment.status] ?? STATUS_BORDER.scheduled
  const confM     = CONF_META[appointment.confirmation_status] ?? CONF_META.pending

  if (!appointment.clients || !appointment.services) return null

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
      await deleteDoc(wsDoc(db, workspaceId, 'appointments', appointment.id))
      onDelete?.(appointment.id)
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
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

  const avatar = (
    <div className={clsx('w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-xs', avatarBg(clientFullName))}>
      {clientInitials}
    </div>
  )

  const timeBadge = (
    <div className="flex items-center gap-1 shrink-0">
      <span className="font-bold text-blue-600 tabular-nums text-sm">{format(start, 'HH:mm')}</span>
      <ChevronRight className="w-3 h-3 text-slate-300" />
      <span className="text-slate-400 tabular-nums text-sm">{format(end, 'HH:mm')}</span>
      <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full', isActive ? 'bg-green-100 text-green-700' : isDone ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600')}>
        {isActive ? 'In corso' : isDone ? 'Terminato' : `tra ${formatCountdown(msToStart)}`}
      </span>
    </div>
  )

  const badges = (
    <div className="flex items-center gap-1 flex-wrap">
      <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', confM.cls)}>{confM.label}</span>
      {appointment.staff && (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: appointment.staff.color }}>
          {appointment.staff.initials}
        </span>
      )}
      {confirmationSent && (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 flex items-center gap-0.5">
          <Check className="w-3 h-3" /> Conf.
        </span>
      )}
      {(autoReminderSent || reminderSent) && (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 flex items-center gap-0.5">
          <Check className="w-3 h-3" /> Prom.
        </span>
      )}
      {autoReminderError && (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-500">Prom. errore</span>
      )}
      {appointment.notes && (
        <span className="text-xs text-slate-400 italic truncate max-w-[140px]">{appointment.notes}</span>
      )}
    </div>
  )

  const actionButtons = !isCancelled && (
    <>
      {!hideClientDetails ? (
        <a href={`tel:${appointment.clients.phone}`} className="flex items-center gap-1 text-blue-500 text-xs font-semibold hover:text-blue-700 transition-colors shrink-0">
          <Phone className="w-3.5 h-3.5" />{appointment.clients.phone}
        </a>
      ) : (
        <span className="text-xs text-slate-300 italic shrink-0">Solo nominativo</span>
      )}
      {!hideClientDetails && (
        <button type="button" onClick={handleSendWhatsApp} disabled={whatsAppLoading}
          className={clsx('flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all shrink-0',
            whatsAppSent ? 'bg-emerald-500 text-white' : 'bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60')}>
          {whatsAppSent ? <><Check className="w-3 h-3" /> Inviato</> : <><MessageCircle className="w-3 h-3" />{whatsAppLoading ? '…' : 'Conferma'}</>}
        </button>
      )}
      {!hideClientDetails && (
        <button type="button" onClick={handleSendReminder} disabled={reminderLoading}
          className={clsx('flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all shrink-0',
            reminderSent ? 'bg-amber-500 text-white' : 'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60')}>
          {reminderSent ? <><Check className="w-3 h-3" /> Inviato</> : <><MessageCircle className="w-3 h-3" />{reminderLoading ? '…' : 'Promemoria'}</>}
        </button>
      )}
    </>
  )

  const editDelete = (
    <>
      <Link href={`/appointments/${appointment.id}/edit`}
        className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Modifica">
        <Pencil className="w-4 h-4" />
      </Link>
      {onDelete && (
        <button onClick={() => setConfirmDelete(true)}
          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Elimina">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </>
  )

  return (
    <div className={clsx('border-l-[3px] border-b border-b-slate-100 last:border-b-0', borderCls, isCancelled && 'opacity-60')}>

      {/* ── DESKTOP: riga distribuita justify-between ──────────────── */}
      <div className="hidden md:flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50/50 transition-colors">
        {/* Gruppo 1: avatar + nome */}
        <div className="flex items-center gap-2 shrink-0">
          {avatar}
          <span className="font-semibold text-slate-800 text-sm whitespace-nowrap">{clientFullName}</span>
        </div>
        {/* Gruppo 2: servizio + durata */}
        <span className="text-sm text-slate-500 whitespace-nowrap shrink-0">
          {appointment.services.name}
          <span className="text-slate-300 mx-1">·</span>
          {appointment.services.duration_minutes}min
        </span>
        {/* Gruppo 3: orario + stato */}
        <div className="shrink-0">{timeBadge}</div>
        {/* Gruppo 4: badges */}
        <div className="shrink-0">{badges}</div>
        {/* Gruppo 5: azioni */}
        <div className="flex items-center gap-2 shrink-0">
          {actionButtons}
          <div className="flex items-center gap-0.5">{editDelete}</div>
        </div>
      </div>

      {/* ── MOBILE: 3 righe ──────────────────────────────────────── */}
      <div className="md:hidden px-3 py-2.5 space-y-1.5">
        {/* Riga 1: avatar + nome + edit/delete */}
        <div className="flex items-center gap-2">
          {avatar}
          <span className="font-semibold text-slate-800 text-sm flex-1 min-w-0 truncate">{clientFullName}</span>
          <div className="flex items-center gap-0.5 shrink-0">{editDelete}</div>
        </div>
        {/* Riga 2: servizio + orario + badges */}
        <div className="flex items-center gap-2 flex-wrap pl-10">
          <span className="text-sm text-slate-500 shrink-0">
            {appointment.services.name}<span className="text-slate-300 mx-1">·</span>{appointment.services.duration_minutes}min
          </span>
          {timeBadge}
          {badges}
        </div>
        {/* Riga 3: azioni */}
        {!isCancelled && (
          <div className="flex items-center gap-1.5 flex-wrap pl-10">
            {actionButtons}
          </div>
        )}
      </div>

      {/* ── Confirm delete ─────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="bg-red-50 border-t border-red-100 px-4 py-2.5 flex items-center justify-between gap-3">
          <span className="text-xs text-red-600 font-semibold">Eliminare questo appuntamento?</span>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setConfirmDelete(false)}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium px-3 py-1.5 rounded-lg bg-white border border-slate-200 transition-colors">
              Annulla
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="text-xs text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 font-semibold px-3 py-1.5 rounded-lg transition-colors">
              {deleting ? '…' : 'Elimina'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
