'use client'

import { useMemo } from 'react'

interface DateColumnLike {
  date: Date
  dateKey: string
}

export interface MonthOffset {
  year: number
  month: number
  offset: number
  width: number
}

/**
 * 가변 너비 기반 날짜 레이아웃 계산 훅.
 * totalWidth, monthOffsets, dateOffsets를 계산한다.
 * CalendarView, WorkloadView에서 공통 사용.
 */
export function useDateLayout(
  dates: DateColumnLike[],
  getDayWidth: (dateKey: string) => number,
) {
  const totalWidth = useMemo(() => {
    let total = 0
    for (const col of dates) total += getDayWidth(col.dateKey)
    return total
  }, [dates, getDayWidth])

  const monthOffsets = useMemo(() => {
    const offsets: MonthOffset[] = []
    let currentMonth = -1
    let currentYear = 0
    let accOffset = 0
    let groupStart = 0
    let groupWidth = 0

    for (const col of dates) {
      const m = col.date.getMonth() + 1
      const y = col.date.getFullYear()
      const w = getDayWidth(col.dateKey)

      if (m !== currentMonth || y !== currentYear) {
        if (currentMonth !== -1) {
          offsets.push({ year: currentYear, month: currentMonth, offset: groupStart, width: groupWidth })
        }
        currentYear = y
        currentMonth = m
        groupStart = accOffset
        groupWidth = 0
      }
      groupWidth += w
      accOffset += w
    }
    if (currentMonth !== -1) {
      offsets.push({ year: currentYear, month: currentMonth, offset: groupStart, width: groupWidth })
    }
    return offsets
  }, [dates, getDayWidth])

  const dateOffsets = useMemo(() => {
    const offsets = new Map<string, number>()
    let acc = 0
    for (const col of dates) {
      offsets.set(col.dateKey, acc)
      acc += getDayWidth(col.dateKey)
    }
    return offsets
  }, [dates, getDayWidth])

  return { totalWidth, monthOffsets, dateOffsets }
}
