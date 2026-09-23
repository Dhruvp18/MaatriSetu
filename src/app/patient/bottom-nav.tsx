'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Info, MessageSquare } from 'lucide-react'

const navItems = [
  { href: '/patient', label: 'My ANC', icon: Home, activeColor: 'text-[#b84c63]', activeBg: 'bg-rose-50' },
  { href: '/patient/info', label: 'Information', icon: Info, activeColor: 'text-[#456b9c]', activeBg: 'bg-blue-50' },
  { href: '/patient/chat', label: 'Message Us', icon: MessageSquare, activeColor: 'text-[#5c4a9c]', activeBg: 'bg-purple-50' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 w-full bg-white border-t border-slate-100 flex items-center justify-around py-2 px-4 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.08)] z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0.5rem)' }}
    >
      {navItems.map(({ href, label, icon: Icon, activeColor, activeBg }) => {
        const isActive = pathname === href || (href !== '/patient' && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href as any}
            className={`flex flex-col items-center p-2 rounded-xl transition-all duration-200 ${
              isActive ? `${activeColor} ${activeBg}` : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Icon className="w-6 h-6 mb-1" strokeWidth={isActive ? 2.5 : 1.5} />
            <span className={`text-[10px] font-medium tracking-wide ${isActive ? 'font-bold' : ''}`}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
