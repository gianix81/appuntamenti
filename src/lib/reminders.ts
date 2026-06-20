import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { getAdminDb } from '@/lib/firebase/admin'
import { sendSms } from '@/lib/twilio'
import type { AppointmentWithRelations, Client, Service, NotificationType } from '@/types/database'

// ── Chiave per la mappa notifications_sent ───────────────────────────────────
export function notificationKey(type: 'confirmation'): string
export function notificationKey(type: 'reminder', intervalMinutes: number): string
export function notificationKey(type: NotificationType, intervalMinutes?: number): string {
  if (type === 'confirmation') return 'confirmation'
  return `reminder_${intervalMinutes}`
}

// ── Messaggi SMS ─────────────────────────────────────────────────────────────
function buildConfirmationMessage(apt: AppointmentWithRelations, centerName: string): string {
  const name    = apt.clients.first_name
  const time    = format(new Date(apt.start_time), 'HH:mm', { locale: it })
  const date    = format(new Date(apt.start_time), 'EEEE d MMMM', { locale: it })
  const service = apt.services.name
  return (
    `Ciao ${name}! Abbiamo fissato il tuo appuntamento per ${service} ` +
    `${date} alle ${time}` +
    (centerName ? ` presso ${centerName}` : '') +
    `. Rispondi SI per confermare oppure NO per annullare.`
  )
}

function buildReminderMessage(apt: AppointmentWithRelations, centerName: string, intervalMinutes: number): string {
  const name    = apt.clients.first_name
  const time    = format(new Date(apt.start_time), 'HH:mm', { locale: it })
  const service = apt.services.name

  let when: string
  if (intervalMinutes >= 1440) {
    when = 'domani'
  } else if (intervalMinutes >= 60) {
    const hours = Math.round(intervalMinutes / 60)
    when = `tra ${hours} ${hours === 1 ? 'ora' : 'ore'}`
  } else {
    when = `tra ${intervalMinutes} minuti`
  }

  return (
    `Ciao ${name}, ti ricordiamo il tuo appuntamento per ${service} ` +
    `${when} alle ${time}` +
    (centerName ? ` presso ${centerName}` : '') +
    `. Per annullare rispondi NO.`
  )
}

// ── Helper: risolve appuntamento con relazioni ───────────────────────────────
async function resolveAppointmentWithRelations(appointmentId: string) {
  const db      = getAdminDb()
  const aptSnap = await db.collection('appointments').doc(appointmentId).get()
  if (!aptSnap.exists) return { error: 'Appuntamento non trovato' as const }

  const aptData = { id: aptSnap.id, ...aptSnap.data() } as AppointmentWithRelations & {
    client_id: string
    service_id: string
    notifications_sent?: Record<string, string>
  }

  if (aptData.status === 'cancelled') return { error: 'Appuntamento annullato' as const }

  const [clientSnap, serviceSnap, settingsSnap] = await Promise.all([
    db.collection('clients').doc(aptData.client_id).get(),
    db.collection('services').doc(aptData.service_id).get(),
    db.collection('settings').doc('main').get(),
  ])

  if (!clientSnap.exists || !serviceSnap.exists) return { error: 'Cliente o servizio non trovati' as const }

  const appointment: AppointmentWithRelations = {
    ...aptData,
    clients:  { id: clientSnap.id,  ...clientSnap.data() }  as Client,
    services: { id: serviceSnap.id, ...serviceSnap.data() } as Service,
  }
  const centerName = settingsSnap.exists
    ? (settingsSnap.data() as { center_name: string }).center_name
    : 'il centro estetico'

  return { appointment, aptData, centerName, db }
}

// ── Invia SMS di conferma appuntamento ───────────────────────────────────────
export async function sendConfirmationMessage(appointmentId: string): Promise<{ success: boolean; error?: string }> {
  const resolved = await resolveAppointmentWithRelations(appointmentId)
  if ('error' in resolved) return { success: false, error: resolved.error }

  const { appointment, aptData, centerName, db } = resolved
  const key = notificationKey('confirmation')

  if (aptData.notifications_sent?.[key]) return { success: false, error: 'Conferma già inviata' }

  const messageBody = buildConfirmationMessage(appointment, centerName)

  let messageSid: string
  try {
    messageSid = await sendSms(appointment.clients.phone, messageBody)
  } catch (err) {
    return { success: false, error: String(err) }
  }

  const now = new Date().toISOString()
  await Promise.all([
    db.collection('message_logs').add({
      appointment_id:      appointmentId,
      client_id:           aptData.client_id,
      channel:             'sms',
      message_body:        messageBody,
      provider_message_id: messageSid,
      direction:           'outbound',
      status:              'sent',
      notification_type:   'confirmation',
      received_response:   false,
      created_at:          now,
    }),
    db.collection('appointments').doc(appointmentId).update({
      [`notifications_sent.${key}`]: now,
    }),
  ])

  return { success: true }
}

// ── Invia SMS di promemoria appuntamento ─────────────────────────────────────
export async function sendAppointmentReminder(
  appointmentId: string,
  intervalMinutes = 30,
): Promise<{ success: boolean; error?: string }> {
  const resolved = await resolveAppointmentWithRelations(appointmentId)
  if ('error' in resolved) return { success: false, error: resolved.error }

  const { appointment, aptData, centerName, db } = resolved
  const key = notificationKey('reminder', intervalMinutes)

  if (aptData.notifications_sent?.[key]) {
    return { success: false, error: 'Promemoria già inviato per questo intervallo' }
  }

  const messageBody = buildReminderMessage(appointment, centerName, intervalMinutes)

  let messageSid: string
  try {
    messageSid = await sendSms(appointment.clients.phone, messageBody)
  } catch (err) {
    return { success: false, error: String(err) }
  }

  const now = new Date().toISOString()
  await Promise.all([
    db.collection('message_logs').add({
      appointment_id:      appointmentId,
      client_id:           aptData.client_id,
      channel:             'sms',
      message_body:        messageBody,
      provider_message_id: messageSid,
      direction:           'outbound',
      status:              'sent',
      notification_type:   'reminder',
      interval_minutes:    intervalMinutes,
      received_response:   false,
      created_at:          now,
    }),
    db.collection('appointments').doc(appointmentId).update({
      [`notifications_sent.${key}`]: now,
      reminder_sent_at: now,
    }),
  ])

  return { success: true }
}

// ── Parsing risposta cliente ─────────────────────────────────────────────────
export function parseClientReply(body: string): 'confirmed' | 'declined' | null {
  const n = body.trim().toUpperCase()
  if (['SI', 'SÌ', 'YES', 'S', 'Y', '1'].includes(n)) return 'confirmed'
  if (['NO', 'N', '0'].includes(n)) return 'declined'
  return null
}
