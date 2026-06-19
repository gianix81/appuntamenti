'use client'

import { useEffect, useState, useCallback } from 'react'
import { format, isToday, startOfDay, endOfDay } from 'date-fns'
import { it } from 'date-fns/locale'
import { collection, getDocs, getDoc, doc, query, where, orderBy } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase/client'
import type { AppointmentWithRelations, Client, Service } from '@/types/database'
import { AppointmentCard } from '@/components/appointments/AppointmentCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { CalendarDays, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

function waitForAuth() {
  return new Promise<boolean>(resolve => {
    const unsub = onAuthStateChanged(auth, user => {
      unsub()
      resolve(!!user)
    })
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: Firestore non risponde. Hai creato il database in Firebase Console?')), ms)
    ),
  ])
}

async function fetchAppointmentsWithRelations(date: Date): Promise<AppointmentWithRelations[]> {
  const snap = await withTimeout(getDocs(query(
    collection(db, 'appointments'),
    where('start_time', '>=', startOfDay(date).toISOString()),
    where('start_time', '<=', endOfDay(date).toISOString()),
    orderBy('start_time')
  )), 8000)

  const appointments = snap.docs.map(d => ({ id: d.id, ...d.data() })) as (AppointmentWithRelations & { client_id: string; service_id: string })[]
  const active = appointments.filter(a => a.status !== 'cancelled')

  const clientIds  = [...new Set(active.map(a => a.client_id))]
  const serviceIds = [...new Set(active.map(a => a.service_id))]

  const [clientSnaps, serviceSnaps] = await Promise.all([
    Promise.all(clientIds.map(id => getDoc(doc(db, 'clients', id)))),
    Promise.all(serviceIds.map(id => getDoc(doc(db, 'services', id)))),
  ])

  const clientMap  = Object.fromEntries(clientSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Client]))
  const serviceMap = Object.fromEntries(serviceSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Service]))

  return active.map(a => ({ ...a, clients: clientMap[a.client_id], services: serviceMap[a.service_id] }))
}

export default function DashboardPage() {
  const [date, setDate]               = useState(new Date())
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [sending, setSending]         = useState<string | null>(null) // eslint-disable-line @typescript-eslint/no-unused-vars
  const [stats, setStats]             = useState({ total: 0, pending: 0, confirmed: 0 })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const authed = await waitForAuth()
      if (!authed) {
        setError('Sessione scaduta. Ricarica la pagina o accedi di nuovo.')
        return
      }
      // Assicura che il token sia disponibile prima della query Firestore
      await auth.currentUser?.getIdToken()
      const list = await fetchAppointmentsWithRelations(date)
      setAppointments(list)
      setStats({ total: list.length, pending: list.filter(a => a.confirmation_status === 'pending').length, confirmed: list.filter(a => a.confirmation_status === 'confirmed').length })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento degli appuntamenti.')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  async function handleSendReminder(appointmentId: string) {
    setSending(appointmentId)
    await fetch('/api/reminders/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId }) })
    await load()
    setSending(null)
  }

  function prevDay() { setDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n }) }
  function nextDay() { setDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n }) }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{isToday(date) ? 'Oggi' : format(date, 'EEEE', { locale: it })}</h1>
          <p className="text-gray-400 text-sm capitalize">{format(date, 'd MMMM yyyy', { locale: it })}</p>
        </div>
        <Link href="/appointments/new" className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Nuovo
        </Link>
      </div>

      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 p-3 mb-4">
        <button onClick={prevDay} className="p-2 hover:bg-gray-50 rounded-xl transition-colors"><ChevronLeft className="w-4 h-4 text-gray-500" /></button>
        <button onClick={() => setDate(new Date())} className="text-sm font-medium text-gray-700 hover:text-rose-500 transition-colors">
          {isToday(date) ? 'Oggi' : 'Vai a oggi'}
        </button>
        <button onClick={nextDay} className="p-2 hover:bg-gray-50 rounded-xl transition-colors"><ChevronRight className="w-4 h-4 text-gray-500" /></button>
      </div>

      {!loading && !error && appointments.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <p className="text-xl font-bold text-gray-800">{stats.total}</p><p className="text-xs text-gray-400">Totali</p>
          </div>
          <div className="bg-white rounded-2xl border border-yellow-100 p-3 text-center">
            <p className="text-xl font-bold text-yellow-600">{stats.pending}</p><p className="text-xs text-gray-400">In attesa</p>
          </div>
          <div className="bg-white rounded-2xl border border-green-100 p-3 text-center">
            <p className="text-xl font-bold text-green-600">{stats.confirmed}</p><p className="text-xs text-gray-400">Confermati</p>
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-red-600 text-sm font-medium mb-1">Errore di connessione</p>
          <p className="text-red-500 text-xs">{error}</p>
          <button onClick={load} className="mt-4 text-sm text-rose-500 hover:text-rose-700 underline">Riprova</button>
        </div>
      ) : appointments.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nessun appuntamento"
          description={`Nessun appuntamento per ${isToday(date) ? 'oggi' : format(date, 'd MMMM', { locale: it })}.`}
          action={<Link href="/appointments/new" className="inline-flex items-center gap-2 bg-rose-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-rose-600 transition-colors"><Plus className="w-4 h-4" /> Aggiungi appuntamento</Link>} />
      ) : (
        <div className="space-y-3">
          {appointments.map(apt => (
            <AppointmentCard key={apt.id} appointment={apt} />
          ))}
        </div>
      )}
    </div>
  )
}
