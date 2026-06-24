'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { doc, getDoc, getDocs, query, collection, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Client, AppointmentWithRelations, Service, Staff } from '@/types/database'
import { LoadingState } from '@/components/ui/LoadingState'
import { ArrowLeft, Phone, Mail, CalendarDays, Clock, User } from 'lucide-react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { clsx } from 'clsx'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  scheduled:  { label: 'Confermato',  color: 'bg-blue-100 text-blue-700' },
  confirmed:  { label: 'Confermato',  color: 'bg-emerald-100 text-emerald-700' },
  completed:  { label: 'Completato',  color: 'bg-slate-100 text-slate-600' },
  cancelled:  { label: 'Cancellato',  color: 'bg-red-100 text-red-600' },
  no_show:    { label: 'No-show',     color: 'bg-orange-100 text-orange-600' },
}

export default function ClientHistoryPage() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient]   = useState<Client | null>(null)
  const [apts, setApts]       = useState<AppointmentWithRelations[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [clientSnap, aptsSnap] = await Promise.all([
        getDoc(doc(db, 'clients', id)),
        getDocs(query(
          collection(db, 'appointments'),
          where('client_id', '==', id),
          orderBy('start_time', 'desc'),
        )),
      ])

      if (!clientSnap.exists()) { setLoading(false); return }
      setClient({ id: clientSnap.id, ...clientSnap.data() } as Client)

      const raw = aptsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as (AppointmentWithRelations & { service_id: string; staff_id?: string | null })[]

      const sIds  = [...new Set(raw.map(a => a.service_id).filter(Boolean))]
      const stIds = [...new Set(raw.map(a => a.staff_id).filter((x): x is string => Boolean(x)))]

      const [sSnaps, stSnaps] = await Promise.all([
        Promise.all(sIds.map(sid => getDoc(doc(db, 'services', sid)))),
        Promise.all(stIds.map(sid => getDoc(doc(db, 'staff', sid)))),
      ])

      const sMap:  Record<string, Service> = Object.fromEntries(sSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Service]))
      const stMap: Record<string, Staff>   = Object.fromEntries(stSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() } as Staff]))

      setApts(raw.map(a => ({
        ...a,
        clients:  { id, ...clientSnap.data() } as Client,
        services: (a.service_id ? sMap[a.service_id] : undefined) as Service,
        staff:    (a.staff_id   ? stMap[a.staff_id]  : undefined) as Staff,
      })))
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="flex-1 flex items-center justify-center"><LoadingState /></div>
  if (!client) return <div className="flex-1 flex items-center justify-center text-slate-400">Cliente non trovato</div>

  const fullName = `${client.first_name} ${client.last_name}`
  const initials = `${client.first_name[0]}${client.last_name[0]}`.toUpperCase()
  const completedApts = apts.filter(a => a.status !== 'cancelled' && a.status !== 'no_show')
  const totalSpent = completedApts.reduce((s, a) => s + (a.services?.price ?? 0), 0)

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/clients" className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </Link>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-800 truncate">{fullName}</h1>
              <p className="text-xs text-slate-400">{completedApts.length} visite · €{totalSpent.toFixed(0)} totale speso</p>
            </div>
          </div>
          <Link href={`/clients/${id}/edit`} className="text-xs font-semibold text-blue-600 hover:text-blue-700 shrink-0">
            Modifica
          </Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 space-y-4">

        {/* Contact card */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-wrap gap-4">
          {client.phone && (
            <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
              <Phone className="w-4 h-4" /> {client.phone}
            </a>
          )}
          {client.email && (
            <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-sm text-slate-600 hover:underline">
              <Mail className="w-4 h-4" /> {client.email}
            </a>
          )}
          {client.notes && (
            <p className="w-full text-sm text-slate-500 italic">{client.notes}</p>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Visite totali',   value: completedApts.length },
            { label: 'Totale speso',    value: `€${totalSpent.toFixed(0)}` },
            { label: 'Media visita',    value: completedApts.length > 0 ? `€${(totalSpent / completedApts.length).toFixed(0)}` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 p-3 shadow-sm text-center">
              <p className="text-xl font-black text-violet-600">{value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* History list */}
        <div>
          <h2 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-400" /> Storico appuntamenti
          </h2>
          {apts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-sm">
              <CalendarDays className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">Nessun appuntamento registrato</p>
            </div>
          ) : (
            <div className="space-y-2">
              {apts.map(apt => {
                const st = STATUS_LABEL[apt.status] ?? { label: apt.status, color: 'bg-slate-100 text-slate-600' }
                const date = parseISO(apt.start_time)
                return (
                  <Link key={apt.id} href={`/appointments/${apt.id}/edit`}
                    className="block bg-white rounded-2xl border border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', st.color)}>{st.label}</span>
                          {apt.services?.price && apt.status !== 'cancelled' && apt.status !== 'no_show' && (
                            <span className="text-xs font-bold text-emerald-600">€{apt.services.price}</span>
                          )}
                        </div>
                        <p className="font-semibold text-slate-800 text-sm truncate">{apt.services?.name ?? '—'}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(date, 'HH:mm')} – {format(parseISO(apt.end_time), 'HH:mm')}
                          </span>
                          {apt.staff && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {apt.staff.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-700">{format(date, 'd MMM', { locale: it })}</p>
                        <p className="text-xs text-slate-400">{format(date, 'yyyy')}</p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
