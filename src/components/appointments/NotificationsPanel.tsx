'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CheckCircle, MessageSquare, Bell } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

const INTERVAL_LABELS: Record<number, string> = {
  15:   '15 min prima',
  30:   '30 min prima',
  60:   '1 ora prima',
  120:  '2 ore prima',
  240:  '4 ore prima',
  480:  '8 ore prima',
  1440: '24 ore prima',
  2880: '48 ore prima',
}

type Slot = { interval: number; type: 'confirmation' | 'reminder' }

interface Props {
  appointmentId: string
  initialSent?: Record<string, string> | null
}

export function NotificationsPanel({ appointmentId, initialSent }: Props) {
  const [sent, setSent]       = useState<Record<string, string>>(initialSent ?? {})
  const [slots, setSlots]     = useState<Slot[]>([])
  const [smsEnabled, setSmsEnabled] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    getDoc(doc(db, 'settings', 'main')).then(snap => {
      if (!snap.exists()) return
      const d = snap.data()
      setSmsEnabled(d.reminder_enabled ?? true)
      const loadedSlots: Slot[] = d.notification_slots ??
        ((d.reminder_intervals ?? (d.reminder_minutes ? [d.reminder_minutes] : [1440, 120]))
          .map((i: number) => ({ interval: i, type: 'reminder' as const })))
      setSlots(loadedSlots)
    }).catch(() => {})
  }, [])

  function slotKey(slot: Slot) { return `${slot.type}_${slot.interval}` }

  async function sendNotification(slot: Slot) {
    const key = slotKey(slot)
    setSending(key)
    setError(null)
    try {
      const res = await fetch('/api/reminders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appointmentId, type: slot.type, intervalMinutes: slot.interval }),
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

  if (slots.length === 0) return (
    <p className="text-xs text-slate-400 italic">Nessuna notifica configurata nelle impostazioni.</p>
  )

  return (
    <div className="space-y-2">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-4 py-2">{error}</div>
      )}

      {[...slots].sort((a, b) => b.interval - a.interval).map((slot, i) => {
        const key      = slotKey(slot)
        const sentAt   = sent[key]
        const isConf   = slot.type === 'confirmation'
        const isSending = sending === key
        const label    = INTERVAL_LABELS[slot.interval] ?? `${slot.interval} min prima`

        return (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
            {/* Orario + tipo */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-xs font-semibold mt-0.5 ${
                isConf ? 'text-blue-600' : 'text-amber-600'
              }`}>
                {isConf ? '✉️ Conferma' : '🔔 Promemoria'}
              </p>
            </div>

            {/* Stato / Pulsante */}
            {sentAt ? (
              <div className="flex items-center gap-1.5 text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs font-medium">
                  {format(new Date(sentAt), 'd MMM HH:mm', { locale: it })}
                </span>
              </div>
            ) : (
              <button
                type="button"
                disabled={isSending}
                onClick={() => sendNotification(slot)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ${
                  isConf
                    ? 'bg-blue-100 hover:bg-blue-200 text-blue-700'
                    : 'bg-amber-100 hover:bg-amber-200 text-amber-700'
                }`}
              >
                {isSending
                  ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : isConf ? <MessageSquare className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />
                }
                Invia
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

