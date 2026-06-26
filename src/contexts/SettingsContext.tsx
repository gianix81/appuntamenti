'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebase/client'
import { useWorkspace } from './WorkspaceContext'
import { wsDoc } from '@/lib/firebase/workspace'
import type { Settings } from '@/types/database'

interface SettingsContextValue {
  settings: Settings | null
  loading: boolean
  isAuthenticated: boolean
  /** true quando l'utente è loggato ma non ha ancora settings/main */
  isNewUser: boolean
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: null,
  loading: true,
  isAuthenticated: false,
  isNewUser: false,
})

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isNewUser, setIsNewUser] = useState(false)

  const { workspaceId, loading: workspaceLoading } = useWorkspace()

  useEffect(() => {
    // Aspetta che il workspace sia risolto prima di sottoscrivere le settings
    if (workspaceLoading) {
      setLoading(true)
      return
    }

    let unsubSnap: (() => void) | undefined

    const unsubAuth = onAuthStateChanged(auth, user => {
      unsubSnap?.()
      unsubSnap = undefined

      if (!user) {
        setIsAuthenticated(false)
        setIsNewUser(false)
        setSettings(null)
        setLoading(false)
        return
      }

      setIsAuthenticated(true)
      const ref = wsDoc(db, workspaceId, 'settings', 'main')

      unsubSnap = onSnapshot(
        ref,
        snap => {
          if (snap.exists()) {
            setSettings({ id: snap.id, ...snap.data() } as Settings)
            setIsNewUser(false)
          } else {
            setSettings(null)
            setIsNewUser(true)
          }
          setLoading(false)
        },
        () => {
          setLoading(false)
        },
      )
    })

    return () => {
      unsubAuth()
      unsubSnap?.()
    }
  }, [workspaceId, workspaceLoading])

  return (
    <SettingsContext.Provider value={{ settings, loading, isAuthenticated, isNewUser }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
