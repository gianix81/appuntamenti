import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { AppointmentWithRelations } from '@/types/database'
import { AppointmentStatusBadge, ConfirmationStatusBadge } from '@/components/ui/StatusBadge'
import { Clock, Phone, Scissors, Pencil, MessageCircle } from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  appointment: AppointmentWithRelations
  onSendReminder?: (id: string) => void
  sending?: boolean
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

export function AppointmentCard({ appointment, onSendReminder, sending }: Props) {
  const isPending = appointment.confirmation_status === 'pending'
  const start = new Date(appointment.start_time)
  const end   = new Date(appointment.end_time)

  return (
    <div className={clsx(
      'bg-white rounded-2xl border p-4 flex gap-4',
      isPending ? 'border-yellow-200 ring-1 ring-yellow-100' : 'border-gray-100'
    )}>
      <div className="flex flex-col items-center justify-center w-14 shrink-0">
        <span className="text-xl font-bold text-rose-500">{format(start, 'HH:mm')}</span>
        <span className="text-xs text-gray-400">{format(end, 'HH:mm')}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 truncate">
              {appointment.clients.first_name} {appointment.clients.last_name}
            </p>
            <div className="flex items-center gap-1 text-gray-500 text-xs mt-0.5">
              <Scissors className="w-3 h-3 shrink-0" />
              <span className="truncate">{appointment.services.name}</span>
            </div>
            <div className="flex items-center gap-1 text-gray-500 text-xs mt-0.5">
              <Clock className="w-3 h-3 shrink-0" />
              <span>{appointment.services.duration_minutes} min</span>
            </div>
          </div>
          <Link
            href={`/appointments/${appointment.id}/edit`}
            className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2">
          <AppointmentStatusBadge status={appointment.status} />
          <ConfirmationStatusBadge status={appointment.confirmation_status} />
        </div>

        {appointment.notes && (
          <p className="text-xs text-gray-400 mt-2 italic truncate">{appointment.notes}</p>
        )}

        <div className="flex items-center justify-between mt-3 gap-2">
          <a
            href={`tel:${appointment.clients.phone}`}
            className="flex items-center gap-1 text-rose-500 text-xs font-medium hover:underline"
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
  )
}
