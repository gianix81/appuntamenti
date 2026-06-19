import { NextRequest, NextResponse } from 'next/server'
import { sendPushToAll } from '@/lib/push'

export async function POST(request: NextRequest) {
  const { title, body, url } = await request.json()
  if (!title || !body) return NextResponse.json({ error: 'title e body obbligatori' }, { status: 400 })

  await sendPushToAll({ title, body, url })
  return NextResponse.json({ ok: true })
}
