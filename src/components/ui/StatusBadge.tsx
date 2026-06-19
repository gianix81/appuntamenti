import { clsx } from 'clsx'
import type { AppointmentStatus, ConfirmationStatus } from '@/types/database'

const statusConfig: Record<AppointmentStatus, { label: string; className: string }> = {
  scheduled:  { label: 'Programmato', className: 'bg-blue-100 text-blue-700' },
  confirmed:  { label: 'Confermato',  className: 'bg-green-100 text-green-700' },
  cancelled:  { label: 'Annullato',   className: 'bg-red-100 text-red-700' },
  completed:  { label: 'Completato',  className: 'bg-gray-100 text-gray-600' },
  no_show:    { label: 'No-show',     className: 'bg-orange-100 text-orange-700' },
}

const confirmConfig: Record<ConfirmationStatus, { label: string; className: string }> = {
  pending:      { label: 'In attesa',   className: 'bg-yellow-100 text-yellow-700' },
  confirmed:    { label: 'Confermato',  className: 'bg-green-100 text-green-700' },
  declined:     { label: 'Rifiutato',   className: 'bg-red-100 text-red-700' },
  no_response:  { label: 'Nessuna risposta', className: 'bg-gray-100 text-gray-600' },
}

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, className } = statusConfig[status]
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  )
}

export function ConfirmationStatusBadge({ status }: { status: ConfirmationStatus }) {
  const { label, className } = confirmConfig[status]
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  )
}
