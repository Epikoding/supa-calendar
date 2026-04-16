import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface RealtimeSyncCallbacks {
  onScheduleChange?: () => void
  onProjectChange?: () => void
  onBrandChange?: () => void
  onMemberChange?: () => void
  onScenarioChange?: () => void
  onKeywordHighlightChange?: () => void
  onRoleChange?: () => void
}

const DEBOUNCE_MS = 300
const SELF_SUPPRESS_MS = 500

/**
 * Supabase Realtime 구독 훅.
 * - 테이블 변경 이벤트를 감지하여 콜백 호출
 * - 디바운스: 300ms 이내 연속 이벤트는 마지막 1회만 실행
 * - 자기 mutation 억제: suppressRealtime() 호출 후 500ms 이내 이벤트 무시
 */
export function useRealtimeSync(callbacks: RealtimeSyncCallbacks) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const suppressUntilRef = useRef<Record<string, number>>({})
  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  // 디바운스된 콜백 호출
  const debouncedCall = useCallback((key: string, fn: (() => void) | undefined) => {
    if (!fn) return
    // 자기 mutation 억제 체크
    const suppressUntil = suppressUntilRef.current[key] ?? 0
    if (Date.now() < suppressUntil) return

    clearTimeout(debounceTimersRef.current[key])
    debounceTimersRef.current[key] = setTimeout(() => {
      // 타이머 실행 시점에도 suppress 재체크 (mutation 후 suppressRealtime 호출 대응)
      const suppressUntilNow = suppressUntilRef.current[key] ?? 0
      if (Date.now() < suppressUntilNow) return
      fn()
    }, DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule' }, () => {
        debouncedCall('schedule', callbacksRef.current.onScheduleChange)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_assignees' }, () => {
        debouncedCall('schedule', callbacksRef.current.onScheduleChange)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        debouncedCall('project', callbacksRef.current.onProjectChange)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, () => {
        debouncedCall('project', callbacksRef.current.onProjectChange)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => {
        debouncedCall('brand', callbacksRef.current.onBrandChange)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => {
        debouncedCall('member', callbacksRef.current.onMemberChange)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scenario_schedules' }, () => {
        debouncedCall('scenario', callbacksRef.current.onScenarioChange)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'keyword_highlights' }, () => {
        debouncedCall('keyword', callbacksRef.current.onKeywordHighlightChange)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_roles' }, () => {
        debouncedCall('role', callbacksRef.current.onRoleChange)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      // 타이머 정리
      for (const timer of Object.values(debounceTimersRef.current)) {
        clearTimeout(timer)
      }
      supabase.removeChannel(channel)
    }
  }, [debouncedCall])

  /**
   * 자기 mutation 직후 호출하여 해당 카테고리의 Realtime 이벤트를 잠시 억제.
   * 이미 직접 refetch 했으므로 Realtime으로 인한 중복 refetch를 방지.
   */
  const suppressRealtime = useCallback((keys: string[]) => {
    const until = Date.now() + SELF_SUPPRESS_MS
    for (const key of keys) {
      suppressUntilRef.current[key] = until
    }
  }, [])

  return { suppressRealtime }
}
