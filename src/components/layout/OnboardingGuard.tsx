'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSettings } from '@/contexts/SettingsContext'
import { useUserRole } from '@/hooks/useUserRole'

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { settings, loading: settingsLoading, isAuthenticated, isNewUser } = useSettings()
  const { role, loading: roleLoading } = useUserRole()
  const router = useRouter()

  const loading = settingsLoading || roleLoading

  const needsOnboarding =
    isAuthenticated &&
    !loading &&
    role !== 'unauthorized' &&
    (isNewUser || settings?.onboarding_completed === false)

  const isUnauthorized = isAuthenticated && !loading && role === 'unauthorized'

  useEffect(() => {
    if (isUnauthorized) {
      router.replace('/access-denied')
    } else if (needsOnboarding) {
      router.replace('/onboarding')
    }
  }, [isUnauthorized, needsOnboarding, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isUnauthorized || needsOnboarding) return null

  return <>{children}</>
}
