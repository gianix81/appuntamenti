'use client'

import { useEffect, useState, useMemo } from 'react'
import { getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { wsCol } from '@/lib/firebase/workspace'
import type { Service, Staff } from '@/types/database'
import { LoadingState } from '@/components/ui/LoadingState'
import {
  BarChart3, TrendingUp, CalendarCheck, XCircle, Star,
  Users, PhoneCall, UserCheck, AlertCircle, Sparkles, Trophy,
  TrendingDown, Zap,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear,
  parseISO, startOfDay, endOfDay, differenceInDays, subDays,
} from 'date-fns'
import { it } from 'date-fns/locale'
import { clsx } from 'clsx'

type Period = 'month' | '3months' | '6months' | 'year'

interface AptRaw {
  id: string
  client_id: string
  service_id: string
  staff_id?: string | null
  start_time: string
  status: string
}

interface ClientInfo { name: string; phone: string }

const VALID = new Set(['scheduled', 'confirmed', 'completed'])

const PERIOD_LABELS: Record<Period, string> = {
  month:    'Questo mese',
  '3months': 'Ultimi 3 mesi',
  '6months': 'Ultimi 6 mesi',
  year:     'Quest\'anno',
}

function getPeriodRange(period: Period): [Date, Date] {
  const now = new Date()
  if (period === 'month')    return [startOfMonth(now), endOfMonth(now)]
  if (period === '3months')  return [startOfMonth(subMonths(now, 2)), endOfMonth(now)]
  if (period === '6months')  return [startOfMonth(subMonths(now, 5)), endOfMonth(now)]
  return [startOfYear(now), endOfYear(now)]
}

function formatEur(n: number) {
  return `€${n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// Barra orizzontale percentuale
function HBar({ pct, color = 'bg-gradient-to-r from-violet-500 to-purple-700', label }: { pct: number; color?: string; label?: string }) {
  return (
    <div className="flex-1 bg-slate-100 rounded-full h-2 relative overflow-hidden">
      <div className={clsx('h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.max(pct, 2)}%` }} />
    </div>
  )
}

export default function ReportsPage() {
  const { workspaceId } = useWorkspace()
  const [period, setPeriod]     = useState<Period>('month')
  const [loading, setLoading]   = useState(true)
  const [loadingExtra, setLoadingExtra] = useState(true)

  // Dati base
  const [apts, setApts]         = useState<AptRaw[]>([])
  const [svcMap, setSvcMap]     = useState<Record<string, Service & { id: string }>>({})
  const [staffMap, setStaffMap] = useState<Record<string, Staff & { id: string }>>({})

  // Dati per analisi clienti
  const [clientMap, setClientMap] = useState<Record<string, ClientInfo>>({})
  const [allApts, setAllApts]     = useState<AptRaw[]>([])   // ultimi 18 mesi

  // Carica servizi + staff + clienti (una volta)
  useEffect(() => {
    Promise.all([
      getDocs(wsCol(db, workspaceId, 'services')),
      getDocs(wsCol(db, workspaceId, 'staff')),
      getDocs(wsCol(db, workspaceId, 'clients')),
    ]).then(([sSnap, stSnap, cSnap]) => {
      const sm: Record<string, Service & { id: string }> = {}
      sSnap.docs.forEach(d => { sm[d.id] = { id: d.id, ...d.data() } as Service & { id: string } })

      const stm: Record<string, Staff & { id: string }> = {}
      stSnap.docs.forEach(d => { stm[d.id] = { id: d.id, ...d.data() } as Staff & { id: string } })

      const cm: Record<string, ClientInfo> = {}
      cSnap.docs.forEach(d => {
        const data = d.data()
        cm[d.id] = { name: `${data.first_name} ${data.last_name}`, phone: data.phone ?? '' }
      })

      setSvcMap(sm)
      setStaffMap(stm)
      setClientMap(cm)
    })
  }, [workspaceId])

  // Carica tutti gli appuntamenti ultimi 18 mesi (per analisi clienti)
  useEffect(() => {
    const since = subMonths(new Date(), 18).toISOString()
    getDocs(query(
      wsCol(db, workspaceId, 'appointments'),
      where('start_time', '>=', since),
      orderBy('start_time', 'asc'),
    )).then(snap => {
      setAllApts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AptRaw))
      setLoadingExtra(false)
    }).catch(() => setLoadingExtra(false))
  }, [workspaceId])

  // Carica appuntamenti per il periodo selezionato
  useEffect(() => {
    setLoading(true)
    const [start, end] = getPeriodRange(period)
    getDocs(query(
      wsCol(db, workspaceId, 'appointments'),
      where('start_time', '>=', startOfDay(start).toISOString()),
      where('start_time', '<=', endOfDay(end).toISOString()),
      orderBy('start_time'),
    )).then(snap => {
      setApts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AptRaw))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [period, workspaceId])

  // ── Stats per il periodo ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    const valid     = apts.filter(a => VALID.has(a.status))
    const cancelled = apts.filter(a => a.status === 'cancelled' || a.status === 'no_show')
    const revenue   = valid.reduce((sum, a) => sum + (svcMap[a.service_id]?.price ?? 0), 0)
    const avgRev    = valid.length > 0 ? revenue / valid.length : 0
    const completionRate = apts.length > 0 ? Math.round(valid.length / apts.length * 100) : 0

    // Per mese
    const monthMap: Record<string, { label: string; revenue: number; count: number }> = {}
    valid.forEach(a => {
      const d   = parseISO(a.start_time)
      const key = format(d, 'yyyy-MM')
      const lbl = format(d, 'MMM yy', { locale: it })
      if (!monthMap[key]) monthMap[key] = { label: lbl, revenue: 0, count: 0 }
      monthMap[key].revenue += svcMap[a.service_id]?.price ?? 0
      monthMap[key].count++
    })
    const monthData = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v)

    // Per servizio
    const bySvc: Record<string, { name: string; revenue: number; count: number }> = {}
    valid.forEach(a => {
      const svc = svcMap[a.service_id]
      if (!svc) return
      if (!bySvc[a.service_id]) bySvc[a.service_id] = { name: svc.name, revenue: 0, count: 0 }
      bySvc[a.service_id].revenue += svc.price ?? 0
      bySvc[a.service_id].count++
    })
    const svcData = Object.values(bySvc).sort((a, b) => b.count - a.count).slice(0, 8)

    // Per operatrice
    const byStaff: Record<string, { name: string; color: string; revenue: number; count: number }> = {}
    valid.forEach(a => {
      if (!a.staff_id) return
      const st = staffMap[a.staff_id]
      if (!st) return
      if (!byStaff[a.staff_id]) byStaff[a.staff_id] = { name: st.name, color: st.color ?? '#6366f1', revenue: 0, count: 0 }
      byStaff[a.staff_id].revenue += svcMap[a.service_id]?.price ?? 0
      byStaff[a.staff_id].count++
    })
    const staffData = Object.values(byStaff).sort((a, b) => b.revenue - a.revenue)

    // Clienti unici nel periodo
    const uniqueClients = new Set(valid.map(a => a.client_id)).size

    return { revenue, avgRev, completionRate, validCount: valid.length, cancelledCount: cancelled.length, totalCount: apts.length, monthData, svcData, staffData, uniqueClients }
  }, [apts, svcMap, staffMap])

  // ── Analisi clienti (18 mesi) ─────────────────────────────────────────────
  const clientStats = useMemo(() => {
    const validAll = allApts.filter(a => VALID.has(a.status))
    const now      = new Date()

    // Dati per cliente
    const byClient: Record<string, { count: number; lastVisit: Date; firstVisit: Date; spend: number }> = {}
    validAll.forEach(a => {
      const cid  = a.client_id
      const date = new Date(a.start_time)
      if (!byClient[cid]) byClient[cid] = { count: 0, lastVisit: date, firstVisit: date, spend: 0 }
      byClient[cid].count++
      byClient[cid].spend += svcMap[a.service_id]?.price ?? 0
      if (date > byClient[cid].lastVisit) byClient[cid].lastVisit = date
      if (date < byClient[cid].firstVisit) byClient[cid].firstVisit = date
    })

    const entries = Object.entries(byClient)

    // Segmentazione
    const nuovi      = entries.filter(([, c]) => differenceInDays(now, c.firstVisit) <= 60 && c.count <= 2)
    const abituali   = entries.filter(([, c]) => c.count >= 5)
    const frequenti  = entries.filter(([, c]) => c.count >= 3 && c.count < 5)
    const aRischio   = entries.filter(([, c]) => {
      const d = differenceInDays(now, c.lastVisit)
      return d >= 60 && d < 120
    })
    const assenti    = entries.filter(([, c]) => differenceInDays(now, c.lastVisit) >= 120)

    // Top 10 per frequenza
    const topByVisit = entries
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([id, c]) => ({
        id,
        name:      clientMap[id]?.name  ?? 'N/A',
        phone:     clientMap[id]?.phone ?? '',
        count:     c.count,
        spend:     c.spend,
        lastVisit: c.lastVisit,
      }))

    // Top 5 per fatturato
    const topBySpend = entries
      .sort(([, a], [, b]) => b.spend - a.spend)
      .slice(0, 5)
      .map(([id, c]) => ({
        id,
        name:  clientMap[id]?.name ?? 'N/A',
        phone: clientMap[id]?.phone ?? '',
        spend: c.spend,
        count: c.count,
      }))

    // Da ricontattare: assenti + a rischio, con telefono, ordinati per giorni assenza
    const toContact = [...aRischio, ...assenti]
      .map(([id, c]) => ({
        id,
        name:          clientMap[id]?.name  ?? 'N/A',
        phone:         clientMap[id]?.phone ?? '',
        lastVisit:     c.lastVisit,
        daysSinceLast: differenceInDays(now, c.lastVisit),
        visitCount:    c.count,
      }))
      .filter(c => c.phone)
      .sort((a, b) => b.daysSinceLast - a.daysSinceLast)
      .slice(0, 20)

    return {
      nuovi: nuovi.length,
      abituali: abituali.length,
      frequenti: frequenti.length,
      aRischio: aRischio.length,
      assenti: assenti.length,
      topByVisit,
      topBySpend,
      toContact,
      totalActive: entries.length,
    }
  }, [allApts, clientMap, svcMap])

  const maxMonthRev   = Math.max(...stats.monthData.map(m => m.revenue), 1)
  const maxVisitCount = Math.max(...(clientStats.topByVisit.map(c => c.count)), 1)

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-base font-bold text-slate-800">Analisi & Statistiche</h1>
            <p className="text-slate-400 text-[11px]">Andamento centro, operatrici, clientela</p>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setPeriod(key)}
                className={clsx('px-2.5 py-1 rounded-lg text-xs font-semibold transition-all',
                  period === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-3 space-y-3">
        {loading && !stats.totalCount ? <LoadingState /> : (
          <>
            {/* ── RIGA 1: KPI 4 colonne ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Fatturato',          value: formatEur(stats.revenue),    icon: TrendingUp,    iconBg: 'bg-orange-500',  gradient: 'from-slate-800 to-slate-900' },
                { label: 'Appuntamenti',        value: String(stats.validCount),    icon: CalendarCheck, iconBg: 'bg-emerald-500', gradient: 'from-slate-800 to-slate-900' },
                { label: 'Scontrino medio',     value: formatEur(stats.avgRev),     icon: Star,          iconBg: 'bg-amber-500',   gradient: 'from-slate-800 to-slate-900' },
                { label: 'Clienti nel periodo', value: String(stats.uniqueClients), icon: Users,         iconBg: 'bg-violet-500',  gradient: 'from-slate-800 to-slate-900' },
              ].map(({ label, value, icon: Icon, iconBg, gradient }) => (
                <div key={label} className={clsx('bg-gradient-to-br rounded-2xl p-3.5 shadow-lg flex items-center gap-3', gradient)}>
                  <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xl font-black text-white leading-none">{value}</p>
                    <p className="text-[11px] text-white/60 mt-0.5 font-medium">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── RIGA 2: Andamento | Operatrici | Servizi ── */}
            <div className="grid md:grid-cols-3 gap-3">

              {/* Andamento mensile */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/60 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                  <h2 className="font-bold text-slate-800 text-xs">Andamento mensile</h2>
                </div>
                {stats.monthData.length === 0 ? (
                  <p className="text-xs text-slate-400">Nessun dato</p>
                ) : (
                  <div className="space-y-1.5">
                    {stats.monthData.slice(-6).map((m, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 w-10 shrink-0 capitalize">{m.label}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-5 relative overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                            style={{ width: `${Math.max((m.revenue / maxMonthRev) * 100, 3)}%` }}>
                            {m.revenue / maxMonthRev > 0.35 && (
                              <span className="text-white text-[10px] font-bold">{formatEur(m.revenue)}</span>
                            )}
                          </div>
                        </div>
                        {m.revenue / maxMonthRev <= 0.35 && (
                          <span className="text-[10px] font-semibold text-slate-600 w-8 text-right shrink-0">{formatEur(m.revenue)}</span>
                        )}
                        <span className="text-[10px] text-slate-400 w-10 text-right shrink-0">{m.count} apt</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Classifica operatrici */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/60 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  <h2 className="font-bold text-slate-800 text-xs">Classifica operatrici</h2>
                </div>
                {stats.staffData.length === 0 ? (
                  <p className="text-xs text-slate-400">Nessun dato disponibile</p>
                ) : (
                  <div className="space-y-2">
                    {stats.staffData.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                          style={{ backgroundColor: s.color }}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-700 font-semibold truncate">{s.name}</span>
                            <span className="text-xs font-bold text-slate-800 ml-1 shrink-0">{formatEur(s.revenue)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <HBar pct={(s.revenue / (stats.staffData[0]?.revenue || 1)) * 100} />
                            <span className="text-[10px] text-slate-400 shrink-0">{s.count} apt</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top servizi */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/60 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                  <h2 className="font-bold text-slate-800 text-xs">Servizi più richiesti</h2>
                </div>
                {stats.svcData.length === 0 ? (
                  <p className="text-xs text-slate-400">Nessun dato disponibile</p>
                ) : (
                  <div className="space-y-1.5">
                    {stats.svcData.map((s, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded bg-violet-50 text-violet-600 text-[9px] font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-xs text-slate-700 flex-1 truncate">{s.name}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">{s.count}×</span>
                        {s.revenue > 0 && (
                          <span className="text-[10px] font-bold text-emerald-600 shrink-0">{formatEur(s.revenue)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGA 3: Tasso completamento | Segmentazione clientela ── */}
            <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,2.5fr)] gap-3">

              {/* Tasso completamento */}
              {stats.totalCount > 0 && (
                <div className="bg-white rounded-2xl shadow-md shadow-slate-200/60 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <CalendarCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <h2 className="font-bold text-slate-800 text-xs">Tasso completamento</h2>
                    </div>
                    <span className={clsx('text-base font-black', stats.completionRate >= 80 ? 'text-emerald-600' : stats.completionRate >= 60 ? 'text-amber-500' : 'text-rose-500')}>
                      {stats.completionRate}%
                    </span>
                  </div>
                  <div className="flex rounded-full overflow-hidden h-2.5 mb-1.5">
                    <div className="bg-emerald-400 transition-all" style={{ width: `${(stats.validCount / stats.totalCount) * 100}%` }} />
                    <div className="bg-rose-200 flex-1" />
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Completati: {stats.validCount}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-200 inline-block" /> Annullati: {stats.cancelledCount}</span>
                  </div>
                </div>
              )}

              {/* Segmentazione clientela */}
              {!loadingExtra && clientStats.totalActive > 0 && (
                <div className="bg-white rounded-2xl shadow-md shadow-slate-200/60 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-3.5 h-3.5 text-violet-500" />
                    <h2 className="font-bold text-slate-800 text-xs">Segmentazione clientela · 18 mesi</h2>
                    <span className="ml-auto text-[10px] text-slate-400">{clientStats.totalActive} attivi</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: 'Nuovi',     value: clientStats.nuovi,     desc: '<60 gg', color: 'bg-blue-50 text-blue-600 border-blue-100',     icon: '🌱' },
                      { label: 'Frequenti', value: clientStats.frequenti, desc: '3-4 vis',  color: 'bg-violet-50 text-violet-600 border-violet-100', icon: '⭐' },
                      { label: 'Abituali',  value: clientStats.abituali,  desc: '5+ vis',   color: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: '💎' },
                      { label: 'A rischio', value: clientStats.aRischio,  desc: '60-120 gg',color: 'bg-amber-50 text-amber-600 border-amber-100',   icon: '⚠️' },
                      { label: 'Assenti',   value: clientStats.assenti,   desc: '120+ gg',  color: 'bg-rose-50 text-rose-600 border-rose-100',     icon: '🔴' },
                    ].map(seg => (
                      <div key={seg.label} className={clsx('rounded-lg border p-2 text-center', seg.color)}>
                        <div className="text-base mb-0.5">{seg.icon}</div>
                        <p className="text-lg font-black leading-none">{seg.value}</p>
                        <p className="text-[10px] font-bold mt-0.5">{seg.label}</p>
                        <p className="text-[9px] opacity-60">{seg.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Sezioni extra (scrollabili) ── */}
            {!loadingExtra && clientStats.totalActive > 0 && (
              <div className="grid md:grid-cols-2 gap-3">

                {/* Top per frequenza */}
                <div className="bg-white rounded-2xl shadow-md shadow-slate-200/60 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="w-3.5 h-3.5 text-violet-500" />
                    <h2 className="font-bold text-slate-800 text-xs">Top clienti per visite</h2>
                  </div>
                  <div className="space-y-1.5">
                    {clientStats.topByVisit.slice(0, 5).map((c, i) => (
                      <div key={c.id} className="flex items-center gap-2">
                        <span className="text-xs w-4 text-center shrink-0 font-bold text-slate-400">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-slate-700 font-medium truncate">{c.name}</span>
                            <span className="text-[10px] font-black text-violet-600 ml-1 shrink-0">{c.count} vis</span>
                          </div>
                          <HBar pct={(c.count / maxVisitCount) * 100} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top per spesa */}
                <div className="bg-white rounded-2xl shadow-md shadow-slate-200/60 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    <h2 className="font-bold text-slate-800 text-xs">Top clienti per fatturato</h2>
                  </div>
                  <div className="space-y-2">
                    {clientStats.topBySpend.map((c, i) => (
                      <div key={c.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs w-4 text-center shrink-0 font-bold text-slate-400">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs text-slate-700 font-medium truncate">{c.name}</p>
                            <p className="text-[9px] text-slate-400">{c.count} visite</p>
                          </div>
                        </div>
                        <span className="text-xs font-black text-emerald-600 shrink-0">{formatEur(c.spend)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Da ricontattare */}
            {!loadingExtra && clientStats.toContact.length > 0 && (
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/60 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <PhoneCall className="w-3.5 h-3.5 text-amber-500" />
                  <h2 className="font-bold text-slate-800 text-xs">Da ricontattare</h2>
                  <span className="ml-auto text-[10px] bg-amber-50 text-amber-600 font-bold px-2 py-0.5 rounded-full border border-amber-100">
                    {clientStats.toContact.length} clienti
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mb-2">Assenti da 60+ giorni</p>
                <div className="space-y-1.5">
                  {clientStats.toContact.map(c => (
                    <div key={c.id} className="flex items-center gap-2.5 py-1.5 border-b border-slate-50 last:border-0">
                      <div className={clsx('text-center shrink-0 w-11 rounded-lg py-0.5', c.daysSinceLast >= 120 ? 'bg-rose-50' : 'bg-amber-50')}>
                        <p className={clsx('text-sm font-black leading-none', c.daysSinceLast >= 120 ? 'text-rose-600' : 'text-amber-600')}>{c.daysSinceLast}</p>
                        <p className={clsx('text-[8px] font-semibold', c.daysSinceLast >= 120 ? 'text-rose-400' : 'text-amber-400')}>gg fa</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{c.name}</p>
                        <p className="text-[9px] text-slate-400">Ultima: {format(c.lastVisit, 'd MMM yy', { locale: it })} · {c.visitCount} visite</p>
                      </div>
                      {c.phone && (
                        <a href={`tel:${c.phone}`}
                          className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors">
                          <PhoneCall className="w-3 h-3" /> Chiama
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadingExtra && (
              <div className="text-center py-3 text-xs text-slate-400">Caricamento analisi clientela…</div>
            )}

            {stats.totalCount === 0 && !loading && (
              <div className="bg-white rounded-xl border border-slate-100 p-8 text-center shadow-sm">
                <BarChart3 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-500 font-medium text-sm">Nessun appuntamento nel periodo selezionato</p>
                <p className="text-slate-400 text-xs mt-1">Prova a selezionare un periodo diverso</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
