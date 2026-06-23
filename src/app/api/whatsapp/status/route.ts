import { NextResponse } from 'next/server'
import { isGigawaConfigured } from '@/lib/gigawa'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({ configured: isGigawaConfigured() })
}
