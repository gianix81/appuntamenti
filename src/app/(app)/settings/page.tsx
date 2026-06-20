'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useReminderContext } from '@/components/layout/ReminderCheckerProvider'
import { clearAllNotified, type CheckResult } from '@/hooks/useReminderChecker'
import type { Settings } from '@/types/database'
import { Bell, BellOff, CheckCircle, RefreshCw, Plus, Trash2, ChevronDown } from 'lucide-react'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [checking, setChecking]         = useState(false)
  const [showAdd, setShowAdd]             = useState(false)
  const [newInterval, setNewInterval]     = useState<number | ''>('')
  const [newType, setNewType]             = useState<'confirmation' | 'reminder'>('reminder')
  const [expandedCard, setExpandedCard]   = useState<string | null>(null)
  const [diagInfo, setDiagInfo]           = useState<string | null>(null)
  const [diagRunning, setDiagRunning]     = useState(false)

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

  function getDefaultMessage(type: 'confirmation' | 'reminder'): string {
    if (type === 'confirmation')
      return 'Ciao {nome}! Abbiamo fissato il tuo appuntamento per {servizio} il {data} alle {ora} presso {centro}. Rispondi SI per confermare o NO per annullare.'
    return 'Ciao {nome}! Ti ricordiamo il tuo appuntamento per {servizio} {quando} alle {ora} presso {centro}. Per annullare rispondi NO.'
  }

  const [form, setForm] = useState({
    center_name:          '',
    phone_number:         '',
    address:              '',
    reminder_enabled:     true,
    notification_slots:   [
      { interval: 1440, type: 'confirmation' as const },
      { interval: 120,  type: 'reminder'     as const },
    ],
    notification_messages: { confirmation: '', reminder: '' },
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
            reminder_enabled:   data.reminder_enabled ?? true,
            notification_slots: data.notification_slots ?? (
              (data.reminder_intervals ?? (data.reminder_minutes ? [data.reminder_minutes] : [1440, 120]))
                .map((interval: number) => ({ interval, type: 'reminder' as const }))
            ),
            notification_messages: {
              confirmation: (data.notification_messages as Record<string, string>)?.confirmation ?? '',
              reminder:     (data.notification_messages as Record<string, string>)?.reminder ?? '',
            },
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
    const minInterval = form.notification_slots.length > 0 ? Math.min(...form.notification_slots.map(s => s.interval)) : 30
    await setDoc(doc(db, 'settings', 'main'), {
      center_name:          form.center_name.trim(),
      phone_number:         form.phone_number.trim() || null,
      address:              form.address.trim() || null,

      reminder_enabled:    form.reminder_enabled,
      notification_slots:  form.notification_slots,
      reminder_intervals:  form.notification_slots.map(s => s.interval),
      reminder_minutes:    minInterval,
      notification_messages: form.notification_messages,
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

  async function runDiagnostics() {
    setDiagRunning(true)
    const lines: string[] = []
    try {
      // 1. Notification API
      lines.push(`Notification API: ${'Notification' in window ? '✅' : '❌ non disponibile'}`)
      if ('Notification' in window) {
        lines.push(`Permesso notifiche: ${Notification.permission === 'granted' ? '✅ granted' : `❌ ${Notification.permission}`}`)
      }
      // 2. Service Worker
      lines.push(`Service Worker: ${'serviceWorker' in navigator ? '✅' : '❌ non supportato'}`)
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        lines.push(`SW registrati: ${regs.length > 0 ? `✅ ${regs.length}` : '❌ nessuno'}`)
        if (regs.length > 0) {
          const sw = regs[0]
          lines.push(`SW stato: ${sw.active ? '✅ active' : sw.installing ? '⚠️ installing' : sw.waiting ? '⚠️ waiting' : '❌'}`)
        }
      }
      // 3. Push Manager
      lines.push(`PushManager: ${'PushManager' in window ? '✅' : '❌ non supportato'}`)
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.ready.catch(() => null)
        if (reg) {
          const sub = await reg.pushManager.getSubscription().catch(() => null)
          lines.push(`Push subscription: ${sub ? '✅ presente' : '❌ NON presente — clicca "Attiva notifiche"'}`)
        }
      }
      // 4. VAPID key
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      lines.push(`VAPID key: ${vapid ? '✅ configurata' : '❌ MANCANTE (controlla Vercel env vars)'}`)
      // 5. Slot configurati
      const slotCount = form.notification_slots.length
      lines.push(`Slot notifiche: ${slotCount > 0 ? `✅ ${slotCount} configurati` : '❌ nessuno — aggiungine in "Notifiche programmate"'}`)
    } catch (err) {
      lines.push(`Errore: ${err}`)
    }
    setDiagInfo(lines.join('\n'))
    setDiagRunning(false)
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
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-700">Notifiche SMS ai clienti</p>
                <p className="text-xs text-slate-400">Invia SMS ai clienti per conferma e promemoria</p>
              </div>
              <button type="button" onClick={() => setForm(p => ({ ...p, reminder_enabled: !p.reminder_enabled }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.reminder_enabled ? 'bg-blue-600' : 'bg-slate-200'}`}>
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${form.reminder_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {form.reminder_enabled && (
              <>
                {/* Notifiche programmate: ogni slot ha tempo + tipo */}
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notifiche programmate</p>
                    <p className="text-xs text-slate-400 mt-0.5">Configura quando inviare la notifica e di che tipo.</p>
                  </div>

                  {form.notification_slots.length === 0 && (
                    <p className="text-xs text-slate-400 italic py-1">Nessuna notifica configurata.</p>
                  )}

                  {[...form.notification_slots].sort((a, b) => b.interval - a.interval).map((slot, i) => {
                    const { time, unit } = intervalToDisplay(slot.interval)
                    const isConf = slot.type === 'confirmation'
                    return (
                      <div key={i} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                        {/* Orario */}
                        <div className="flex items-baseline gap-1 min-w-[72px]">
                          <span className="text-2xl font-bold text-slate-800 tabular-nums leading-none">{time}</span>
                          <span className="text-xs text-slate-500 leading-tight">{unit}</span>
                        </div>
                        {/* Badge tipo */}
                        <div className={`flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${
                          isConf ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          <span>{isConf ? '✉️' : '🔔'}</span>
                          <span>{isConf ? 'Conferma' : 'Promemoria'}</span>
                        </div>
                        {/* Elimina */}
                        <button type="button"
                          onClick={() => setForm(p => ({ ...p, notification_slots: p.notification_slots.filter((_, j) => j !== i) }))}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}

                  {showAdd ? (
                    <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/30 p-3 space-y-3">
                      {/* 1. Seleziona orario */}
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1.5">1. Quando inviare</p>
                        <select value={newInterval} onChange={e => setNewInterval(Number(e.target.value))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800 bg-white">
                          <option value="">Seleziona orario…</option>
                          {REMINDER_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      {/* 2. Seleziona tipo */}
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1.5">2. Tipo di messaggio</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => setNewType('confirmation')}
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                              newType === 'confirmation'
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'
                            }`}>
                            ✉️ Conferma
                          </button>
                          <button type="button" onClick={() => setNewType('reminder')}
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                              newType === 'reminder'
                                ? 'bg-amber-500 border-amber-500 text-white'
                                : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300'
                            }`}>
                            🔔 Promemoria
                          </button>
                        </div>
                      </div>
                      {/* Aggiungi / Annulla */}
                      <div className="flex gap-2">
                        <button type="button" disabled={newInterval === ''}
                          onClick={() => {
                            if (newInterval !== '') {
                              setForm(p => ({ ...p, notification_slots: [...p.notification_slots, { interval: newInterval as number, type: newType }] }))
                              setNewInterval('')
                              setNewType('reminder')
                              setShowAdd(false)
                            }
                          }}
                          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-200 text-white text-sm font-semibold rounded-xl transition-colors">
                          Aggiungi
                        </button>
                        <button type="button" onClick={() => { setShowAdd(false); setNewInterval(''); setNewType('reminder') }}
                          className="p-2.5 border border-slate-200 text-slate-400 hover:bg-slate-50 rounded-xl transition-colors">
                          <span className="text-sm">✕</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowAdd(true)}
                      className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-blue-200 hover:border-blue-400 text-blue-500 hover:text-blue-700 text-sm font-medium py-3 rounded-2xl transition-colors">
                      <Plus className="w-4 h-4" /> Aggiungi notifica
                    </button>
                  )}
                </div>

                {/* Messaggi */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Messaggi</p>

                  {/* Conferma */}
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">✉️ Conferma appuntamento</p>
                        <p className="text-xs text-slate-400">Chiede al cliente di confermare la prenotazione</p>
                      </div>
                      <button type="button" onClick={() => setExpandedCard(prev => prev === 'confirmation' ? null : 'confirmation')}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expandedCard === 'confirmation' ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    {expandedCard === 'confirmation' ? (
                      <div className="px-4 py-3 border-t border-slate-100 bg-white space-y-2">
                        <textarea rows={4}
                          value={form.notification_messages.confirmation || getDefaultMessage('confirmation')}
                          onChange={e => setForm(p => ({ ...p, notification_messages: { ...p.notification_messages, confirmation: e.target.value } }))}
                          className="w-full text-sm text-slate-700 border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        <p className="text-xs text-slate-400">Variabili:{' '}{['{nome}','{servizio}','{data}','{ora}','{centro}'].map(v => <code key={v} className="bg-slate-100 text-slate-600 px-1 rounded mr-1">{v}</code>)}</p>
                        <button type="button" onClick={() => setForm(p => ({ ...p, notification_messages: { ...p.notification_messages, confirmation: '' } }))}
                          className="text-xs text-blue-500 hover:text-blue-700 hover:underline">↺ Ripristina predefinito</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setExpandedCard('confirmation')}
                        className="w-full px-4 py-2.5 border-t border-slate-100 text-left hover:bg-slate-50 transition-colors group">
                        <p className="text-xs text-slate-400 group-hover:text-slate-500 truncate">
                          💬 {(form.notification_messages.confirmation || getDefaultMessage('confirmation')).slice(0, 90)}
                        </p>
                      </button>
                    )}
                  </div>

                  {/* Promemoria */}
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">🔔 Promemoria appuntamento</p>
                        <p className="text-xs text-slate-400">Ricorda al cliente l&apos;appuntamento in arrivo</p>
                      </div>
                      <button type="button" onClick={() => setExpandedCard(prev => prev === 'reminder' ? null : 'reminder')}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expandedCard === 'reminder' ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    {expandedCard === 'reminder' ? (
                      <div className="px-4 py-3 border-t border-slate-100 bg-white space-y-2">
                        <textarea rows={4}
                          value={form.notification_messages.reminder || getDefaultMessage('reminder')}
                          onChange={e => setForm(p => ({ ...p, notification_messages: { ...p.notification_messages, reminder: e.target.value } }))}
                          className="w-full text-sm text-slate-700 border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        <p className="text-xs text-slate-400">Variabili:{' '}{['{nome}','{servizio}','{data}','{ora}','{centro}','{quando}'].map(v => <code key={v} className="bg-slate-100 text-slate-600 px-1 rounded mr-1">{v}</code>)}</p>
                        <p className="text-xs text-slate-400 mt-1"><code className="bg-slate-100 text-slate-600 px-1 rounded">{'{quando}'}</code> → es. &quot;domani&quot;, &quot;tra 2 ore&quot;, &quot;tra 30 minuti&quot;</p>
                        <button type="button" onClick={() => setForm(p => ({ ...p, notification_messages: { ...p.notification_messages, reminder: '' } }))}
                          className="text-xs text-blue-500 hover:text-blue-700 hover:underline">↺ Ripristina predefinito</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setExpandedCard('reminder')}
                        className="w-full px-4 py-2.5 border-t border-slate-100 text-left hover:bg-slate-50 transition-colors group">
                        <p className="text-xs text-slate-400 group-hover:text-slate-500 truncate">
                          💬 {(form.notification_messages.reminder || getDefaultMessage('reminder')).slice(0, 90)}
                        </p>
                      </button>
                    )}
                  </div>
                </div>
              </>
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

              {/* Diagnostica */}
              <button
                onClick={runDiagnostics}
                disabled={diagRunning}
                className="w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                🔍 {diagRunning ? 'Diagnostica in corso…' : 'Diagnostica notifiche'}
              </button>
              {diagInfo && (
                <div className="rounded-xl bg-slate-900 text-green-300 text-xs font-mono px-4 py-3 whitespace-pre-line leading-relaxed">
                  {diagInfo}
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
