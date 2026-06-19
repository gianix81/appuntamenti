'use client'

import { useReminderChecker } from '@/hooks/useReminderChecker'
import { ReminderModal } from '@/components/ui/ReminderModal'

export function ReminderCheckerProvider({ children }: { children: React.ReactNode }) {
  useReminderChecker()
  return (
    <>
      {children}
      <ReminderModal />
    </>
  )
}
