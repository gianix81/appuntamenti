'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { doc, addDoc, updateDoc, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Staff, WeekSchedule, DaySchedule } from '@/types/database'
import { clsx } from 'clsx'

const ROLES = ['Titolare', 'Estetista', 'Nail Artist', 'Massaggiatrice', 'Parrucchiera', 'Truccatrice', 'Receptionist', 'Altro']

const COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]

const DAYS = [
  { key: 'monday',    label: 'Lunedì' },
  { key: 'tuesday',   label: 'Martedì' },
  { key: 'wednesday', label: 'Mercoledì' },
  { key: 'thursday',  label: 'Giovedì' },
  { key: 'friday',    label: 'Venerdì' },
  { key: 'saturday',  label: 'Sabato' },
  { key: 'sunday',    label: 'Domenica' },
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

interface Props { existing?: Staff & { id: string } }

export function StaffForm({ existing }: Props) {
  const router = useRouter()
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

  const [schedule, setSchedule] = useState<WeekSchedule>(
    existing?.schedule ?? DEFAULT_SCHEDULE,
  )

  // Auto-calcola iniziali dal nome (solo in creazione)
  useEffect(() => {
    if (!existing && form.name) {
      setForm(prev => ({ ...prev, initials: getInitials(form.name) }))
    }
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
      name:           form.name.trim(),
      role:           form.role,
      color:          form.color,
      initials:       initialsValue,
      phone:          form.phone.trim()  || null,
      email:          form.email.trim()  || null,
      commission_pct: Number(form.commission_pct),
      active:         form.active,
      is_owner:       form.is_owner,
      schedule,
      days_off:       existing?.days_off ?? [],
      updated_at:     new Date().toISOString(),
    }

    try {
      if (existing) {
        await updateDoc(doc(db, 'staff', existing.id), payload)
      } else {
        await addDoc(collection(db, 'staff'), {
          ...payload,
          created_at: new Date().toISOString(),
        })
      }
      router.push('/staff')
      router.refresh()
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  const displayInitials = form.initials || getInitials(form.name) || '?'

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">

      {/* Preview avatar */}
      <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ backgroundColor: form.color }}
        >
          {displayInitials}
        </div>
        <div>
          <p className="font-semibold text-slate-800">{form.name || 'Nome operatrice'}</p>
          <p className="text-sm text-slate-500">{form.role}</p>
        </div>
      </div>

      {/* Nome, ruolo, iniziali */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
          <input
            required
            type="text"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Es. Maria Rossi"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Ruolo</label>
          <select
            value={form.role}
            onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm bg-white"
          >
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Iniziali <span className="text-slate-400">(max 2 caratteri)</span>
          </label>
          <input
            type="text"
            value={form.initials}
            onChange={e => setForm(p => ({ ...p, initials: e.target.value.slice(0, 2).toUpperCase() }))}
            maxLength={2}
            placeholder="Es. MR"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800"
          />
        </div>
      </div>

      {/* Colore in agenda */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Colore in agenda</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setForm(p => ({ ...p, color: c }))}
              className={clsx(
                'w-9 h-9 rounded-full transition-all',
                form.color === c
                  ? 'ring-2 ring-offset-2 ring-slate-700 scale-110'
                  : 'hover:scale-105',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Contatti e commissione */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Telefono</label>
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            placeholder="+39 333 1234567"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            placeholder="email@esempio.it"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Provvigione <span className="text-slate-400">(%)</span>
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={form.commission_pct}
            onChange={e => setForm(p => ({ ...p, commission_pct: Number(e.target.value) }))}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800"
          />
        </div>
      </div>

      {/* Orario settimanale */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">Orario settimanale</label>
        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const day    = schedule[key]
            const isOpen = day !== null
            return (
              <div key={key} className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setDay(key, isOpen ? null : { start: '09:00', end: '18:00' })}
                  className={clsx(
                    'w-20 sm:w-24 text-xs py-2 rounded-lg font-medium shrink-0 transition-colors',
                    isOpen
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-100 text-slate-400',
                  )}
                >
                  {label}
                </button>
                {isOpen ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input
                      type="time"
                      value={day!.start}
                      onChange={e => setDay(key, { ...day!, start: e.target.value })}
                      className="flex-1 min-w-0 px-2 sm:px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 text-slate-800"
                    />
                    <span className="text-slate-400 text-xs shrink-0">–</span>
                    <input
                      type="time"
                      value={day!.end}
                      onChange={e => setDay(key, { ...day!, end: e.target.value })}
                      className="flex-1 min-w-0 px-2 sm:px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 text-slate-800"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">Riposo</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        {[
          { key: 'active',   label: 'Operatrice attiva',  desc: 'Può ricevere appuntamenti' },
          { key: 'is_owner', label: 'Titolare',            desc: "Ha accesso completo all'app" },
        ].map(({ key, label, desc }) => {
          const value = form[key as 'active' | 'is_owner']
          return (
            <label key={key} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl cursor-pointer">
              <div>
                <p className="text-sm font-medium text-slate-800">{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, [key]: !value }))}
                className={clsx(
                  'relative w-12 h-6 rounded-full transition-colors shrink-0 ml-4',
                  value ? 'bg-blue-600' : 'bg-slate-300',
                )}
              >
                <span className={clsx(
                  'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all',
                  value ? 'left-7' : 'left-1',
                )} />
              </button>
            </label>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
        >
          {loading ? 'Salvataggio…' : existing ? 'Aggiorna' : 'Aggiungi operatrice'}
        </button>
      </div>
    </form>
  )
}
