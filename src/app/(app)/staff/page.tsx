'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Staff } from '@/types/database'
import { Plus, Pencil, Trash2, Phone, Crown, UserCog } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { clsx } from 'clsx'

type StaffDoc = Staff & { id: string }

const DAY_LABELS: Record<string, string> = {
  monday: 'Lu', tuesday: 'Ma', wednesday: 'Me', thursday: 'Gi',
  friday: 'Ve', saturday: 'Sa', sunday: 'Do',
}

export default function StaffPage() {
  const [staffList, setStaffList]     = useState<StaffDoc[]>([])
  const [loading, setLoading]         = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'staff'), orderBy('name')))
      setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() }) as StaffDoc))
    } catch (err) {
      console.error('[Staff] load:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'staff', id))
      setStaffList(prev => prev.filter(s => s.id !== id))
      setConfirmDelete(null)
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  const staffToDelete = staffList.find(s => s.id === confirmDelete)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Staff</h1>
          <p className="text-sm text-slate-400 mt-0.5">{staffList.length} operatric{staffList.length === 1 ? 'e' : 'i'}</p>
        </div>
        <Link
          href="/staff/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuova operatrice
        </Link>
      </div>

      {loading ? (
        <LoadingState />
      ) : staffList.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="Nessuna operatrice"
          description="Aggiungi le operatrici del centro per assegnare gli appuntamenti."
          action={
            <Link
              href="/staff/new"
              className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Aggiungi operatrice
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {staffList.map(s => {
            const workDays = Object.entries(s.schedule ?? {})
              .filter(([, v]) => v !== null)
              .map(([k]) => DAY_LABELS[k] ?? k)
            return (
              <div key={s.id} className={clsx(
                'bg-white rounded-2xl border p-4 flex items-start gap-4',
                s.active ? 'border-slate-100' : 'border-slate-100 opacity-60',
              )}>
                {/* Avatar */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ backgroundColor: s.color }}
                >
                  {s.initials}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-800">{s.name}</p>
                    {s.is_owner && (
                      <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                        <Crown className="w-2.5 h-2.5" /> Titolare
                      </span>
                    )}
                    {!s.active && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Non attiva</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">{s.role}</p>
                  {s.phone && (
                    <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 text-xs text-blue-600 mt-1">
                      <Phone className="w-3 h-3" /> {s.phone}
                    </a>
                  )}
                  {workDays.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {workDays.map(d => (
                        <span key={d} className="text-xs bg-slate-50 text-slate-600 px-1.5 py-0.5 rounded-md">{d}</span>
                      ))}
                    </div>
                  )}
                  {s.commission_pct > 0 && (
                    <p className="text-xs text-slate-400 mt-1">Provvigione: {s.commission_pct}%</p>
                  )}
                </div>

                {/* Azioni */}
                <div className="flex gap-1 shrink-0">
                  <Link
                    href={`/staff/${s.id}/edit`}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Modifica"
                  >
                    <Pencil className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => setConfirmDelete(s.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Elimina"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modale conferma eliminazione */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="font-bold text-slate-800 mb-2">Eliminare operatrice?</h2>
            <p className="text-sm text-slate-500 mb-1">
              <strong>{staffToDelete?.name}</strong> verrà rimossa dallo staff.
            </p>
            <p className="text-xs text-slate-400 mb-5">
              Gli appuntamenti esistenti non verranno eliminati ma rimarranno senza operatrice assegnata.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {deleting ? 'Eliminando…' : 'Sì, elimina'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
