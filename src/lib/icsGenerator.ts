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

/** Convert ISO to ICS datetime format: 20240620T100000Z */
function toICSDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/** Offset minutes → ICS TRIGGER string */
function offsetToTrigger(minutes: number): string {
  if (minutes === 0) return 'PT0S'                              // at event start
  if (minutes < 60)  return `-PT${minutes}M`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `-PT${h}H` : `-PT${h}H${m}M`
}

function alarmDesc(minutes: number, clientName: string, service: string): string {
  if (minutes === 0) return `Appuntamento ora! ${clientName} — ${service}`
  if (minutes < 60)  return `Tra ${minutes} min: ${clientName} — ${service}`
  const h = Math.round(minutes / 60)
  return `Tra ${h}${h === 1 ? ' ora' : ' ore'}: ${clientName} — ${service}`
}

/** Fold long lines per RFC 5545 (max 75 octets) */
function fold(line: string): string {
  const chunks: string[] = []
  while (line.length > 75) {
    chunks.push(line.slice(0, 75))
    line = ' ' + line.slice(75)
  }
  chunks.push(line)
  return chunks.join('\r\n')
}

export function generateICS(apt: ICSAppointment, settings: AlarmSettings): string {
  const uid       = `apt-${apt.id}@estetista`
  const dtStart   = toICSDate(apt.start_time)
  const dtEnd     = toICSDate(apt.end_time)
  const dtstamp   = toICSDate(new Date().toISOString())
  const summary   = `${apt.client_name} — ${apt.service_name}`
  const descParts = [
    `Cliente: ${apt.client_name}`,
    `Tel: ${apt.client_phone}`,
    `Servizio: ${apt.service_name}`,
    apt.notes ? `Note: ${apt.notes}` : null,
    '',
    'Apri WhatsApp o SMS dall\'app Estetista.',
  ].filter(Boolean)

  const valarms = settings.offsets_minutes.map(offset => [
    'BEGIN:VALARM',
    `TRIGGER:${offsetToTrigger(offset)}`,
    'ACTION:DISPLAY',
    fold(`DESCRIPTION:${alarmDesc(offset, apt.client_name, apt.service_name)}`),
    'END:VALARM',
  ].join('\r\n')).join('\r\n')

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
    fold(`DESCRIPTION:${descParts.join('\\n')}`),
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
