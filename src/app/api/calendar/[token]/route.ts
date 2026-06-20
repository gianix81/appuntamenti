import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, isAdminConfigured } from '@/lib/firebase/admin'
import { generateICS } from '@/lib/icsGenerator'

const EMPTY_CAL = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Estetista//Appuntamenti//IT',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'X-WR-CALNAME:Appuntamenti Salone',
  'END:VCALENDAR',
].join('\r\n')

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params

  if (!isAdminConfigured()) {
    return new NextResponse('Server non configurato', { status: 503 })
  }

  try {
    const db = getAdminDb()

    // Verify token
    const settingsSnap = await db.collection('settings').doc('main').get()
    const settings = settingsSnap.data() ?? {}

    if (!settings.calendar_token || settings.calendar_token !== token) {
      return new NextResponse('Token non valido', { status: 401 })
    }

    const offsets: number[] = settings.alarm_offsets_minutes ?? [120, 30]

    // All future appointments, ordered by start_time
    const now     = new Date().toISOString()
    const aptSnap = await db.collection('appointments')
      .where('start_time', '>=', now)
      .orderBy('start_time')
      .get()

    const appointments = aptSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((a: Record<string, unknown>) => a.status !== 'cancelled') as Array<{
        id: string
        start_time: string
        end_time: string
        client_id: string
        service_id: string
        notes?: string | null
        status: string
      }>

    if (!appointments.length) {
      return calResponse(EMPTY_CAL)
    }

    // Batch-fetch clients and services
    const clientIds  = [...new Set(appointments.map(a => a.client_id))]
    const serviceIds = [...new Set(appointments.map(a => a.service_id))]

    const [cDocs, sDocs] = await Promise.all([
      Promise.all(clientIds.map(id => db.collection('clients').doc(id).get())),
      Promise.all(serviceIds.map(id => db.collection('services').doc(id).get())),
    ])

    const clientMap  = Object.fromEntries(
      cDocs.filter(d => d.exists).map(d => [d.id, d.data() as Record<string, string>])
    )
    const serviceMap = Object.fromEntries(
      sDocs.filter(d => d.exists).map(d => [d.id, d.data() as Record<string, string>])
    )

    // Build VEVENT blocks
    const eventBlocks: string[] = []
    for (const apt of appointments) {
      const client  = clientMap[apt.client_id]
      const service = serviceMap[apt.service_id]
      if (!client || !service) continue

      const ics = generateICS(
        {
          id:           apt.id,
          start_time:   apt.start_time,
          end_time:     apt.end_time,
          client_name:  `${client.first_name} ${client.last_name}`,
          client_phone: client.phone,
          service_name: service.name,
          notes:        apt.notes ?? null,
        },
        { offsets_minutes: offsets },
      )

      const match = ics.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/)
      if (match) eventBlocks.push(match[0])
    }

    const fullICS = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Estetista//Appuntamenti//IT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Appuntamenti Salone',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
      ...eventBlocks,
      'END:VCALENDAR',
    ].join('\r\n')

    return calResponse(fullICS)
  } catch (err) {
    console.error('[calendar feed]', err)
    return new NextResponse('Errore interno', { status: 500 })
  }
}

function calResponse(body: string) {
  return new NextResponse(body, {
    headers: {
      'Content-Type':  'text/calendar;charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
