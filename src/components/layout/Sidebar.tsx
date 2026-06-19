'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'
import {
  LayoutDashboard,
  Users,
  Scissors,
  CalendarDays,
  Settings,
  LogOut,
} from 'lucide-react'

const nav = [
  { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/appointments', label: 'Appuntamenti', icon: CalendarDays },
  { href: '/clients',      label: 'Clienti',      icon: Users },
  { href: '/services',     label: 'Servizi',      icon: Scissors },
  { href: '/settings',     label: 'Impostazioni', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await signOut(auth)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen bg-white border-r border-gray-100 py-6 px-3">
      <div className="px-3 mb-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center">
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-800 text-sm leading-tight">Appuntamenti<br/>App</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              pathname.startsWith(href)
                ? 'bg-rose-50 text-rose-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors mt-4"
      >
        <LogOut className="w-4 h-4 shrink-0" />
        Esci
      </button>
    </aside>
  )
}
