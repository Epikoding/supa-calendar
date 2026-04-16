import { useMemo, useCallback } from 'react'
import { formatDateKey, getMonthDates, isWeekend as isWeekendDay } from '@/lib/utils/calendar'

const DEFAULT_DAY_WIDTH = 32
const MONTHS_TO_SHOW = 12

function getMonthRange(year: number, month: number): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = []
  let y = year
  let m = month - 3
  while (m <= 0) { y -= 1; m += 12 }
  for (let i = 0; i < MONTHS_TO_SHOW; i++) {
    result.push({ year: y, month: m })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return result
}

export function useGanttTimeline(year: number, month: number, hideWeekends: boolean, DAY_WIDTH: number = DEFAULT_DAY_WIDTH) {
  const monthRange = useMemo(() => getMonthRange(year, month), [year, month])

  const allDates = useMemo(() => {
    const result: Date[] = []
    for (const m of monthRange) {
      for (const d of getMonthDates(m.year, m.month)) {
        if (hideWeekends && isWeekendDay(d)) continue
        result.push(d)
      }
    }
    return result
  }, [monthRange, hideWeekends])

  const timelineStartDate = useMemo(() => allDates[0], [allDates])

  const monthOffsets = useMemo(() => {
    let offset = 0
    return monthRange.map((m) => {
      const o = offset
      const totalDays = new Date(m.year, m.month, 0).getDate()
      let visibleDays = totalDays
      if (hideWeekends) {
        visibleDays = 0
        for (let d = 1; d <= totalDays; d++) {
          const dow = new Date(m.year, m.month - 1, d).getDay()
          if (dow !== 0 && dow !== 6) visibleDays++
        }
      }
      offset += visibleDays * DAY_WIDTH
      return { ...m, offset: o, width: visibleDays * DAY_WIDTH }
    })
  }, [monthRange, hideWeekends, DAY_WIDTH])

  const totalWidth = allDates.length * DAY_WIDTH

  // 주 구분선 오프셋 (월요일 왼쪽)
  const weekStartOffsets = useMemo(() => {
    const offsets: number[] = []
    for (let i = 0; i < allDates.length; i++) {
      if (allDates[i].getDay() === 1) offsets.push(i * DAY_WIDTH)
    }
    return offsets
  }, [allDates, DAY_WIDTH])

  // 날짜 → allDates 인덱스 매핑
  const dateIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    allDates.forEach((d, i) => map.set(formatDateKey(d), i))
    return map
  }, [allDates])

  // 날짜의 allDates 인덱스를 반환 (숨겨진 주말이면 인접 평일로 스냅)
  const getDateIdx = useCallback((date: Date, snap: 'ceil' | 'floor' = 'ceil'): number | null => {
    const idx = dateIndexMap.get(formatDateKey(date))
    if (idx !== undefined) return idx
    const d = new Date(date)
    const dir = snap === 'ceil' ? 1 : -1
    for (let i = 1; i <= 3; i++) {
      d.setDate(d.getDate() + dir)
      const found = dateIndexMap.get(formatDateKey(d))
      if (found !== undefined) return found
    }
    return null
  }, [dateIndexMap])

  // 날짜 범위 → 바 위치 계산 (공통 헬퍼)
  const calcBarPos = useCallback((start: Date, end: Date): { left: number; width: number } | null => {
    const tlStart = timelineStartDate
    const tlEnd = allDates[allDates.length - 1]
    const visibleStart = start < tlStart ? tlStart : start
    const visibleEnd = end > tlEnd ? tlEnd : end
    if (visibleStart > tlEnd || visibleEnd < tlStart) return null
    const startIdx = getDateIdx(visibleStart, 'ceil')
    const endIdx = getDateIdx(visibleEnd, 'floor')
    if (startIdx === null || endIdx === null || endIdx < startIdx) return null
    return {
      left: startIdx * DAY_WIDTH,
      width: (endIdx - startIdx + 1) * DAY_WIDTH - 4,
    }
  }, [timelineStartDate, allDates, getDateIdx, DAY_WIDTH])

  const addVisibleDays = useCallback((date: Date, days: number): Date => {
    if (!hideWeekends) {
      const d = new Date(date)
      d.setDate(d.getDate() + days)
      return d
    }
    const d = new Date(date)
    let remaining = Math.abs(days)
    const dir = days >= 0 ? 1 : -1
    while (remaining > 0) {
      d.setDate(d.getDate() + dir)
      const dow = d.getDay()
      if (dow !== 0 && dow !== 6) remaining--
    }
    return d
  }, [hideWeekends])

  return {
    monthRange, allDates, timelineStartDate, monthOffsets,
    weekStartOffsets, totalWidth, dateIndexMap,
    getDateIdx, calcBarPos, addVisibleDays,
  }
}
