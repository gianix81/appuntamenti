'use client'

import { createContext, useContext } from 'react'
import { useReminderChecker, type CheckResult } from '@/hooks/useReminderChecker'
import { ReminderModal } from '@/components/ui/ReminderModal'

interface ReminderCtx {
  lastResult: CheckResult | null
  forceCheck: () => Promise<CheckResult>
}

const Ctx = createContext<ReminderCtx>({ lastResult: null, forceCheck: async () => ({ ok: false, message: '', found: 0, notified: 0 }) })

export function useReminderContext() { return useContext(Ctx) }

export function ReminderCheckerProvider({ children }: { children: React.ReactNode }) {
  const { lastResult, forceCheck } = useReminderChecker()
  return (
    <Ctx.Provider value={{ lastResult, forceCheck }}>
      {children}
      <ReminderModal />
    </Ctx.Provider>
  )
}
