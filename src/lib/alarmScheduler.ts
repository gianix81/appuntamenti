import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  saveAlarms, deleteAlarmsForAppointment,
  getAlarmSettings, type StoredAlarm,
} from './alarmDB'

interface AppointmentInfo {
  id:         string
  start_time: string   // ISO
  client:     { first_name: string; last_name: string; phone: string }
  service:    { name: string }
  notes?:     string | null
}

function buildWhatsAppUrl(client: AppointmentInfo['client'], service: AppointmentInfo['service'], start: Date): string {
  const time = format(start, 'HH:mm', { locale: it })
  const date = format(start, "EEEE d MMMM", { locale: it })
  const msg  = `Ciao ${client.first_name}! Ti ricordiamo il tuo appuntamento per ${service.name} ${date} alle ${time}. Rispondici per confermare o disdire. Grazie!`
  const phone = client.phone.replace(/\s+/g, '').replace(/^\+/, '')
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
}

function buildSmsUrl(client: AppointmentInfo['client'], service: AppointmentInfo['service'], start: Date): string {
  const time = format(start, 'HH:mm', { locale: it })
  const date = format(start, "EEEE d MMMM", { locale: it })
  const msg  = `Ciao ${client.first_name}, ti ricordiamo l'appuntamento per ${service.name} ${date} alle ${time}. Rispondi a questo SMS per confermare.`
  const phone = client.phone.replace(/\s+/g, '')
  // sms: URI — Android uses ?body=, iOS uses &body=
  return `sms:${phone}?body=${encodeURIComponent(msg)}`
}

export async function scheduleAlarms(apt: AppointmentInfo): Promise<void> {
  // Remove old alarms for this appointment (re-scheduling after edit)
  await deleteAlarmsForAppointment(apt.id)

  const settings = await getAlarmSettings()
  if (!settings || !settings.offsets_minutes.length) return

  const aptTime  = new Date(apt.start_time).getTime()
  const now      = Date.now()
  const startDt  = new Date(apt.start_time)

  const alarms: StoredAlarm[] = settings.offsets_minutes
    .map(offset => ({
      id:               `${apt.id}_${offset}`,
      appointment_id:   apt.id,
      alarm_time:       aptTime - offset * 60 * 1000,
      appointment_time: aptTime,
      client_name:      `${apt.client.first_name} ${apt.client.last_name}`,
      client_phone:     apt.client.phone,
      service_name:     apt.service.name,
      notes:            apt.notes ?? null,
      whatsapp_url:     buildWhatsAppUrl(apt.client, apt.service, startDt),
      sms_url:          buildSmsUrl(apt.client, apt.service, startDt),
      fired:            false,
    }))
    .filter(a => a.alarm_time > now) // skip past alarms

  if (alarms.length) await saveAlarms(alarms)

  // Notify SW to update its alarm cache
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(reg => reg.active?.postMessage({ type: 'ALARMS_UPDATED' }))
      .catch(() => {})
  }
}

export async function cancelAlarms(appointmentId: string): Promise<void> {
  await deleteAlarmsForAppointment(appointmentId)
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(reg => reg.active?.postMessage({ type: 'ALARMS_UPDATED' }))
      .catch(() => {})
  }
}
