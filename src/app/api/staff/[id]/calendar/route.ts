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

    // Verify staff exists
    const staffSnap = await db.collection('staff').doc(id).get()
    if (!staffSnap.exists) return new NextResponse('Not found', { status: 404 })

    const staffData = staffSnap.data()!
    const settingsSnap = await db.collection('settings').doc('main').get()
    const settings = settingsSnap.data() ?? {}
    const centerName: string = settings.center_name ?? ''
    const address:    string = settings.address ?? ''
    const city:       string = settings.city    ?? ''
    const location = [address, city].filter(Boolean).join(', ')

    // Load all future non-cancelled appointments for this staff member
    const now = new Date()
    const threeMonthsLater = new Date(now)
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3)

    const aptsSnap = await db.collection('appointments')
      .where('staff_id', '==', id)
      .where('start_time', '>=', now.toISOString())
      .where('start_time', '<=', threeMonthsLater.toISOString())
      .orderBy('start_time')
      .get()

    const events: string[] = []
    const dtstamp = toICSDate(now.toISOString())

    for (const aptDoc of aptsSnap.docs) {
      const apt = aptDoc.data()
      if (apt.status === 'cancelled') continue

      const [clientSnap, serviceSnap] = await Promise.all([
        db.collection('clients').doc(apt.client_id).get(),
        db.collection('services').doc(apt.service_id).get(),
      ])

      if (!clientSnap.exists || !serviceSnap.exists) continue

      const client  = clientSnap.data()!
      const service = serviceSnap.data()!

      const start = new Date(apt.start_time)
      const timeStr  = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(start)
      const dateStr  = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(start)

      const clientName = `${client.first_name} ${client.last_name}`
      const summary    = `${service.name} – ${clientName}`
      const desc = [
        `Cliente: ${clientName}`,
        `Servizio: ${service.name}`,
        `Data: ${dateStr} alle ${timeStr}`,
        centerName ? `Centro: ${centerName}` : null,
        location   ? `Indirizzo: ${location}` : null,
        apt.notes  ? `Note: ${apt.notes}`     : null,
      ].filter(Boolean).join('\\n')

      const uid     = `staff-${id}-apt-${aptDoc.id}@estetista`
      const dtStart = toICSDate(apt.start_time)
      const dtEnd   = toICSDate(apt.end_time)

      events.push([
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        fold(`SUMMARY:${summary}`),
        fold(`DESCRIPTION:${desc}`),
        location ? fold(`LOCATION:${location}`) : null,
        'BEGIN:VALARM',
        'TRIGGER:-PT30M',
        'ACTION:DISPLAY',
        fold(`DESCRIPTION:Tra 30 min: ${service.name} con ${clientName}`),
        'END:VALARM',
        'END:VEVENT',
      ].filter(Boolean).join('\r\n'))
    }

    const calName = `${staffData.name}${centerName ? ` – ${centerName}` : ''}`
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Estetista//Staff Calendar//IT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      fold(`X-WR-CALNAME:${calName}`),
      'X-WR-TIMEZONE:Europe/Rome',
      'X-WR-CALDESC:I tuoi appuntamenti',
      ...events,
      'END:VCALENDAR',
    ].join('\r\n')

    const fileName = `agenda-${staffData.initials?.toLowerCase() ?? id}.ics`

    return new NextResponse(ics, {
      headers: {
        'Content-Type':        'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control':       'no-cache, no-store',
      },
    })
  } catch (err) {
    console.error('[staff/calendar]', err)
    return new NextResponse('Error', { status: 500 })
  }
}
