export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
export type ConfirmationStatus = 'pending' | 'confirmed' | 'declined' | 'no_response'
export type MessageChannel = 'sms' | 'whatsapp'
export type MessageDirection = 'outbound' | 'inbound'
export type NotificationType = 'confirmation' | 'reminder'

export interface NotificationSlot {
  interval: number        // minuti prima dell'appuntamento
  type: NotificationType
}

export interface Client {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface DaySchedule {
  start: string  // "09:00"
  end: string    // "18:00"
}

export type WeekSchedule = {
  monday:    DaySchedule | null
  tuesday:   DaySchedule | null
  wednesday: DaySchedule | null
  thursday:  DaySchedule | null
  friday:    DaySchedule | null
  saturday:  DaySchedule | null
  sunday:    DaySchedule | null
}

export interface Staff {
  id?: string
  name: string
  role: string
  color: string        // hex color per l'agenda
  initials: string     // 1-2 chars, es. "MR"
  phone: string | null
  email: string | null
  active: boolean
  is_owner: boolean
  commission_pct: number  // 0-100
  schedule: WeekSchedule
  days_off: string[]      // ISO dates "YYYY-MM-DD"
  photo_url?: string | null     // Firebase Storage download URL
  auth_uid?: string | null      // Firebase Auth UID (linked when login is created)
  login_email?: string | null   // email used for app login
  created_at: string
  updated_at?: string
}

export interface Appointment {
  id: string
  client_id: string
  service_id: string
  staff_id?: string | null   // null = non assegnato
  start_time: string
  end_time: string
  status: AppointmentStatus
  confirmation_status: ConfirmationStatus
  // Mappa chiave → ISO timestamp dell'invio
  // Chiavi: 'confirmation', 'reminder_1440', 'reminder_120', ecc.
  notifications_sent: Record<string, string> | null
  reminder_sent_at: string | null  // mantenuto per retrocompatibilità
  confirmed_at: string | null
  cancelled_at: string | null
  notes: string | null
  google_calendar_event_id?: string | null
  google_calendar_html_link?: string | null
  google_calendar_synced_at?: string | null
  created_at: string
  updated_at: string
}

export interface AppointmentWithRelations extends Appointment {
  clients: Client
  services: Service
  staff?: Staff | null
}

export interface MessageLog {
  id: string
  appointment_id: string | null
  client_id: string | null
  channel: MessageChannel
  message_body: string
  provider_message_id: string | null
  direction: MessageDirection
  status: string | null
  notification_type?: NotificationType
  interval_minutes?: number
  received_response: boolean
  created_at: string
}

export type BusinessLevel = 1 | 2 | 3 | 4

export interface Settings {
  id?: string
  // ── Profilo business ──────────────────────────────────────────
  business_level: BusinessLevel          // 1=Solo, 2=Piccolo salone, 3=Centro, 4=Catena
  onboarding_completed: boolean
  specialties: string[]                  // es. ['estetica', 'nails', 'massaggi']
  // ── Dati centro ───────────────────────────────────────────────
  center_name: string
  phone_number: string | null
  address: string | null
  city: string | null
  logo_url: string | null
  // ── Notifiche ─────────────────────────────────────────────────
  reminder_enabled: boolean
  notification_slots: NotificationSlot[]
  reminder_intervals: number[]
  reminder_minutes: number
  notification_messages?: { confirmation?: string; reminder?: string }
  // ── Calendario ICS ────────────────────────────────────────────
  calendar_token?: string
  alarm_offsets_minutes?: number[]
  google_calendar?: {
    access_token?: string
    refresh_token?: string
    expires_at?: string
    calendar_id?: string
    scope?: string
    connected_at?: string
  }
  // ── Timestamps ────────────────────────────────────────────────
  created_at: string
  updated_at?: string
}
