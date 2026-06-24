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
  Mail,
} from 'lucide-react'
import { useBusinessLevel } from '@/hooks/useBusinessLevel'
import { useUserRole } from '@/hooks/useUserRole'

const NAV_COLORS: Record<string, string> = {
  '/dashboard':    'from-blue-500 to-indigo-600',
  '/appointments': 'from-orange-400 to-rose-500',
  '/clients':      'from-violet-500 to-purple-700',
  '/services':     'from-emerald-400 to-teal-600',
  '/staff':        'from-sky-400 to-blue-600',
  '/reports':      'from-amber-400 to-orange-600',
  '/marketing':    'from-violet-400 to-purple-600',
  '/inventory':    'from-pink-400 to-rose-600',
  '/settings':     'from-slate-400 to-slate-600',
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { hasStaff, hasMarketing, hasWarehouse } = useBusinessLevel()
  const { role, staffRecord } = useUserRole()
  const isStaff = role === 'staff'

  async function handleLogout() {
    await signOut(auth)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const nav = [
    { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard, show: true },
    { href: '/appointments', label: 'Appuntamenti', icon: CalendarDays,    show: true },
    { href: '/clients',      label: 'Clienti',      icon: Users,           show: true },
    { href: '/services',     label: 'Servizi',      icon: Scissors,        show: !isStaff },
    { href: '/staff',        label: 'Staff',        icon: UserCog,         show: hasStaff && !isStaff },
    { href: '/reports',      label: 'Statistiche',  icon: BarChart3,       show: hasMarketing && !isStaff },
    { href: '/marketing',    label: 'Email',        icon: Mail,            show: hasMarketing && !isStaff },
    { href: '/inventory',    label: 'Magazzino',    icon: Package,         show: hasWarehouse && !isStaff },
    { href: '/settings',     label: 'Impostazioni', icon: Settings,        show: true },
  ].filter(item => item.show)

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 border-r border-white/5 py-6 px-3">
      {/* Logo */}
      <div className="px-3 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-900/50">
            <Scissors className="w-5 h-5 text-white" strokeWidth={1.8} />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">Estetista</p>
            <p className="text-white/40 text-xs">
              {isStaff && staffRecord ? staffRecord.name : 'Gestione salone'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          const gradient = NAV_COLORS[href] ?? 'from-slate-500 to-slate-600'
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              )}
            >
              <div className={clsx(
                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br transition-opacity',
                gradient,
                active ? 'opacity-100 shadow-sm' : 'opacity-60',
              )}>
                <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2} />
              </div>
              {label}
              {active && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Divider */}
      <div className="border-t border-white/10 mx-3 my-3" />

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-all"
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br from-slate-500 to-slate-600 opacity-60">
          <LogOut className="w-3.5 h-3.5 text-white" strokeWidth={2} />
        </div>
        Esci
      </button>
    </aside>
  )
}
