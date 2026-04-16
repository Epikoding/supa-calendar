'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { fetchRoles } from '@/lib/queries/masterData'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import type { ProjectRole } from '@/lib/types/role'

interface RolesContextValue {
  roles: ProjectRole[]
}

const RolesContext = createContext<RolesContextValue | null>(null)

/**
 * 앱 전체에서 하나의 role 목록과 Realtime 구독을 공유하는 Provider.
 * layout.tsx(또는 루트 Providers)에서 한 번만 사용한다.
 * - activeOnly=true (기본): 활성 role만 로드
 */
export function RolesProvider({
  children,
  activeOnly = true,
}: {
  children: ReactNode
  activeOnly?: boolean
}) {
  const [roles, setRoles] = useState<ProjectRole[]>([])

  const load = useCallback(async () => {
    try {
      const data = await fetchRoles(undefined, activeOnly)
      setRoles(data)
    } catch (err) {
      console.error('RolesProvider load error:', err)
    }
  }, [activeOnly])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeSync({ onRoleChange: load })

  return <RolesContext.Provider value={{ roles }}>{children}</RolesContext.Provider>
}

/**
 * Context에서 role 목록을 읽는다. RolesProvider 밖에서 호출하면 에러.
 */
export function useRoles(): RolesContextValue {
  const ctx = useContext(RolesContext)
  if (!ctx) throw new Error('useRoles must be used inside RolesProvider')
  return ctx
}
