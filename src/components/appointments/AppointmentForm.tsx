'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format, addMinutes, parseISO } from 'date-fns'
import { collection, getDocs, getDoc, doc, addDoc, updateDoc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Client, Service, Appointment, AppointmentStatus, ConfirmationStatus } from '@/types/database'
import { scheduleAlarms, cancelAlarms } from '@/lib/alarmScheduler'

interface Props { existing?: Appointment }

export function AppointmentForm({ existing }: Props) {
  const router = useRouter()
  const [clients, setClients]   = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const defaultDate = existing
    ? format(parseISO(existing.start_time), "yyyy-MM-dd'T'HH:mm")
    : format(new Date(), "yyyy-MM-dd'T'HH:mm")

  const [form, setForm] = useState({
    client_id:           existing?.client_id ?? '',
    service_id:          existing?.service_id ?? '',
    start_time:          defaultDate,
    status:              (existing?.status ?? 'scheduled') as AppointmentStatus,
    confirmation_status: (existing?.confirmation_status ?? 'pending') as ConfirmationStatus,
    notes:               existing?.notes ?? '',
  })

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'clients'), orderBy('last_name'))),
      getDocs(query(collection(db, 'services'), orderBy('name'))),
    ]).then(([cSnap, sSnap]) => {
      setClients(cSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Client))
      setServices(sSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Service).filter(s => s.active))
    }).catch(err => setError(`Errore caricamento dati: ${err.message}`))
  }, [])

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const selectedService = services.find(s => s.id === form.service_id)

  function getEndTime() {
    if (!selectedService || !form.start_time) return new Date(form.start_time).toISOString()
    return addMinutes(new Date(form.start_time), selectedService.duration_minutes).toISOString()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_id || !form.service_id) { setError('Seleziona cliente e servizio.'); return }
    setError(null)
    setLoading(true)

    const payload = {
      client_id:           form.client_id,
      service_id:          form.service_id,
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
        await updateDoc(doc(db, 'appointments', existing.id), payload)
        appointmentId = existing.id
      } else {
        const ref = await addDoc(collection(db, 'appointments'), {
          ...payload,
          created_at: new Date().toISOString(),
        })
        appointmentId = ref.id
      }

      // Schedule in-app alarms (IndexedDB) in background — non bloccante
      const [clientSnap, serviceSnap] = await Promise.all([
        getDoc(doc(db, 'clients',  form.client_id)),
        getDoc(doc(db, 'services', form.service_id)),
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

      // Il calendario si aggiorna automaticamente via feed webcal
      // (iscrizione una tantum dalle Impostazioni)
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Cliente *</label>
        <select required value={form.client_id} onChange={e => set('client_id', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800 bg-white">
          <option value="">Seleziona cliente…</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.last_name} {c.first_name} — {c.phone}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Servizio *</label>
        <select required value={form.service_id} onChange={e => set('service_id', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800 bg-white">
          <option value="">Seleziona servizio…</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes} min — €{Number(s.price).toFixed(2)})</option>)}
        </select>
        {selectedService && form.start_time && (
          <p className="text-xs text-slate-400 mt-1">Fine prevista: {format(addMinutes(new Date(form.start_time), selectedService.duration_minutes), 'HH:mm')}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Data e ora *</label>
        <input required type="datetime-local" value={form.start_time} onChange={e => set('start_time', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800" />
      </div>

      {existing && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Stato</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800 bg-white">
              <option value="scheduled">Programmato</option>
              <option value="confirmed">Confermato</option>
              <option value="cancelled">Annullato</option>
              <option value="completed">Completato</option>
              <option value="no_show">No-show</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Conferma</label>
            <select value={form.confirmation_status} onChange={e => set('confirmation_status', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm text-slate-800 bg-white">
              <option value="pending">In attesa</option>
              <option value="confirmed">Confermato</option>
              <option value="declined">Rifiutato</option>
              <option value="no_response">Nessuna risposta</option>
            </select>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
        <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm resize-none" placeholder="Note interne…" />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.back()}
          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Annulla</button>
        <button type="submit" disabled={loading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold py-3 rounded-xl transition-colors">
          {loading ? 'Salvataggio…' : existing ? 'Aggiorna' : 'Salva appuntamento'}
        </button>
      </div>
    </form>
  )
}
