export const dynamic = 'force-dynamic'

import { AppointmentForm } from '@/components/appointments/AppointmentForm'

export default function NewAppointmentPage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">Nuovo Appuntamento</h1>
        <p className="text-gray-400 text-sm">Inserisci i dettagli dell&apos;appuntamento</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <AppointmentForm />
      </div>
    </div>
  )
}
