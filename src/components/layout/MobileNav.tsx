'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import { LayoutDashboard, Users, Scissors, CalendarDays, Settings } from 'lucide-react'

const nav = [
  { href: '/dashboard',    label: 'Home',         icon: LayoutDashboard },
  { href: '/appointments', label: 'Agenda',       icon: CalendarDays },
  { href: '/clients',      label: 'Clienti',      icon: Users },
  { href: '/services',     label: 'Servizi',      icon: Scissors },
  { href: '/settings',     label: 'Settings',     icon: Settings },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 flex">
      {nav.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={clsx(
            'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors',
            pathname.startsWith(href)
              ? 'text-blue-600'
              : 'text-slate-400 hover:text-slate-600'
          )}
        >
          <Icon className="w-5 h-5" />
          {label}
        </Link>
      ))}
    </nav>
  )
}
