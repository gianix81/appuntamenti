'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSettings } from '@/contexts/SettingsContext'

/**
 * Protegge le pagine dell'app: se l'utente è loggato ma non ha
 * completato l'onboarding, lo manda a /onboarding.
 *
 * Regole:
 * - isNewUser (no doc settings) → /onboarding
 * - settings.onboarding_completed === false → /onboarding
 * - settings esiste ma onboarding_completed è undefined (utente pre-feature) → passa
 * - settings.onboarding_completed === true → passa
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { settings, loading, isAuthenticated, isNewUser } = useSettings()
  const router = useRouter()

  const needsOnboarding =
    isAuthenticated &&
    !loading &&
    (isNewUser || settings?.onboarding_completed === false)

  useEffect(() => {
    if (needsOnboarding) {
      router.replace('/onboarding')
    }
  }, [needsOnboarding, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (needsOnboarding) return null

  return <>{children}</>
}
