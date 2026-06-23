import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, isAdminConfigured } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

export async function POST() {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Firebase Admin non configurato' }, { status: 503 })
  }

  await getAdminDb().collection('settings').doc('main').set({
    google_calendar: FieldValue.delete(),
    updated_at: new Date().toISOString(),
  }, { merge: true })

  return NextResponse.json({ ok: true })
}
