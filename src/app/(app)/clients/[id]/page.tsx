'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { doc, getDoc, getDocs, query, collection, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Client, AppointmentWithRelations, Service, Staff, ClientTreatment, TreatmentCategory } from '@/types/database'
import { LoadingState } from '@/components/ui/LoadingState'
import { ArrowLeft, Phone, Mail, CalendarDays, Clock, User, CalendarPlus, Copy, Check, Plus, Pencil } from 'lucide-react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { clsx } from 'clsx'
import { TreatmentModal } from '@/components/clients/TreatmentModal'

// ── Costanti ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Confermato',  color: 'bg-blue-100 text-blue-700'     },
  confirmed: { label: 'Confermato',  color: 'bg-emerald-100 text-emerald-700' },
  completed: { label: 'Completato',  color: 'bg-slate-100 text-slate-600'   },
  cancelled: { label: 'Cancellato',  color: 'bg-red-100 text-red-600'       },
  no_show:   { label: 'No-show',     color: 'bg-orange-100 text-orange-600' },
}

const CAT_META: Record<TreatmentCategory, { label: string; labelLong: string; color: string; dot: string }> = {
  corpo:    { label: 'Corpo',     labelLong: 'Trattamenti Corpo',          color: 'text-indigo-600', dot: 'bg-indigo-500' },
  viso:     { label: 'Viso',      labelLong: 'Trattamenti Viso/Décolleté', color: 'text-violet-600', dot: 'bg-violet-500' },
  laser:    { label: 'Laser',     labelLong: 'Scheda Laser',               color: 'text-rose-600',   dot: 'bg-rose-500'   },
  prodotto: { label: 'Prodotti',  labelLong: 'Prodotti per Casa',          color: 'text-emerald-600',dot: 'bg-emerald-500'},
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avgFrequency(items: { date: string }[]): string | null {
  if (items.length < 2) return null
  const ts   = items.map(i => new Date(i.date).getTime()).sort((a, b) => a - b)
  const gaps = ts.slice(1).map((t, i) => (t - ts[i]) / 86400000)
  const avg  = Math.round(gaps.reduce((a, b) => a + b) / gaps.length)
  if (avg < 14)  return `ogni ${avg} giorni`
  if (avg < 60)  return `ogni ${Math.round(avg / 7)} sett.`
  return `ogni ${Math.round(avg / 30)} mesi`
}

function LaserTag({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
      <span className="text-rose-400 font-normal">{label}:</span>{value}
    </span>
  )
}

// ── Sub-componente tab trattamenti ────────────────────────────────────────────

function TreatmentTab({
  category, items, onAdd, onEdit,
}: {
  category: TreatmentCategory
  items: ClientTreatment[]
  onAdd: () => void
  onEdit: (t: ClientTreatment) => void
}) {
  const meta       = CAT_META[category]
  const freq       = avgFrequency(items)
  const totalSpend = items.reduce((s, t) => s + (t.price ?? 0), 0)

  return (
    <div>
      {/* Stats bar + Add */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-400 leading-snug">
          <span className="font-bold text-slate-700">{items.length}</span>
          {' '}{meta.label.toLowerCase()}
          {freq && (
            <> · <span className={clsx('font-semibold', meta.color)}>{freq}</span></>
          )}
          {totalSpend > 0 && (
            <> · <span className="text-emerald-600 font-semibold">€{totalSpend.toFixed(0)}</span></>
          )}
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 text-xs font-semibold bg-gradient-to-r from-violet-500 to-purple-700 text-white px-3 py-1.5 rounded-xl shadow hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" /> Aggiungi
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
          <p className="text-slate-400 text-sm mb-3">Nessun {meta.label.toLowerCase()} registrato</p>
          <button
            onClick={onAdd}
            className="text-xs font-semibold text-violet-600 hover:text-violet-700"
          >
            + Aggiungi il primo
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(t => (
            <button
              key={t.id}
              onClick={() => onEdit(t)}
              className="w-full text-left bg-white rounded-2xl border border-slate-100 p-4 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">

                {/* Data */}
                <div className="text-center shrink-0 w-12">
                  <p className={clsx('text-2xl font-black leading-none', meta.color)}>
                    {format(new Date(t.date), 'd')}
                  </p>
                  <p className="text-xs text-slate-400 font-bold uppercase mt-0.5">
                    {format(new Date(t.date), 'MMM', { locale: it })}
                  </p>
                  <p className="text-[10px] text-slate-300">{format(new Date(t.date), 'yyyy')}</p>
                </div>

                {/* Contenuto */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">{t.treatment}</p>

                  {/* Parametri laser */}
                  {t.category === 'laser' && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {t.zone           && <LaserTag label="Zona"     value={t.zone} />}
                      {t.program        && <LaserTag label="Prog."    value={t.program} />}
                      {t.energy         && <LaserTag label="Energia"  value={`${t.energy}J`} />}
                      {t.frequency_hz   && <LaserTag label="Freq."    value={`${t.frequency_hz}Hz`} />}
                      {t.pulse_duration && <LaserTag label="Impulso"  value={`${t.pulse_duration}ms`} />}
                    </div>
                  )}

                  {(t.operator || t.notes) && (
                    <p className="text-xs text-slate-400 mt-1">
                      {t.operator && <span>{t.operator}</span>}
                      {t.operator && t.notes && <span> · </span>}
                      {t.notes && <span className="italic">{t.notes}</span>}
                    </p>
                  )}
                </div>

                {/* Prezzo + edit icon */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {t.price != null && t.price > 0 && (
                    <span className="text-sm font-bold text-emerald-600">€{t.price.toFixed(0)}</span>
                  )}
                  <Pencil className="w-3.5 h-3.5 text-slate-300" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Pagina principale ─────────────────────────────────────────────────────────

type ActiveTab = 'agenda' | TreatmentCategory

export default function ClientHistoryPage() {
  const { id } = useParams<{ id: string }>()
  const [client,     setClient]     = useState<Client | null>(null)
  const [apts,       setApts]       = useState<AppointmentWithRelations[]>([])
  const [treatments, setTreatments] = useState<ClientTreatment[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<ActiveTab>('agenda')
  const [modal,      setModal]      = useState<{ category: TreatmentCategory; editing?: ClientTreatment } | null>(null)
  const [copiedCal,  setCopiedCal]  = useState(false)

  // ── Carica cliente + appuntamenti ──────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [clientSnap, aptsSnap] = await Promise.all([
        getDoc(doc(db, 'clients', id)),
        getDocs(query(collection(db, 'appointments'), where('client_id', '==', id))),
      ])
      if (!clientSnap.exists()) { setLoading(false); return }
      setClient({ id: clientSnap.id, ...clientSnap.data() } as Client)

      const raw   = aptsSnap.docs
        .map(d => ({ id: d.id, ...d.data() })) as (AppointmentWithRelations & { service_id: string; staff_id?: string | null })[]
      raw.sort((a, b) => b.start_time.localeCompare(a.start_time))
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
        services: sMap[a.service_id] as Service,
        staff:    a.staff_id ? stMap[a.staff_id] : null,
      })))
      setLoading(false)
    }
    load()
  }, [id])

  // ── Carica trattamenti (ricaricabile dopo save) ────────────────────────────
  const loadTreatments = useCallback(async () => {
    const snap = await getDocs(query(collection(db, 'client_treatments'), where('client_id', '==', id)))
    const raw  = snap.docs.map(d => ({ id: d.id, ...d.data() }) as ClientTreatment)
    setTreatments(raw.sort((a, b) => b.date.localeCompare(a.date)))
  }, [id])

  useEffect(() => { loadTreatments() }, [loadTreatments])

  if (loading) return <div className="flex-1 flex items-center justify-center"><LoadingState /></div>
  if (!client) return <div className="flex-1 flex items-center justify-center text-slate-400">Cliente non trovata</div>

  // ── Computed ───────────────────────────────────────────────────────────────
  const completedApts   = apts.filter(a => a.status !== 'cancelled' && a.status !== 'no_show')
  const totalAptSpend   = completedApts.reduce((s, a) => s + (a.services?.price ?? 0), 0)
  const totalTreatSpend = treatments.reduce((s, t) => s + (t.price ?? 0), 0)
  const totalSpent      = totalAptSpend + totalTreatSpend
  const byCategory      = (cat: TreatmentCategory) => treatments.filter(t => t.category === cat)

  // Frequenza globale: appuntamenti + trattamenti
  const allDates = [
    ...completedApts.map(a => ({ date: a.start_time.split('T')[0] })),
    ...treatments.map(t => ({ date: t.date })),
  ]
  const globalFreq = avgFrequency(allDates)

  const calUrl   = typeof window !== 'undefined' ? `${window.location.origin}/api/clients/${id}/calendar` : `/api/clients/${id}/calendar`
  const fullName = `${client.first_name} ${client.last_name}`
  const initials = `${client.first_name[0]}${client.last_name[0]}`.toUpperCase()

  const TABS: { key: ActiveTab; label: string; count: number }[] = [
    { key: 'agenda',   label: '🗓 Agenda',   count: completedApts.length },
    { key: 'corpo',    label: '💆 Corpo',    count: byCategory('corpo').length },
    { key: 'viso',     label: '✨ Viso',     count: byCategory('viso').length },
    { key: 'laser',    label: '⚡ Laser',    count: byCategory('laser').length },
    { key: 'prodotto', label: '🧴 Prodotti', count: byCategory('prodotto').length },
  ]

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">

      {/* ── Header sticky ── */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-4 sticky top-0 z-20">
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
              <p className="text-xs text-slate-400">
                {completedApts.length + treatments.length} trattamenti totali · €{totalSpent.toFixed(0)}
              </p>
            </div>
          </div>
          <Link href={`/clients/${id}/edit`} className="text-xs font-semibold text-blue-600 hover:text-blue-700 shrink-0">
            Modifica
          </Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 space-y-4">

        {/* ── Stats ── */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Visite',    value: completedApts.length + treatments.length },
            { label: 'Speso',     value: `€${totalSpent.toFixed(0)}` },
            { label: 'Media',     value: (completedApts.length + treatments.length) > 0 ? `€${(totalSpent / (completedApts.length + treatments.length)).toFixed(0)}` : '—' },
            { label: 'Cadenza',   value: globalFreq ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 p-3 shadow-sm text-center">
              <p className="text-base font-black text-violet-600 leading-tight">{value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Contatti ── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-wrap gap-3">
          {client.phone && (
            <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              <Phone className="w-4 h-4" /> {client.phone}
            </a>
          )}
          {client.email && (
            <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 text-sm text-slate-600 hover:underline">
              <Mail className="w-4 h-4" /> {client.email}
            </a>
          )}
          {client.birth_date && (
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              🎂 {format(new Date(client.birth_date), 'd MMMM yyyy', { locale: it })}
            </span>
          )}
          {client.profession && (
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              💼 {client.profession}
            </span>
          )}
          {client.city && (
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              📍 {client.city}
            </span>
          )}
          {client.notes && (
            <p className="w-full text-sm text-slate-500 italic border-t border-slate-50 pt-2 mt-1">{client.notes}</p>
          )}
        </div>

        {/* ── Tab bar ── */}
        <div className="overflow-x-auto scrollbar-none -mx-4 px-4">
          <div className="flex gap-1 w-max bg-white rounded-2xl border border-slate-100 p-1 shadow-sm">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
                  tab === t.key
                    ? 'bg-violet-600 text-white shadow'
                    : 'text-slate-500 hover:bg-slate-50',
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={clsx(
                    'text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center leading-none',
                    tab === t.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500',
                  )}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════
            TAB: AGENDA (storico appuntamenti)
        ══════════════════════════════════════════ */}
        {tab === 'agenda' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400" /> Storico appuntamenti
              </h2>
              <Link href={`/appointments/new`}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
                <Plus className="w-3.5 h-3.5" /> Nuovo
              </Link>
            </div>

            {/* Link calendario ICS */}
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100 p-3 mb-3 shadow-sm">
              <div className="flex items-center gap-2">
                <CalendarPlus className="w-4 h-4 text-indigo-500 shrink-0" />
                <p className="text-xs text-slate-600 flex-1 font-medium truncate">Calendario ICS per la cliente</p>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(calUrl)
                    setCopiedCal(true)
                    setTimeout(() => setCopiedCal(false), 2000)
                  }}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                  title="Copia link"
                >
                  {copiedCal
                    ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                    : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
                </button>
                <a href={calUrl} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                  Apri
                </a>
              </div>
            </div>

            {completedApts.length === 0 ? (
              <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
                <CalendarDays className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Nessun appuntamento registrato</p>
              </div>
            ) : (
              <div className="space-y-2">
                {completedApts.map(apt => {
                  const st   = STATUS_LABEL[apt.status] ?? { label: apt.status, color: 'bg-slate-100 text-slate-600' }
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
                              {format(date, 'HH:mm')}–{format(parseISO(apt.end_time), 'HH:mm')}
                            </span>
                            {apt.staff && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" /> {apt.staff.name}
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

            {/* ── Annullati / No-show ── */}
            {(() => {
              const cancelled = apts.filter(a => a.status === 'cancelled' || a.status === 'no_show')
              if (cancelled.length === 0) return null
              return (
                <details className="group mt-4">
                  <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-400 hover:text-rose-500 transition-colors list-none select-none">
                    <span className="w-5 h-5 rounded-full bg-rose-50 text-rose-400 flex items-center justify-center text-[10px] font-black">{cancelled.length}</span>
                    Annullati / No-show
                    <span className="ml-auto text-[10px] group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    {cancelled.map(apt => {
                      const st   = STATUS_LABEL[apt.status] ?? { label: apt.status, color: 'bg-slate-100 text-slate-600' }
                      const date = parseISO(apt.start_time)
                      return (
                        <Link key={apt.id} href={`/appointments/${apt.id}/edit`}
                          className="block bg-white rounded-2xl border border-rose-100 p-4 shadow-sm opacity-70 hover:opacity-100 transition-opacity">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', st.color)}>{st.label}</span>
                              <p className="font-semibold text-slate-600 text-sm mt-1">{apt.services?.name ?? '—'}</p>
                              {apt.staff && <p className="text-xs text-slate-400 mt-0.5">{apt.staff.name}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-slate-500">{format(date, 'd MMM', { locale: it })}</p>
                              <p className="text-xs text-slate-300">{format(date, 'yyyy')}</p>
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </details>
              )
            })()}
          </div>
        )}

        {/* ══════════════════════════════════════════
            TABS: CORPO / VISO / LASER / PRODOTTI
        ══════════════════════════════════════════ */}
        {(tab === 'corpo' || tab === 'viso' || tab === 'laser' || tab === 'prodotto') && (
          <TreatmentTab
            category={tab}
            items={byCategory(tab)}
            onAdd={() => setModal({ category: tab })}
            onEdit={t => setModal({ category: t.category, editing: t })}
          />
        )}

      </div>

      {/* ── Modal add/edit ── */}
      {modal && (
        <TreatmentModal
          clientId={id}
          defaultCategory={modal.category}
          existing={modal.editing}
          onSaved={loadTreatments}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
