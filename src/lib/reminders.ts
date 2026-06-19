import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { getAdminDb } from '@/lib/firebase/admin'
import { sendSms } from '@/lib/twilio'
import type { AppointmentWithRelations, Client, Service } from '@/types/database'

function buildReminderMessage(apt: AppointmentWithRelations, centerName: string): string {
  const name    = apt.clients.first_name
  const time    = format(new Date(apt.start_time), 'HH:mm', { locale: it })
  const service = apt.services.name
  return (
    `Ciao ${name}, ti ricordiamo il tuo appuntamento presso ${centerName} oggi alle ${time} per ${service}. ` +
    `Rispondi SI per confermare oppure NO per annullare.`
  )
}

export async function sendAppointmentReminder(appointmentId: string): Promise<{ success: boolean; error?: string }> {
  const db = getAdminDb()
  const aptSnap = await db.collection('appointments').doc(appointmentId).get()
  if (!aptSnap.exists) return { success: false, error: 'Appuntamento non trovato' }

  const apt = { id: aptSnap.id, ...aptSnap.data() } as AppointmentWithRelations & { client_id: string; service_id: string }

  if (apt.reminder_sent_at) return { success: false, error: 'Promemoria già inviato' }
  if (apt.status === 'cancelled') return { success: false, error: 'Appuntamento annullato' }

  const [clientSnap, serviceSnap, settingsSnap] = await Promise.all([
    db.collection('clients').doc(apt.client_id).get(),
    db.collection('services').doc(apt.service_id).get(),
    db.collection('settings').doc('main').get(),
  ])

  if (!clientSnap.exists || !serviceSnap.exists) return { success: false, error: 'Cliente o servizio non trovati' }

  const appointment: AppointmentWithRelations = {
    ...apt,
    clients:  { id: clientSnap.id,  ...clientSnap.data() }  as Client,
    services: { id: serviceSnap.id, ...serviceSnap.data() } as Service,
  }
  const centerName = settingsSnap.exists
    ? (settingsSnap.data() as { center_name: string }).center_name
    : 'il centro estetico'

  const messageBody = buildReminderMessage(appointment, centerName)

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
      client_id:           apt.client_id,
      channel:             'sms',
      message_body:        messageBody,
      provider_message_id: messageSid,
      direction:           'outbound',
      status:              'sent',
      received_response:   false,
      created_at:          now,
    }),
    db.collection('appointments').doc(appointmentId).update({ reminder_sent_at: now }),
  ])

  return { success: true }
}

export function parseClientReply(body: string): 'confirmed' | 'declined' | null {
  const n = body.trim().toUpperCase()
  if (['SI', 'SÌ', 'YES', 'S', 'Y', '1'].includes(n)) return 'confirmed'
  if (['NO', 'N', '0'].includes(n)) return 'declined'
  return null
}
