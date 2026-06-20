'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { saveAlarmSettings, getAlarmSettings } from '@/lib/alarmDB'
import { CheckCircle, Bell, Calendar, Copy } from 'lucide-react'

const ALARM_OPTIONS: { label: string; minutes: number }[] = [
  { label: '24 ore prima',        minutes: 1440 },
  { label: '2 ore prima',         minutes: 120  },
  { label: '30 min prima',        minutes: 30   },
  { label: "All'orario esatto",   minutes: 0    },
]

export default function SettingsPage() {
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>('default')
  const [calToken, setCalToken]   = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)

  const [form, setForm] = useState({ center_name: '', phone_number: '', address: '' })
  const [alarmOffsets, setAlarmOffsets] = useState<number[]>([1440, 120, 30])

  useEffect(() => {
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
          })
          if (d.alarm_offsets_minutes) setAlarmOffsets(d.alarm_offsets_minutes)
          if (d.calendar_token)        setCalToken(d.calendar_token)
        }
        if (idbSettings?.offsets_minutes?.length) setAlarmOffsets(idbSettings.offsets_minutes)
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()

    if ('Notification' in window) setNotifPerm(Notification.permission)
    else setNotifPerm('unsupported')
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
    try {
      const token   = await ensureCalendarToken()
      const feedUrl = `${window.location.origin}/api/calendar/${token}`

      // Test the feed first — gives a clear error if something's wrong
      const res = await fetch(feedUrl)
      if (!res.ok) {
        const txt = await res.text().catch(() => `HTTP ${res.status}`)
        alert(`Errore feed calendario (${res.status}): ${txt}`)
        return
      }

      // Open webcal:// via anchor click — works in PWA where window.open is blocked
      const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://')
      const a = document.createElement('a')
      a.href  = webcalUrl
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      alert(`Impossibile aprire il calendario: ${err}`)
    }
  }

  async function handleCopyLink() {
    try {
      const token   = await ensureCalendarToken()
      const feedUrl = `${window.location.origin}/api/calendar/${token}`
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      alert('Copia non riuscita. Prova dal browser.')
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await saveAlarmSettings({ offsets_minutes: alarmOffsets })
      await setDoc(doc(db, 'settings', 'main'), {
        center_name:           form.center_name.trim(),
        phone_number:          form.phone_number.trim() || null,
        address:               form.address.trim()      || null,
        alarm_offsets_minutes: alarmOffsets,
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

        {/* ── Sincronizzazione calendario ────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-700">Calendario automatico</h2>
          </div>
          <p className="text-xs text-slate-500">
            Iscriviti una sola volta: tutti gli appuntamenti futuri si sincronizzano
            automaticamente nel calendario del telefono con le sveglie già impostate.
            Funziona anche senza internet, anche a telefono spento.
          </p>
          <button
            type="button"
            onClick={handleSubscribeCalendar}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Iscriviti al calendario
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-medium py-2.5 rounded-xl transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? 'Link copiato!' : 'Copia link (per Google Calendar)'}
          </button>
          <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 text-xs text-slate-500">
            <p className="font-medium text-slate-600">Come funziona:</p>
            <p>📱 <strong>iPhone</strong>: tocca &quot;Iscriviti&quot; → iOS chiede conferma → Aggiungi</p>
            <p>🤖 <strong>Android</strong>: copia il link → apri Google Calendar →
               menu ☰ → Altre agende → Da URL → incolla → Aggiungi</p>
            <p className="text-slate-400 pt-1">
              Dopo l&apos;iscrizione ogni nuovo appuntamento appare nel calendario automaticamente entro 1 ora.
            </p>
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
        </div>

        <button type="submit" disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
          {saved ? <><CheckCircle className="w-4 h-4" /> Salvato!</> : saving ? 'Salvataggio…' : 'Salva impostazioni'}
        </button>
      </form>
    </div>
  )
}
