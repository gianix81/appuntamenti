'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { CheckCircle } from 'lucide-react'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [form, setForm]       = useState({
    center_name:  '',
    phone_number: '',
    address:      '',
  })

  useEffect(() => {
    getDoc(doc(db, 'settings', 'main')).then(snap => {
      if (snap.exists()) {
        const d = snap.data()
        setForm({
          center_name:  d.center_name  ?? '',
          phone_number: d.phone_number ?? '',
          address:      d.address      ?? '',
        })
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'main'), {
        center_name:  form.center_name.trim(),
        phone_number: form.phone_number.trim() || null,
        address:      form.address.trim()      || null,
        updated_at:   new Date().toISOString(),
      }, { merge: true })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(`Errore salvataggio: ${err}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-400 text-sm">Caricamento…</div>

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto w-full">
      <h1 className="text-xl font-bold text-slate-800 mb-6">Impostazioni</h1>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Informazioni centro</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome centro</label>
            <input
              type="text"
              value={form.center_name}
              onChange={e => set('center_name', e.target.value)}
              placeholder="Il tuo salone…"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Telefono</label>
            <input
              type="tel"
              value={form.phone_number}
              onChange={e => set('phone_number', e.target.value)}
              placeholder="+39 …"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Indirizzo</label>
            <input
              type="text"
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="Via …"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {saved
            ? <><CheckCircle className="w-4 h-4" /> Salvato!</>
            : saving ? 'Salvataggio…' : 'Salva impostazioni'}
        </button>
      </form>
    </div>
  )
}
