'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/client'
import { ADMIN_EMAIL } from '@/lib/auth/constants'

interface WorkspaceContextValue {
  /** null = master admin (usa flat collections); stringa = uid workspace */
  workspaceId: string | null
  loading: boolean
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaceId: null,
  loading: true,
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user || user.email === ADMIN_EMAIL) {
        setWorkspaceId(null)
        setLoading(false)
        return
      }
      try {
        const snap = await getDoc(doc(db, 'allowed_users', user.email!))
        if (snap.exists() && snap.data().workspace_id) {
          setWorkspaceId(snap.data().workspace_id as string)
        } else {
          // Fallback: usa l'uid dell'utente come workspace
          setWorkspaceId(user.uid)
        }
      } catch {
        setWorkspaceId(user.uid)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return (
    <WorkspaceContext.Provider value={{ workspaceId, loading }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
