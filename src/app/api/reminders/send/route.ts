import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'
import { sendAppointmentReminder } from '@/lib/reminders'

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get('__session')?.value
  if (!sessionCookie) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  try {
    await getAdminAuth().verifySessionCookie(sessionCookie, true)
  } catch {
    return NextResponse.json({ error: 'Sessione non valida' }, { status: 401 })
  }

  const { appointmentId } = await request.json()
  if (!appointmentId) return NextResponse.json({ error: 'appointmentId mancante' }, { status: 400 })

  const result = await sendAppointmentReminder(appointmentId)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json({ success: true })
}
