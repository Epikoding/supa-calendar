import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface PresenceUser {
  userId: string
  email: string
  view: 'calendar' | 'gantt' | 'workload' | 'projects' | 'attendance' | 'settings'
  cell: string | null // 캘린더: "projectId:dateKey", 간트: "projectId"
  cellLabel: string | null // "프로젝트 A > 3/20(목)" 또는 "프로젝트 A"
  color: string
}

const PRESENCE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
] as const

const colorCache = new Map<string, string>()

export function hashToColor(userId: string): string {
  const cached = colorCache.get(userId)
  if (cached) return cached
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  const color = PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length]
  colorCache.set(userId, color)
  return color
}

interface PresenceContextValue {
  others: PresenceUser[]
  currentUser: { userId: string; email: string } | null
  trackCell: (view: PresenceUser['view'], cell: string | null, cellLabel?: string | null) => void
}

const PresenceContext = createContext<PresenceContextValue>({
  others: [],
  currentUser: null,
  trackCell: () => {},
})

/**
 * 앱 전체에서 하나의 Presence 채널을 공유하는 Provider.
 * layout.tsx에서 한 번만 사용한다.
 */
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [others, setOthers] = useState<PresenceUser[]>([])
  const [currentUser, setCurrentUser] = useState<{ userId: string; email: string } | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastTrackRef = useRef<{ view: string; cell: string | null; cellLabel: string | null }>({ view: '', cell: null, cellLabel: null })

  useEffect(() => {
    let aborted = false
    let channel: RealtimeChannel | null = null

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || aborted) return

      const userId = user.id
      const email = user.email ?? 'unknown'
      setCurrentUser({ userId, email })

      channel = supabase.channel('presence:app', {
        config: { presence: { key: userId } },
      })

      channel
        .on('presence', { event: 'sync' }, () => {
          if (aborted) return
          const state = channel!.presenceState()
          const users: PresenceUser[] = []
          for (const [key, presences] of Object.entries(state)) {
            if (key === userId) continue
            const p = presences[0] as unknown as PresenceUser
            if (p) users.push(p)
          }
          setOthers(prev => {
            if (prev.length !== users.length) return users
            const changed = users.some((u, i) => {
              const p = prev[i]
              return p.userId !== u.userId || p.view !== u.view || p.cell !== u.cell || p.cellLabel !== u.cellLabel
            })
            return changed ? users : prev
          })
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && !aborted) {
            await channel!.track({
              userId,
              email,
              view: 'calendar',
              cell: null,
              cellLabel: null,
              color: hashToColor(userId),
            })
          }
        })

      if (!aborted) channelRef.current = channel
    }

    init()

    return () => {
      aborted = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const trackCell = useCallback((view: PresenceUser['view'], cell: string | null, cellLabel?: string | null) => {
    if (!channelRef.current || !currentUser) return
    const last = lastTrackRef.current
    if (last.view === view && last.cell === cell && last.cellLabel === (cellLabel ?? null)) return
    lastTrackRef.current = { view, cell, cellLabel: cellLabel ?? null }
    void channelRef.current.track({
      userId: currentUser.userId,
      email: currentUser.email,
      view,
      cell,
      cellLabel: cellLabel ?? null,
      color: hashToColor(currentUser.userId),
    })
  }, [currentUser])

  return (
    <PresenceContext value={{ others, currentUser, trackCell }}>
      {children}
    </PresenceContext>
  )
}

/**
 * Presence 상태를 소비하는 훅.
 * PresenceProvider 하위에서만 사용 가능.
 */
export function usePresence() {
  return useContext(PresenceContext)
}
