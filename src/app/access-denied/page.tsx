'use client'

import { useEffect, useState } from 'react'
import { signOut, onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase/client'
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { ShieldOff, Clock, CheckCircle, XCircle, Send } from 'lucide-react'

type RequestStatus = 'none' | 'pending' | 'approved' | 'denied'

export default function AccessDeniedPage() {
  const router = useRouter()
  const [uid,      setUid]      = useState<string | null>(null)
  const [email,    setEmail]    = useState<string | null>(null)
  const [status,   setStatus]   = useState<RequestStatus>('none')
  const [loading,  setLoading]  = useState(true)
  const [name,     setName]     = useState('')
  const [message,  setMessage]  = useState('')
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)

  // Carica utente corrente e stato eventuale richiesta
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { router.replace('/login'); return }
      setUid(user.uid)
      setEmail(user.email)
      setName(user.displayName ?? '')

      const snap = await getDoc(doc(db, 'access_requests', user.uid))
      if (snap.exists()) {
        setStatus(snap.data().status as RequestStatus)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [router])

  // Listener real-time: quando l'admin approva → redirect
  useEffect(() => {
    if (!uid || status === 'none') return

    const unsub = onSnapshot(doc(db, 'access_requests', uid), snap => {
      if (!snap.exists()) return
      const s = snap.data().status as RequestStatus
      setStatus(s)
      if (s === 'approved') {
        // Breve delay per mostrare il messaggio di successo, poi reload
        setTimeout(() => window.location.replace('/'), 2000)
      }
    })
    return () => unsub()
  }, [uid, status])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!uid || !email) return
    setSending(true)
    try {
      await setDoc(doc(db, 'access_requests', uid), {
        uid,
        email,
        display_name: name.trim() || email,
        message:      message.trim() || null,
        status:       'pending',
        requested_at: new Date().toISOString(),
      })
      setStatus('pending')
      setSent(true)
    } finally {
      setSending(false)
    }
  }

  async function handleLogout() {
    await signOut(auth)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-8 max-w-sm w-full">

        {/* ── Approvato ── */}
        {status === 'approved' && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-lg font-black text-slate-800 mb-1">Accesso approvato!</h1>
            <p className="text-slate-400 text-sm">Stai entrando nell'app…</p>
            <div className="mt-4 flex justify-center">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        )}

        {/* ── Negato ── */}
        {status === 'denied' && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-rose-500" />
            </div>
            <h1 className="text-lg font-black text-slate-800 mb-1">Accesso negato</h1>
            <p className="text-slate-500 text-sm mb-6">
              La tua richiesta non è stata approvata. Contatta l'amministratore per maggiori informazioni.
            </p>
            <button onClick={handleLogout}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
              Esci
            </button>
          </div>
        )}

        {/* ── In attesa ── */}
        {status === 'pending' && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-amber-500" />
            </div>
            <h1 className="text-lg font-black text-slate-800 mb-1">Richiesta inviata</h1>
            <p className="text-slate-500 text-sm mb-2">
              La tua richiesta è in attesa di approvazione. Riceverai accesso non appena l'amministratore la conferma.
            </p>
            <p className="text-xs text-slate-400 mb-6">Puoi lasciare aperta questa pagina — si aggiornerà in automatico.</p>
            <div className="flex items-center justify-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              In attesa di approvazione…
            </div>
            <button onClick={handleLogout}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2.5 rounded-xl text-sm transition-colors">
              Esci
            </button>
          </div>
        )}

        {/* ── Form richiesta ── */}
        {status === 'none' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                <ShieldOff className="w-8 h-8 text-blue-500" />
              </div>
              <h1 className="text-lg font-black text-slate-800 mb-1">Accesso richiesto</h1>
              <p className="text-slate-500 text-sm">
                Il tuo account (<span className="font-semibold">{email}</span>) non ha ancora i permessi. Invia una richiesta all'amministratore.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Il tuo nome</label>
                <input type="text" required value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nome e cognome"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Messaggio (opzionale)</label>
                <textarea rows={2} value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Perché vuoi accedere all'app?"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm resize-none" />
              </div>
              <button type="submit" disabled={sending}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                <Send className="w-3.5 h-3.5" />
                {sending ? 'Invio…' : 'Invia richiesta'}
              </button>
            </form>

            <button onClick={handleLogout}
              className="w-full mt-2 text-slate-400 hover:text-slate-600 text-xs py-2 transition-colors">
              Esci con un altro account
            </button>
          </>
        )}
      </div>
    </div>
  )
}
