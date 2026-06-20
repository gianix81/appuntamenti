'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { Send, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

const INTERVAL_LABELS: Record<number, string> = {
  15:   '15 minuti prima',
  30:   '30 minuti prima',
  60:   '1 ora prima',
  120:  '2 ore prima',
  240:  '4 ore prima',
  480:  '8 ore prima',
  1440: '24 ore prima',
  2880: '48 ore prima',
}

interface Props {
  appointmentId: string
  initialSent?: Record<string, string> | null
}

export function NotificationsPanel({ appointmentId, initialSent }: Props) {
  const [sent, setSent]                           = useState<Record<string, string>>(initialSent ?? {})
  const [confirmationEnabled, setConfirmationEnabled] = useState(true)
  const [reminderEnabled, setReminderEnabled]     = useState(true)
  const [intervals, setIntervals]                 = useState<number[]>([1440, 120])
  const [sending, setSending]                     = useState<string | null>(null)
  const [error, setError]                         = useState<string | null>(null)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'main')).then(snap => {
      if (!snap.exists()) return
      const d = snap.data()
      setConfirmationEnabled(d.confirmation_enabled ?? true)
      setReminderEnabled(d.reminder_enabled ?? true)
      setIntervals(d.reminder_intervals ?? (d.reminder_minutes ? [d.reminder_minutes] : [1440, 120]))
    }).catch(() => {})
  }, [])

  async function sendNotification(type: 'confirmation' | 'reminder', intervalMinutes?: number) {
    const key = type === 'confirmation' ? 'confirmation' : `reminder_${intervalMinutes}`
    setSending(key)
    setError(null)
    try {
      const res = await fetch('/api/reminders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appointmentId, type, intervalMinutes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore sconosciuto')
      setSent(prev => ({ ...prev, [key]: new Date().toISOString() }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(null)
    }
  }

  const hasAny = confirmationEnabled || reminderEnabled
  if (!hasAny) return (
    <p className="text-xs text-slate-400 italic">Le notifiche SMS sono disattivate nelle impostazioni.</p>
  )

  return (
    <div className="space-y-2">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-4 py-2">
          {error}
        </div>
      )}

      {/* Conferma appuntamento */}
      {confirmationEnabled && (
        <NotificationRow
          label="Conferma appuntamento"
          description="SMS con richiesta di conferma al cliente"
          sentAt={sent['confirmation']}
          isSending={sending === 'confirmation'}
          onSend={() => sendNotification('confirmation')}
        />
      )}

      {/* Promemoria per ogni intervallo configurato */}
      {reminderEnabled && intervals.map(interval => {
        const key   = `reminder_${interval}`
        const label = INTERVAL_LABELS[interval] ?? `${interval} min prima`
        return (
          <NotificationRow
            key={key}
            label={`Promemoria — ${label}`}
            description="SMS di promemoria appuntamento"
            sentAt={sent[key]}
            isSending={sending === key}
            onSend={() => sendNotification('reminder', interval)}
          />
        )
      })}
    </div>
  )
}

// ── Riga singola notifica ────────────────────────────────────────────────────
function NotificationRow({
  label,
  description,
  sentAt,
  isSending,
  onSend,
}: {
  label: string
  description: string
  sentAt?: string
  isSending: boolean
  onSend: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{description}</p>
        {sentAt && (
          <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Inviato il {format(new Date(sentAt), 'd MMM alle HH:mm', { locale: it })}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onSend}
        disabled={!!sentAt || isSending}
        className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium px-3 py-2 rounded-xl transition-colors shrink-0"
      >
        {isSending ? (
          <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
        ) : sentAt ? (
          <CheckCircle className="w-3 h-3" />
        ) : (
          <Send className="w-3 h-3" />
        )}
        {isSending ? '…' : sentAt ? 'Inviato' : 'Invia'}
      </button>
    </div>
  )
}
