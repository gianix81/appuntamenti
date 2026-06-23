import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export type AppointmentMessageKind = 'confirmation' | 'reminder'

export function buildAppointmentMessage(params: {
  kind: AppointmentMessageKind
  firstName: string
  serviceName: string
  start: Date
}): string {
  const time = format(params.start, 'HH:mm', { locale: it })
  const date = format(params.start, 'EEEE d MMMM', { locale: it })

  if (params.kind === 'reminder') {
    return `Ciao ${params.firstName}, ti ricordiamo l'appuntamento per ${params.serviceName} ${date} alle ${time}. A presto!`
  }

  return `Ciao ${params.firstName}! Ti confermiamo l'appuntamento per ${params.serviceName} ${date} alle ${time}. Rispondi a questo messaggio per confermare o disdire. Grazie!`
}
