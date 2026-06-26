'use client'

import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/client'
import type { Staff } from '@/types/database'
import { ADMIN_EMAIL } from '@/lib/auth/constants'

export type UserRole = 'admin' | 'staff' | 'unauthorized'

export interface UserRoleInfo {
  loading: boolean
  role: UserRole
  staffId: string | null
  staffRecord: (Staff & { id: string }) | null
  userEmail: string | null
}

const INITIAL: UserRoleInfo = {
  loading: true, role: 'admin', staffId: null, staffRecord: null, userEmail: null,
}

export function useUserRole(): UserRoleInfo {
  const [info, setInfo] = useState<UserRoleInfo>(INITIAL)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) {
        setInfo({ loading: false, role: 'admin', staffId: null, staffRecord: null, userEmail: null })
        return
      }

      // Master admin — bypassa tutto
      if (user.email === ADMIN_EMAIL) {
        setInfo({ loading: false, role: 'admin', staffId: null, staffRecord: null, userEmail: user.email })
        return
      }

      try {
        // Controlla se è uno staff registrato
        const staffSnap = await getDocs(query(
          collection(db, 'staff'),
          where('auth_uid', '==', user.uid),
        ))
        if (!staffSnap.empty) {
          const d = staffSnap.docs[0]
          const staffRecord = { id: d.id, ...d.data() } as Staff & { id: string }
          setInfo({ loading: false, role: 'staff', staffId: d.id, staffRecord, userEmail: user.email })
          return
        }

        // Controlla allowed_users per admin aggiuntivi
        if (user.email) {
          const allowedSnap = await getDoc(doc(db, 'allowed_users', user.email))
          if (allowedSnap.exists()) {
            const data = allowedSnap.data()
            if (data.active === true) {
              const role: UserRole = data.role === 'admin' ? 'admin' : 'staff'
              setInfo({ loading: false, role, staffId: null, staffRecord: null, userEmail: user.email })
              return
            }
          }
        }

        // Nessuna corrispondenza → non autorizzato
        setInfo({ loading: false, role: 'unauthorized', staffId: null, staffRecord: null, userEmail: user.email })
      } catch {
        // In caso di errore (es. regole Firestore non ancora aggiornate), nega l'accesso
        setInfo({ loading: false, role: 'unauthorized', staffId: null, staffRecord: null, userEmail: user.email })
      }
    })
    return () => unsub()
  }, [])

  return info
}
