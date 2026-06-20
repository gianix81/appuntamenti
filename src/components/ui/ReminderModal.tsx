'use client'

import { useEffect, useState } from 'react'
import { Bell, X, MessageCircle, Send, CheckCircle } from 'lucide-react'

interface ReminderData {
  appointmentId: string
  clientName: string
  serviceName: string
  time: string
  reminderMinutes: number
  intervalMinutes: number
  whatsappUrl?: string
}

export function ReminderModal() {
  const [reminders, setReminders] = useState<ReminderData[]>([])

  useEffect(() => {
    function handler(e: Event) {
      const data = (e as CustomEvent<ReminderData>).detail
      setReminders(prev => {
        if (prev.some(r => r.appointmentId === data.appointmentId)) return prev
        return [...prev, data]
      })
    }
    window.addEventListener('appointment-reminder', handler)
    return () => window.removeEventListener('appointment-reminder', handler)
  }, [])

  function dismiss(id: string) {
    setReminders(prev => prev.filter(r => r.appointmentId !== id))
  }

  if (reminders.length === 0) return null

  return (
    <div className="fixed bottom-20 md:bottom-4 right-4 z-50 space-y-3 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
      {reminders.map(reminder => (
        <ReminderCard
          key={reminder.appointmentId}
          reminder={reminder}
          onDismiss={() => dismiss(reminder.appointmentId)}
        />
      ))}
    </div>
  )
}

// ── Singola card notifica ─────────────────────────────────────────────────────
function ReminderCard({ reminder, onDismiss }: { reminder: ReminderData; onDismiss: () => void }) {
  const [smsSent, setSmsSent]   = useState<'confirmation' | 'reminder' | null>(null)
  const [sending, setSending]   = useState<'confirmation' | 'reminder' | null>(null)
  const [smsError, setSmsError] = useState<string | null>(null)

  const isNow = reminder.reminderMinutes === 0

  async function sendSms(type: 'confirmation' | 'reminder') {
    setSending(type)
    setSmsError(null)
    try {
      const res = await fetch('/api/reminders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          appointmentId: reminder.appointmentId,
          type,
          intervalMinutes: reminder.intervalMinutes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore')
      setSmsSent(type)
    } catch (err) {
      setSmsError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="bg-white border border-blue-200 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isNow ? 'bg-red-100' : 'bg-blue-100'}`}>
          <Bell className={`w-5 h-5 ${isNow ? 'text-red-600' : 'text-blue-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${isNow ? 'text-red-700' : 'text-slate-800'}`}>
            {isNow ? '⚡ Appuntamento ADESSO!' : `⏰ Tra ${reminder.reminderMinutes} min`}
          </p>
          <p className="text-sm text-slate-600 leading-snug mt-0.5">
            <span className="font-semibold">{reminder.clientName}</span>
            {' — '}{reminder.serviceName}
            {' alle '}<span className="font-semibold">{reminder.time}</span>
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-slate-300 hover:text-slate-500 transition-colors shrink-0"
          aria-label="Chiudi"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Azioni ── */}
      <div className="px-4 pb-4 space-y-2">

        {/* WhatsApp */}
        {reminder.whatsappUrl && (
          <a
            href={reminder.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 w-full bg-[#25D366] hover:bg-[#1db954] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">Apri WhatsApp</span>
          </a>
        )}

        {/* SMS: 2 pulsanti affiancati */}
        {smsSent ? (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
            <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
            <span className="text-sm text-green-700 font-medium">
              SMS {smsSent === 'confirmation' ? 'di conferma' : 'promemoria'} inviato ✓
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!!sending}
              onClick={() => sendSms('confirmation')}
              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2.5 rounded-xl transition-colors"
            >
              {sending === 'confirmation'
                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Send className="w-3.5 h-3.5" />
              }
              SMS Conferma
            </button>

            <button
              type="button"
              disabled={!!sending}
              onClick={() => sendSms('reminder')}
              className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2.5 rounded-xl transition-colors"
            >
              {sending === 'reminder'
                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Bell className="w-3.5 h-3.5" />
              }
              SMS Promemoria
            </button>
          </div>
        )}

        {smsError && (
          <p className="text-xs text-red-500 px-1">{smsError}</p>
        )}
      </div>
    </div>
  )
}

