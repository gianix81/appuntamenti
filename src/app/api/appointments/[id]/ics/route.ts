import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, isAdminConfigured } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

const TZ = 'Europe/Rome'

function toICSDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function fold(line: string): string {
  const out: string[] = []
  while (line.length > 75) {
    out.push(line.slice(0, 75))
    line = ' ' + line.slice(75)
  }
  out.push(line)
  return out.join('\r\n')
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isAdminConfigured()) {
    return new NextResponse('Server error', { status: 503 })
  }

  try {
    const db = getAdminDb()
    const [aptSnap, settingsSnap] = await Promise.all([
      db.collection('appointments').doc(params.id).get(),
      db.collection('settings').doc('main').get(),
    ])

    if (!aptSnap.exists) return new NextResponse('Not found', { status: 404 })

    const apt      = aptSnap.data()!
    const settings = settingsSnap.data() ?? {}

    const [clientSnap, serviceSnap] = await Promise.all([
      db.collection('clients').doc(apt.client_id).get(),
      db.collection('services').doc(apt.service_id).get(),
    ])

    if (!clientSnap.exists || !serviceSnap.exists) {
      return new NextResponse('Not found', { status: 404 })
    }

    const client  = clientSnap.data()!
    const service = serviceSnap.data()!

    const start = new Date(apt.start_time)
    const time  = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(start)
    const date  = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(start)

    const centerName: string = settings.center_name ?? ''
    const address:    string = settings.address ?? ''
    const city:       string = settings.city    ?? ''
    const location = [address, city].filter(Boolean).join(', ')

    const summary = `${service.name}${centerName ? ` – ${centerName}` : ''}`
    const desc = [
      `Appuntamento: ${service.name}`,
      `Data: ${date} alle ${time}`,
      centerName ? `Centro: ${centerName}` : null,
      location   ? `Indirizzo: ${location}` : null,
      apt.notes  ? `Note: ${apt.notes}`     : null,
    ].filter(Boolean).join('\\n')

    const uid     = `apt-${params.id}@estetista`
    const dtStart = toICSDate(apt.start_time)
    const dtEnd   = toICSDate(apt.end_time)
    const dtstamp = toICSDate(new Date().toISOString())

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
      fold(`DESCRIPTION:${desc}`),
      location ? fold(`LOCATION:${location}`) : null,
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:Ricorda: ${service.name} tra 1 ora`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      `DESCRIPTION:Ricorda: ${service.name} tra 30 minuti`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n')

    return new NextResponse(lines, {
      headers: {
        'Content-Type':        'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="appuntamento.ics"',
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('[ics]', err)
    return new NextResponse('Error', { status: 500 })
  }
}
