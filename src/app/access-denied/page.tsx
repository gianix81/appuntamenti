'use client'

import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'
import { useRouter } from 'next/navigation'
import { ShieldOff } from 'lucide-react'

export default function AccessDeniedPage() {
  const router = useRouter()

  async function handleLogout() {
    await signOut(auth)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-10 max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-5">
          <ShieldOff className="w-8 h-8 text-rose-500" />
        </div>
        <h1 className="text-xl font-black text-slate-800 mb-2">Accesso negato</h1>
        <p className="text-slate-500 text-sm mb-1">
          Il tuo account non ha i permessi per accedere a questa applicazione.
        </p>
        <p className="text-slate-400 text-xs mb-8">
          Contatta l'amministratore per richiedere l'accesso.
        </p>
        <button
          onClick={handleLogout}
          className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          Esci
        </button>
      </div>
    </div>
  )
}
