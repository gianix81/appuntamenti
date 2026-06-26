'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { wsCol, wsDoc } from '@/lib/firebase/workspace'
import type { Client } from '@/types/database'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Users, Plus, Search, Phone, Pencil, Trash2, Clock, Download } from 'lucide-react'
import { useUserRole } from '@/hooks/useUserRole'

export default function ClientsPage() {
  const { role } = useUserRole()
  const isStaff = role === 'staff'
  const { workspaceId } = useWorkspace()

  const [clients,  setClients]  = useState<Client[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  async function loadClients() {
    const snap = await getDocs(query(wsCol(db, workspaceId, 'clients'), orderBy('last_name')))
    setClients(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Client))
    setLoading(false)
  }

  useEffect(() => { loadClients() }, [workspaceId])

  async function handleDelete(id: string) {
    if (!confirm('Eliminare questo cliente?')) return
    setDeleting(id)
    await deleteDoc(wsDoc(db, workspaceId, 'clients', id))
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
            {(() => {
              const gridCols = isStaff
                ? '2rem 1fr 1fr 5rem 5rem'
                : '2rem 1fr 1fr 1.5fr 1.8fr 5rem 5.5rem'

              const actionBtns = (client: Client) => (
                <>
                  <Link href={`/clients/${client.id}`}
                    className="p-1.5 text-slate-300 hover:text-violet-500 hover:bg-violet-50 rounded-lg transition-colors" title="Storico">
                    <Clock className="w-4 h-4" />
                  </Link>
                  {!isStaff && (
                    <Link href={`/clients/${client.id}/edit`}
                      className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Modifica">
                      <Pencil className="w-4 h-4" />
                    </Link>
                  )}
                  {!isStaff && (
                    <button onClick={() => handleDelete(client.id)} disabled={deleting === client.id}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40" title="Elimina">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </>
              )

              return (
                <>
                  {/* Header — solo desktop, stesso grid delle righe */}
                  <div className="hidden md:grid border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide items-center"
                    style={{ gridTemplateColumns: gridCols }}>
                    <span>#</span>
                    <span>Cognome</span>
                    <span>Nome</span>
                    {!isStaff && <span>Telefono</span>}
                    {!isStaff && <span>Email</span>}
                    <span>Aggiunto</span>
                    <span />
                  </div>

                  {filtered.map((client, i) => (
                    <div key={client.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/30 transition-colors">

                      {/* ── DESKTOP: grid allineato all'header ── */}
                      <div className="hidden md:grid items-center px-4"
                        style={{ gridTemplateColumns: gridCols }}>
                        <span className="py-3 text-xs text-slate-300 font-mono tabular-nums">{i + 1}</span>
                        <span className="py-3 font-bold text-slate-800 truncate pr-2">{client.last_name}</span>
                        <span className="py-3 text-slate-600 truncate pr-2">{client.first_name}</span>
                        {!isStaff && (
                          <a href={`tel:${client.phone}`}
                            className="py-3 flex items-center gap-1 text-blue-500 hover:text-blue-700 text-sm whitespace-nowrap">
                            <Phone className="w-3 h-3 shrink-0" />{client.phone}
                          </a>
                        )}
                        {!isStaff && (
                          <span className="py-3 text-slate-500 text-sm truncate pr-2">
                            {client.email
                              ? <a href={`mailto:${client.email}`} className="hover:text-blue-500 hover:underline transition-colors" title={client.email}>{client.email}</a>
                              : <span className="text-slate-300">—</span>}
                          </span>
                        )}
                        <span className="py-3 text-xs text-slate-400 tabular-nums whitespace-nowrap">
                          {client.created_at ? format(new Date(client.created_at), 'dd/MM/yy') : '—'}
                        </span>
                        <div className="py-2 flex items-center justify-end gap-0.5">{actionBtns(client)}</div>
                      </div>

                      {/* ── MOBILE: 2 righe ── */}
                      <div className="md:hidden px-4">
                        {/* Riga 1: # + Cognome Nome + bottoni */}
                        <div className="flex items-center gap-2 py-2.5">
                          <span className="text-xs text-slate-300 font-mono w-5 shrink-0">{i + 1}</span>
                          <span className="font-bold text-slate-800 shrink-0">{client.last_name}</span>
                          <span className="text-slate-600 flex-1 truncate">{client.first_name}</span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {isStaff && <span className="text-xs text-slate-400 tabular-nums mr-1">{client.created_at ? format(new Date(client.created_at), 'dd/MM/yy') : '—'}</span>}
                            {actionBtns(client)}
                          </div>
                        </div>
                        {/* Riga 2: telefono + email + data */}
                        {!isStaff && (
                          <div className="flex items-center gap-3 pb-2.5 pl-7 flex-wrap">
                            <a href={`tel:${client.phone}`} className="flex items-center gap-1 text-blue-500 hover:text-blue-700 text-sm shrink-0">
                              <Phone className="w-3 h-3" />{client.phone}
                            </a>
                            <span className="text-slate-500 text-sm truncate">
                              {client.email
                                ? <a href={`mailto:${client.email}`} className="hover:text-blue-500 hover:underline">{client.email}</a>
                                : <span className="text-slate-300">—</span>}
                            </span>
                            <span className="text-xs text-slate-400 tabular-nums ml-auto whitespace-nowrap">
                              {client.created_at ? format(new Date(client.created_at), 'dd/MM/yy') : '—'}
                            </span>
                          </div>
                        )}
                      </div>

                    </div>
                  ))}
                </>
              )
            })()}

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
