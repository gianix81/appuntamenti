const TZ = 'Europe/Rome'

export type AppointmentMessageKind = 'confirmation' | 'reminder'

export function buildAppointmentMessage(params: {
  kind: AppointmentMessageKind
  firstName: string
  serviceName: string
  start: Date
}): string {
  const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(params.start)
  const date = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(params.start)

  if (params.kind === 'reminder') {
    return `Ciao ${params.firstName}, ti ricordiamo l'appuntamento per ${params.serviceName} ${date} alle ${time}. A presto!`
  }

  return `Ciao ${params.firstName}! Ti confermiamo l'appuntamento per ${params.serviceName} ${date} alle ${time}. Rispondi a questo messaggio per confermare o disdire. Grazie!`
}
