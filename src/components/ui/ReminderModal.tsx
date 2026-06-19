'use client'

import { useEffect, useState } from 'react'
import { Bell, X, MessageCircle } from 'lucide-react'

interface ReminderData {
  appointmentId: string
  clientName: string
  serviceName: string
  time: string
  reminderMinutes: number
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
    <div className="fixed bottom-20 md:bottom-4 right-4 z-50 space-y-3 max-w-sm w-[calc(100vw-2rem)] md:w-full pointer-events-none">
      {reminders.map(reminder => (
        <div
          key={reminder.appointmentId}
          className="bg-white border border-blue-200 rounded-2xl shadow-2xl p-4 flex gap-3 items-start pointer-events-auto"
        >
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-blue-600" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">
              ⏰ Appuntamento tra {reminder.reminderMinutes} min
            </p>
            <p className="text-sm text-slate-600 mt-0.5 leading-snug">
              {reminder.clientName} — {reminder.serviceName} alle {reminder.time}
            </p>

            {reminder.whatsappUrl && (
              <a
                href={reminder.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => dismiss(reminder.appointmentId)}
                className="mt-3 inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Invia promemoria WhatsApp
              </a>
            )}
          </div>

          <button
            onClick={() => dismiss(reminder.appointmentId)}
            className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 mt-0.5"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
