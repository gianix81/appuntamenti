'use client'

import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useUserRole } from './useUserRole'

export function usePendingRequests(): number {
  const { role } = useUserRole()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (role !== 'admin') return

    const q = query(collection(db, 'access_requests'), where('status', '==', 'pending'))
    const unsub = onSnapshot(q, snap => setCount(snap.size), () => setCount(0))
    return () => unsub()
  }, [role])

  return count
}
