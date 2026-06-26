'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, addMinutes, parseISO, startOfDay, endOfDay } from 'date-fns'
import { collection, getDocs, getDoc, doc, addDoc, updateDoc, query, orderBy, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { wsCol, wsDoc } from '@/lib/firebase/workspace'
import type { Client, Service, Appointment, AppointmentStatus, ConfirmationStatus, Staff } from '@/types/database'
import { scheduleAlarms, cancelAlarms } from '@/lib/alarmScheduler'
import { useBusinessLevel } from '@/hooks/useBusinessLevel'
import { useUserRole } from '@/hooks/useUserRole'
import { Search, X, ChevronDown, UserPlus } from 'lucide-react'
import Link from 'next/link'

interface Props { existing?: Appointment }

export function AppointmentForm({ existing }: Props) {
  const router = useRouter()
  const { workspaceId } = useWorkspace()
  const { hasStaff } = useBusinessLevel()
  const { role } = useUserRole()
  const isStaff = role === 'staff'

  const [clients,  setClients]  = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Client combobox state
  const [clientSearch,  setClientSearch]  = useState('')
  const [clientOpen,    setClientOpen]    = useState(false)
  const clientBoxRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState({
    client_id:           existing?.client_id           ?? '',
    service_id:          existing?.service_id          ?? '',
    staff_id:            existing?.staff_id            ?? '',
    start_time:          '',   // set in useEffect to avoid SSR/client timezone mismatch
    status:              (existing?.status              ?? 'scheduled') as AppointmentStatus,
    confirmation_status: (existing?.confirmation_status ?? 'pending')   as ConfirmationStatus,
    notes:               existing?.notes               ?? '',
  })

  // Set start_time on client only — avoids hydration mismatch
  useEffect(() => {
    queueMicrotask(() => {
      setForm(prev => ({
        ...prev,
        start_time: existing
          ? format(parseISO(existing.start_time), "yyyy-MM-dd'T'HH:mm")
          : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      }))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    Promise.all([
      getDocs(query(wsCol(db, workspaceId, 'clients'),  orderBy('last_name'))),
      getDocs(query(wsCol(db, workspaceId, 'services'), orderBy('name'))),
    ]).then(([cSnap, sSnap]) => {
      setClients(cSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Client))
      setServices(sSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Service).filter(s => s.active))
    }).catch(err => setError(`Errore caricamento dati: ${err.message}`))
  }, [workspaceId])

  useEffect(() => {
    if (!hasStaff) return
    getDocs(query(wsCol(db, workspaceId, 'staff'), orderBy('name')))
      .then(snap => {
        setStaffList(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }) as Staff & { id: string })
            .filter(s => s.active),
        )
      })
      .catch(() => {})
  }, [hasStaff, workspaceId])

  // Deduplicate clients by last_name+first_name+phone, then filter by search
  const dedupedClients = useMemo(() => {
    const seen = new Set<string>()
    return clients.filter(c => {
      const key = `${c.last_name}|${c.first_name}|${c.phone}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [clients])

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return dedupedClients
    return dedupedClients.filter(c =>
      `${c.first_name} ${c.last_name} ${c.phone}`.toLowerCase().includes(q)
    )
  }, [dedupedClients, clientSearch])

  const selectedClient = clients.find(c => c.id === form.client_id)

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (clientBoxRef.current && !clientBoxRef.current.contains(e.target as Node)) {
        setClientOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const selectedService = services.find(s => s.id === form.service_id)

  function getEndTime() {
    if (!selectedService || !form.start_time) return new Date(form.start_time).toISOString()
    return addMinutes(new Date(form.start_time), selectedService.duration_minutes).toISOString()
  }

  async function syncGoogleCalendar(appointmentId: string) {
    const res = await fetch('/api/google-calendar/sync', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ appointmentId }),
    })

    if (res.status === 409) return
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'Sincronizzazione Google Calendar non riuscita')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_id || !form.service_id) { setError('Seleziona cliente e servizio.'); return }
    setError(null)
    setLoading(true)

    // ── Schedule / orari di lavoro ────────────────────────────────
    if (form.staff_id && selectedService) {
      const staffMember = staffList.find(s => s.id === form.staff_id)
      if (staffMember?.schedule) {
        const startDt  = new Date(form.start_time)
        const endDt    = addMinutes(startDt, selectedService.duration_minutes)
        const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const
        const dayKey   = DAY_KEYS[startDt.getDay()]

        // Ferie / giorno libero
        const dateStr = format(startDt, 'yyyy-MM-dd')
        if (staffMember.days_off?.includes(dateStr)) {
          setError(`${staffMember.name} è in ferie in questa data.`)
          setLoading(false)
          return
        }

        const daySchedule = staffMember.schedule[dayKey]

        // Giorno non lavorativo
        if (!daySchedule) {
          const IT_DAYS = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato']
          setError(`${staffMember.name} non lavora il ${IT_DAYS[startDt.getDay()]}.`)
          setLoading(false)
          return
        }

        // Orario: minuti dall'inizio della giornata
        const toMins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
        const aptStart = startDt.getHours() * 60 + startDt.getMinutes()
        const aptEnd   = endDt.getHours()   * 60 + endDt.getMinutes()

        if (aptStart < toMins(daySchedule.start)) {
          setError(`Orario non disponibile: ${staffMember.name} inizia alle ${daySchedule.start}.`)
          setLoading(false)
          return
        }
        if (aptEnd > toMins(daySchedule.end)) {
          setError(
            `L'appuntamento terminerebbe alle ${format(endDt, 'HH:mm')} ` +
            `ma il centro chiude alle ${daySchedule.end}. Anticipa l'orario o scegli un servizio più breve.`,
          )
          setLoading(false)
          return
        }
      }
    }

    // Overlap check: query appointments for same day, filter by staff and time overlap
    if (form.staff_id && selectedService) {
      const startDt = new Date(form.start_time)
      const endDt   = addMinutes(startDt, selectedService.duration_minutes)
      const dayStart = startOfDay(startDt).toISOString()
      const dayEnd   = endOfDay(startDt).toISOString()

      const conflictSnap = await getDocs(query(
        wsCol(db, workspaceId, 'appointments'),
        where('start_time', '>=', dayStart),
        where('start_time', '<=', dayEnd),
        orderBy('start_time'),
      ))

      const hasConflict = conflictSnap.docs.some(d => {
        if (d.id === existing?.id) return false
        const data = d.data()
        if (data.staff_id !== form.staff_id) return false
        if (data.status === 'cancelled') return false
        const aptStart = new Date(data.start_time).getTime()
        const aptEnd   = new Date(data.end_time).getTime()
        return startDt.getTime() < aptEnd && endDt.getTime() > aptStart
      })

      if (hasConflict) {
        setError('Orario già occupato: questa operatrice ha un appuntamento in questa fascia. Scegli un altro orario.')
        setLoading(false)
        return
      }
    }

    const payload = {
      client_id:           form.client_id,
      service_id:          form.service_id,
      staff_id:            form.staff_id || null,
      start_time:          new Date(form.start_time).toISOString(),
      end_time:            getEndTime(),
      status:              form.status,
      confirmation_status: form.confirmation_status,
      notes:               form.notes.trim() || null,
      updated_at:          new Date().toISOString(),
    }

    try {
      let appointmentId: string

      if (existing) {
        await updateDoc(wsDoc(db, workspaceId, 'appointments', existing.id), payload)
        appointmentId = existing.id
      } else {
        const ref = await addDoc(wsCol(db, workspaceId, 'appointments'), {
          ...payload,
          created_at: new Date().toISOString(),
        })
        appointmentId = ref.id
      }

      // Schedule in-app alarms (IndexedDB) in background
      const [clientSnap, serviceSnap] = await Promise.all([
        getDoc(wsDoc(db, workspaceId, 'clients',  form.client_id)),
        getDoc(wsDoc(db, workspaceId, 'services', form.service_id)),
      ])
      const client  = clientSnap.exists()  ? { id: clientSnap.id,  ...clientSnap.data()  } as Client  : null
      const service = serviceSnap.exists() ? { id: serviceSnap.id, ...serviceSnap.data() } as Service : null

      if (client && service && payload.status !== 'cancelled') {
        scheduleAlarms({
          id: appointmentId, start_time: payload.start_time,
          client:  { first_name: client.first_name, last_name: client.last_name, phone: client.phone },
          service: { name: service.name },
          notes:   payload.notes,
        }).catch(() => {})
      } else if (payload.status === 'cancelled') {
        cancelAlarms(appointmentId).catch(() => {})
      }

      await syncGoogleCalendar(appointmentId)

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">

      {/* Cliente — combobox cercabile */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Cliente *</label>
        <div ref={clientBoxRef} className="relative">
          {/* Trigger input */}
          <div
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm bg-white cursor-pointer transition-all ${
              clientOpen ? 'border-orange-400 ring-2 ring-orange-100' : 'border-slate-200 hover:border-slate-300'
            }`}
            onClick={() => { setClientOpen(v => !v); setClientSearch('') }}
          >
            {selectedClient ? (
              <>
                <span className="flex-1 text-slate-800 font-medium">
                  {selectedClient.last_name} {selectedClient.first_name}
                  {!isStaff && <span className="text-slate-400 font-normal"> — {selectedClient.phone}</span>}
                </span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); set('client_id', ''); setClientSearch('') }}
                  className="text-slate-300 hover:text-slate-500 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-slate-400">Seleziona cliente…</span>
                <ChevronDown className="w-4 h-4 text-slate-300 shrink-0" />
              </>
            )}
          </div>

          {/* Dropdown */}
          {clientOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Cerca per nome o telefono…"
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  className="flex-1 text-sm outline-none text-slate-800 placeholder:text-slate-400"
                  onClick={e => e.stopPropagation()}
                />
                {clientSearch && (
                  <button type="button" onClick={() => setClientSearch('')} className="text-slate-300 hover:text-slate-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Options */}
              <div className="max-h-52 overflow-y-auto">
                {filteredClients.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-400 text-center">Nessun cliente trovato</div>
                ) : (
                  filteredClients.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { set('client_id', c.id); setClientOpen(false); setClientSearch('') }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-orange-50 transition-colors flex items-center justify-between gap-2 ${
                        form.client_id === c.id ? 'bg-orange-50 text-orange-700 font-semibold' : 'text-slate-700'
                      }`}
                    >
                      <span>{c.last_name} {c.first_name}</span>
                      {!isStaff && <span className="text-slate-400 text-xs shrink-0">{c.phone}</span>}
                    </button>
                  ))
                )}
              </div>

              {/* Crea nuovo cliente */}
              <div className="border-t border-slate-100">
                <Link
                  href={`/clients/new${clientSearch ? `?prefill=${encodeURIComponent(clientSearch)}` : ''}`}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-orange-500 hover:bg-orange-50 font-semibold transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Crea nuovo cliente
                </Link>
              </div>
            </div>
          )}
        </div>
        {/* Hidden input for form validation */}
        <input type="hidden" required value={form.client_id} onChange={() => {}} />
      </div>

      {/* Servizio */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Servizio *</label>
        <select
          required
          value={form.service_id}
          onChange={e => set('service_id', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800 bg-white"
        >
          <option value="">Seleziona servizio…</option>
          {services.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.duration_minutes} min — €{Number(s.price).toFixed(2)})
            </option>
          ))}
        </select>
        {selectedService && form.start_time && (
          <p className="text-xs text-slate-400 mt-1">
            Fine prevista: {format(addMinutes(new Date(form.start_time), selectedService.duration_minutes), 'HH:mm')}
          </p>
        )}
      </div>

      {/* Operatrice — solo se hasStaff */}
      {hasStaff && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Operatrice</label>
          <select
            value={form.staff_id}
            onChange={e => set('staff_id', e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800 bg-white"
          >
            <option value="">— Non assegnata —</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.name} · {s.role}</option>
            ))}
          </select>
        </div>
      )}

      {/* Data e ora */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Data e ora *</label>
        <input
          required
          type="datetime-local"
          value={form.start_time}
          onChange={e => set('start_time', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800"
        />
      </div>

      {/* Stato e conferma — solo in modifica */}
      {existing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Stato</label>
            <select
              value={form.status}
              onChange={e => set('status', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800 bg-white"
            >
              <option value="scheduled">Programmato</option>
              <option value="confirmed">Confermato</option>
              <option value="cancelled">Annullato</option>
              <option value="completed">Completato</option>
              <option value="no_show">No-show</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Conferma</label>
            <select
              value={form.confirmation_status}
              onChange={e => set('confirmation_status', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800 bg-white"
            >
              <option value="pending">In attesa</option>
              <option value="confirmed">Confermato</option>
              <option value="declined">Rifiutato</option>
              <option value="no_response">Nessuna risposta</option>
            </select>
          </div>
        </div>
      )}

      {/* Note */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
        <textarea
          rows={3}
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm resize-none"
          placeholder="Note interne…"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>
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
          className="flex-1 bg-gradient-to-r from-orange-500 to-amber-600 hover:opacity-90 disabled:opacity-50 text-white text-sm font-bold py-3 rounded-full shadow-md shadow-orange-200 transition-opacity"
        >
          {loading ? 'Salvataggio…' : existing ? 'Aggiorna' : 'Salva appuntamento'}
        </button>
      </div>
    </form>
  )
}
