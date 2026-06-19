'use client'

import { useReminderChecker } from '@/hooks/useReminderChecker'

export function ReminderCheckerProvider({ children }: { children: React.ReactNode }) {
  useReminderChecker()
  return <>{children}</>
}
