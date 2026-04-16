'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { usePresence } from '@/hooks/usePresence'
import { useClickOutside } from '@/hooks/useClickOutside'
import { GLASS_NAV_STYLE } from '@/lib/styles/toolbar'
import { APP_NAME } from '@/lib/config'
import { primaryGradient, primaryAlpha, primaryTextGradientStyle } from '@/lib/colors'

const navItems = [
  { href: '/gantt', label: '간트 차트' },
  { href: '/calendar', label: '캘린더뷰' },
  { href: '/workload', label: '워크로드' },
  { href: '/projects', label: '프로젝트 관리' },
  { href: '/attendance', label: '출근' },
  { href: '/settings', label: '설정' },
]

export function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { others } = usePresence()
  const [popoverUserId, setPopoverUserId] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  useClickOutside(popoverRef, popoverUserId !== null, () => setPopoverUserId(null))

  useEffect(() => {
    if (popoverUserId && !others.some(u => u.userId === popoverUserId)) {
      setPopoverUserId(null)
    }
  }, [others, popoverUserId])

  const getViewLabel = (view: string) => {
    const item = navItems.find(n => n.href === '/' + view)
    return item?.label ?? view
  }

  if (pathname === '/login') return null

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav
      className="relative z-50 flex items-center gap-1.5 px-5 py-2.5"
      style={GLASS_NAV_STYLE}
    >
      <span
        className="font-bold text-[15px] mr-5"
        style={primaryTextGradientStyle}
      >
        {APP_NAME}
      </span>
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <a
            key={item.href}
            href={item.href}
            className={
              isActive
                ? 'px-3.5 py-1.5 rounded-[10px] text-[13px] font-medium text-white transition-all'
                : 'px-3.5 py-1.5 rounded-[10px] text-[13px] font-medium text-gray-400 hover:text-blue-800 hover:bg-blue-50/50 transition-all'
            }
            style={
              isActive
                ? {
                    background: primaryGradient,
                    boxShadow: `0 2px 8px ${primaryAlpha(0.25)}`,
                  }
                : undefined
            }
          >
            {item.label}
          </a>
        )
      })}
      <div className="ml-auto flex items-center gap-2">
        <div ref={popoverRef} className="relative flex items-center -space-x-1.5">
          {others.map((u) => (
            <div
              key={u.userId}
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold cursor-pointer"
              style={{
                backgroundColor: u.color,
                border: '2px solid rgba(255,255,255,0.9)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
              title={u.email}
              onClick={() => setPopoverUserId(prev => prev === u.userId ? null : u.userId)}
            >
              {(u.email[0] ?? '?').toUpperCase()}
            </div>
          ))}
          {popoverUserId && (() => {
            const u = others.find(o => o.userId === popoverUserId)
            if (!u) return null
            const isSameView = pathname === '/' + u.view || pathname.startsWith('/' + u.view + '/')
            return (
              <div
                className="absolute top-full right-0 mt-2 z-50 min-w-[200px] rounded-xl px-4 py-3 text-sm shadow-lg border border-white/20"
                style={{
                  background: 'rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <div className="font-medium text-gray-800 truncate">{u.email}</div>
                <div className="mt-1 text-gray-500">{getViewLabel(u.view)}</div>
                {u.cellLabel && (
                  <div className="mt-0.5 text-gray-600 font-medium">{u.cellLabel}</div>
                )}
                {!isSameView && (
                  <button
                    className="mt-2 w-full text-center text-xs font-medium text-blue-600 hover:text-blue-800 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                    onClick={() => {
                      router.push('/' + u.view)
                      setPopoverUserId(null)
                    }}
                  >
                    이동 →
                  </button>
                )}
              </div>
            )
          })()}
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-blue-800 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </nav>
  )
}
