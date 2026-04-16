'use client'

import { useCallback, useEffect, useRef } from 'react'
import { formatDateKey } from '@/lib/utils/calendar'

interface UseScrollToTodayOptions {
  scrollRef: React.RefObject<HTMLDivElement | null>
  dateOffsets: Map<string, number>
  labelWidth: number
  viewYear: number
  viewMonth: number
  onNavigateToToday: () => void
  dataLoaded: boolean
}

/**
 * "오늘" 버튼 스크롤 + 초기 로드 스크롤 + 월 변경 후 스크롤을 공통화한 훅.
 * CalendarView, WorkloadView에서 사용.
 */
export function useScrollToToday({
  scrollRef,
  dateOffsets,
  labelWidth,
  viewYear,
  viewMonth,
  onNavigateToToday,
  dataLoaded,
}: UseScrollToTodayOptions) {
  const pendingRef = useRef(false)

  const scrollImmediate = useCallback(() => {
    const todayKey = formatDateKey(new Date())
    const offset = dateOffsets.get(todayKey)
    if (offset !== undefined && scrollRef.current) {
      const visibleWidth = scrollRef.current.clientWidth - labelWidth
      scrollRef.current.scrollLeft = offset - labelWidth - visibleWidth / 2
    }
  }, [dateOffsets, labelWidth, scrollRef])

  const handleScrollToToday = useCallback(() => {
    const now = new Date()
    const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth() + 1
    if (isCurrentMonth) {
      scrollImmediate()
    } else {
      pendingRef.current = true
      onNavigateToToday()
    }
  }, [viewYear, viewMonth, scrollImmediate, onNavigateToToday])

  // 월 변경 후 오늘 스크롤
  useEffect(() => {
    if (!pendingRef.current) return
    pendingRef.current = false
    const timer = setTimeout(() => scrollImmediate(), 100)
    return () => clearTimeout(timer)
  }, [viewYear, viewMonth, scrollImmediate])

  // 초기 로드 시 오늘로 스크롤
  useEffect(() => {
    if (dataLoaded) {
      const timer = setTimeout(() => scrollImmediate(), 200)
      return () => clearTimeout(timer)
    }
  }, [dataLoaded]) // eslint-disable-line react-hooks/exhaustive-deps -- 초기 1회만 실행. scrollImmediate 포함 시 dateOffsets 변경마다 재스크롤됨

  return { handleScrollToToday, scrollImmediate }
}
