'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { Staff } from '@/types/database'
import { Plus, Pencil, Trash2, Phone, Crown, UserCog, KeyRound, Calendar, Loader2, X, Eye, EyeOff, ShieldOff } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { clsx } from 'clsx'

type StaffDoc = Staff & { id: string }

const DAY_LABELS: Record<string, string> = {
  monday: 'Lu', tuesday: 'Ma', wednesday: 'Me', thursday: 'Gi',
  friday: 'Ve', saturday: 'Sa', sunday: 'Do',
}

/* ── Login modal ─────────────────────────────────────────────── */
function CreateLoginModal({
  staff,
  onClose,
  onSuccess,
}: {
  staff: StaffDoc
  onClose: () => void
  onSuccess: (uid: string, email: string) => void
}) {
  const [email, setEmail]       = useState(staff.email ?? '')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/create-staff-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: staff.id, email: email.trim(), password }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Errore'); return }
      onSuccess(json.uid, email.trim())
    } catch {
      setError('Errore di rete')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800">Crea accesso per {staff.name}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-5">
          L&apos;operatrice potrà accedere all&apos;app con queste credenziali e vedrà solo i propri appuntamenti.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="es. maria@salone.it"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Password (min. 6 caratteri)</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="password…"
                className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Crea accesso
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Revoke modal ────────────────────────────────────────────── */
function RevokeLoginModal({
  staff,
  onClose,
  onSuccess,
}: {
  staff: StaffDoc
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleRevoke() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/create-staff-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: staff.id }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Errore'); return }
      onSuccess()
    } catch {
      setError('Errore di rete')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-slate-800 mb-2">Revocare accesso?</h2>
        <p className="text-sm text-slate-500 mb-1">
          <strong>{staff.name}</strong> non potrà più accedere all&apos;app.
        </p>
        <p className="text-xs text-slate-400 mb-1">Email: {staff.login_email}</p>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</p>
        )}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            onClick={handleRevoke}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
            Revoca
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────── */
export default function StaffPage() {
  const [staffList, setStaffList]         = useState<StaffDoc[]>([])
  const [loading, setLoading]             = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting]           = useState(false)
  const [createLoginFor, setCreateLoginFor] = useState<StaffDoc | null>(null)
  const [revokeLoginFor, setRevokeLoginFor] = useState<StaffDoc | null>(null)

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
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Staff</h1>
          <p className="text-sm text-slate-400 mt-0.5">{staffList.length} operatric{staffList.length === 1 ? 'e' : 'i'}</p>
        </div>
        <Link
          href="/staff/new"
          className="flex items-center gap-2 bg-gradient-to-r from-sky-400 to-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-200 hover:opacity-90 transition-opacity"
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
              className="inline-flex items-center gap-2 bg-gradient-to-r from-sky-400 to-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-200 hover:opacity-90 transition-opacity"
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
            const hasLogin = !!s.auth_uid
            const icsUrl   = `/api/staff/${s.id}/calendar`

            return (
              <div key={s.id} className={clsx(
                'bg-white rounded-2xl border p-4',
                s.active ? 'border-slate-100' : 'border-slate-100 opacity-60',
              )}>
                <div className="flex items-start gap-4">
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
                      {hasLogin && (
                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <KeyRound className="w-2.5 h-2.5" /> Accesso attivo
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
                    {hasLogin && s.login_email && (
                      <p className="text-xs text-slate-400 mt-1">Login: {s.login_email}</p>
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

                {/* Login actions row */}
                <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-2 flex-wrap">
                  {!hasLogin ? (
                    <button
                      onClick={() => setCreateLoginFor(s)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" /> Crea accesso app
                    </button>
                  ) : (
                    <>
                      <a
                        href={icsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors"
                        title="URL feed calendario da aggiungere a Google Calendar / Apple Calendar"
                      >
                        <Calendar className="w-3.5 h-3.5" /> Feed calendario
                      </a>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}${icsUrl}`
                          navigator.clipboard.writeText(url)
                          alert(`URL copiato!\n${url}\n\nIncollalo in Google Calendar → "Aggiungi da URL" per sincronizzare gli appuntamenti.`)
                        }}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Copia URL
                      </button>
                      <button
                        onClick={() => setRevokeLoginFor(s)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors ml-auto"
                      >
                        <ShieldOff className="w-3.5 h-3.5" /> Revoca accesso
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modale Crea Login */}
      {createLoginFor && (
        <CreateLoginModal
          staff={createLoginFor}
          onClose={() => setCreateLoginFor(null)}
          onSuccess={(uid, email) => {
            setStaffList(prev => prev.map(s =>
              s.id === createLoginFor.id ? { ...s, auth_uid: uid, login_email: email } : s,
            ))
            setCreateLoginFor(null)
          }}
        />
      )}

      {/* Modale Revoca Login */}
      {revokeLoginFor && (
        <RevokeLoginModal
          staff={revokeLoginFor}
          onClose={() => setRevokeLoginFor(null)}
          onSuccess={() => {
            setStaffList(prev => prev.map(s =>
              s.id === revokeLoginFor.id ? { ...s, auth_uid: null, login_email: null } : s,
            ))
            setRevokeLoginFor(null)
          }}
        />
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
