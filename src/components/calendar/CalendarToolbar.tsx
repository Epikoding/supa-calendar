'use client'

import { useCallback } from 'react'
import type { CalendarViewState } from '@/lib/types/calendar'
import { useMonthNavigation } from '@/hooks/useMonthNavigation'
import { STATUS_OPTIONS } from '@/lib/constants/project'
import { PILL_ACTIVE_STYLE, PILL_INACTIVE_STYLE, GLASS_TOOLBAR_STYLE, GLASS_NAV_BTN_STYLE, getStatusPillStyle } from '@/lib/styles/toolbar'
import BrandFilter from '@/components/shared/BrandFilter'

interface CalendarToolbarProps {
  viewState: CalendarViewState
  onViewStateChange: (state: CalendarViewState) => void
  brands: { id: number; code: string; name: string; color: string | null }[]
  columnWidth: number
  onColumnWidthChange: (width: number) => void
  autoFit: boolean
  onAutoFitChange: (autoFit: boolean) => void
  hideEmptyRows: boolean
  onHideEmptyRowsChange: (hide: boolean) => void
  hideWeekends: boolean
  onHideWeekendsChange: (hide: boolean) => void
  onScrollToToday?: () => void
}

export default function CalendarToolbar({
  viewState,
  onViewStateChange,
  brands,
  columnWidth,
  onColumnWidthChange,
  autoFit,
  onAutoFitChange,
  hideEmptyRows,
  onHideEmptyRowsChange,
  hideWeekends,
  onHideWeekendsChange,
  onScrollToToday,
}: CalendarToolbarProps) {
  const { year, month, statusFilter, brandFilter } = viewState

  const { goToPrevMonth, goToNextMonth, goToToday } = useMonthNavigation(
    year, month,
    useCallback((y, m) => {
      if (viewState.year === y && viewState.month === m) return
      onViewStateChange({ ...viewState, year: y, month: m })
    }, [viewState, onViewStateChange]),
    onScrollToToday,
  )

  const toggleStatus = useCallback(
    (status: (typeof STATUS_OPTIONS)[number]) => {
      const current = statusFilter ?? []
      const isActive = current.includes(status)

      if (isActive) {
        const next = current.filter((s) => s !== status)
        onViewStateChange({ ...viewState, statusFilter: next })
      } else {
        onViewStateChange({ ...viewState, statusFilter: [...current, status] })
      }
    },
    [viewState, statusFilter, onViewStateChange]
  )

  const isStatusActive = (status: (typeof STATUS_OPTIONS)[number]) => {
    const current = statusFilter ?? []
    return current.includes(status)
  }

  return (
    <div className="relative z-20 flex items-center gap-4 p-3 border-b border-white/70" style={GLASS_TOOLBAR_STYLE}>
      {/* 월 네비게이션 */}
      <div className="flex items-center gap-1">
        <button
          onClick={goToPrevMonth}
          className="px-2 py-1 rounded-lg text-sm text-gray-400 hover:text-blue-700 transition-all"
          style={GLASS_NAV_BTN_STYLE}
          aria-label="이전 달"
        >
          &lt;
        </button>
        <span className="text-sm font-semibold min-w-[100px] text-center text-gray-800">
          {year}년 {month}월
        </span>
        <button
          onClick={goToNextMonth}
          className="px-2 py-1 rounded-lg text-sm text-gray-400 hover:text-blue-700 transition-all"
          style={GLASS_NAV_BTN_STYLE}
          aria-label="다음 달"
        >
          &gt;
        </button>
        <button
          onClick={goToToday}
          className="ml-1 px-2.5 py-1 rounded-lg text-sm text-gray-400 hover:text-blue-700 transition-all"
          style={GLASS_NAV_BTN_STYLE}
        >
          오늘
        </button>
      </div>

      {/* 구분선 */}
      <div className="h-5 w-px bg-black/[0.06]" />

      {/* 상태 필터 */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 mr-0.5">상태</span>
        {STATUS_OPTIONS.map((status) => {
          const active = isStatusActive(status)
          return (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
              style={getStatusPillStyle(status, active)}
            >
              {status}
            </button>
          )
        })}
      </div>

      {/* 구분선 */}
      <div className="h-5 w-px bg-black/[0.06]" />

      {/* 브랜드 필터 */}
      <BrandFilter
        brands={brands}
        value={brandFilter ?? null}
        onChange={(next) => onViewStateChange({ ...viewState, brandFilter: next })}
      />

      {/* 구분선 */}
      <div className="h-5 w-px bg-black/[0.06]" />

      {/* 셀 폭 */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 mr-0.5">셀 폭</span>
        <input
          type="number"
          value={columnWidth}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (v >= 40 && v <= 300) onColumnWidthChange(v)
          }}
          min={40}
          max={300}
          step={10}
          disabled={autoFit}
          className={`w-16 text-sm text-center border border-black/[0.05] rounded px-1 py-1 bg-white/60 text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 ${autoFit ? 'opacity-40' : ''}`}
        />
        <button
          onClick={() => onAutoFitChange(!autoFit)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            autoFit
              ? 'text-white border-transparent'
              : 'text-gray-400 hover:text-blue-800'
          }`}
          style={autoFit ? PILL_ACTIVE_STYLE : PILL_INACTIVE_STYLE}
        >
          자동 맞춤
        </button>
      </div>

      {/* 구분선 */}
      <div className="h-5 w-px bg-black/[0.06]" />

      {/* 주말 숨김 */}
      <button
        onClick={() => onHideWeekendsChange(!hideWeekends)}
        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
          hideWeekends
            ? 'text-white border-transparent'
            : 'text-gray-400 hover:text-blue-800'
        }`}
        style={hideWeekends ? PILL_ACTIVE_STYLE : PILL_INACTIVE_STYLE}
      >
        주말 숨김
      </button>

      {/* 빈 행 숨기기 */}
      <button
        onClick={() => onHideEmptyRowsChange(!hideEmptyRows)}
        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
          hideEmptyRows
            ? 'text-white border-transparent'
            : 'text-gray-400 hover:text-blue-800'
        }`}
        style={hideEmptyRows ? PILL_ACTIVE_STYLE : PILL_INACTIVE_STYLE}
      >
        빈 행 숨김
      </button>


    </div>
  )
}
