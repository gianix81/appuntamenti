import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'

export async function POST(request: NextRequest) {
  const subscription = await request.json()
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Subscription non valida' }, { status: 400 })
  }

  const db = getAdminDb()
  // Usiamo l'endpoint come ID univoco per evitare duplicati
  const id = Buffer.from(subscription.endpoint).toString('base64').slice(0, 64)
  await db.collection('push_subscriptions').doc(id).set(subscription)

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const { endpoint } = await request.json()
  if (!endpoint) return NextResponse.json({ ok: true })

  const db = getAdminDb()
  const id = Buffer.from(endpoint).toString('base64').slice(0, 64)
  await db.collection('push_subscriptions').doc(id).delete()

  return NextResponse.json({ ok: true })
}
