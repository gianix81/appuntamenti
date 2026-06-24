'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { saveAlarmSettings, getAlarmSettings } from '@/lib/alarmDB'
import { CheckCircle, Bell, Calendar, Copy, Scissors, Users, Building2, Globe } from 'lucide-react'
import type { BusinessLevel } from '@/types/database'
import { clsx } from 'clsx'

const ALARM_OPTIONS: { label: string; minutes: number }[] = [
  { label: '24 ore prima',        minutes: 1440 },
  { label: '2 ore prima',         minutes: 120  },
  { label: '30 min prima',        minutes: 30   },
  { label: "All'orario esatto",   minutes: 0    },
]

const LEVEL_OPTIONS: { value: BusinessLevel; icon: React.ComponentType<{ className?: string }>; title: string; desc: string }[] = [
  { value: 1, icon: Scissors,  title: 'Da sola',         desc: 'Studio singolo o a domicilio' },
  { value: 2, icon: Users,     title: 'Piccolo salone',  desc: '2–4 collaboratrici' },
  { value: 3, icon: Building2, title: 'Centro',          desc: '5+ operatori, struttura organizzata' },
  { value: 4, icon: Globe,     title: 'Più sedi',        desc: 'Gestione multi-punto vendita' },
]

export default function SettingsPage() {
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [googleSyncing, setGoogleSyncing] = useState(false)
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>('default')
  const [calToken, setCalToken]   = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)
  const [googleStatus, setGoogleStatus] = useState<{
    configured: boolean
    connected: boolean
    connectedAt?: string | null
  } | null>(null)
  const [googleNotice, setGoogleNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [whatsAppStatus, setWhatsAppStatus] = useState<{ configured: boolean } | null>(null)

  const [form, setForm] = useState({ center_name: '', phone_number: '', address: '', city: '' })
  const [businessLevel, setBusinessLevel] = useState<BusinessLevel>(1)
  const [alarmOffsets, setAlarmOffsets] = useState<number[]>([1440, 120, 30])
  const [msgConfirmation, setMsgConfirmation] = useState('')
  const [msgReminder, setMsgReminder]         = useState('')

  useEffect(() => {
    async function loadGoogleStatus() {
      try {
        const res = await fetch('/api/google-calendar/status', { cache: 'no-store' })
        const status = await res.json()
        setGoogleStatus(status)
        return status as { configured: boolean; connected: boolean; connectedAt?: string | null }
      } catch {
        setGoogleStatus(null)
        return null
      }
    }

    async function load() {
      try {
        const [snap, idbSettings] = await Promise.all([
          getDoc(doc(db, 'settings', 'main')).catch(() => null),
          getAlarmSettings().catch(() => null),
        ])
        if (snap?.exists()) {
          const d = snap.data()
          setForm({
            center_name:  d.center_name  ?? '',
            phone_number: d.phone_number ?? '',
            address:      d.address      ?? '',
            city:         d.city         ?? '',
          })
          if (d.business_level)         setBusinessLevel(d.business_level as BusinessLevel)
          if (d.alarm_offsets_minutes) setAlarmOffsets(d.alarm_offsets_minutes)
          if (d.calendar_token)        setCalToken(d.calendar_token)
          if (d.notification_messages?.confirmation) setMsgConfirmation(d.notification_messages.confirmation)
          if (d.notification_messages?.reminder)     setMsgReminder(d.notification_messages.reminder)
        }
        if (idbSettings?.offsets_minutes?.length) setAlarmOffsets(idbSettings.offsets_minutes)
        const status = await loadGoogleStatus()
        const params = new URLSearchParams(window.location.search)
        const googleCalendarResult = params.get('googleCalendar')
        const googleCalendarReason = params.get('googleCalendarReason')
        if (googleCalendarResult) {
          if (googleCalendarResult === 'connected') {
            setGoogleNotice({
              type: 'success',
              text: status?.connected
                ? 'Google Calendar collegato correttamente.'
                : 'Autorizzazione Google completata. Sto verificando il collegamento.',
            })
          } else if (googleCalendarResult === 'state_error') {
            setGoogleNotice({ type: 'error', text: 'Collegamento Google non riuscito: sessione OAuth scaduta. Riprova.' })
          } else if (googleCalendarResult === 'firebase_error') {
            setGoogleNotice({ type: 'error', text: 'Collegamento Google non riuscito: Firebase Admin non configurato.' })
          } else {
            setGoogleNotice({
              type: 'error',
              text: googleCalendarReason
                ? `Collegamento Google non riuscito: ${googleCalendarReason}`
                : 'Collegamento Google non riuscito. Riprova da questo pulsante.',
            })
          }
          const cleanUrl = `${window.location.pathname}${window.location.hash}`
          window.history.replaceState(null, '', cleanUrl)
        }
        fetch('/api/whatsapp/status')
          .then(res => res.json())
          .then(setWhatsAppStatus)
          .catch(() => setWhatsAppStatus(null))
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()

    queueMicrotask(() => {
      if ('Notification' in window) setNotifPerm(Notification.permission)
      else setNotifPerm('unsupported')
    })
  }, [])

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleOffset(minutes: number) {
    setAlarmOffsets(prev =>
      prev.includes(minutes) ? prev.filter(m => m !== minutes) : [...prev, minutes]
    )
  }

  async function requestNotifPermission() {
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setNotifPerm(result)
  }

  // Generate a token if missing, save it, return it
  async function ensureCalendarToken(): Promise<string> {
    if (calToken) return calToken
    const token = crypto.randomUUID()
    await setDoc(doc(db, 'settings', 'main'), { calendar_token: token }, { merge: true })
    setCalToken(token)
    return token
  }

  async function handleSubscribeCalendar() {
    const token = await ensureCalendarToken()
    const feedUrl = `${window.location.origin}/api/calendar/${token}`
    // webcal:// causes the OS to open the calendar subscription dialog
    window.open(feedUrl.replace(/^https?:\/\//, 'webcal://'), '_blank')
  }

  async function handleCopyLink() {
    const token  = await ensureCalendarToken()
    const feedUrl = `${window.location.origin}/api/calendar/${token}`
    await navigator.clipboard.writeText(feedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function handleConnectGoogleCalendar() {
    setGoogleNotice(null)
    window.location.href = '/api/google-calendar/connect'
  }

  async function handleSyncGoogleCalendar() {
    setGoogleSyncing(true)
    try {
      const res = await fetch('/api/google-calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Sincronizzazione non riuscita')
      if (body.connected === false) {
        setGoogleNotice({ type: 'error', text: 'Google Calendar non è ancora collegato. Premi “Collega Google Calendar”.' })
        return
      }
      alert(`Google Calendar sincronizzato: ${body.results?.length ?? 0} appuntamenti controllati.`)
    } catch (err) {
      alert(`Errore Google Calendar: ${err}`)
    } finally {
      setGoogleSyncing(false)
    }
  }

  async function handleDisconnectGoogleCalendar() {
    if (!confirm('Scollegare Google Calendar? Gli eventi già creati su Google non verranno eliminati.')) return
    setGoogleSyncing(true)
    try {
      const res = await fetch('/api/google-calendar/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error('Disconnessione non riuscita')
      setGoogleStatus(prev => prev ? { ...prev, connected: false, connectedAt: null } : prev)
    } catch (err) {
      alert(`Errore Google Calendar: ${err}`)
    } finally {
      setGoogleSyncing(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await saveAlarmSettings({ offsets_minutes: alarmOffsets })
      await setDoc(doc(db, 'settings', 'main'), {
        business_level:        businessLevel,
        center_name:           form.center_name.trim(),
        phone_number:          form.phone_number.trim() || null,
        address:               form.address.trim()      || null,
        city:                  form.city.trim()         || null,
        alarm_offsets_minutes: alarmOffsets,
        notification_messages: {
          confirmation: msgConfirmation.trim() || null,
          reminder:     msgReminder.trim()     || null,
        },
        updated_at:            new Date().toISOString(),
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

        {/* ── Tipo di attività ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Tipo di attività</h2>
          <p className="text-xs text-slate-500">
            Cambiando livello appaiono o scompaiono le sezioni Staff, Statistiche e Magazzino.
          </p>
          <div className="space-y-2">
            {LEVEL_OPTIONS.map(({ value, icon: Icon, title, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setBusinessLevel(value)}
                className={clsx(
                  'w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all',
                  businessLevel === value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50',
                )}
              >
                <div className={clsx(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  businessLevel === value ? 'bg-blue-600' : 'bg-slate-100',
                )}>
                  <Icon className={clsx('w-4 h-4', businessLevel === value ? 'text-white' : 'text-slate-400')} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={clsx('text-sm font-medium', businessLevel === value ? 'text-blue-700' : 'text-slate-700')}>{title}</p>
                  <p className="text-xs text-slate-400">{desc}</p>
                </div>
                {businessLevel === value && <CheckCircle className="w-4 h-4 text-blue-600 shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* ── Sincronizzazione calendario ────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-700">Google Calendar</h2>
          </div>
          <p className="text-xs text-slate-500">
            Collega Google Calendar: ogni appuntamento creato, modificato o annullato viene
            scritto direttamente nel calendario Google.
          </p>
          {googleStatus?.configured === false && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Configura GOOGLE_CALENDAR_CLIENT_ID e GOOGLE_CALENDAR_CLIENT_SECRET sul server.
            </p>
          )}
          {googleNotice && (
            <p className={clsx(
              'text-xs rounded-xl px-3 py-2 border',
              googleNotice.type === 'success'
                ? 'text-green-700 bg-green-50 border-green-100'
                : 'text-red-700 bg-red-50 border-red-100',
            )}>
              {googleNotice.text}
            </p>
          )}
          {googleStatus?.connected && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              Google Calendar collegato
              {googleStatus.connectedAt ? ` dal ${new Date(googleStatus.connectedAt).toLocaleDateString('it-IT')}` : ''}
            </p>
          )}
          {!googleStatus?.connected ? (
            <button
              type="button"
              onClick={handleConnectGoogleCalendar}
              disabled={googleStatus?.configured === false}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
            >
              <Calendar className="w-4 h-4" />
              Collega Google Calendar
            </button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSyncGoogleCalendar}
                disabled={googleSyncing}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
              >
                <Calendar className="w-4 h-4" />
                {googleSyncing ? 'Sincronizzo…' : 'Sincronizza ora'}
              </button>
              <button
                type="button"
                onClick={handleDisconnectGoogleCalendar}
                disabled={googleSyncing}
                className="w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 disabled:opacity-60 text-slate-600 text-sm font-medium py-3 rounded-xl transition-colors"
              >
                Scollega
              </button>
            </div>
          )}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs text-slate-400">
              Link ICS di emergenza, utile solo per calendari che non supportano il collegamento Google diretto.
            </p>
          <button
            type="button"
            onClick={handleSubscribeCalendar}
              className="w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-medium py-2.5 rounded-xl transition-colors"
          >
            <Calendar className="w-4 h-4" />
              Apri feed ICS
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-medium py-2.5 rounded-xl transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? 'Link copiato!' : 'Copia link (per Google Calendar)'}
          </button>
          </div>
        </div>

        {/* ── WhatsApp ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-semibold text-slate-700">WhatsApp</h2>
          </div>
          {whatsAppStatus?.configured ? (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              Invio WhatsApp collegato
            </p>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Configura GIGAWA_USER_ID e GIGAWA_SESSION_ID sul server.
            </p>
          )}
          <p className="text-xs text-slate-500">
            Il pulsante WhatsApp negli appuntamenti invia un messaggio reale tramite Gigawa.
          </p>
        </div>

        {/* ── Messaggi WhatsApp ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-semibold text-slate-700">Messaggi WhatsApp</h2>
          </div>
          <p className="text-xs text-slate-400">
            Variabili disponibili: <code className="bg-slate-100 px-1 rounded">{'{nome}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded">{'{servizio}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded">{'{data}'}</code>{' '}
            <code className="bg-slate-100 px-1 rounded">{'{ora}'}</code>
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Messaggio di conferma</label>
            <textarea
              rows={3}
              value={msgConfirmation}
              onChange={e => setMsgConfirmation(e.target.value)}
              placeholder={`Ciao {nome}! Ti confermiamo l'appuntamento per {servizio} {data} alle {ora}. Rispondi per confermare o disdire. Grazie!`}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Messaggio promemoria</label>
            <textarea
              rows={3}
              value={msgReminder}
              onChange={e => setMsgReminder(e.target.value)}
              placeholder={`Ciao {nome}, ti ricordiamo l'appuntamento per {servizio} {data} alle {ora}. A presto!`}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm resize-none"
            />
          </div>
        </div>

        {/* ── Sveglie ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-700">Timing sveglie</h2>
          </div>

          {notifPerm === 'unsupported' && (
            <p className="text-xs text-slate-400">Notifiche non supportate su questo browser.</p>
          )}
          {notifPerm === 'default' && (
            <button type="button" onClick={requestNotifPermission}
              className="w-full text-sm bg-blue-50 text-blue-700 font-medium py-2.5 rounded-xl hover:bg-blue-100 transition-colors">
              Attiva notifiche in-app
            </button>
          )}
          {notifPerm === 'granted' && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Notifiche in-app attive
            </p>
          )}
          {notifPerm === 'denied' && (
            <p className="text-xs text-red-500">Notifiche bloccate. Abilitale nelle impostazioni del browser.</p>
          )}

          <p className="text-xs text-slate-500">Sveglie per ogni appuntamento:</p>
          <div className="space-y-2">
            {ALARM_OPTIONS.map(opt => (
              <label key={opt.minutes} className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={alarmOffsets.includes(opt.minutes)}
                  onChange={() => toggleOffset(opt.minutes)}
                  className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
                <span className="text-sm text-slate-700 group-hover:text-blue-600 transition-colors">
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
          {alarmOffsets.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Seleziona almeno un timing per le sveglie.
            </p>
          )}
        </div>

        {/* ── Informazioni centro ────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Informazioni centro</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome centro</label>
            <input type="text" value={form.center_name} onChange={e => set('center_name', e.target.value)}
              placeholder="Il tuo salone…"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Telefono</label>
            <input type="tel" value={form.phone_number} onChange={e => set('phone_number', e.target.value)}
              placeholder="+39 …"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Indirizzo</label>
            <input type="text" value={form.address} onChange={e => set('address', e.target.value)}
              placeholder="Via …"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Città</label>
            <input type="text" value={form.city} onChange={e => set('city', e.target.value)}
              placeholder="Roma, Milano…"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800" />
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
          {saved ? <><CheckCircle className="w-4 h-4" /> Salvato!</> : saving ? 'Salvataggio…' : 'Salva impostazioni'}
        </button>
      </form>
    </div>
  )
}
