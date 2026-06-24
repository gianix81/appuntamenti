import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { AlarmProvider } from './AlarmProvider'
import { OnboardingGuard } from './OnboardingGuard'
import { SettingsProvider } from '@/contexts/SettingsContext'

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <OnboardingGuard>
        <AlarmProvider>
          <div className="flex h-screen overflow-hidden bg-slate-50">
            <Sidebar />
            <main className="flex-1 flex flex-col pb-16 md:pb-0">
              {children}
            </main>
            <MobileNav />
          </div>
        </AlarmProvider>
      </OnboardingGuard>
    </SettingsProvider>
  )
}
