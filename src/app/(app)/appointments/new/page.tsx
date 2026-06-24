'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppointmentForm } from '@/components/appointments/AppointmentForm'
import { useUserRole } from '@/hooks/useUserRole'

export default function NewAppointmentPage() {
  const router = useRouter()
  const { role, loading } = useUserRole()

  useEffect(() => {
    if (!loading && role === 'staff') router.replace('/dashboard')
  }, [loading, role, router])

  if (loading || role === 'staff') return null

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Nuovo Appuntamento</h1>
        <p className="text-slate-400 text-sm">Inserisci i dettagli dell&apos;appuntamento</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6">
        <AppointmentForm />
      </div>
    </div>
  )
}
