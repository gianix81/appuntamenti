'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Client } from '@/types/database'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Users, Plus, Search, Phone, Mail, Pencil, Trash2 } from 'lucide-react'

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  async function loadClients() {
    const snap = await getDocs(query(collection(db, 'clients'), orderBy('last_name')))
    setClients(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Client))
    setLoading(false)
  }

  useEffect(() => { loadClients() }, [])

  async function handleDelete(id: string) {
    if (!confirm('Eliminare questo cliente?')) return
    setDeleting(id)
    await deleteDoc(doc(db, 'clients', id))
    await loadClients()
    setDeleting(null)
  }

  const filtered = clients.filter(c =>
    `${c.first_name} ${c.last_name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Clienti</h1>
          <p className="text-slate-400 text-sm">{clients.length} clienti totali</p>
        </div>
        <Link href="/clients/new" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Nuovo
        </Link>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" placeholder="Cerca per nome o telefono…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800 placeholder:text-slate-400" />
      </div>

      {loading ? <LoadingState /> : filtered.length === 0 ? (
        <EmptyState icon={Users} title="Nessun cliente trovato"
          description={search ? 'Prova con un altro termine di ricerca.' : 'Aggiungi il primo cliente.'}
          action={!search ? (
            <Link href="/clients/new" className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" /> Aggiungi cliente
            </Link>
          ) : undefined} />
      ) : (
        <div className="space-y-3">
          {filtered.map(client => (
            <div key={client.id} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-blue-700 font-semibold text-sm">
                {client.first_name[0]}{client.last_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{client.first_name} {client.last_name}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 min-w-0">
                  <span className="flex items-center gap-1 text-slate-500 text-xs shrink-0"><Phone className="w-3 h-3" /> {client.phone}</span>
                  {client.email && <span className="flex items-center gap-1 text-slate-500 text-xs min-w-0 truncate"><Mail className="w-3 h-3 shrink-0" /> <span className="truncate">{client.email}</span></span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/clients/${client.id}/edit`} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
                  <Pencil className="w-4 h-4" />
                </Link>
                <button onClick={() => handleDelete(client.id)} disabled={deleting === client.id}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
