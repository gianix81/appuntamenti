const GIGAWA_SEND_URL = 'https://gigawa.it/send'

interface GigawaSendParams {
  number: string
  message: string
}

interface GigawaResponse {
  success: boolean
  message?: string
  error?: string
  from?: string
  to?: string
  sentAt?: string
}

export function isGigawaConfigured(): boolean {
  return Boolean(process.env.GIGAWA_USER_ID && process.env.GIGAWA_SESSION_ID)
}

export function normalizeWhatsAppNumber(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) return cleaned.slice(1)
  if (cleaned.startsWith('00')) return cleaned.slice(2)
  if (cleaned.startsWith('39')) return cleaned
  return `39${cleaned}`
}

export async function sendGigawaMessage({ number, message }: GigawaSendParams): Promise<GigawaResponse> {
  if (!isGigawaConfigured()) {
    throw new Error('Gigawa non configurato')
  }

  const res = await fetch(GIGAWA_SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: process.env.GIGAWA_USER_ID,
      sessionId: process.env.GIGAWA_SESSION_ID,
      number,
      message,
    }),
  })

  const body = await res.json().catch(() => ({})) as GigawaResponse
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? body.message ?? `Gigawa error ${res.status}`)
  }

  return body
}
