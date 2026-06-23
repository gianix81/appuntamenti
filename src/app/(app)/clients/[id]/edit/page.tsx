export const dynamic = 'force-dynamic'

import { getAdminDb } from '@/lib/firebase/admin'
import { ClientForm } from '@/components/clients/ClientForm'
import { notFound } from 'next/navigation'
import type { Client } from '@/types/database'

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await getAdminDb().collection('clients').doc(id).get()
  if (!snap.exists) notFound()

  const client = { id: snap.id, ...snap.data() } as Client

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Modifica Cliente</h1>
        <p className="text-slate-400 text-sm">{client.first_name} {client.last_name}</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6">
        <ClientForm existing={client} />
      </div>
    </div>
  )
}
