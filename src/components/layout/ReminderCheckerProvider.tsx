'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { useReminderChecker, runCheck, clearAllNotified, type CheckResult } from '@/hooks/useReminderChecker'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { ReminderModal } from '@/components/ui/ReminderModal'

interface ReminderCtx {
  lastResult: CheckResult | null
  checking: boolean
  forceCheck: () => Promise<CheckResult>
}

const Ctx = createContext<ReminderCtx>({
  lastResult: null,
  checking: false,
  forceCheck: async () => ({ ok: false, message: '', found: 0, notified: 0 }),
})

export function useReminderContext() { return useContext(Ctx) }

export function ReminderCheckerProvider({ children }: { children: React.ReactNode }) {
  useReminderChecker()
  // Auto-registra push subscription ogni volta che l'app è aperta
  const { subscribe } = usePushNotifications()
  useEffect(() => {
    // Se il permesso è già granted, rinnova la subscription (può essere scaduta)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      subscribe().catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [lastResult, setLastResult] = useState<CheckResult | null>(null)
  const [checking, setChecking] = useState(false)

  async function forceCheck() {
    setChecking(true)
    clearAllNotified()
    const result = await runCheck(true)
    setLastResult(result)
    setChecking(false)
    return result
  }

  return (
    <Ctx.Provider value={{ lastResult, checking, forceCheck }}>
      {children}
      <ReminderModal />
    </Ctx.Provider>
  )
}
