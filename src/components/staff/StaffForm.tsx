'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { doc, addDoc, updateDoc, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { wsCol, wsDoc } from '@/lib/firebase/workspace'
import type { Staff, WeekSchedule, DaySchedule } from '@/types/database'
import { clsx } from 'clsx'

const ROLES = ['Titolare', 'Estetista', 'Nail Artist', 'Massaggiatrice', 'Parrucchiera', 'Truccatrice', 'Receptionist', 'Altro']
const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899']
const DAYS = [
  { key: 'monday',    label: 'Lun' },
  { key: 'tuesday',   label: 'Mar' },
  { key: 'wednesday', label: 'Mer' },
  { key: 'thursday',  label: 'Gio' },
  { key: 'friday',    label: 'Ven' },
  { key: 'saturday',  label: 'Sab' },
  { key: 'sunday',    label: 'Dom' },
] as const

const DEFAULT_SCHEDULE: WeekSchedule = {
  monday:    { start: '09:00', end: '18:00' },
  tuesday:   { start: '09:00', end: '18:00' },
  wednesday: { start: '09:00', end: '18:00' },
  thursday:  { start: '09:00', end: '18:00' },
  friday:    { start: '09:00', end: '18:00' },
  saturday:  { start: '09:00', end: '14:00' },
  sunday:    null,
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.trim().slice(0, 2).toUpperCase()
}

const inp = 'w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-300 text-sm text-slate-800 bg-white'
const lbl = 'block text-xs font-semibold text-slate-600 mb-1'

interface Props { existing?: Staff & { id: string } }

export function StaffForm({ existing }: Props) {
  const router = useRouter()
  const { workspaceId } = useWorkspace()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const [form, setForm] = useState({
    name:           existing?.name           ?? '',
    role:           existing?.role           ?? 'Estetista',
    color:          existing?.color          ?? COLORS[0],
    initials:       existing?.initials       ?? '',
    phone:          existing?.phone          ?? '',
    email:          existing?.email          ?? '',
    commission_pct: existing?.commission_pct ?? 0,
    active:         existing?.active         ?? true,
    is_owner:       existing?.is_owner       ?? false,
  })

  const [schedule, setSchedule] = useState<WeekSchedule>(existing?.schedule ?? DEFAULT_SCHEDULE)

  useEffect(() => {
    if (!existing && form.name) setForm(p => ({ ...p, initials: getInitials(form.name) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name])

  function setDay(day: keyof WeekSchedule, value: DaySchedule | null) {
    setSchedule(prev => ({ ...prev, [day]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Inserisci il nome.'); return }
    setError(null)
    setLoading(true)
    const initialsValue = form.initials.trim().slice(0, 2).toUpperCase() || getInitials(form.name)
    const payload = {
      name: form.name.trim(), role: form.role, color: form.color,
      initials: initialsValue, phone: form.phone.trim() || null,
      email: form.email.trim() || null, commission_pct: Number(form.commission_pct),
      active: form.active, is_owner: form.is_owner, schedule,
      days_off: existing?.days_off ?? [], updated_at: new Date().toISOString(),
    }
    try {
      if (existing) {
        await updateDoc(wsDoc(db, workspaceId, 'staff', existing.id), payload)
      } else {
        await addDoc(wsCol(db, workspaceId, 'staff'), { ...payload, created_at: new Date().toISOString() })
      }
      router.push('/staff')
      router.refresh()
    } catch (err) { setError(String(err)); setLoading(false) }
  }

  const displayInitials = form.initials || getInitials(form.name) || '?'

  return (
    <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-3 min-h-0">

      {/* Preview + nome/ruolo */}
      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0 overflow-hidden"
          style={{ backgroundColor: form.color }}
        >
          {existing?.photo_url
            ? <img src={existing.photo_url} alt={form.name} className="w-full h-full object-cover" />
            : displayInitials
          }
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate">{form.name || 'Nome operatrice'}</p>
          <p className="text-xs text-slate-400">{form.role}</p>
        </div>
      </div>

      {/* Riga 1: Nome + Ruolo */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Nome *</label>
          <input required type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Maria Rossi" className={inp} />
        </div>
        <div>
          <label className={lbl}>Ruolo</label>
          <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className={inp}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Riga 2: Iniziali + Colore */}
      <div className="grid grid-cols-2 gap-3 items-start">
        <div>
          <label className={lbl}>Iniziali <span className="text-slate-400 font-normal">(max 2)</span></label>
          <input type="text" value={form.initials} onChange={e => setForm(p => ({ ...p, initials: e.target.value.slice(0,2).toUpperCase() }))} maxLength={2} placeholder="MR" className={inp} />
        </div>
        <div>
          <label className={lbl}>Colore agenda</label>
          <div className="flex gap-1.5 flex-wrap pt-1">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))}
                className={clsx('w-7 h-7 rounded-full transition-all', form.color === c ? 'ring-2 ring-offset-1 ring-slate-700 scale-110' : 'hover:scale-105')}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
      </div>

      {/* Riga 3: Telefono + Email */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Telefono</label>
          <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+39 333 1234567" className={inp} />
        </div>
        <div>
          <label className={lbl}>Email</label>
          <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@esempio.it" className={inp} />
        </div>
      </div>

      {/* Riga 4: Provvigione + Toggles inline */}
      <div className="grid grid-cols-2 gap-3 items-center">
        <div>
          <label className={lbl}>Provvigione (%)</label>
          <input type="number" min={0} max={100} value={form.commission_pct} onChange={e => setForm(p => ({ ...p, commission_pct: Number(e.target.value) }))} className={inp} />
        </div>
        <div className="flex flex-col gap-2">
          {([
            { key: 'active',   label: 'Attiva' },
            { key: 'is_owner', label: 'Titolare' },
          ] as const).map(({ key, label }) => {
            const value = form[key]
            return (
              <label key={key} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5 cursor-pointer">
                <span className="text-xs font-medium text-slate-700">{label}</span>
                <button type="button" onClick={() => setForm(p => ({ ...p, [key]: !value }))}
                  className={clsx('relative w-9 h-5 rounded-full transition-colors shrink-0', value ? 'bg-orange-500' : 'bg-slate-300')}>
                  <span className={clsx('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', value ? 'left-4' : 'left-0.5')} />
                </button>
              </label>
            )
          })}
        </div>
      </div>

      {/* Orario settimanale — compatto */}
      <div>
        <label className={lbl}>Orario settimanale</label>
        <div className="grid grid-cols-1 gap-1">
          {DAYS.map(({ key, label }) => {
            const day = schedule[key]
            const isOpen = day !== null
            return (
              <div key={key} className="flex items-center gap-2">
                <button type="button" onClick={() => setDay(key, isOpen ? null : { start: '09:00', end: '18:00' })}
                  className={clsx('w-10 text-center text-xs py-1 rounded-md font-semibold shrink-0 transition-colors',
                    isOpen ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400')}>
                  {label}
                </button>
                {isOpen ? (
                  <div className="flex items-center gap-1 flex-1">
                    <input type="time" value={day!.start} onChange={e => setDay(key, { ...day!, start: e.target.value })}
                      className="flex-1 px-2 py-1 rounded-md border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-300" />
                    <span className="text-slate-300 text-xs">–</span>
                    <input type="time" value={day!.end} onChange={e => setDay(key, { ...day!, end: e.target.value })}
                      className="flex-1 px-2 py-1 rounded-md border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-300" />
                  </div>
                ) : (
                  <span className="text-xs text-slate-300">Riposo</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-2 text-sm">{error}</div>}

      <div className="flex gap-3 mt-auto pt-1">
        <button type="button" onClick={() => router.back()} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
          Annulla
        </button>
        <button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-orange-500 to-amber-600 hover:opacity-90 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-full shadow-md shadow-orange-200 transition-opacity">
          {loading ? 'Salvataggio…' : existing ? 'Aggiorna' : 'Aggiungi operatrice'}
        </button>
      </div>
    </form>
  )
}
