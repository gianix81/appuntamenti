'use client'

import { useEffect, useState, useMemo } from 'react'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Service, Staff } from '@/types/database'
import { LoadingState } from '@/components/ui/LoadingState'
import { BarChart3, TrendingUp, CalendarCheck, XCircle, Star } from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear,
  parseISO, startOfDay, endOfDay,
} from 'date-fns'
import { it } from 'date-fns/locale'
import { clsx } from 'clsx'

type Period = 'month' | '3months' | 'year'

interface AptRaw {
  id: string
  service_id: string
  staff_id?: string | null
  start_time: string
  status: string
}

const VALID = new Set(['scheduled', 'confirmed', 'completed'])

const PERIOD_LABELS: Record<Period, string> = {
  month: 'Questo mese',
  '3months': 'Ultimi 3 mesi',
  year: 'Quest\'anno',
}

function getPeriodRange(period: Period): [Date, Date] {
  const now = new Date()
  if (period === 'month')   return [startOfMonth(now), endOfMonth(now)]
  if (period === '3months') return [startOfMonth(subMonths(now, 2)), endOfMonth(now)]
  return [startOfYear(now), endOfYear(now)]
}

function formatEur(n: number) {
  return `€${n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function ReportsPage() {
  const [period, setPeriod]     = useState<Period>('month')
  const [loading, setLoading]   = useState(true)
  const [apts, setApts]         = useState<AptRaw[]>([])
  const [svcMap, setSvcMap]     = useState<Record<string, Service & { id: string }>>({})
  const [staffMap, setStaffMap] = useState<Record<string, Staff & { id: string }>>({})

  // Fetch services + staff once
  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'services')),
      getDocs(collection(db, 'staff')),
    ]).then(([sSnap, stSnap]) => {
      const sm: Record<string, Service & { id: string }> = {}
      sSnap.docs.forEach(d => { sm[d.id] = { id: d.id, ...d.data() } as Service & { id: string } })
      const stm: Record<string, Staff & { id: string }> = {}
      stSnap.docs.forEach(d => { stm[d.id] = { id: d.id, ...d.data() } as Staff & { id: string } })
      setSvcMap(sm)
      setStaffMap(stm)
    })
  }, [])

  // Fetch appointments for selected period
  useEffect(() => {
    setLoading(true)
    const [start, end] = getPeriodRange(period)
    getDocs(query(
      collection(db, 'appointments'),
      where('start_time', '>=', startOfDay(start).toISOString()),
      where('start_time', '<=', endOfDay(end).toISOString()),
      orderBy('start_time'),
    )).then(snap => {
      setApts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AptRaw))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [period])

  const stats = useMemo(() => {
    const valid     = apts.filter(a => VALID.has(a.status))
    const cancelled = apts.filter(a => a.status === 'cancelled' || a.status === 'no_show')
    const revenue   = valid.reduce((sum, a) => sum + (svcMap[a.service_id]?.price ?? 0), 0)
    const avgRev    = valid.length > 0 ? revenue / valid.length : 0
    const completionRate = apts.length > 0 ? Math.round(valid.length / apts.length * 100) : 0

    // By month
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

    // By service
    const bySvc: Record<string, { name: string; revenue: number; count: number }> = {}
    valid.forEach(a => {
      const svc = svcMap[a.service_id]
      if (!svc) return
      if (!bySvc[a.service_id]) bySvc[a.service_id] = { name: svc.name, revenue: 0, count: 0 }
      bySvc[a.service_id].revenue += svc.price ?? 0
      bySvc[a.service_id].count++
    })
    const svcData = Object.values(bySvc).sort((a, b) => b.revenue - a.revenue).slice(0, 8)

    // By staff
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

    return { revenue, avgRev, completionRate, validCount: valid.length, cancelledCount: cancelled.length, totalCount: apts.length, monthData, svcData, staffData }
  }, [apts, svcMap, staffMap])

  const maxMonthRev = Math.max(...stats.monthData.map(m => m.revenue), 1)

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Statistiche</h1>
            <p className="text-slate-400 text-xs mt-0.5">Fatturato e andamento appuntamenti</p>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setPeriod(key)}
                className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  period === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-5 space-y-5">
        {loading ? <LoadingState /> : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Fatturato',       value: formatEur(stats.revenue),     icon: TrendingUp,    color: 'bg-indigo-50 text-indigo-600' },
                { label: 'Appuntamenti',    value: String(stats.validCount),      icon: CalendarCheck, color: 'bg-emerald-50 text-emerald-600' },
                { label: 'Media a prenotaz.', value: formatEur(stats.avgRev),    icon: Star,          color: 'bg-amber-50 text-amber-600' },
                { label: 'Cancellati',      value: String(stats.cancelledCount),  icon: XCircle,       color: 'bg-rose-50 text-rose-500' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center mb-3', color)}>
                    <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                  </div>
                  <p className="text-2xl font-black text-slate-800">{value}</p>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">{label}</p>
                </div>
              ))}
            </div>

            {/* Andamento mensile */}
            {stats.monthData.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-indigo-500" />
                  <h2 className="font-bold text-slate-800 text-sm">Andamento mensile</h2>
                </div>
                <div className="space-y-2.5">
                  {stats.monthData.map((m, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 w-12 shrink-0 capitalize">{m.label}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-6 relative overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                          style={{ width: `${Math.max((m.revenue / maxMonthRev) * 100, 4)}%` }}
                        >
                          {m.revenue / maxMonthRev > 0.25 && (
                            <span className="text-white text-[10px] font-bold">{formatEur(m.revenue)}</span>
                          )}
                        </div>
                      </div>
                      {m.revenue / maxMonthRev <= 0.25 && (
                        <span className="text-xs font-semibold text-slate-600 w-14 text-right shrink-0">{formatEur(m.revenue)}</span>
                      )}
                      <span className="text-xs text-slate-400 w-10 text-right shrink-0">{m.count} apt.</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-5">
              {/* Per servizio */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <h2 className="font-bold text-slate-800 text-sm mb-4">Top servizi</h2>
                {stats.svcData.length === 0 ? (
                  <p className="text-sm text-slate-400">Nessun dato disponibile</p>
                ) : (
                  <div className="space-y-2">
                    {stats.svcData.map((s, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                          <span className="text-sm text-slate-700 truncate">{s.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-400">{s.count}×</span>
                          <span className="text-sm font-bold text-slate-800">{formatEur(s.revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Per operatrice */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <h2 className="font-bold text-slate-800 text-sm mb-4">Per operatrice</h2>
                {stats.staffData.length === 0 ? (
                  <p className="text-sm text-slate-400">Nessun dato disponibile</p>
                ) : (
                  <div className="space-y-3">
                    {stats.staffData.map((s, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: s.color }}>
                          {s.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-700 font-medium truncate">{s.name}</span>
                            <span className="text-sm font-bold text-slate-800 shrink-0 ml-2">{formatEur(s.revenue)}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full transition-all"
                              style={{ width: `${(s.revenue / (stats.staffData[0]?.revenue || 1)) * 100}%`, backgroundColor: s.color }} />
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">{s.count} apt.</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Completion breakdown */}
            {stats.totalCount > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-slate-800 text-sm">Tasso di completamento</h2>
                  <span className="text-lg font-black text-emerald-600">{stats.completionRate}%</span>
                </div>
                <div className="flex rounded-full overflow-hidden h-3">
                  <div className="bg-emerald-400 transition-all" style={{ width: `${(stats.validCount / stats.totalCount) * 100}%` }} />
                  <div className="bg-rose-300 flex-1" />
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Completati: {stats.validCount}</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-300 inline-block" /> Cancellati/assenti: {stats.cancelledCount}</span>
                </div>
              </div>
            )}

            {stats.totalCount === 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-sm">
                <BarChart3 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Nessun appuntamento nel periodo selezionato</p>
                <p className="text-slate-400 text-sm mt-1">Prova a selezionare un periodo diverso</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
