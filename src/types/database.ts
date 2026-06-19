export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
export type ConfirmationStatus = 'pending' | 'confirmed' | 'declined' | 'no_response'
export type MessageChannel = 'sms' | 'whatsapp'
export type MessageDirection = 'outbound' | 'inbound'

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

export interface Appointment {
  id: string
  client_id: string
  service_id: string
  start_time: string
  end_time: string
  status: AppointmentStatus
  confirmation_status: ConfirmationStatus
  reminder_sent_at: string | null
  confirmed_at: string | null
  cancelled_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AppointmentWithRelations extends Appointment {
  clients: Client
  services: Service
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
  received_response: boolean
  created_at: string
}

export interface Settings {
  id?: string
  center_name: string
  phone_number: string | null
  address: string | null
  reminder_minutes: number
  created_at: string
  updated_at?: string
}
