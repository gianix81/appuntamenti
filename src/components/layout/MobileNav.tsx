'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { LayoutDashboard, Users, Scissors, CalendarDays, Settings, UserCog, LogOut } from 'lucide-react'
import { useBusinessLevel } from '@/hooks/useBusinessLevel'
import { useUserRole } from '@/hooks/useUserRole'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'

const ACTIVE_COLORS: Record<string, string> = {
  '/dashboard':    'text-orange-500',
  '/appointments': 'text-rose-500',
  '/clients':      'text-purple-600',
  '/services':     'text-teal-600',
  '/staff':        'text-sky-600',
  '/settings':     'text-slate-600',
}

const ACTIVE_BG: Record<string, string> = {
  '/dashboard':    'bg-orange-50',
  '/appointments': 'bg-rose-50',
  '/clients':      'bg-purple-50',
  '/services':     'bg-teal-50',
  '/staff':        'bg-sky-50',
  '/settings':     'bg-slate-100',
}

export function MobileNav() {
  const pathname = usePathname()
  const router   = useRouter()
  const { hasStaff } = useBusinessLevel()
  const { role } = useUserRole()
  const isStaff = role === 'staff'

  async function handleLogout() {
    await signOut(auth)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const nav = [
    { href: '/dashboard',    label: 'Home',    icon: LayoutDashboard, show: true },
    { href: '/appointments', label: 'Agenda',  icon: CalendarDays,    show: true },
    { href: '/clients',      label: 'Clienti', icon: Users,           show: true },
    { href: '/staff',        label: 'Staff',   icon: UserCog,         show: hasStaff && !isStaff },
    { href: '/services',     label: 'Servizi', icon: Scissors,        show: !hasStaff && !isStaff },
    { href: '/settings',     label: 'Menu',    icon: Settings,        show: true },
  ].filter(item => item.show)

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-t border-slate-200/80 flex">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors"
          >
            <div className={clsx(
              'w-8 h-8 rounded-xl flex items-center justify-center transition-all',
              active ? (ACTIVE_BG[href] ?? 'bg-slate-100') : 'bg-transparent',
            )}>
              <Icon
                className={clsx('transition-colors', active ? (ACTIVE_COLORS[href] ?? 'text-orange-500') : 'text-slate-400')}
                style={{ width: '18px', height: '18px' }}
              />
            </div>
            <span className={clsx('text-[10px] font-semibold',
              active ? (ACTIVE_COLORS[href] ?? 'text-orange-500') : 'text-slate-400')}>
              {label}
            </span>
          </Link>
        )
      })}
      {/* Logout — rosso e distinto */}
      <button
        onClick={handleLogout}
        className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors group"
      >
        <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center group-active:bg-red-100 transition-colors">
          <LogOut className="text-red-500" style={{ width: '18px', height: '18px' }} />
        </div>
        <span className="text-[10px] font-bold text-red-500">Esci</span>
      </button>
    </nav>
  )
}
