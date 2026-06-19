'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import type { Settings } from '@/types/database'
import { Bell, BellOff, CheckCircle } from 'lucide-react'

export default function SettingsPage() {
  const [settings, setSettings]   = useState<Settings | null>(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [testSent, setTestSent]   = useState(false)
  const [form, setForm] = useState({
    center_name:      '',
    phone_number:     '',
    address:          '',
    reminder_minutes: '30',
  })

  const { permission, subscribed, subscribe, unsubscribe } = usePushNotifications()

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'main'))
        if (snap.exists()) {
          const data = snap.data() as Settings
          setSettings(data)
          setForm({
            center_name:      data.center_name ?? '',
            phone_number:     data.phone_number ?? '',
            address:          data.address ?? '',
            reminder_minutes: data.reminder_minutes?.toString() ?? '30',
          })
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await setDoc(doc(db, 'settings', 'main'), {
      center_name:      form.center_name.trim(),
      phone_number:     form.phone_number.trim() || null,
      address:          form.address.trim() || null,
      reminder_minutes: parseInt(form.reminder_minutes),
      updated_at:       new Date().toISOString(),
      created_at:       settings?.created_at ?? new Date().toISOString(),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleTestNotification() {
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    new Notification('Test notifica Appuntamenti App', {
      body: 'Le notifiche funzionano correttamente!',
      icon: '/icons/icon-192.png',
    })
    setTestSent(true)
    setTimeout(() => setTestSent(false), 3000)
  }

  if (loading) return (
    <div className="p-6">
      <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto w-full space-y-6">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-slate-800">Impostazioni</h1>
        <p className="text-slate-400 text-sm">Configura il tuo centro estetico</p>
      </div>

      {/* Centro */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Dati del centro</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome centro *</label>
            <input required value={form.center_name}
              onChange={e => setForm(p => ({ ...p, center_name: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm"
              placeholder="Il Mio Centro Estetico" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Telefono del centro</label>
            <input type="tel" value={form.phone_number}
              onChange={e => setForm(p => ({ ...p, phone_number: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm"
              placeholder="+39 02 1234567" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Indirizzo</label>
            <input value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm"
              placeholder="Via Roma 1, Milano" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Anticipo promemoria</label>
            <select value={form.reminder_minutes}
              onChange={e => setForm(p => ({ ...p, reminder_minutes: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm bg-white">
              <option value="15">15 minuti prima</option>
              <option value="30">30 minuti prima</option>
              <option value="60">1 ora prima</option>
              <option value="120">2 ore prima</option>
              <option value="1440">24 ore prima</option>
            </select>
          </div>
          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold py-3 rounded-xl transition-colors">
            {saving ? 'Salvataggio…' : saved ? '✓ Salvato!' : 'Salva impostazioni'}
          </button>
        </form>
      </div>

      {/* Notifiche */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Notifiche promemoria</h2>
        <p className="text-xs text-slate-400 mb-4">
          Ricevi una notifica sul dispositivo prima di ogni appuntamento per decidere se inviare un messaggio WhatsApp al cliente.
        </p>

        {permission === 'denied' ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
            Le notifiche sono bloccate dal browser. Vai nelle impostazioni del browser e consenti le notifiche per questo sito.
          </div>
        ) : subscribed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
              <Bell className="w-5 h-5 text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">Notifiche attive</p>
                <p className="text-xs text-green-600">Riceverai un avviso prima di ogni appuntamento.</p>
              </div>
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleTestNotification}
                className="flex-1 text-sm border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-2.5 rounded-xl transition-colors">
                {testSent ? '✓ Inviata!' : 'Prova notifica'}
              </button>
              <button onClick={unsubscribe}
                className="flex-1 text-sm border border-red-200 hover:bg-red-50 text-red-500 font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                <BellOff className="w-4 h-4" /> Disattiva
              </button>
            </div>
          </div>
        ) : (
          <button onClick={subscribe}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 rounded-xl transition-colors">
            <Bell className="w-4 h-4" />
            Attiva notifiche
          </button>
        )}
      </div>
    </div>
  )
}
