'use client'

import { useEffect, useState } from 'react'
import { collection, doc, getDocs, setDoc, updateDoc, query, orderBy, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { AllowedUser } from '@/types/database'
import { useUserRole } from '@/hooks/useUserRole'
import { ADMIN_EMAIL } from '@/lib/auth/constants'
import { ShieldCheck, UserPlus, Trash2, ArrowLeft, Crown, Users, AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { clsx } from 'clsx'

type StaffEntry = { id: string; name: string; login_email: string | null; auth_uid: string | null }
interface AccessRequest {
  uid: string
  email: string
  display_name: string
  message?: string | null
  status: 'pending' | 'approved' | 'denied'
  requested_at: string
}

export default function AccessPage() {
  const { role } = useUserRole()
  const [pendingReqs,  setPendingReqs]  = useState<AccessRequest[]>([])
  const [allowedUsers, setAllowedUsers] = useState<(AllowedUser & { id: string })[]>([])
  const [staffList,    setStaffList]    = useState<StaffEntry[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [approvingId,  setApprovingId]  = useState<string | null>(null)
  const [approveRole,  setApproveRole]  = useState<Record<string, 'admin' | 'staff'>>({})
  const [form,         setForm]         = useState({ email: '', role: 'admin' as 'admin' | 'staff', display_name: '' })
  const [error,        setError]        = useState('')

  async function loadAll() {
    setLoading(true)
    try {
      const [auSnap, stSnap] = await Promise.all([
        getDocs(query(collection(db, 'allowed_users'), orderBy('created_at', 'desc'))),
        getDocs(collection(db, 'staff')),
      ])
      setAllowedUsers(auSnap.docs.map(d => ({ id: d.id, ...d.data() }) as AllowedUser & { id: string }))
      setStaffList(
        stSnap.docs.map(d => {
          const data = d.data()
          return { id: d.id, name: data.name ?? '', login_email: data.login_email ?? null, auth_uid: data.auth_uid ?? null }
        }).filter(s => s.auth_uid),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Real-time listener per richieste pendenti
  useEffect(() => {
    if (role !== 'admin') return
    // Senza orderBy per evitare indice composto — ordiniamo lato client
    const q = query(collection(db, 'access_requests'), where('status', '==', 'pending'))
    const unsub = onSnapshot(q, snap => {
      const reqs = snap.docs.map(d => d.data() as AccessRequest)
      reqs.sort((a, b) => b.requested_at.localeCompare(a.requested_at))
      setPendingReqs(reqs)
    }, (err) => { console.error('access_requests listener:', err); setPendingReqs([]) })
    return () => unsub()
  }, [role])

  async function handleApprove(req: AccessRequest) {
    const chosenRole = approveRole[req.uid] ?? 'staff'
    setApprovingId(req.uid)
    try {
      await setDoc(doc(db, 'allowed_users', req.email), {
        email:        req.email,
        role:         chosenRole,
        display_name: req.display_name || undefined,
        active:       true,
        created_at:   new Date().toISOString(),
        created_by:   ADMIN_EMAIL,
        workspace_id: req.uid,  // ogni utente approvato ha il suo archivio isolato
      } satisfies AllowedUser)
      await updateDoc(doc(db, 'access_requests', req.uid), {
        status:      'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: ADMIN_EMAIL,
      })
      await loadAll()
    } finally {
      setApprovingId(null)
    }
  }

  async function handleDeny(req: AccessRequest) {
    if (!confirm(`Negare l'accesso a ${req.display_name} (${req.email})?`)) return
    await updateDoc(doc(db, 'access_requests', req.uid), {
      status:      'denied',
      reviewed_at: new Date().toISOString(),
      reviewed_by: ADMIN_EMAIL,
    })
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const email = form.email.trim().toLowerCase()
    if (!email.includes('@')) { setError('Email non valida'); return }
    if (email === ADMIN_EMAIL) { setError('Questo è già l\'account admin principale'); return }

    setSaving(true)
    try {
      await setDoc(doc(db, 'allowed_users', email), {
        email,
        role:         form.role,
        display_name: form.display_name.trim() || undefined,
        active:       true,
        created_at:   new Date().toISOString(),
        created_by:   ADMIN_EMAIL,
      } satisfies AllowedUser)
      setForm({ email: '', role: 'admin', display_name: '' })
      await loadAll()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(email: string) {
    if (!confirm(`Revocare l'accesso a ${email}?`)) return
    await updateDoc(doc(db, 'allowed_users', email), { active: false })
    await loadAll()
  }

  async function handleRestore(email: string) {
    await updateDoc(doc(db, 'allowed_users', email), { active: true })
    await loadAll()
  }

  if (role !== 'admin') {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Sezione riservata all'amministratore
      </div>
    )
  }

  const activeUsers  = allowedUsers.filter(u => u.active)
  const revokedUsers = allowedUsers.filter(u => !u.active)

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-3 sticky top-0 z-10 flex items-center gap-3">
        <Link href="/settings" className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </Link>
        <div>
          <h1 className="text-base font-bold text-slate-800">Gestione Accessi</h1>
          <p className="text-[11px] text-slate-400">Controlla chi può accedere all'app</p>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 space-y-4 max-w-2xl">

        {/* ── Richieste in attesa ── */}
        {pendingReqs.length > 0 && (
          <div className="bg-white rounded-xl border border-amber-200 p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <h2 className="text-xs font-bold text-slate-700">Richieste di accesso</h2>
              <span className="ml-auto text-[10px] bg-amber-100 text-amber-700 font-black px-2 py-0.5 rounded-full">
                {pendingReqs.length} in attesa
              </span>
            </div>
            <div className="space-y-2">
              {pendingReqs.map(req => (
                <div key={req.uid} className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-200 flex items-center justify-center shrink-0 text-amber-700 text-sm font-black">
                      {req.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{req.display_name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{req.email}</p>
                      {req.message && (
                        <p className="text-[10px] text-slate-500 italic mt-0.5">"{req.message}"</p>
                      )}
                      <p className="text-[9px] text-slate-300 mt-0.5">
                        {format(new Date(req.requested_at), 'd MMM yyyy · HH:mm', { locale: it })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={approveRole[req.uid] ?? 'staff'}
                      onChange={e => setApproveRole(p => ({ ...p, [req.uid]: e.target.value as 'admin' | 'staff' }))}
                      className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-orange-300">
                      <option value="staff">Staff — accesso limitato</option>
                      <option value="admin">Admin — accesso completo</option>
                    </select>
                    <button
                      onClick={() => handleApprove(req)}
                      disabled={approvingId === req.uid}
                      className="flex items-center gap-1 text-[10px] font-bold bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white px-2.5 py-1.5 rounded-lg transition-colors shrink-0">
                      <CheckCircle className="w-3 h-3" />
                      {approvingId === req.uid ? '…' : 'Approva'}
                    </button>
                    <button
                      onClick={() => handleDeny(req)}
                      className="flex items-center gap-1 text-[10px] font-bold bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 px-2.5 py-1.5 rounded-lg transition-colors shrink-0">
                      <XCircle className="w-3 h-3" />
                      Nega
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Admin principale — fisso */}
        <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-3.5 h-3.5 text-amber-500" />
            <h2 className="text-xs font-bold text-slate-700">Amministratore principale</h2>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 bg-amber-50 rounded-xl border border-amber-100">
            <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
              <Crown className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800">{ADMIN_EMAIL}</p>
              <p className="text-[10px] text-amber-600">Accesso completo · non modificabile</p>
            </div>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Admin</span>
          </div>
        </div>

        {/* Staff con login */}
        {staffList.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-3.5 h-3.5 text-orange-500" />
              <h2 className="text-xs font-bold text-slate-700">Staff con accesso</h2>
              <span className="text-[10px] text-slate-400 ml-auto">Gestito da <Link href="/staff" className="text-orange-500 hover:underline">Sezione Staff</Link></span>
            </div>
            <div className="space-y-1">
              {staffList.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-orange-50 rounded-xl border border-orange-100">
                  <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center shrink-0 text-white text-[10px] font-black">
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{s.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{s.login_email}</p>
                  </div>
                  <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full shrink-0">Staff</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Utenti aggiunti manualmente */}
        {activeUsers.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <h2 className="text-xs font-bold text-slate-700">Accessi aggiuntivi</h2>
            </div>
            <div className="space-y-1">
              {activeUsers.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                  <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white text-[10px] font-black',
                    u.role === 'admin' ? 'bg-slate-700' : 'bg-orange-500')}>
                    {(u.display_name || u.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    {u.display_name && <p className="text-xs font-bold text-slate-800 truncate">{u.display_name}</p>}
                    <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                    <p className="text-[9px] text-slate-300">
                      Aggiunto il {format(new Date(u.created_at), 'd MMM yyyy', { locale: it })}
                    </p>
                  </div>
                  <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0',
                    u.role === 'admin' ? 'bg-slate-100 text-slate-700' : 'bg-orange-100 text-orange-700')}>
                    {u.role === 'admin' ? 'Admin' : 'Staff'}
                  </span>
                  <button onClick={() => handleRevoke(u.email)}
                    className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aggiungi nuovo accesso */}
        <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus className="w-3.5 h-3.5 text-orange-500" />
            <h2 className="text-xs font-bold text-slate-700">Aggiungi accesso</h2>
          </div>
          <form onSubmit={handleAdd} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">Email</label>
                <input type="email" required value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="email@esempio.com"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">Nome (opzionale)</label>
                <input type="text" value={form.display_name}
                  onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                  placeholder="Nome cognome"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">Tipo di accesso</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as 'admin' | 'staff' }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                  <option value="admin">Admin — accesso completo</option>
                  <option value="staff">Staff — accesso limitato</option>
                </select>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}
            <button type="submit" disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors">
              <UserPlus className="w-3.5 h-3.5" />
              {saving ? 'Salvataggio…' : 'Aggiungi accesso'}
            </button>
          </form>
        </div>

        {/* Accessi revocati (collassabile) */}
        {revokedUsers.length > 0 && (
          <details className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <summary className="px-3 py-2.5 cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-2 list-none select-none">
              <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-black">{revokedUsers.length}</span>
              Accessi revocati
            </summary>
            <div className="divide-y divide-slate-50 px-3 pb-3">
              {revokedUsers.map(u => (
                <div key={u.id} className="flex items-center gap-3 py-2 opacity-50">
                  <div className="w-7 h-7 rounded-lg bg-slate-300 flex items-center justify-center shrink-0 text-white text-[10px] font-black">
                    {(u.display_name || u.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    {u.display_name && <p className="text-xs font-bold text-slate-600 truncate">{u.display_name}</p>}
                    <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                  </div>
                  <button onClick={() => handleRestore(u.email)}
                    className="text-[10px] font-semibold text-orange-500 hover:text-orange-600 shrink-0">
                    Ripristina
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}

        {loading && (
          <div className="text-center py-4 text-xs text-slate-400">Caricamento…</div>
        )}
      </div>
    </div>
  )
}
