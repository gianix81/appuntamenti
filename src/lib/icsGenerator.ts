import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { AlarmSettings } from './alarmDB'

export interface ICSAppointment {
  id:           string
  start_time:   string   // ISO
  end_time:     string   // ISO
  client_name:  string
  client_phone: string
  service_name: string
  notes?:       string | null
}

function toICSDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function offsetToTrigger(minutes: number): string {
  if (minutes === 0) return 'PT0S'
  if (minutes < 60)  return `-PT${minutes}M`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `-PT${h}H` : `-PT${h}H${m}M`
}

function alarmLabel(minutes: number): string {
  if (minutes === 0)  return 'Appuntamento ora!'
  if (minutes < 60)   return `Appuntamento tra ${minutes} min`
  const h = Math.round(minutes / 60)
  return `Appuntamento tra ${h}${h === 1 ? ' ora' : ' ore'}`
}

/** RFC 5545 line folding: max 75 octets per line */
function fold(line: string): string {
  const out: string[] = []
  while (line.length > 75) {
    out.push(line.slice(0, 75))
    line = ' ' + line.slice(75)
  }
  out.push(line)
  return out.join('\r\n')
}

function buildWhatsAppUrl(client: { first_name: string; phone: string }, serviceName: string, start: Date): string {
  const time = format(start, 'HH:mm', { locale: it })
  const date = format(start, 'EEEE d MMMM', { locale: it })
  const msg  = `Ciao ${client.first_name}! Ti ricordiamo il tuo appuntamento per ${serviceName} ${date} alle ${time}. Rispondici per confermare o disdire. Grazie!`
  const phone = client.phone.replace(/\s+/g, '').replace(/^\+/, '')
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
}

function buildSmsUrl(phone: string, firstName: string, serviceName: string, start: Date): string {
  const time = format(start, 'HH:mm', { locale: it })
  const date = format(start, 'EEEE d MMMM', { locale: it })
  const msg  = `Ciao ${firstName}, ti ricordiamo l'appuntamento per ${serviceName} ${date} alle ${time}. Rispondi per confermare.`
  const clean = phone.replace(/\s+/g, '')
  return `sms:${clean}?body=${encodeURIComponent(msg)}`
}

export function generateICS(apt: ICSAppointment, settings: AlarmSettings): string {
  const start     = new Date(apt.start_time)
  const firstName = apt.client_name.split(' ')[0] ?? apt.client_name

  const waUrl  = buildWhatsAppUrl(
    { first_name: firstName, phone: apt.client_phone },
    apt.service_name,
    start,
  )
  const smsUrl = buildSmsUrl(apt.client_phone, firstName, apt.service_name, start)

  const uid     = `apt-${apt.id}@estetista`
  const dtStart = toICSDate(apt.start_time)
  const dtEnd   = toICSDate(apt.end_time)
  const dtstamp = toICSDate(new Date().toISOString())
  const summary = `${apt.client_name} — ${apt.service_name}`

  // Event description: shown when user taps the event in the calendar
  // URLs here are tappable on both iOS and Android
  const descLines = [
    `Cliente: ${apt.client_name}`,
    `Tel: ${apt.client_phone}`,
    `Servizio: ${apt.service_name}`,
    apt.notes ? `Note: ${apt.notes}` : null,
    '',
    `Manda WhatsApp: ${waUrl}`,
    `Invia SMS: ${smsUrl}`,
  ].filter(Boolean).join('\\n')

  // VALARMs: each includes the WhatsApp link in description
  // so it's visible directly nella notifica della sveglia
  const valarms = settings.offsets_minutes.map(offset => {
    const label = alarmLabel(offset)
    // Include the link directly in the alarm notification text
    const desc  = `${label}\\n${apt.client_name} — ${apt.service_name}\\nWhatsApp: ${waUrl}`
    return [
      'BEGIN:VALARM',
      `TRIGGER:${offsetToTrigger(offset)}`,
      'ACTION:DISPLAY',
      fold(`DESCRIPTION:${desc}`),
      'END:VALARM',
    ].join('\r\n')
  }).join('\r\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Estetista//Appuntamenti//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    fold(`SUMMARY:${summary}`),
    fold(`DESCRIPTION:${descLines}`),
    // URL field: shown as tappable link in iOS/Android calendar event detail
    fold(`URL:${waUrl}`),
    valarms,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.join('\r\n')
}

export function downloadICS(ics: string, clientName: string, date: Date): void {
  const slug     = clientName.replace(/\s+/g, '_').toLowerCase()
  const dateStr  = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const filename = `appuntamento_${slug}_${dateStr}.ics`
  const blob     = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url      = URL.createObjectURL(blob)
  const a        = document.createElement('a')
  a.href         = url
  a.download     = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
