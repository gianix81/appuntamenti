'use client'

import { useEffect, useState, useMemo } from 'react'
import { getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { wsCol } from '@/lib/firebase/workspace'
import type { Client } from '@/types/database'
import { LoadingState } from '@/components/ui/LoadingState'
import { Mail, CheckSquare, Square, Send, Copy, Check, Users } from 'lucide-react'
import { clsx } from 'clsx'

export default function MarketingPage() {
  const { workspaceId } = useWorkspace()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getDocs(query(wsCol(db, workspaceId, 'clients'), orderBy('last_name')))
      .then(snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Client)
        const withEmail = all.filter(c => c.email)
        setClients(withEmail)
        setSelected(new Set(withEmail.map(c => c.id)))
      })
      .finally(() => setLoading(false))
  }, [])

  const selectedList = useMemo(() => clients.filter(c => selected.has(c.id)), [clients, selected])

  function toggleAll() {
    if (selected.size === clients.length) setSelected(new Set())
    else setSelected(new Set(clients.map(c => c.id)))
  }

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function openMailto() {
    const bcc = selectedList.map(c => c.email).join(',')
    const url = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(url, '_blank')
  }

  async function copyAddresses() {
    const text = selectedList.map(c => c.email).join(', ')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inp = 'w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300 text-sm text-slate-800 bg-white'

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Email Marketing</h1>
            <p className="text-slate-400 text-xs mt-0.5">{clients.length} clienti con email</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-5">
        <div className="grid md:grid-cols-2 gap-5">

          {/* Left: client selector */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" /> Destinatari
              </p>
              <button onClick={toggleAll} className="text-xs font-semibold text-orange-500 hover:text-orange-600">
                {selected.size === clients.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
              </button>
            </div>
            {loading ? (
              <div className="p-6"><LoadingState /></div>
            ) : clients.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">
                Nessun cliente con email registrata
              </div>
            ) : (
              <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
                {clients.map(c => {
                  const isSelected = selected.has(c.id)
                  return (
                    <button key={c.id} onClick={() => toggle(c.id)}
                      className={clsx('w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors',
                        isSelected ? 'bg-orange-50/40' : '')}>
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-orange-500 shrink-0" />
                        : <Square className="w-4 h-4 text-slate-300 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{c.first_name} {c.last_name}</p>
                        <p className="text-xs text-slate-400 truncate">{c.email}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 font-medium">
              {selected.size} selezionati
            </div>
          </div>

          {/* Right: composer */}
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400" /> Componi messaggio
              </h3>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Oggetto</label>
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="Es. Promozione Luglio 🌞" className={inp} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Messaggio</label>
                <textarea rows={6} value={body} onChange={e => setBody(e.target.value)}
                  placeholder={`Cara cliente,\n\nTi scriviamo per informarti...\n\nA presto!\n${''}`}
                  className={`${inp} resize-none`} />
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <button onClick={openMailto} disabled={selected.size === 0}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-purple-700 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-md shadow-purple-200 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
                <Send className="w-4 h-4" />
                Apri nel client email ({selected.size})
              </button>
              <button onClick={copyAddresses} disabled={selected.size === 0}
                className="w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiato!' : 'Copia indirizzi BCC'}
              </button>
              <p className="text-xs text-slate-400 text-center leading-relaxed">
                "Apri nel client email" apre il tuo programma email (Gmail, Outlook…) con tutti gli indirizzi nel campo BCC e il testo precompilato.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
