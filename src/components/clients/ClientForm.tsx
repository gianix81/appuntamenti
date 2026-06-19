'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, doc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Client } from '@/types/database'

interface Props { existing?: Client }

export function ClientForm({ existing }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    first_name: existing?.first_name ?? '',
    last_name:  existing?.last_name ?? '',
    phone:      existing?.phone ?? '',
    email:      existing?.email ?? '',
    notes:      existing?.notes ?? '',
  })

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const payload = {
      first_name: form.first_name.trim(),
      last_name:  form.last_name.trim(),
      phone:      form.phone.trim(),
      email:      form.email.trim() || null,
      notes:      form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    try {
      if (existing) {
        await updateDoc(doc(db, 'clients', existing.id), payload)
      } else {
        await addDoc(collection(db, 'clients'), {
          ...payload,
          created_at: new Date().toISOString(),
        })
      }
      router.push('/clients')
      router.refresh()
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
          <input required value={form.first_name} onChange={e => set('first_name', e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-300 text-sm" placeholder="Maria" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cognome *</label>
          <input required value={form.last_name} onChange={e => set('last_name', e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-300 text-sm" placeholder="Rossi" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Telefono *</label>
        <input required type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-300 text-sm" placeholder="+39 333 1234567" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-300 text-sm" placeholder="maria@email.com" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
        <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-300 text-sm resize-none" placeholder="Allergie, preferenze, ecc." />
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.back()}
          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">Annulla</button>
        <button type="submit" disabled={loading}
          className="flex-1 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white text-sm font-semibold py-3 rounded-xl transition-colors">
          {loading ? 'Salvataggio…' : existing ? 'Aggiorna' : 'Salva cliente'}
        </button>
      </div>
    </form>
  )
}
