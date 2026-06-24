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
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdminConfigured()) {
    return new NextResponse('Server error', { status: 503 })
  }

  const { id } = await params

  try {
    const db = getAdminDb()

    const clientSnap = await db.collection('clients').doc(id).get()
    if (!clientSnap.exists) return new NextResponse('Not found', { status: 404 })

    const client      = clientSnap.data()!
    const clientName  = `${client.first_name} ${client.last_name}`

    const settingsSnap = await db.collection('settings').doc('main').get()
    const settings     = settingsSnap.data() ?? {}
    const centerName: string = settings.center_name ?? 'Salone'
    const address:    string = settings.address ?? ''
    const city:       string = settings.city    ?? ''
    const location           = [address, city].filter(Boolean).join(', ')

    const now              = new Date()
    const sixMonthsLater   = new Date(now)
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6)

    const aptsSnap = await db.collection('appointments')
      .where('client_id', '==', id)
      .where('start_time', '>=', now.toISOString())
      .where('start_time', '<=', sixMonthsLater.toISOString())
      .orderBy('start_time')
      .get()

    const events: string[] = []
    const dtstamp = toICSDate(now.toISOString())

    for (const aptDoc of aptsSnap.docs) {
      const apt = aptDoc.data()
      if (apt.status === 'cancelled') continue

      const [serviceSnap, staffSnap] = await Promise.all([
        db.collection('services').doc(apt.service_id).get(),
        apt.staff_id ? db.collection('staff').doc(apt.staff_id).get() : Promise.resolve(null),
      ])

      if (!serviceSnap.exists) continue

      const service    = serviceSnap.data()!
      const staffName  = staffSnap?.exists ? (staffSnap.data()!.name as string) : null

      const start    = new Date(apt.start_time)
      const timeStr  = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(start)
      const dateStr  = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(start)

      const summary = `${service.name}${staffName ? ` con ${staffName}` : ''} – ${centerName}`
      const desc = [
        `Servizio: ${service.name}`,
        staffName  ? `Operatrice: ${staffName}` : null,
        `Data: ${dateStr} alle ${timeStr}`,
        centerName ? `Centro: ${centerName}`     : null,
        location   ? `Indirizzo: ${location}`    : null,
        apt.notes  ? `Note: ${apt.notes}`        : null,
      ].filter(Boolean).join('\\n')

      const uid = `client-${id}-apt-${aptDoc.id}@estetista`

      events.push([
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${toICSDate(apt.start_time)}`,
        `DTEND:${toICSDate(apt.end_time)}`,
        fold(`SUMMARY:${summary}`),
        fold(`DESCRIPTION:${desc}`),
        location ? fold(`LOCATION:${location}`) : null,
        'BEGIN:VALARM',
        'TRIGGER:-PT60M',
        'ACTION:DISPLAY',
        fold(`DESCRIPTION:Tra 1 ora: ${service.name} da ${centerName}`),
        'END:VALARM',
        'END:VEVENT',
      ].filter(Boolean).join('\r\n'))
    }

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Estetista//Client Calendar//IT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      fold(`X-WR-CALNAME:I miei appuntamenti – ${centerName}`),
      'X-WR-TIMEZONE:Europe/Rome',
      `X-WR-CALDESC:Appuntamenti di ${clientName}`,
      ...events,
      'END:VCALENDAR',
    ].join('\r\n')

    return new NextResponse(ics, {
      headers: {
        'Content-Type':        'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="appuntamenti-${client.first_name?.toLowerCase()}.ics"`,
        'Cache-Control':       'no-cache, no-store',
      },
    })
  } catch (err) {
    console.error('[clients/calendar]', err)
    return new NextResponse('Error', { status: 500 })
  }
}
