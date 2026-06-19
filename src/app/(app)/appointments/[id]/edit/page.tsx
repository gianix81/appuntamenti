export const dynamic = 'force-dynamic'

import { getAdminDb } from '@/lib/firebase/admin'
import { AppointmentForm } from '@/components/appointments/AppointmentForm'
import { notFound } from 'next/navigation'
import type { Appointment } from '@/types/database'

export default async function EditAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await getAdminDb().collection('appointments').doc(id).get()
  if (!snap.exists) notFound()

  const appointment = { id: snap.id, ...snap.data() } as Appointment

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">Modifica Appuntamento</h1>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <AppointmentForm existing={appointment} />
      </div>
    </div>
  )
}
