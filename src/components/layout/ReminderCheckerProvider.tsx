'use client'

import { createContext, useContext, useState } from 'react'
import { useReminderChecker, runCheck, clearAllNotified, type CheckResult } from '@/hooks/useReminderChecker'
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
