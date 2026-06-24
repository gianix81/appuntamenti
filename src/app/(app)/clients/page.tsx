'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Client } from '@/types/database'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Users, Plus, Search, Phone, Pencil, Trash2, Clock, Download } from 'lucide-react'
import { useUserRole } from '@/hooks/useUserRole'

export default function ClientsPage() {
  const { role } = useUserRole()
  const isStaff = role === 'staff'

  const [clients,  setClients]  = useState<Client[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
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

  const deduped = useMemo(() => {
    const seen = new Set<string>()
    return clients.filter(c => {
      const key = `${c.first_name}|${c.last_name}|${c.phone}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [clients])

  const filtered = useMemo(() =>
    deduped.filter(c =>
      `${c.first_name} ${c.last_name} ${c.phone} ${c.email ?? ''}`.toLowerCase().includes(search.toLowerCase()),
    ),
  [deduped, search])

  function exportCSV() {
    const BOM = '﻿'
    const headers = ['Nome', 'Cognome', 'Telefono', 'Email', 'Note', 'Aggiunto il']
    const rows = deduped.map(c => [
      c.first_name,
      c.last_name,
      c.phone,
      c.email ?? '',
      c.notes ?? '',
      c.created_at ? format(new Date(c.created_at), 'dd/MM/yyyy') : '',
    ])
    const csv = BOM + [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `clienti_${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-8 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Clienti</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              {deduped.length} {deduped.length === 1 ? 'cliente' : 'clienti'} totali
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isStaff && (
              <button
                onClick={exportCSV}
                title="Scarica archivio CSV (apri con Excel)"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Esporta CSV</span>
              </button>
            )}
            <Link
              href="/clients/new"
              className="flex items-center gap-2 bg-gradient-to-r from-violet-500 to-purple-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-purple-200 hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nuovo</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-4">

        {/* ── Search ── */}
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cerca per nome, telefono, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 text-sm placeholder:text-slate-400"
          />
        </div>

        {/* ── Table ── */}
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
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide w-10">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Cognome</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Nome</th>
                    {!isStaff && <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Telefono</th>}
                    {!isStaff && <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Email</th>}
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide">Aggiunto</th>
                    <th className="px-3 py-3 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client, i) => (
                    <tr
                      key={client.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-violet-50/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-xs text-slate-300 font-mono tabular-nums">{i + 1}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{client.last_name}</td>
                      <td className="px-4 py-3 text-slate-600">{client.first_name}</td>
                      {!isStaff && (
                        <td className="px-4 py-3">
                          <a
                            href={`tel:${client.phone}`}
                            className="flex items-center gap-1 text-blue-500 hover:text-blue-700 hover:underline w-max"
                          >
                            <Phone className="w-3 h-3 shrink-0" />
                            {client.phone}
                          </a>
                        </td>
                      )}
                      {!isStaff && (
                        <td className="px-4 py-3 text-slate-500 max-w-[180px]">
                          {client.email ? (
                            <a
                              href={`mailto:${client.email}`}
                              className="truncate block hover:text-blue-500 hover:underline transition-colors"
                              title={client.email}
                            >
                              {client.email}
                            </a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-xs text-slate-400 tabular-nums whitespace-nowrap">
                        {client.created_at ? format(new Date(client.created_at), 'dd/MM/yy') : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          <Link
                            href={`/clients/${client.id}`}
                            className="p-1.5 text-slate-300 hover:text-violet-500 hover:bg-violet-50 rounded-lg transition-colors"
                            title="Storico visite"
                          >
                            <Clock className="w-4 h-4" />
                          </Link>
                          {!isStaff && (
                            <Link
                              href={`/clients/${client.id}/edit`}
                              className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Modifica"
                            >
                              <Pencil className="w-4 h-4" />
                            </Link>
                          )}
                          {!isStaff && (
                            <button
                              onClick={() => handleDelete(client.id)}
                              disabled={deleting === client.id}
                              className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                              title="Elimina"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer count */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
              {filtered.length === deduped.length
                ? `${deduped.length} clienti`
                : `${filtered.length} di ${deduped.length} clienti`}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
