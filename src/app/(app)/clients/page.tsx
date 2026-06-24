'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Client } from '@/types/database'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Users, Plus, Search, Phone, Mail, Pencil, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'

const AVATAR_COLORS = [
  'from-rose-400 to-rose-600',
  'from-violet-400 to-violet-600',
  'from-blue-400 to-blue-600',
  'from-emerald-400 to-emerald-600',
  'from-amber-400 to-amber-600',
  'from-cyan-400 to-cyan-600',
  'from-pink-400 to-pink-600',
  'from-indigo-400 to-indigo-600',
]

function avatarGradient(name: string): string {
  let h = 0
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
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
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Clienti</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              {clients.length} {clients.length === 1 ? 'cliente' : 'clienti'} totali
            </p>
          </div>
          <Link
            href="/clients/new"
            className="flex items-center gap-2 bg-gradient-to-r from-violet-500 to-purple-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-purple-200 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Nuovo
          </Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cerca per nome o telefono…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm"
          />
        </div>

        {/* List */}
        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nessun cliente trovato"
            description={search ? 'Prova con un altro termine.' : 'Aggiungi il primo cliente.'}
            action={!search ? (
              <Link
                href="/clients/new"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-500 to-purple-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-md shadow-purple-200 hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" /> Aggiungi cliente
              </Link>
            ) : undefined}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map(client => {
              const fullName = `${client.first_name} ${client.last_name}`
              const initials = `${client.first_name[0]}${client.last_name[0]}`.toUpperCase()
              const gradient = avatarGradient(fullName)
              return (
                <div
                  key={client.id}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100/80 p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
                >
                  {/* Avatar */}
                  <div className={clsx(
                    'w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br shadow-sm',
                    gradient,
                  )}>
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 truncate">{fullName}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      <a
                        href={`tel:${client.phone}`}
                        className="flex items-center gap-1 text-blue-500 text-xs font-medium hover:underline"
                      >
                        <Phone className="w-3 h-3" /> {client.phone}
                      </a>
                      {client.email && (
                        <span className="flex items-center gap-1 text-slate-400 text-xs min-w-0 truncate">
                          <Mail className="w-3 h-3 shrink-0" />
                          <span className="truncate">{client.email}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Link
                      href={`/clients/${client.id}/edit`}
                      className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(client.id)}
                      disabled={deleting === client.id}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
