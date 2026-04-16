import { ReactNode } from 'react'
import { KOREAN_DAYS } from '@/lib/utils/calendar'
const MONTH_HEADER_HEIGHT = 24
const DAY_HEADER_HEIGHT = 28
export const DATE_HEADER_HEIGHT = MONTH_HEADER_HEIGHT + DAY_HEADER_HEIGHT

interface MonthOffset {
  year: number
  month: number
  offset: number
  width: number
}

interface DateHeaderDate {
  date: Date
  dateKey: string
  isWeekend: boolean
  isToday: boolean
}

interface DateHeaderProps {
  dates: DateHeaderDate[]
  monthOffsets: MonthOffset[]
  totalWidth: number
  getDayWidth: (dateKey: string) => number
  /** 현재 월 하이라이트 (간트 차트에서 사용) */
  currentYear?: number
  currentMonth?: number
  /** 날짜+요일을 한 줄로 표시 (기본: 2줄) */
  inlineDayLabel?: boolean
  /** 일 헤더 셀에 추가 요소 렌더링 (캘린더뷰 출하 도트 등) */
  renderDayExtra?: (dateKey: string) => ReactNode
}

export default function DateHeader({
  dates,
  monthOffsets,
  totalWidth,
  getDayWidth,
  currentYear,
  currentMonth,
  inlineDayLabel = false,
  renderDayExtra,
}: DateHeaderProps) {
  return (
    <div
      className="sticky top-0 z-10"
      style={{ height: DATE_HEADER_HEIGHT, background: '#f8fafc', borderBottom: '1px solid rgba(0,0,0,0.06)', width: totalWidth }}
    >
      {/* 월 헤더 */}
      <div className="relative" style={{ height: MONTH_HEADER_HEIGHT }}>
        {monthOffsets.map((m) => {
          const isCurrent = currentYear !== undefined && m.year === currentYear && m.month === currentMonth
          return (
            <div
              key={`${m.year}-${m.month}`}
              className={`flex items-center justify-center text-xs font-medium border-r border-black/[0.04] absolute ${isCurrent ? 'bg-[var(--color-primary)]/[0.04] text-[var(--color-primary)]' : 'text-gray-500'}`}
              style={{ width: m.width, left: m.offset, height: MONTH_HEADER_HEIGHT }}
            >
              {m.year}년 {m.month}월
            </div>
          )
        })}
      </div>
      {/* 일 헤더 */}
      <div className="flex" style={{ height: DAY_HEADER_HEIGHT, position: 'absolute', top: MONTH_HEADER_HEIGHT }}>
        {dates.map((col) => {
          const dayOfWeek = col.date.getDay()
          const isFirstOfMonth = col.date.getDate() === 1
          const isFirstOfYear = isFirstOfMonth && col.date.getMonth() === 0
          const isMonday = dayOfWeek === 1
          const borderClass = isFirstOfYear
            ? 'border-l-[3px] border-gray-600'
            : isFirstOfMonth
              ? 'border-l-2 border-gray-400'
              : isMonday
                ? 'border-l border-gray-400'
                : 'border-r border-gray-300'
          return (
            <div
              key={col.dateKey}
              data-header-dk={col.dateKey}
              className={`flex flex-col items-center justify-center text-[10px] leading-tight flex-shrink-0 ${borderClass} ${
                col.isToday
                  ? 'bg-[var(--color-primary)]/[0.06] font-bold text-[var(--color-primary)]'
                  : col.isWeekend
                    ? 'text-red-400'
                    : 'text-gray-400'
              }`}
              style={{ width: getDayWidth(col.dateKey), flexShrink: 0 }}
            >
              <div className="flex items-center gap-1">
                {inlineDayLabel ? (
                  <span>{col.date.getDate()}({KOREAN_DAYS[dayOfWeek]})</span>
                ) : (
                  <div className="flex flex-col items-center">
                    <span>{col.date.getDate()}</span>
                    <span>{KOREAN_DAYS[dayOfWeek]}</span>
                  </div>
                )}
                {renderDayExtra?.(col.dateKey)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
