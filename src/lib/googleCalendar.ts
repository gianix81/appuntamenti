import { FieldValue } from 'firebase-admin/firestore'
import type { Appointment } from '@/types/database'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
]

interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type?: string
}

interface GoogleCalendarSettings {
  access_token?: string
  refresh_token?: string
  expires_at?: string
  calendar_id?: string
  scope?: string
  connected_at?: string
}

interface AppointmentRelations {
  appointment: Appointment
  client: { first_name: string; last_name: string; phone: string; email?: string | null }
  service: { name: string; duration_minutes?: number }
  settings?: { center_name?: string; address?: string | null; city?: string | null }
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET)
}

export function getGoogleRedirectUri(origin: string): string {
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${origin}/api/google-calendar/callback`
}

export function buildGoogleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
    redirect_uri: getGoogleRedirectUri(origin),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export async function exchangeGoogleCode(origin: string, code: string): Promise<GoogleTokenResponse> {
  return requestToken({
    code,
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
    redirect_uri: getGoogleRedirectUri(origin),
    grant_type: 'authorization_code',
  })
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  return requestToken({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  })
}

async function requestToken(params: Record<string, string>): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Google token error: ${body.error_description ?? body.error ?? res.status}`)
  }
  return body as GoogleTokenResponse
}

export function tokenToSettings(token: GoogleTokenResponse, previous?: GoogleCalendarSettings): GoogleCalendarSettings {
  const refreshToken = token.refresh_token ?? previous?.refresh_token
  if (!refreshToken) {
    throw new Error('Google non ha restituito il refresh token. Revoca l’accesso dell’app dal tuo Account Google e riprova il collegamento.')
  }

  return {
    access_token: token.access_token,
    refresh_token: refreshToken,
    expires_at: new Date(Date.now() + token.expires_in * 1000 - 60_000).toISOString(),
    calendar_id: previous?.calendar_id ?? 'primary',
    scope: token.scope ?? previous?.scope,
    connected_at: previous?.connected_at ?? new Date().toISOString(),
  }
}

export async function getValidAccessToken(
  settings: GoogleCalendarSettings | undefined,
  persist: (settings: GoogleCalendarSettings) => Promise<void>,
): Promise<string | null> {
  if (!settings?.refresh_token) return null

  const expiresAt = settings.expires_at ? new Date(settings.expires_at).getTime() : 0
  if (settings.access_token && expiresAt > Date.now() + 60_000) return settings.access_token

  const refreshed = tokenToSettings(await refreshAccessToken(settings.refresh_token), settings)
  await persist(refreshed)
  return refreshed.access_token ?? null
}

export function buildCalendarEvent({ appointment, client, service, settings }: AppointmentRelations) {
  const clientName = `${client.first_name} ${client.last_name}`.trim()
  const location = [settings?.address, settings?.city].filter(Boolean).join(', ') || undefined
  const description = [
    `Cliente: ${clientName}`,
    `Telefono: ${client.phone}`,
    client.email ? `Email: ${client.email}` : null,
    `Servizio: ${service.name}`,
    appointment.notes ? `Note: ${appointment.notes}` : null,
    '',
    'Creato da Estetista.',
  ].filter(Boolean).join('\n')

  return {
    summary: `${clientName} - ${service.name}`,
    location,
    description,
    start: { dateTime: appointment.start_time },
    end: { dateTime: appointment.end_time },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 120 },
        { method: 'popup', minutes: 30 },
      ],
    },
    extendedProperties: {
      private: {
        appointmentId: appointment.id,
        source: 'estetista',
      },
    },
  }
}

export async function upsertGoogleCalendarEvent(params: {
  accessToken: string
  calendarId: string
  eventId?: string | null
  event: ReturnType<typeof buildCalendarEvent>
}): Promise<{ id: string; htmlLink?: string }> {
  const { accessToken, calendarId, eventId, event } = params
  const encodedCalendarId = encodeURIComponent(calendarId)
  const url = eventId
    ? `${GOOGLE_CALENDAR_API}/calendars/${encodedCalendarId}/events/${encodeURIComponent(eventId)}`
    : `${GOOGLE_CALENDAR_API}/calendars/${encodedCalendarId}/events`
  const res = await fetch(url, {
    method: eventId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Google Calendar event error: ${body.error?.message ?? res.status}`)
  }
  return body as { id: string; htmlLink?: string }
}

export async function deleteGoogleCalendarEvent(params: {
  accessToken: string
  calendarId: string
  eventId: string
}): Promise<void> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(params.calendarId)}/events/${encodeURIComponent(params.eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${params.accessToken}` },
    },
  )
  if (res.status === 404 || res.status === 410) return
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Google Calendar delete error: ${body.error?.message ?? res.status}`)
  }
}

export const googleCalendarDeleteFields = {
  access_token: FieldValue.delete(),
  refresh_token: FieldValue.delete(),
  expires_at: FieldValue.delete(),
  calendar_id: FieldValue.delete(),
  scope: FieldValue.delete(),
  connected_at: FieldValue.delete(),
}
