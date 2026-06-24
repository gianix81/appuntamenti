'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { collection, getDocs, deleteDoc, doc, query, orderBy, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/client'
import type { Staff } from '@/types/database'
import {
  Plus, Pencil, Trash2, Crown, UserCog, KeyRound,
  Calendar, Loader2, X, Eye, EyeOff, ShieldOff, Camera,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { clsx } from 'clsx'

type StaffDoc = Staff & { id: string }

const DAY_LABELS: Record<string, string> = {
  monday: 'Lu', tuesday: 'Ma', wednesday: 'Me', thursday: 'Gi',
  friday: 'Ve', saturday: 'Sa', sunday: 'Do',
}

/* ── Photo avatar with upload ──────────────────────────────── */
function StaffAvatar({
  staff,
  size = 80,
  onPhotoUpdated,
}: {
  staff: StaffDoc
  size?: number
  onPhotoUpdated?: (url: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [localUrl, setLocalUrl]   = useState<string | null>(staff.photo_url ?? null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const storageRef = ref(storage, `staff-photos/${staff.id}`)
      await uploadBytes(storageRef, file, { contentType: file.type })
      const url = await getDownloadURL(storageRef)
      await updateDoc(doc(db, 'staff', staff.id), { photo_url: url })
      setLocalUrl(url)
      onPhotoUpdated?.(url)
    } catch (err) {
      console.error('[photo upload]', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const showPhoto = localUrl && !uploading

  return (
    <div className="relative group" style={{ width: size, height: size }}>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <div
        className="w-full h-full rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer"
        style={!showPhoto ? { backgroundColor: staff.color } : {}}
        onClick={() => fileInputRef.current?.click()}
        title="Clicca per cambiare foto"
      >
        {uploading ? (
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        ) : showPhoto ? (
          <img src={localUrl} alt={staff.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-white font-bold" style={{ fontSize: size * 0.28 }}>{staff.initials}</span>
        )}
      </div>
      {/* Camera overlay on hover */}
      {!uploading && (
        <div
          className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera className="text-white" style={{ width: size * 0.28, height: size * 0.28 }} />
        </div>
      )}
    </div>
  )
}

/* ── Login modal ─────────────────────────────────────────────── */
function CreateLoginModal({
  staff, onClose, onSuccess,
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
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/create-staff-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: staff.id, email: email.trim(), password }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Errore'); return }
      onSuccess(json.uid, email.trim())
    } catch { setError('Errore di rete') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800">Crea accesso per {staff.name}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500 mb-5">L&apos;operatrice potrà accedere all&apos;app con queste credenziali e vedrà solo i propri appuntamenti.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="es. maria@salone.it"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-slate-800" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Password (min. 6 caratteri)</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} required minLength={6} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="password…"
                className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-slate-800" />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Annulla</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Crea accesso
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Revoke modal ────────────────────────────────────────────── */
function RevokeLoginModal({ staff, onClose, onSuccess }: { staff: StaffDoc; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleRevoke() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/create-staff-account', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: staff.id }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Errore'); return }
      onSuccess()
    } catch { setError('Errore di rete') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-slate-800 mb-2">Revocare accesso?</h2>
        <p className="text-sm text-slate-500 mb-1"><strong>{staff.name}</strong> non potrà più accedere all&apos;app.</p>
        <p className="text-xs text-slate-400 mb-1">Email: {staff.login_email}</p>
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Annulla</button>
          <button onClick={handleRevoke} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />} Revoca
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────── */
export default function StaffPage() {
  const [staffList, setStaffList]           = useState<StaffDoc[]>([])
  const [loading, setLoading]               = useState(true)
  const [confirmDelete, setConfirmDelete]   = useState<string | null>(null)
  const [deleting, setDeleting]             = useState(false)
  const [createLoginFor, setCreateLoginFor] = useState<StaffDoc | null>(null)
  const [revokeLoginFor, setRevokeLoginFor] = useState<StaffDoc | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'staff'), orderBy('name')))
      setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() }) as StaffDoc))
    } catch (err) { console.error('[Staff] load:', err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'staff', id))
      setStaffList(prev => prev.filter(s => s.id !== id))
      setConfirmDelete(null)
    } finally { setDeleting(false) }
  }

  const staffToDelete = staffList.find(s => s.id === confirmDelete)

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Staff</h1>
            <p className="text-slate-400 text-xs mt-0.5">{staffList.length} operatric{staffList.length === 1 ? 'e' : 'i'}</p>
          </div>
          <Link href="/staff/new"
            className="flex items-center gap-2 bg-gradient-to-r from-sky-400 to-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-200 hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> Nuova operatrice
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-5">
        {loading ? (
          <LoadingState />
        ) : staffList.length === 0 ? (
          <EmptyState icon={UserCog} title="Nessuna operatrice"
            description="Aggiungi le operatrici del centro per assegnare gli appuntamenti."
            action={
              <Link href="/staff/new"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-sky-400 to-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-200 hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4" /> Aggiungi operatrice
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {staffList.map(s => {
              const workDays = Object.entries(s.schedule ?? {})
                .filter(([, v]) => v !== null)
                .map(([k]) => DAY_LABELS[k] ?? k)
              const hasLogin = !!s.auth_uid
              const icsUrl   = `/api/staff/${s.id}/calendar`

              return (
                <div key={s.id} className={clsx(
                  'bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col overflow-hidden',
                  !s.active && 'opacity-60',
                )}>
                  {/* Top: photo + color accent */}
                  <div className="p-4 flex flex-col items-center gap-3"
                    style={{ background: `linear-gradient(135deg, ${s.color}18, ${s.color}08)` }}>
                    <StaffAvatar
                      staff={s}
                      size={80}
                      onPhotoUpdated={url =>
                        setStaffList(prev => prev.map(st => st.id === s.id ? { ...st, photo_url: url } : st))
                      }
                    />
                    <div className="text-center min-w-0 w-full">
                      <p className="font-bold text-slate-800 truncate">{s.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{s.role}</p>
                      {/* Badges */}
                      <div className="flex items-center justify-center gap-1 mt-1.5 flex-wrap">
                        {s.is_owner && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
                            <Crown className="w-2.5 h-2.5" /> Titolare
                          </span>
                        )}
                        {hasLogin && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                            <KeyRound className="w-2.5 h-2.5" /> Accesso attivo
                          </span>
                        )}
                        {!s.active && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Non attiva</span>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 italic text-center">clicca sulla foto per cambiarla</p>
                  </div>

                  {/* Days */}
                  {workDays.length > 0 && (
                    <div className="px-3 pb-2 flex gap-1 flex-wrap justify-center">
                      {workDays.map(d => (
                        <span key={d} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                          style={{ backgroundColor: `${s.color}20`, color: s.color }}>
                          {d}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Provvigione / login email */}
                  {(s.commission_pct > 0 || (hasLogin && s.login_email)) && (
                    <div className="px-3 pb-2 space-y-0.5">
                      {s.commission_pct > 0 && (
                        <p className="text-[11px] text-slate-400 text-center">Provvigione {s.commission_pct}%</p>
                      )}
                      {hasLogin && s.login_email && (
                        <p className="text-[10px] text-slate-400 truncate text-center" title={s.login_email}>{s.login_email}</p>
                      )}
                    </div>
                  )}

                  {/* Actions footer */}
                  <div className="mt-auto border-t border-slate-50 p-2 space-y-1.5">
                    {/* Edit / Delete */}
                    <div className="flex gap-1">
                      <Link href={`/staff/${s.id}/edit`}
                        className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 px-2 py-1.5 rounded-lg transition-colors">
                        <Pencil className="w-3 h-3" /> Modifica
                      </Link>
                      <button onClick={() => setConfirmDelete(s.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Login / Calendar */}
                    {!hasLogin ? (
                      <button onClick={() => setCreateLoginFor(s)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1.5 rounded-lg transition-colors">
                        <KeyRound className="w-3 h-3" /> Crea accesso app
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <a href={icsUrl} target="_blank" rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-2 py-1.5 rounded-lg transition-colors">
                          <Calendar className="w-3 h-3" /> Calendario
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}${icsUrl}`)
                            alert(`URL copiato!\nIncollalo in Google Calendar → "Aggiungi da URL".`)
                          }}
                          className="flex-1 flex items-center justify-center text-[11px] font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 px-2 py-1.5 rounded-lg transition-colors">
                          Copia URL
                        </button>
                        <button onClick={() => setRevokeLoginFor(s)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <ShieldOff className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modali */}
      {createLoginFor && (
        <CreateLoginModal staff={createLoginFor} onClose={() => setCreateLoginFor(null)}
          onSuccess={(uid, email) => {
            setStaffList(prev => prev.map(s => s.id === createLoginFor.id ? { ...s, auth_uid: uid, login_email: email } : s))
            setCreateLoginFor(null)
          }} />
      )}
      {revokeLoginFor && (
        <RevokeLoginModal staff={revokeLoginFor} onClose={() => setRevokeLoginFor(null)}
          onSuccess={() => {
            setStaffList(prev => prev.map(s => s.id === revokeLoginFor.id ? { ...s, auth_uid: null, login_email: null } : s))
            setRevokeLoginFor(null)
          }} />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="font-bold text-slate-800 mb-2">Eliminare operatrice?</h2>
            <p className="text-sm text-slate-500 mb-1"><strong>{staffToDelete?.name}</strong> verrà rimossa dallo staff.</p>
            <p className="text-xs text-slate-400 mb-5">Gli appuntamenti esistenti rimarranno senza operatrice assegnata.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Annulla</button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {deleting ? 'Eliminando…' : 'Sì, elimina'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
