'use client'

import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/client'
import type { Staff } from '@/types/database'

export type UserRole = 'admin' | 'staff'

export interface UserRoleInfo {
  loading: boolean
  role: UserRole
  staffId: string | null
  staffRecord: (Staff & { id: string }) | null
}

const INITIAL: UserRoleInfo = { loading: true, role: 'admin', staffId: null, staffRecord: null }

export function useUserRole(): UserRoleInfo {
  const [info, setInfo] = useState<UserRoleInfo>(INITIAL)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) {
        setInfo({ loading: false, role: 'admin', staffId: null, staffRecord: null })
        return
      }
      try {
        const snap = await getDocs(query(
          collection(db, 'staff'),
          where('auth_uid', '==', user.uid),
        ))
        if (!snap.empty) {
          const d = snap.docs[0]
          const staffRecord = { id: d.id, ...d.data() } as Staff & { id: string }
          setInfo({ loading: false, role: 'staff', staffId: d.id, staffRecord })
        } else {
          setInfo({ loading: false, role: 'admin', staffId: null, staffRecord: null })
        }
      } catch {
        setInfo({ loading: false, role: 'admin', staffId: null, staffRecord: null })
      }
    })
    return () => unsub()
  }, [])

  return info
}
