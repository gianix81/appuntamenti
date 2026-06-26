'use client'

import { WorkspaceProvider } from '@/contexts/WorkspaceContext'

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <div className="min-h-screen bg-blue-950">
        {children}
      </div>
    </WorkspaceProvider>
  )
}
