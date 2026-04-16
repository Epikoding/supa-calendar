'use client'

import { useMemo } from 'react'
import { getMonthDates, formatDateKey, getDayLabel, isWeekend } from '@/lib/utils/calendar'

interface UseDateColumnsOptions {
  year: number
  month: number
  monthsToShow?: number
  hideWeekends?: boolean
  dayWidth: number
}

export interface MonthOffset {
  year: number
  month: number
  offset: number
  width: number
}

export interface DateColumn {
  date: Date
  dateKey: string
  dayLabel: string
  isWeekend: boolean
  isToday: boolean
  isMonday: boolean
  index: number
}

/**
 * 날짜 배열, dateIndexMap, monthOffsets, totalWidth를 계산하는 훅.
 * 간트차트/캘린더/워크로드에서 공통 사용.
 */
export function useDateColumns({
  year,
  month,
  monthsToShow = 1,
  hideWeekends = false,
  dayWidth,
}: UseDateColumnsOptions) {
  const todayKey = formatDateKey(new Date())

  return useMemo(() => {
    const allDates = getMonthDates(year, month, monthsToShow)

    const dates: DateColumn[] = []
    const dateIndexMap = new Map<string, number>()

    let idx = 0
    for (const d of allDates) {
      if (hideWeekends && isWeekend(d)) continue
      const key = formatDateKey(d)
      dates.push({
        date: d,
        dateKey: key,
        dayLabel: getDayLabel(d),
        isWeekend: isWeekend(d),
        isToday: key === todayKey,
        isMonday: d.getDay() === 1,
        index: idx,
      })
      dateIndexMap.set(key, idx)
      idx++
    }

    const totalWidth = dates.length * dayWidth

    // monthOffsets: 월 헤더 렌더링용
    const monthOffsets: MonthOffset[] = []
    let currentMonth = -1
    let currentYear = 0
    let startIdx = 0
    let count = 0

    for (let i = 0; i < dates.length; i++) {
      const col = dates[i]
      const m = col.date.getMonth() + 1
      const y = col.date.getFullYear()
      if (m !== currentMonth || y !== currentYear) {
        if (currentMonth !== -1) {
          monthOffsets.push({
            year: currentYear,
            month: currentMonth,
            offset: startIdx * dayWidth,
            width: count * dayWidth,
          })
        }
        currentYear = y
        currentMonth = m
        startIdx = i
        count = 0
      }
      count++
    }
    if (currentMonth !== -1) {
      monthOffsets.push({
        year: currentYear,
        month: currentMonth,
        offset: startIdx * dayWidth,
        width: count * dayWidth,
      })
    }

    return { dates, dateIndexMap, totalWidth, monthOffsets }
  }, [year, month, monthsToShow, hideWeekends, dayWidth, todayKey])
}
