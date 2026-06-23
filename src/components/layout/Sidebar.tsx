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
  UserCog,
  BarChart3,
  Package,
} from 'lucide-react'
import { useBusinessLevel } from '@/hooks/useBusinessLevel'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { hasStaff, hasMarketing, hasWarehouse } = useBusinessLevel()

  async function handleLogout() {
    await signOut(auth)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const nav = [
    { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard, show: true },
    { href: '/appointments', label: 'Appuntamenti', icon: CalendarDays,    show: true },
    { href: '/clients',      label: 'Clienti',      icon: Users,           show: true },
    { href: '/services',     label: 'Servizi',      icon: Scissors,        show: true },
    { href: '/staff',        label: 'Staff',        icon: UserCog,         show: hasStaff },
    { href: '/reports',      label: 'Statistiche',  icon: BarChart3,       show: hasMarketing },
    { href: '/inventory',    label: 'Magazzino',    icon: Package,         show: hasWarehouse },
    { href: '/settings',     label: 'Impostazioni', icon: Settings,        show: true },
  ].filter(item => item.show)

  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen bg-blue-950 border-r border-blue-900 py-6 px-3">
      <div className="px-3 mb-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-400 flex items-center justify-center">
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-sm leading-tight">Appuntamenti<br/>App</span>
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
                ? 'bg-white/10 text-white'
                : 'text-blue-200 hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-blue-300 hover:bg-white/10 hover:text-white transition-colors mt-4"
      >
        <LogOut className="w-4 h-4 shrink-0" />
        Esci
      </button>
    </aside>
  )
}
