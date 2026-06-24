'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { collection, getDocs, deleteDoc, doc, query, orderBy, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Service } from '@/types/database'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Scissors, Plus, Pencil, Trash2, Clock, Euro } from 'lucide-react'
import { clsx } from 'clsx'

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function loadServices() {
    const snap = await getDocs(query(collection(db, 'services'), orderBy('name')))
    setServices(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Service))
    setLoading(false)
  }

  useEffect(() => { loadServices() }, [])

  async function handleDelete(id: string) {
    if (!confirm('Eliminare questo servizio?')) return
    setDeleting(id)
    await deleteDoc(doc(db, 'services', id))
    await loadServices()
    setDeleting(null)
  }

  async function toggleActive(service: Service) {
    await updateDoc(doc(db, 'services', service.id), { active: !service.active, updated_at: new Date().toISOString() })
    await loadServices()
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Servizi</h1>
          <p className="text-slate-400 text-sm">{services.length} servizi totali</p>
        </div>
        <Link href="/services/new" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Nuovo
        </Link>
      </div>

      {loading ? <LoadingState /> : services.length === 0 ? (
        <EmptyState icon={Scissors} title="Nessun servizio" description="Aggiungi i servizi che offre il tuo centro."
          action={<Link href="/services/new" className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"><Plus className="w-4 h-4" /> Aggiungi servizio</Link>} />
      ) : (
        <div className="space-y-3">
          {services.map(service => (
            <div key={service.id} className={clsx('bg-white rounded-2xl border overflow-hidden', service.active ? 'border-slate-100' : 'border-slate-100 opacity-60')}>
              <div className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Scissors className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{service.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-slate-500 text-xs"><Clock className="w-3 h-3" /> {service.duration_minutes} min</span>
                    <span className="flex items-center gap-1 text-slate-500 text-xs"><Euro className="w-3 h-3" /> {Number(service.price).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link href={`/services/${service.id}/edit`} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"><Pencil className="w-4 h-4" /></Link>
                  <button onClick={() => handleDelete(service.id)} disabled={deleting === service.id}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              {/* Toggle attivo/inattivo in fondo alla card */}
              <div className="border-t border-slate-50 px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-slate-400">{service.active ? 'Servizio attivo' : 'Servizio disattivato'}</span>
                <button
                  onClick={() => toggleActive(service)}
                  className={clsx(
                    'relative w-10 h-5 rounded-full transition-colors shrink-0',
                    service.active ? 'bg-green-500' : 'bg-slate-300',
                  )}
                >
                  <span className={clsx(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                    service.active ? 'left-5' : 'left-0.5',
                  )} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
