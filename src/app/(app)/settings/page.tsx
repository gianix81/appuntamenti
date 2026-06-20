'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useReminderContext } from '@/components/layout/ReminderCheckerProvider'
import { clearAllNotified, type CheckResult } from '@/hooks/useReminderChecker'
import type { Settings } from '@/types/database'
import { Bell, BellOff, CheckCircle, RefreshCw, Plus, Trash2 } from 'lucide-react'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [checking, setChecking]         = useState(false)
  const [showAddReminder, setShowAddReminder] = useState(false)
  const [newInterval, setNewInterval]     = useState<number | ''>('')

  const REMINDER_OPTIONS = [
    { value: 15,   label: '15 minuti prima' },
    { value: 30,   label: '30 minuti prima' },
    { value: 60,   label: '1 ora prima' },
    { value: 120,  label: '2 ore prima' },
    { value: 240,  label: '4 ore prima' },
    { value: 480,  label: '8 ore prima' },
    { value: 1440, label: '24 ore prima (giorno prima)' },
    { value: 2880, label: '48 ore prima (2 giorni prima)' },
  ]

  function intervalToDisplay(minutes: number): { time: string; unit: string } {
    if (minutes >= 2880) return { time: String(minutes / 1440), unit: `${minutes / 1440 === 1 ? 'giorno' : 'giorni'} prima` }
    if (minutes >= 1440) return { time: '24', unit: 'ore prima' }
    if (minutes >= 60)   return { time: String(minutes / 60), unit: `${minutes / 60 === 1 ? 'ora' : 'ore'} prima` }
    return { time: String(minutes), unit: 'minuti prima' }
  }

  const [form, setForm] = useState({
    center_name:          '',
    phone_number:         '',
    address:              '',
    confirmation_enabled: true,
    reminder_enabled:     true,
    reminder_intervals:   [1440, 120] as number[],
  })

  const { permission, subscribed, subscribe, unsubscribe } = usePushNotifications()
  const { forceCheck } = useReminderContext()

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'main'))
        if (snap.exists()) {
          const data = snap.data() as Settings
          setSettings(data)
          setForm({
            center_name:          data.center_name ?? '',
            phone_number:         data.phone_number ?? '',
            address:              data.address ?? '',
            confirmation_enabled: data.confirmation_enabled ?? true,
            reminder_enabled:     data.reminder_enabled ?? true,
            reminder_intervals:   data.reminder_intervals ?? (data.reminder_minutes ? [data.reminder_minutes] : [1440, 120]),
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
    const minInterval = form.reminder_intervals.length > 0 ? Math.min(...form.reminder_intervals) : 30
    await setDoc(doc(db, 'settings', 'main'), {
      center_name:          form.center_name.trim(),
      phone_number:         form.phone_number.trim() || null,
      address:              form.address.trim() || null,
      confirmation_enabled: form.confirmation_enabled,
      reminder_enabled:     form.reminder_enabled,
      reminder_intervals:   form.reminder_intervals,
      reminder_minutes:     minInterval,
      updated_at:           new Date().toISOString(),
      created_at:           settings?.created_at ?? new Date().toISOString(),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleTestNotification() {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready
        await reg.showNotification('Test notifica Appuntamenti App', {
          body: 'Le notifiche funzionano correttamente! ✓',
          icon: '/icons/icon-192.png',
          requireInteraction: false,
        })
      } else {
        new Notification('Test notifica Appuntamenti App', {
          body: 'Le notifiche funzionano correttamente! ✓',
          icon: '/icons/icon-192.png',
        })
      }
    } catch (err) {
      console.error('Test notification failed:', err)
    }
    setTestSent(true)
    setTimeout(() => setTestSent(false), 3000)
  }

  async function handleForceCheck() {
    setChecking(true)
    setCheckResult(null)
    try {
      clearAllNotified() // resetta la cache localStorage
      const result = await forceCheck()
      setCheckResult(result)
    } finally {
      setChecking(false)
    }
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
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800"
              placeholder="Il Mio Centro Estetico" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Telefono del centro</label>
            <input type="tel" value={form.phone_number}
              onChange={e => setForm(p => ({ ...p, phone_number: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800"
              placeholder="+39 02 1234567" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Indirizzo</label>
            <input value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800"
              placeholder="Via Roma 1, Milano" />
          </div>
          {/* Notifiche SMS ai clienti */}
          <div className="border-t border-slate-100 pt-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notifiche SMS ai clienti</p>

            {/* Conferma appuntamento */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-700">Conferma appuntamento</p>
                <p className="text-xs text-slate-400">SMS al cliente quando viene fissato un appuntamento</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, confirmation_enabled: !p.confirmation_enabled }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  form.confirmation_enabled ? 'bg-blue-600' : 'bg-slate-200'
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                  form.confirmation_enabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* Promemoria appuntamento */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-700">Promemoria appuntamento</p>
                <p className="text-xs text-slate-400">SMS di promemoria prima dell'appuntamento</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, reminder_enabled: !p.reminder_enabled }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  form.reminder_enabled ? 'bg-blue-600' : 'bg-slate-200'
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                  form.reminder_enabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* Promemoria - stile sveglie */}
            {form.reminder_enabled && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Promemoria attivi</p>

                {form.reminder_intervals.length === 0 && (
                  <p className="text-xs text-slate-400 italic py-1">Nessun promemoria configurato.</p>
                )}

                {[...form.reminder_intervals].sort((a, b) => b - a).map(interval => {
                  const { time, unit } = intervalToDisplay(interval)
                  return (
                    <div key={interval} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-slate-800 tabular-nums leading-none">{time}</span>
                        <span className="text-sm text-slate-500">{unit}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(p => ({ ...p, reminder_intervals: p.reminder_intervals.filter(v => v !== interval) }))}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        title="Rimuovi"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}

                {showAddReminder ? (
                  <div className="flex gap-2 items-center">
                    <select
                      value={newInterval}
                      onChange={e => setNewInterval(Number(e.target.value))}
                      className="flex-1 px-3 py-2.5 rounded-xl border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800 bg-white"
                    >
                      <option value="">Seleziona…</option>
                      {REMINDER_OPTIONS.filter(o => !form.reminder_intervals.includes(o.value)).map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={newInterval === ''}
                      onClick={() => {
                        if (newInterval !== '') {
                          setForm(p => ({ ...p, reminder_intervals: [...p.reminder_intervals, newInterval as number].sort((a, b) => b - a) }))
                          setNewInterval('')
                          setShowAddReminder(false)
                        }
                      }}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-200 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      Aggiungi
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddReminder(false); setNewInterval('') }}
                      className="p-2.5 border border-slate-200 text-slate-400 hover:bg-slate-50 rounded-xl transition-colors"
                    >
                      <span className="text-sm">✕</span>
                    </button>
                  </div>
                ) : REMINDER_OPTIONS.some(o => !form.reminder_intervals.includes(o.value)) ? (
                  <button
                    type="button"
                    onClick={() => setShowAddReminder(true)}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-blue-200 hover:border-blue-400 text-blue-500 hover:text-blue-700 text-sm font-medium py-3 rounded-2xl transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Aggiungi promemoria
                  </button>
                ) : null}
              </div>
            )}
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
              <button onClick={() => { unsubscribe(); alert('Per disattivare completamente le notifiche, vai nelle impostazioni del browser.') }}
                className="flex-1 text-sm border border-red-200 hover:bg-red-50 text-red-500 font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                <BellOff className="w-4 h-4" /> Disattiva
              </button>
            </div>

            {/* Verifica promemoria */}
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <button
                onClick={handleForceCheck}
                disabled={checking}
                className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Verifica in corso…' : 'Verifica ora (forza promemoria)'}
              </button>
              {checkResult && (
                <div className={`rounded-xl px-4 py-3 text-xs font-mono ${checkResult.ok ? 'bg-slate-50 text-slate-600' : 'bg-red-50 text-red-600'}`}>
                  {checkResult.message}
                  {checkResult.found > 0 && (
                    <span className="ml-2 text-slate-400">· trovati: {checkResult.found}</span>
                  )}
                </div>
              )}
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
