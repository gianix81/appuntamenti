import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { getAdminDb } from '@/lib/firebase/admin'
import { sendSms } from '@/lib/twilio'
import type { AppointmentWithRelations, Client, Service, NotificationType } from '@/types/database'

// ── Chiave per la mappa notifications_sent ───────────────────────────────────
const NOTIFICATION_KEY_SEP = '_'
export function notificationKey(type: NotificationType, intervalMinutes: number): string {
  return `${type}${NOTIFICATION_KEY_SEP}${intervalMinutes}`
}

// ── Template e variabili ─────────────────────────────────────────────────────
function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

function buildVars(apt: AppointmentWithRelations, centerName: string, intervalMinutes?: number): Record<string, string> {
  const vars: Record<string, string> = {
    nome:     apt.clients.first_name,
    cognome:  apt.clients.last_name,
    servizio: apt.services.name,
    data:     format(new Date(apt.start_time), 'EEEE d MMMM', { locale: it }),
    ora:      format(new Date(apt.start_time), 'HH:mm',       { locale: it }),
    centro:   centerName || 'il centro',
  }
  if (intervalMinutes !== undefined) {
    if (intervalMinutes >= 2880)      { const d = Math.round(intervalMinutes / 1440); vars.quando = `tra ${d} ${d === 1 ? 'giorno' : 'giorni'}` }
    else if (intervalMinutes >= 1440) { vars.quando = 'domani' }
    else if (intervalMinutes >= 60)   { const h = Math.round(intervalMinutes / 60); vars.quando = `tra ${h} ${h === 1 ? 'ora' : 'ore'}` }
    else                               { vars.quando = `tra ${intervalMinutes} minuti` }
  }
  return vars
}

// ── Messaggi SMS (con supporto template personalizzato) ──────────────────────
function buildConfirmationMessage(apt: AppointmentWithRelations, centerName: string, template?: string): string {
  const vars = buildVars(apt, centerName)
  if (template) return applyTemplate(template, vars)
  return applyTemplate(
    'Ciao {nome}! Abbiamo fissato il tuo appuntamento per {servizio} il {data} alle {ora} presso {centro}. Rispondi SI per confermare o NO per annullare.',
    vars
  )
}

function buildReminderMessage(apt: AppointmentWithRelations, centerName: string, intervalMinutes: number, template?: string): string {
  const vars = buildVars(apt, centerName, intervalMinutes)
  if (template) return applyTemplate(template, vars)
  return applyTemplate(
    'Ciao {nome}! Ti ricordiamo il tuo appuntamento per {servizio} {quando} alle {ora} presso {centro}. Per annullare rispondi NO.',
    vars
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
  const notificationMessages: { confirmation?: string; reminder?: string } = settingsSnap.exists
    ? ((settingsSnap.data() as { notification_messages?: { confirmation?: string; reminder?: string } }).notification_messages ?? {})
    : {}

  return { appointment, aptData, centerName, notificationMessages, db }
}

// ── Invia SMS di conferma appuntamento ───────────────────────────────────────
export async function sendConfirmationMessage(
  appointmentId: string,
  intervalMinutes: number,
): Promise<{ success: boolean; error?: string }> {
  const resolved = await resolveAppointmentWithRelations(appointmentId)
  if ('error' in resolved) return { success: false, error: resolved.error }

  const { appointment, aptData, centerName, notificationMessages, db } = resolved
  const key = notificationKey('confirmation', intervalMinutes)

  if (aptData.notifications_sent?.[key]) return { success: false, error: 'Conferma già inviata per questo orario' }

  const messageBody = buildConfirmationMessage(appointment, centerName, notificationMessages.confirmation || undefined)

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

  const { appointment, aptData, centerName, notificationMessages, db } = resolved
  const key = notificationKey('reminder', intervalMinutes)

  if (aptData.notifications_sent?.[key]) {
    return { success: false, error: 'Promemoria già inviato per questo intervallo' }
  }

  const messageBody = buildReminderMessage(appointment, centerName, intervalMinutes, notificationMessages.reminder || undefined)

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
