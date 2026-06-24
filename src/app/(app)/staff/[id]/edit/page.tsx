'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Staff } from '@/types/database'
import { StaffForm } from '@/components/staff/StaffForm'
import { LoadingState } from '@/components/ui/LoadingState'

export default function EditStaffPage() {
  const { id } = useParams<{ id: string }>()
  const [staff, setStaff]   = useState<(Staff & { id: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    getDoc(doc(db, 'staff', id))
      .then(snap => {
        if (snap.exists()) {
          setStaff({ id: snap.id, ...snap.data() } as Staff & { id: string })
        } else {
          setError('Operatrice non trovata.')
        }
      })
      .catch(() => setError('Errore nel caricamento.'))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl font-bold text-slate-800 mb-6">
        {staff ? `Modifica — ${staff.name}` : 'Modifica operatrice'}
      </h1>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : staff ? (
        <StaffForm existing={staff} />
      ) : null}
    </div>
  )
}
