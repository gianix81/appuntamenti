'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { collection, getDocs, deleteDoc, doc, query, orderBy, updateDoc, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Service } from '@/types/database'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Scissors, Plus, Pencil, Trash2, Clock, Euro, Download, X, Check } from 'lucide-react'
import { clsx } from 'clsx'

/* ── Predefined services list ─────────────────────────────── */
const PRESET_SERVICES = [
  // Unghie
  { name: 'Ricopertura in gel',           duration_minutes: 90, price: 0, category: 'Unghie' },
  { name: 'Ricostruzione in gel',         duration_minutes: 90, price: 0, category: 'Unghie' },
  { name: 'Semipermanente mani',          duration_minutes: 40, price: 0, category: 'Unghie' },
  { name: 'Manicure',                     duration_minutes: 20, price: 0, category: 'Unghie' },
  { name: 'Pedicure',                     duration_minutes: 40, price: 0, category: 'Unghie' },
  // Ceretta
  { name: 'Cera completa donna',          duration_minutes: 40, price: 0, category: 'Ceretta' },
  { name: 'Cera completa uomo',           duration_minutes: 60, price: 0, category: 'Ceretta' },
  { name: 'Cera gambaletto',              duration_minutes: 10, price: 0, category: 'Ceretta' },
  { name: 'Ceretta inguine',              duration_minutes: 15, price: 0, category: 'Ceretta' },
  { name: 'Ceretta coscia',               duration_minutes: 10, price: 0, category: 'Ceretta' },
  { name: 'Cera braccia',                 duration_minutes: 15, price: 0, category: 'Ceretta' },
  { name: 'Baffo e sopracciglia',         duration_minutes: 10, price: 0, category: 'Ceretta' },
  // Laser
  { name: 'Laser Total body',             duration_minutes: 50, price: 0, category: 'Laser' },
  { name: 'Laser a zona',                 duration_minutes: 20, price: 0, category: 'Laser' },
  { name: 'Laser viso',                   duration_minutes: 10, price: 0, category: 'Laser' },
  // Trattamenti
  { name: 'Trattamento corpo e viso',     duration_minutes: 40, price: 0, category: 'Trattamenti' },
]

const CATEGORY_COLOR: Record<string, string> = {
  Unghie:       'bg-pink-50 text-pink-700 border-pink-200',
  Ceretta:      'bg-amber-50 text-amber-700 border-amber-200',
  Laser:        'bg-violet-50 text-violet-700 border-violet-200',
  Trattamenti:  'bg-teal-50 text-teal-700 border-teal-200',
}

type PresetRow = {
  name: string
  duration_minutes: number
  price: number
  category: string
  selected: boolean
}

/* ── Import modal ────────────────────────────────────────── */
function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [rows, setRows] = useState<PresetRow[]>(
    PRESET_SERVICES.map(s => ({ ...s, selected: true }))
  )
  const [loading, setLoading] = useState(false)

  const selectedCount = rows.filter(r => r.selected).length

  function toggleAll() {
    const allSelected = rows.every(r => r.selected)
    setRows(prev => prev.map(r => ({ ...r, selected: !allSelected })))
  }

  function updateRow(i: number, field: 'name' | 'duration_minutes' | 'price', value: string | number) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  async function handleImport() {
    const toAdd = rows.filter(r => r.selected)
    if (toAdd.length === 0) return
    setLoading(true)
    try {
      const now = new Date().toISOString()
      await Promise.all(toAdd.map(r =>
        addDoc(collection(db, 'services'), {
          name:             r.name.trim(),
          duration_minutes: Number(r.duration_minutes),
          price:            Number(r.price),
          description:      null,
          active:           true,
          created_at:       now,
          updated_at:       now,
        })
      ))
      onImported()
    } finally {
      setLoading(false)
    }
  }

  const categories = [...new Set(PRESET_SERVICES.map(s => s.category))]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-bold text-slate-800">Importa servizi predefiniti</h2>
            <p className="text-xs text-slate-400 mt-0.5">{selectedCount} selezionati — imposta i prezzi prima di importare</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {categories.map(cat => {
            const catRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.category === cat)
            return (
              <div key={cat}>
                <div className="px-5 py-2 bg-slate-50 sticky top-0 z-10">
                  <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full border', CATEGORY_COLOR[cat] ?? 'bg-slate-100 text-slate-600 border-slate-200')}>
                    {cat}
                  </span>
                </div>
                {catRows.map(({ r, i }) => (
                  <div key={i} className={clsx('flex items-center gap-3 px-5 py-2.5 border-b border-slate-50 transition-colors', r.selected ? '' : 'opacity-40')}>
                    {/* Checkbox */}
                    <button onClick={() => setRows(prev => prev.map((row, idx) => idx === i ? { ...row, selected: !row.selected } : row))}
                      className={clsx('w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                        r.selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300')}>
                      {r.selected && <Check className="w-3 h-3 text-white" />}
                    </button>

                    {/* Name */}
                    <input
                      type="text"
                      value={r.name}
                      onChange={e => updateRow(i, 'name', e.target.value)}
                      className="flex-1 text-sm text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none py-0.5 min-w-0"
                    />

                    {/* Duration */}
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        value={r.duration_minutes}
                        min={1}
                        onChange={e => updateRow(i, 'duration_minutes', e.target.value)}
                        className="w-12 text-center text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                      <span className="text-xs text-slate-400">min</span>
                    </div>

                    {/* Price */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <span className="text-xs text-slate-400">€</span>
                      <input
                        type="number"
                        value={r.price || ''}
                        min={0}
                        placeholder="0"
                        onChange={e => updateRow(i, 'price', e.target.value)}
                        className="w-14 text-center text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0 bg-white">
          <button onClick={toggleAll} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
            {rows.every(r => r.selected) ? 'Deseleziona tutti' : 'Seleziona tutti'}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 font-medium hover:bg-slate-50">
              Annulla
            </button>
            <button
              onClick={handleImport}
              disabled={loading || selectedCount === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors"
            >
              {loading ? 'Importando…' : `Importa ${selectedCount}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────── */
export default function ServicesPage() {
  const [services, setServices]       = useState<Service[]>([])
  const [loading, setLoading]         = useState(true)
  const [deleting, setDeleting]       = useState<string | null>(null)
  const [showImport, setShowImport]   = useState(false)

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
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Servizi</h1>
            <p className="text-slate-400 text-xs mt-0.5">{services.length} servizi totali</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" /> Importa lista
            </button>
            <Link href="/services/new"
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors">
              <Plus className="w-4 h-4" /> Nuovo
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-4">
        {loading ? <LoadingState /> : services.length === 0 ? (
          <EmptyState icon={Scissors} title="Nessun servizio"
            description="Importa la lista predefinita o aggiungi i servizi uno ad uno."
            action={
              <div className="flex gap-3 flex-wrap justify-center">
                <button onClick={() => setShowImport(true)}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors">
                  <Download className="w-4 h-4" /> Importa lista predefinita
                </button>
                <Link href="/services/new"
                  className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-200 transition-colors">
                  <Plus className="w-4 h-4" /> Aggiungi singolo
                </Link>
              </div>
            }
          />
        ) : (
          <div className="space-y-2">
            {services.map(service => (
              <div key={service.id} className={clsx('bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden', !service.active && 'opacity-60')}>
                <div className="p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Scissors className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{service.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-slate-400 text-xs">
                        <Clock className="w-3 h-3" /> {service.duration_minutes} min
                      </span>
                      <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                        <Euro className="w-3 h-3" />
                        {Number(service.price) > 0 ? Number(service.price).toFixed(2) : <span className="text-amber-500">prezzo da impostare</span>}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleActive(service)}
                      title={service.active ? 'Disattiva' : 'Attiva'}
                      className={clsx('relative w-9 h-5 rounded-full transition-colors shrink-0',
                        service.active ? 'bg-emerald-500' : 'bg-slate-300')}>
                      <span className={clsx('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                        service.active ? 'left-4' : 'left-0.5')} />
                    </button>
                    <Link href={`/services/${service.id}/edit`}
                      className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-colors">
                      <Pencil className="w-4 h-4" />
                    </Link>
                    <button onClick={() => handleDelete(service.id)} disabled={deleting === service.id}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false)
            setLoading(true)
            loadServices()
          }}
        />
      )}
    </div>
  )
}
