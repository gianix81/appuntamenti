import { NextRequest, NextResponse } from 'next/server'
import { getAdminStorage, isAdminConfigured } from '@/lib/firebase/admin'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Admin SDK non configurato' }, { status: 503 })
  }

  const { id } = await params

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Nessun file' }, { status: 400 })

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Formato non supportato (jpeg/png/webp)' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File troppo grande (max 5 MB)' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const bucket = getAdminStorage().bucket()
  const path   = `staff-photos/${id}`
  const fileRef = bucket.file(path)

  await fileRef.save(buffer, {
    metadata: { contentType: file.type },
  })

  // Make the file publicly readable and get a permanent URL
  await fileRef.makePublic()
  const url = `https://storage.googleapis.com/${bucket.name}/${path}`

  return NextResponse.json({ url })
}
