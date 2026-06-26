'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { wsCol, wsDoc } from '@/lib/firebase/workspace'
import type { Service } from '@/types/database'

interface Props { existing?: Service }

export function ServiceForm({ existing }: Props) {
  const router = useRouter()
  const { workspaceId } = useWorkspace()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name:             existing?.name ?? '',
    duration_minutes: existing?.duration_minutes?.toString() ?? '60',
    price:            existing?.price?.toString() ?? '0',
    description:      existing?.description ?? '',
    active:           existing?.active ?? true,
  })

  function set(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const payload = {
      name:             form.name.trim(),
      duration_minutes: parseInt(form.duration_minutes),
      price:            parseFloat(form.price),
      description:      form.description.trim() || null,
      active:           form.active,
      updated_at:       new Date().toISOString(),
    }

    try {
      if (existing) {
        await updateDoc(wsDoc(db, workspaceId, 'services', existing.id), payload)
      } else {
        await addDoc(wsCol(db, workspaceId, 'services'), { ...payload, created_at: new Date().toISOString() })
      }
      router.push('/services')
      router.refresh()
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Nome servizio *</label>
        <input required value={form.name} onChange={e => set('name', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800" placeholder="Es. Manicure, Pulizia viso…" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Durata (minuti) *</label>
          <input required type="number" min={5} step={5} value={form.duration_minutes} onChange={e => set('duration_minutes', e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Prezzo (€) *</label>
          <input required type="number" min={0} step={0.5} value={form.price} onChange={e => set('price', e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Descrizione</label>
        <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm resize-none" />
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => set('active', !form.active)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.active ? 'bg-orange-500' : 'bg-slate-200'}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.active ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
        <span className="text-sm text-slate-700">Servizio attivo</span>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.back()}
          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Annulla</button>
        <button type="submit" disabled={loading}
          className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-semibold py-3 rounded-xl transition-colors">
          {loading ? 'Salvataggio…' : existing ? 'Aggiorna' : 'Salva servizio'}
        </button>
      </div>
    </form>
  )
}
