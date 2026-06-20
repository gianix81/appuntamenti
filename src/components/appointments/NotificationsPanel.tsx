'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CheckCircle, MessageSquare, Bell } from 'lucide-react'
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
  const [sent, setSent]       = useState<Record<string, string>>(initialSent ?? {})
  const [intervals, setIntervals] = useState<number[]>([1440, 120])
  const [smsEnabled, setSmsEnabled] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'main')).then(snap => {
      if (!snap.exists()) return
      const d = snap.data()
      setSmsEnabled(d.reminder_enabled ?? true)
      setIntervals(d.reminder_intervals ?? (d.reminder_minutes ? [d.reminder_minutes] : [1440, 120]))
    }).catch(() => {})
  }, [])

  async function sendNotification(type: 'confirmation' | 'reminder', intervalMinutes: number) {
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

  if (!smsEnabled) return (
    <p className="text-xs text-slate-400 italic">Le notifiche SMS sono disattivate nelle impostazioni.</p>
  )

  if (intervals.length === 0) return (
    <p className="text-xs text-slate-400 italic">Nessun orario configurato nelle impostazioni.</p>
  )

  const confirmSentAt = sent['confirmation']

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-4 py-2">{error}</div>
      )}

      {[...intervals].sort((a, b) => b - a).map(interval => {
        const label = INTERVAL_LABELS[interval] ?? `${interval} min prima`
        const reminderKey = `reminder_${interval}`
        const reminderSentAt = sent[reminderKey]

        return (
          <div key={interval} className="rounded-2xl border border-slate-200 overflow-hidden">
            {/* Header: etichetta orario */}
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
            </div>

            {/* 2 pulsanti affiancati */}
            <div className="grid grid-cols-2 divide-x divide-slate-100">

              {/* ── Conferma ── */}
              <button
                type="button"
                disabled={!!confirmSentAt || sending === 'confirmation'}
                onClick={() => { if (!confirmSentAt) sendNotification('confirmation', interval) }}
                className={`flex flex-col items-center gap-1.5 p-4 transition-colors ${
                  confirmSentAt ? 'bg-green-50 cursor-default' : 'hover:bg-blue-50 active:bg-blue-100'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${confirmSentAt ? 'bg-green-100' : 'bg-blue-100'}`}>
                  {sending === 'confirmation'
                    ? <span className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    : confirmSentAt
                      ? <CheckCircle className="w-5 h-5 text-green-600" />
                      : <MessageSquare className="w-5 h-5 text-blue-600" />
                  }
                </div>
                <span className={`text-xs font-bold ${confirmSentAt ? 'text-green-700' : 'text-blue-700'}`}>
                  Conferma
                </span>
                <span className={`text-[10px] leading-snug text-center ${confirmSentAt ? 'text-green-500' : 'text-slate-400'}`}>
                  {confirmSentAt
                    ? format(new Date(confirmSentAt), 'd MMM HH:mm', { locale: it })
                    : 'Richiesta di conferma'}
                </span>
              </button>

              {/* ── Promemoria ── */}
              <button
                type="button"
                disabled={!!reminderSentAt || sending === reminderKey}
                onClick={() => { if (!reminderSentAt) sendNotification('reminder', interval) }}
                className={`flex flex-col items-center gap-1.5 p-4 transition-colors ${
                  reminderSentAt ? 'bg-green-50 cursor-default' : 'hover:bg-amber-50 active:bg-amber-100'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${reminderSentAt ? 'bg-green-100' : 'bg-amber-100'}`}>
                  {sending === reminderKey
                    ? <span className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    : reminderSentAt
                      ? <CheckCircle className="w-5 h-5 text-green-600" />
                      : <Bell className="w-5 h-5 text-amber-600" />
                  }
                </div>
                <span className={`text-xs font-bold ${reminderSentAt ? 'text-green-700' : 'text-amber-700'}`}>
                  Promemoria
                </span>
                <span className={`text-[10px] leading-snug text-center ${reminderSentAt ? 'text-green-500' : 'text-slate-400'}`}>
                  {reminderSentAt
                    ? format(new Date(reminderSentAt), 'd MMM HH:mm', { locale: it })
                    : 'Avviso appuntamento'}
                </span>
              </button>

            </div>
          </div>
        )
      })}
    </div>
  )
}

