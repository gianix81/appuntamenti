'use client'

import { useAlarmChecker } from '@/hooks/useAlarmChecker'

export function AlarmProvider({ children }: { children: React.ReactNode }) {
  useAlarmChecker()
  return <>{children}</>
}
