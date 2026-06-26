export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
export type ConfirmationStatus = 'pending' | 'confirmed' | 'declined' | 'no_response'
export type MessageChannel = 'sms' | 'whatsapp'
export type MessageDirection = 'outbound' | 'inbound'
export type NotificationType = 'confirmation' | 'reminder'

export interface NotificationSlot {
  interval: number        // minuti prima dell'appuntamento
  type: NotificationType
}

export type YesNo = 'no' | 'si' | null

export type TreatmentCategory = 'corpo' | 'viso' | 'laser' | 'prodotto'

export interface ClientTreatment {
  id: string
  client_id: string
  category: TreatmentCategory
  date: string               // YYYY-MM-DD
  treatment: string          // nome trattamento o prodotto
  operator: string | null    // eseguito da / venduto da
  notes: string | null
  price: number | null
  // Parametri laser
  zone: string | null
  program: string | null
  energy: string | null
  frequency_hz: string | null
  pulse_duration: string | null
  created_at: string
}

export interface ClientAnamnesi {
  // Salute generale
  health_state?: string | null
  ongoing_treatments?: string | null
  medical_history?: string | null
  // Ginecologia
  pregnancy?: YesNo
  pregnancy_count?: string | null
  breastfeeding?: YesNo
  breastfeeding_duration?: string | null
  menstrual_cycle?: 'regolare' | 'irregolare' | 'doloroso' | null
  // Allergie & controindicazioni
  allergies?: YesNo
  allergies_detail?: string | null
  pacemaker?: boolean
  wounds?: boolean
  prosthesis?: boolean
  metal_wires?: boolean
  surgical_wires?: boolean
  hypertension?: boolean
  // Contraccezione
  contraception_iud?: boolean
  contraception_other?: string | null
  // Stile di vita
  diet?: 'regolare' | 'irregolare' | null
  smoking?: YesNo
  smoking_amount?: string | null
  physical_activity?: YesNo
  physical_activity_type?: string | null
  physical_activity_freq?: 'weekly' | 'three_times' | 'daily' | null
  // Esame obiettivo
  warts?: YesNo
  warts_location?: string | null
  mycosis?: YesNo
  mycosis_location?: string | null
  capillaries?: YesNo
  capillaries_location?: string | null
}

export interface Client {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  notes: string | null
  // Dati personali estesi
  birth_date?: string | null
  address?: string | null
  city?: string | null
  cap?: string | null
  profession?: string | null
  // Scheda anamnesi
  anamnesi?: ClientAnamnesi | null
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

export interface AllowedUser {
  email: string
  role: 'admin' | 'staff'
  display_name?: string
  active: boolean
  created_at: string
  created_by: string
  workspace_id?: string  // UID del workspace; assente = usa flat collections (master admin)
}

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
