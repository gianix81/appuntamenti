export const dynamic = 'force-dynamic'

import { getAdminDb } from '@/lib/firebase/admin'
import { ServiceForm } from '@/components/services/ServiceForm'
import { notFound } from 'next/navigation'
import type { Service } from '@/types/database'

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await getAdminDb().collection('services').doc(id).get()
  if (!snap.exists) notFound()

  const service = { id: snap.id, ...snap.data() } as Service

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Modifica Servizio</h1>
        <p className="text-slate-400 text-sm">{service.name}</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6">
        <ServiceForm existing={service} />
      </div>
    </div>
  )
}
