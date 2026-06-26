'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { wsCol } from '@/lib/firebase/workspace'
import type { Client } from '@/types/database'
import { clsx } from 'clsx'
import { differenceInDays } from 'date-fns'
import {
  MessageCircle, Users, CheckSquare, Square, Send,
  X, CheckCircle2, XCircle, Search, ChevronDown,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────
type Segment = 'nuovo' | 'frequente' | 'abituale' | 'a_rischio' | 'assente' | 'mai'
type FilterSegment = Segment | 'tutti'

interface ClientRow {
  id: string
  first_name: string
  last_name: string
  phone: string
  city?: string | null
  segment: Segment
  visitCount: number
  lastVisit: Date | null
}

interface SendResult { clientId: string; name: string; ok: boolean; error?: string }

// ── Costanti ──────────────────────────────────────────────────────────────
const VALID_STATUSES = new Set(['scheduled', 'confirmed', 'completed'])

const SEGMENTS: { key: FilterSegment; label: string; emoji: string; desc: string }[] = [
  { key: 'tutti',     label: 'Tutti',          emoji: '👥', desc: 'Tutti i clienti con telefono' },
  { key: 'nuovo',     label: 'Nuovi',          emoji: '🌱', desc: '1-2 visite, ultimi 60 gg' },
  { key: 'frequente', label: 'Frequenti',      emoji: '⭐', desc: '3-4 visite totali' },
  { key: 'abituale',  label: 'Abituali',       emoji: '💎', desc: '5+ visite totali' },
  { key: 'a_rischio', label: 'A rischio',      emoji: '⚠️', desc: '60-120 gg senza visita' },
  { key: 'assente',   label: 'Da recuperare',  emoji: '🔴', desc: '120+ gg senza visita' },
  { key: 'mai',       label: 'Mai prenotati',  emoji: '👤', desc: 'Nessuna visita registrata' },
]

const SEG_COLORS: Record<FilterSegment, string> = {
  tutti:     'bg-slate-100 text-slate-700',
  nuovo:     'bg-blue-50 text-blue-700 border border-blue-200',
  frequente: 'bg-violet-50 text-violet-700 border border-violet-200',
  abituale:  'bg-emerald-50 text-emerald-700 border border-emerald-200',
  a_rischio: 'bg-amber-50 text-amber-700 border border-amber-200',
  assente:   'bg-rose-50 text-rose-700 border border-rose-200',
  mai:       'bg-slate-100 text-slate-600 border border-slate-200',
}

const SEG_ACTIVE: Record<FilterSegment, string> = {
  tutti:     'bg-slate-800 text-white',
  nuovo:     'bg-blue-600 text-white',
  frequente: 'bg-violet-600 text-white',
  abituale:  'bg-emerald-600 text-white',
  a_rischio: 'bg-amber-500 text-white',
  assente:   'bg-rose-600 text-white',
  mai:       'bg-slate-600 text-white',
}

const PLACEHOLDER = `Ciao {nome}! 🌸

Abbiamo una promozione speciale per te...

Ti aspettiamo! ❤️`

const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-300 text-sm text-slate-800 bg-white'

// ── Component ─────────────────────────────────────────────────────────────
export default function PromoPage() {
  const { workspaceId } = useWorkspace()
  const [clients,       setClients]       = useState<ClientRow[]>([])
  const [loading,       setLoading]       = useState(true)
  const [loadingSegs,   setLoadingSegs]   = useState(true)

  const [filter,        setFilter]        = useState<FilterSegment>('tutti')
  const [search,        setSearch]        = useState('')
  const [selected,      setSelected]      = useState<Set<string>>(new Set())
  const [message,       setMessage]       = useState('')

  // Invio
  const [sending,       setSending]       = useState(false)
  const [showModal,     setShowModal]     = useState(false)
  const [progress,      setProgress]      = useState(0)
  const [results,       setResults]       = useState<SendResult[]>([])
  const abortRef = useRef(false)

  // Carica clienti (subito)
  useEffect(() => {
    getDocs(query(wsCol(db, workspaceId, 'clients'), orderBy('last_name'))).then(snap => {
      const rows: ClientRow[] = snap.docs
        .map(d => {
          const data = d.data()
          return {
            id:         d.id,
            first_name: data.first_name ?? '',
            last_name:  data.last_name  ?? '',
            phone:      data.phone      ?? '',
            city:       data.city       ?? null,
            segment:    'mai' as Segment,
            visitCount: 0,
            lastVisit:  null,
          }
        })
        .filter(c => c.phone.trim().length > 0)
      // Dedup: stessa chiave nome+cognome+telefono → tieni solo il primo
      const seen = new Set<string>()
      const deduped = rows.filter(c => {
        const key = `${c.first_name}|${c.last_name}|${c.phone}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setClients(deduped)
      setSelected(new Set(rows.map(c => c.id)))
      setLoading(false)

      // Carica appuntamenti per segmentazione
      const since = new Date()
      since.setMonth(since.getMonth() - 18)
      getDocs(query(
        wsCol(db, workspaceId, 'appointments'),
        where('start_time', '>=', since.toISOString()),
        orderBy('start_time', 'asc'),
      )).then(aptSnap => {
        const now = new Date()

        // Aggrega per cliente
        const byClient: Record<string, { count: number; first: Date; last: Date }> = {}
        aptSnap.docs.forEach(d => {
          const data = d.data()
          if (!VALID_STATUSES.has(data.status)) return
          const cid  = data.client_id as string
          const date = new Date(data.start_time as string)
          if (!byClient[cid]) byClient[cid] = { count: 0, first: date, last: date }
          byClient[cid].count++
          if (date > byClient[cid].last)  byClient[cid].last  = date
          if (date < byClient[cid].first) byClient[cid].first = date
        })

        setClients(prev => prev.map(c => {
          const stats = byClient[c.id]
          if (!stats) return c  // segment remains 'mai'
          const daysSince = differenceInDays(now, stats.last)
          let segment: Segment
          if      (daysSince >= 120)                                          segment = 'assente'
          else if (daysSince >= 60)                                           segment = 'a_rischio'
          else if (stats.count >= 5)                                         segment = 'abituale'
          else if (stats.count >= 3)                                         segment = 'frequente'
          else if (differenceInDays(now, stats.first) <= 60 && stats.count <= 2) segment = 'nuovo'
          else                                                                segment = 'frequente'
          return { ...c, segment, visitCount: stats.count, lastVisit: stats.last }
        }))
        setLoadingSegs(false)
      }).catch(() => setLoadingSegs(false))
    }).catch(() => setLoading(false))
  }, [workspaceId])

  // Filtro attivo
  const filtered = useMemo(() => {
    let rows = filter === 'tutti' ? clients : clients.filter(c => c.segment === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
        c.phone.includes(q)
      )
    }
    return rows
  }, [clients, filter, search])

  // Conteggi per badge
  const segCounts = useMemo(() => {
    const counts: Record<FilterSegment, number> = {
      tutti: clients.length, nuovo: 0, frequente: 0,
      abituale: 0, a_rischio: 0, assente: 0, mai: 0,
    }
    clients.forEach(c => { counts[c.segment]++ })
    return counts
  }, [clients])

  // Selezione
  function toggleAll() {
    if (filtered.every(c => selected.has(c.id))) {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(c => n.delete(c.id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(c => n.add(c.id)); return n })
    }
  }

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const selectedInView = filtered.filter(c => selected.has(c.id))
  const allInViewSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id))
  const totalSelected = clients.filter(c => selected.has(c.id))

  // Preview messaggio con nome del primo selezionato
  const previewName = totalSelected[0]?.first_name ?? 'Maria'
  const previewMsg  = message.replace(/\{nome\}/gi, previewName)

  // ── Invio ────────────────────────────────────────────────────────────────
  async function startSend() {
    if (!message.trim() || totalSelected.length === 0) return
    abortRef.current = false
    setResults([])
    setProgress(0)
    setSending(true)
    setShowModal(true)

    const queue = totalSelected.map(c => ({ clientId: c.id, firstName: c.first_name, phone: c.phone }))

    for (let i = 0; i < queue.length; i++) {
      if (abortRef.current) break
      const { clientId, firstName, phone } = queue[i]
      const name = `${clients.find(c => c.id === clientId)?.first_name ?? ''} ${clients.find(c => c.id === clientId)?.last_name ?? ''}`.trim()

      try {
        const res = await fetch('/api/whatsapp/promo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, firstName, phone, message }),
        })
        const json = await res.json()
        setResults(prev => [...prev, { clientId, name, ok: json.ok === true, error: json.error }])
      } catch (err) {
        setResults(prev => [...prev, { clientId, name, ok: false, error: String(err) }])
      }

      setProgress(i + 1)
    }

    setSending(false)
  }

  function closeModal() {
    if (sending) { abortRef.current = true }
    setShowModal(false)
    setSending(false)
  }

  const sent   = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Caricamento clienti…</div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-500" />
              Promo WhatsApp
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Invia messaggi personalizzati ai tuoi clienti
            </p>
          </div>
          <span className="text-xs font-semibold bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-full">
            {totalSelected.length} selezionati
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-5 space-y-4">

        {/* Filtri segmento */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Filtra per segmento</p>
          <div className="flex flex-wrap gap-2">
            {SEGMENTS.map(seg => (
              <button
                key={seg.key}
                onClick={() => setFilter(seg.key)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
                  filter === seg.key ? SEG_ACTIVE[seg.key] : SEG_COLORS[seg.key],
                  loadingSegs && seg.key !== 'tutti' && seg.key !== 'mai' ? 'opacity-50' : '',
                )}
              >
                <span>{seg.emoji}</span>
                <span>{seg.label}</span>
                <span className={clsx(
                  'ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black',
                  filter === seg.key ? 'bg-white/20' : 'bg-black/5',
                )}>
                  {segCounts[seg.key]}
                </span>
              </button>
            ))}
          </div>
          {loadingSegs && (
            <p className="text-[10px] text-slate-400 mt-2">Caricamento segmenti in corso…</p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-5">

          {/* ── Pannello destinatari ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            {/* Search + select-all */}
            <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Cerca per nome o telefono…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-300 text-sm"
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 font-medium">
                  {filtered.length} clienti visibili
                </p>
                <button
                  onClick={toggleAll}
                  className="text-xs font-semibold text-green-600 hover:text-green-700 flex items-center gap-1"
                >
                  {allInViewSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  {allInViewSelected ? 'Deseleziona filtrati' : 'Seleziona filtrati'}
                </button>
              </div>
            </div>

            {/* Lista */}
            <div className="divide-y divide-slate-50 max-h-[420px] overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  Nessun cliente in questo segmento
                </div>
              ) : (
                filtered.map(c => {
                  const isSelected = selected.has(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggle(c.id)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors',
                        isSelected ? 'bg-green-50/40' : '',
                      )}
                    >
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-green-600 shrink-0" />
                        : <Square className="w-4 h-4 text-slate-300 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {c.first_name} {c.last_name}
                        </p>
                        <p className="text-xs text-slate-400">{c.phone}</p>
                      </div>
                      {!loadingSegs && (
                        <span className={clsx(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0',
                          SEG_COLORS[c.segment],
                        )}>
                          {SEGMENTS.find(s => s.key === c.segment)?.emoji}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 font-medium">
              {totalSelected.length} selezionati in totale
            </div>
          </div>

          {/* ── Composer ── */}
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-green-500" />
                <h3 className="text-sm font-bold text-slate-700">Messaggio</h3>
              </div>

              {/* Tip variabile */}
              <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2 text-xs text-green-700">
                Usa <span className="font-black bg-green-100 px-1.5 py-0.5 rounded">{'{nome}'}</span> per inserire il nome del cliente automaticamente
              </div>

              <div className="relative">
                <textarea
                  rows={8}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={PLACEHOLDER}
                  className={clsx(INPUT, 'resize-none')}
                />
                <span className={clsx(
                  'absolute bottom-2.5 right-3 text-[10px] font-semibold',
                  message.length > 1000 ? 'text-rose-500' : 'text-slate-300',
                )}>
                  {message.length}
                </span>
              </div>
            </div>

            {/* Preview */}
            {message.trim() && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                  Anteprima — come riceve {previewName}
                </p>
                <div className="bg-[#dcf8c6] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap max-h-36 overflow-y-auto shadow-sm">
                  {previewMsg}
                </div>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={startSend}
              disabled={totalSelected.length === 0 || !message.trim()}
              className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-green-500 to-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold py-4 rounded-2xl shadow-lg shadow-green-200 hover:opacity-90 transition-opacity"
            >
              <Send className="w-4 h-4" />
              Invia a {totalSelected.length} client{totalSelected.length === 1 ? 'e' : 'i'} via WhatsApp
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal progresso invio ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!sending ? closeModal : undefined} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-5">

            {/* Header modal */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-500" />
                <h2 className="font-bold text-slate-800">Invio in corso</h2>
              </div>
              {!sending && (
                <button onClick={closeModal} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              )}
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
                <span>{sending ? 'Invio messaggi…' : 'Completato'}</span>
                <span>{progress} / {totalSelected.length}</span>
              </div>
              <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all duration-300',
                    sending ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-emerald-500',
                  )}
                  style={{ width: `${totalSelected.length > 0 ? (progress / totalSelected.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            {results.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                  <p className="text-2xl font-black text-emerald-600">{sent}</p>
                  <p className="text-xs text-emerald-500 font-semibold">Inviati</p>
                </div>
                <div className={clsx('border rounded-xl p-3 text-center', failed > 0 ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100')}>
                  <XCircle className={clsx('w-5 h-5 mx-auto mb-1', failed > 0 ? 'text-rose-500' : 'text-slate-300')} />
                  <p className={clsx('text-2xl font-black', failed > 0 ? 'text-rose-600' : 'text-slate-300')}>{failed}</p>
                  <p className={clsx('text-xs font-semibold', failed > 0 ? 'text-rose-500' : 'text-slate-400')}>Falliti</p>
                </div>
              </div>
            )}

            {/* Log errori */}
            {failed > 0 && !sending && (
              <details className="text-xs">
                <summary className="text-rose-600 font-semibold cursor-pointer select-none flex items-center gap-1">
                  <ChevronDown className="w-3.5 h-3.5" />
                  Vedi errori ({failed})
                </summary>
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {results.filter(r => !r.ok).map((r, i) => (
                    <div key={i} className="bg-rose-50 rounded-lg px-3 py-1.5">
                      <span className="font-semibold text-rose-700">{r.name}</span>
                      {r.error && <span className="text-rose-400 ml-1.5">— {r.error}</span>}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* CTA finale */}
            {!sending && (
              <button
                onClick={closeModal}
                className="w-full bg-slate-800 text-white text-sm font-semibold py-3 rounded-xl hover:bg-slate-700 transition-colors"
              >
                {results.length > 0 ? 'Chiudi' : 'Annulla'}
              </button>
            )}

            {sending && (
              <p className="text-xs text-center text-slate-400">
                Non chiudere questa finestra durante l'invio
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
