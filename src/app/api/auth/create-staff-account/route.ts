import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb, isAdminConfigured } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Server non configurato' }, { status: 503 })
  }

  // Verify session cookie
  const cookie = request.cookies.get('__session')?.value
  if (!cookie) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  try {
    await getAdminAuth().verifySessionCookie(cookie, true)
  } catch {
    return NextResponse.json({ error: 'Sessione non valida' }, { status: 401 })
  }

  let body: { staffId?: string; email?: string; password?: string } | null = null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { staffId, email, password } = body ?? {}
  if (!staffId || !email || !password) {
    return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password troppo corta (minimo 6 caratteri)' }, { status: 400 })
  }

  const db   = getAdminDb()
  const auth = getAdminAuth()

  // Check staff document exists
  const staffDoc = await db.collection('staff').doc(staffId).get()
  if (!staffDoc.exists) {
    return NextResponse.json({ error: 'Operatrice non trovata' }, { status: 404 })
  }

  const existing = staffDoc.data()
  if (existing?.auth_uid) {
    return NextResponse.json({ error: 'Login già esistente per questa operatrice' }, { status: 409 })
  }

  try {
    // Create Firebase Auth user
    const user = await auth.createUser({ email, password, displayName: existing?.name ?? '' })

    // Link UID to staff document
    await db.collection('staff').doc(staffId).update({
      auth_uid:    user.uid,
      login_email: email,
      updated_at:  new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, uid: user.uid })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('email-already-exists')) {
      return NextResponse.json({ error: 'Email già registrata in Firebase' }, { status: 409 })
    }
    console.error('[create-staff-account]', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Server non configurato' }, { status: 503 })
  }

  const cookie = request.cookies.get('__session')?.value
  if (!cookie) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  try {
    await getAdminAuth().verifySessionCookie(cookie, true)
  } catch {
    return NextResponse.json({ error: 'Sessione non valida' }, { status: 401 })
  }

  let body: { staffId?: string } | null = null
  try { body = await request.json() } catch { /* empty */ }
  const { staffId } = body ?? {}
  if (!staffId) return NextResponse.json({ error: 'staffId mancante' }, { status: 400 })

  const db   = getAdminDb()
  const auth = getAdminAuth()

  const staffDoc = await db.collection('staff').doc(staffId).get()
  if (!staffDoc.exists) return NextResponse.json({ error: 'Operatrice non trovata' }, { status: 404 })

  const uid = staffDoc.data()?.auth_uid
  try {
    if (uid) await auth.deleteUser(uid)
  } catch { /* ignore if user was already deleted */ }

  await db.collection('staff').doc(staffId).update({
    auth_uid:    null,
    login_email: null,
    updated_at:  new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
