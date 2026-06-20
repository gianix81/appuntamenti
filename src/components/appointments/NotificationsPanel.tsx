'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CheckCircle, MessageSquare, Bell } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { buildSmsUrl, buildSmsBody } from '@/lib/sms'

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

interface AptCtx {
  phone: string; firstName: string; lastName: string
  serviceName: string; startTime: string; centerName: string
  templates: { confirmation?: string; reminder?: string }
}

interface Props {
  appointmentId: string
  initialSent?: Record<string, string> | null
}

export function NotificationsPanel({ appointmentId, initialSent }: Props) {
  const [sent, setSent]       = useState<Record<string, string>>(initialSent ?? {})
  const [slots, setSlots]     = useState<Slot[]>([])
  const [smsEnabled, setSmsEnabled] = useState(true)
  const [ctx, setCtx]         = useState<AptCtx | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [settingsSnap, aptSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'main')),
          getDoc(doc(db, 'appointments', appointmentId)),
        ])
        if (settingsSnap.exists()) {
          const d = settingsSnap.data()
          setSmsEnabled(d.reminder_enabled ?? true)
          setSlots(d.notification_slots ??
            ((d.reminder_intervals ?? (d.reminder_minutes ? [d.reminder_minutes] : [1440, 120]))
              .map((i: number) => ({ interval: i, type: 'reminder' as const }))))
          if (aptSnap.exists()) {
            const apt = aptSnap.data()
            const [cSnap, sSnap] = await Promise.all([
              getDoc(doc(db, 'clients', apt.client_id)),
              getDoc(doc(db, 'services', apt.service_id)),
            ])
            if (cSnap.exists() && sSnap.exists()) {
              const c = cSnap.data(); const s = sSnap.data()
              setCtx({
                phone: c.phone ?? '', firstName: c.first_name ?? '', lastName: c.last_name ?? '',
                serviceName: s.name ?? '', startTime: apt.start_time,
                centerName: d.center_name ?? '', templates: d.notification_messages ?? {},
              })
            }
          }
        }
      } catch { /* ignora */ }
      setLoading(false)
    }
    load()
  }, [appointmentId])

  function slotKey(slot: Slot) { return `${slot.type}_${slot.interval}` }

  function getSmsUrl(slot: Slot): string {
    if (!ctx) return '#'
    const body = buildSmsBody(slot.type, {
      firstName: ctx.firstName, lastName: ctx.lastName,
      serviceName: ctx.serviceName, startTime: ctx.startTime,
      centerName: ctx.centerName, intervalMinutes: slot.interval,
    }, ctx.templates)
    return buildSmsUrl(ctx.phone, body)
  }

  async function markSent(slot: Slot) {
    const key = slotKey(slot)
    const now = new Date().toISOString()
    setSent(prev => ({ ...prev, [key]: now }))
    try {
      await updateDoc(doc(db, 'appointments', appointmentId), {
        [`notifications_sent.${key}`]: now,
      })
    } catch { /* ignora */ }
  }

  if (!smsEnabled) return (
    <p className="text-xs text-slate-400 italic">Le notifiche SMS sono disattivate nelle impostazioni.</p>
  )
  if (loading) return (
    <div className="flex items-center gap-2 py-2">
      <span className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
      <span className="text-xs text-slate-400">Caricamento…</span>
    </div>
  )
  if (slots.length === 0) return (
    <p className="text-xs text-slate-400 italic">Nessuna notifica configurata nelle impostazioni.</p>
  )

  return (
    <div className="space-y-2">
      {[...slots].sort((a, b) => b.interval - a.interval).map((slot, i) => {
        const key    = slotKey(slot)
        const sentAt = sent[key]
        const isConf = slot.type === 'confirmation'
        const label  = INTERVAL_LABELS[slot.interval] ?? `${slot.interval} min prima`

        return (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-xs font-semibold mt-0.5 ${isConf ? 'text-blue-600' : 'text-amber-600'}`}>
                {isConf ? '✉️ Conferma' : '🔔 Promemoria'}
              </p>
            </div>

            {sentAt ? (
              <div className="flex items-center gap-1.5 text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs font-medium">{format(new Date(sentAt), 'd MMM HH:mm', { locale: it })}</span>
              </div>
            ) : (
              <a
                href={ctx ? getSmsUrl(slot) : '#'}
                onClick={() => markSent(slot)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  isConf ? 'bg-blue-100 hover:bg-blue-200 text-blue-700' : 'bg-amber-100 hover:bg-amber-200 text-amber-700'
                }`}
              >
                {isConf ? <MessageSquare className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                Invia SMS
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}

