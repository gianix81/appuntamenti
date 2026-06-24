'use client'

import { useState } from 'react'
import { collection, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { ClientTreatment, TreatmentCategory } from '@/types/database'
import { clsx } from 'clsx'
import { X, Trash2 } from 'lucide-react'

interface Props {
  clientId: string
  defaultCategory?: TreatmentCategory
  existing?: ClientTreatment
  onSaved: () => void
  onClose: () => void
}

const CATS: { key: TreatmentCategory; label: string; activeClass: string }[] = [
  { key: 'corpo',    label: '💆 Corpo',          activeClass: 'bg-indigo-600 text-white' },
  { key: 'viso',     label: '✨ Viso/Décolleté', activeClass: 'bg-violet-600 text-white' },
  { key: 'laser',    label: '⚡ Laser',           activeClass: 'bg-rose-600 text-white'   },
  { key: 'prodotto', label: '🧴 Prodotto Casa',   activeClass: 'bg-emerald-600 text-white' },
]

const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300 text-sm bg-white'
const LABEL = 'block text-xs font-semibold text-slate-500 mb-1.5'

export function TreatmentModal({ clientId, defaultCategory = 'corpo', existing, onSaved, onClose }: Props) {
  const [category, setCategory] = useState<TreatmentCategory>(existing?.category ?? defaultCategory)
  const [form, setForm] = useState({
    date:           existing?.date           ?? new Date().toISOString().split('T')[0],
    treatment:      existing?.treatment      ?? '',
    operator:       existing?.operator       ?? '',
    notes:          existing?.notes          ?? '',
    price:          existing?.price != null  ? String(existing.price) : '',
    zone:           existing?.zone           ?? '',
    program:        existing?.program        ?? '',
    energy:         existing?.energy         ?? '',
    frequency_hz:   existing?.frequency_hz   ?? '',
    pulse_duration: existing?.pulse_duration ?? '',
  })
  const [loading,  setLoading]  = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.treatment.trim()) { setError('Inserisci il nome del trattamento.'); return }
    if (!form.date)              { setError('Inserisci la data.'); return }
    setError(null)
    setLoading(true)

    const payload = {
      client_id: clientId,
      category,
      date:      form.date,
      treatment: form.treatment.trim(),
      operator:  form.operator.trim()  || null,
      notes:     form.notes.trim()     || null,
      price:     form.price ? parseFloat(form.price) : null,
      zone:           category === 'laser' ? (form.zone.trim()           || null) : null,
      program:        category === 'laser' ? (form.program.trim()        || null) : null,
      energy:         category === 'laser' ? (form.energy.trim()         || null) : null,
      frequency_hz:   category === 'laser' ? (form.frequency_hz.trim()  || null) : null,
      pulse_duration: category === 'laser' ? (form.pulse_duration.trim() || null) : null,
    }

    try {
      if (existing) {
        await updateDoc(doc(db, 'client_treatments', existing.id), payload)
      } else {
        await addDoc(collection(db, 'client_treatments'), { ...payload, created_at: new Date().toISOString() })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!existing || !confirm('Eliminare questo record?')) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'client_treatments', existing.id))
      onSaved()
      onClose()
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Handle bar */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-slate-800 text-sm">
            {existing ? 'Modifica trattamento' : 'Nuovo trattamento'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Categoria */}
          <div>
            <label className={LABEL}>Categoria</label>
            <div className="flex flex-wrap gap-1.5">
              {CATS.map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    category === c.key ? c.activeClass + ' shadow' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Data */}
          <div>
            <label className={LABEL}>Data *</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={INPUT} />
          </div>

          {/* Nome trattamento */}
          <div>
            <label className={LABEL}>{category === 'prodotto' ? 'Prodotto *' : 'Trattamento *'}</label>
            <input
              value={form.treatment}
              onChange={e => set('treatment', e.target.value)}
              className={INPUT}
              placeholder={
                category === 'prodotto' ? 'es. Crema idratante SPF 30'
                  : category === 'laser' ? 'es. Epilazione laser'
                  : category === 'viso'  ? 'es. Pulizia viso profonda'
                  : 'es. Scrub corpo, Bendaggi'
              }
            />
          </div>

          {/* ── Sezione parametri laser ── */}
          {category === 'laser' && (
            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-extrabold text-rose-600 uppercase tracking-widest">⚡ Parametri laser</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Zona</label>
                  <input value={form.zone} onChange={e => set('zone', e.target.value)}
                    className={INPUT} placeholder="es. Gambe, Ascelle" />
                </div>
                <div>
                  <label className={LABEL}>Programma</label>
                  <input value={form.program} onChange={e => set('program', e.target.value)}
                    className={INPUT} placeholder="es. 1A" />
                </div>
                <div>
                  <label className={LABEL}>Energia (J)</label>
                  <input value={form.energy} onChange={e => set('energy', e.target.value)}
                    className={INPUT} placeholder="es. 18" />
                </div>
                <div>
                  <label className={LABEL}>Frequenza (Hz)</label>
                  <input value={form.frequency_hz} onChange={e => set('frequency_hz', e.target.value)}
                    className={INPUT} placeholder="es. 2" />
                </div>
                <div className="col-span-2">
                  <label className={LABEL}>Durata impulso (ms)</label>
                  <input value={form.pulse_duration} onChange={e => set('pulse_duration', e.target.value)}
                    className={INPUT} placeholder="es. 30" />
                </div>
              </div>
            </div>
          )}

          {/* Operatrice / Prezzo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>{category === 'prodotto' ? 'Venduto da' : 'Eseguito da'}</label>
              <input value={form.operator} onChange={e => set('operator', e.target.value)}
                className={INPUT} placeholder="Nome operatrice" />
            </div>
            <div>
              <label className={LABEL}>Prezzo (€)</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => set('price', e.target.value)}
                className={INPUT} placeholder="0.00" />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className={LABEL}>Note</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              className={clsx(INPUT, 'resize-none')} placeholder="Note libere…" />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-4 flex gap-2">
          {existing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="p-3 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
            Annulla
          </button>
          <button type="button" onClick={handleSave} disabled={loading}
            className="flex-1 bg-gradient-to-r from-violet-500 to-purple-700 disabled:opacity-50 text-white text-sm font-semibold py-3 rounded-xl shadow hover:opacity-90 transition-opacity">
            {loading ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}
