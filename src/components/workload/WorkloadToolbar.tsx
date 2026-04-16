'use client'

import { useCallback } from 'react'
import type { WorkloadViewState } from '@/lib/types/workload'
import { useMonthNavigation } from '@/hooks/useMonthNavigation'
import { PILL_ACTIVE_STYLE, PILL_INACTIVE_STYLE, GLASS_TOOLBAR_STYLE, GLASS_NAV_BTN_STYLE } from '@/lib/styles/toolbar'
import BrandFilter from '@/components/shared/BrandFilter'

interface WorkloadToolbarProps {
  viewState: WorkloadViewState
  onViewStateChange: (state: WorkloadViewState) => void
  brands: { id: number; code: string; name: string; color: string | null }[]
  hideWeekends: boolean
  onHideWeekendsChange: (hide: boolean) => void
  hideEmptyRows: boolean
  onHideEmptyRowsChange: (hide: boolean) => void
  heatmapMode: boolean
  onHeatmapModeChange: (mode: boolean) => void
  autoFit: boolean
  onAutoFitChange: (fit: boolean) => void
  onScrollToToday?: () => void
}

export default function WorkloadToolbar({
  viewState,
  onViewStateChange,
  brands,
  hideWeekends,
  onHideWeekendsChange,
  hideEmptyRows,
  onHideEmptyRowsChange,
  heatmapMode,
  onHeatmapModeChange,
  autoFit,
  onAutoFitChange,
  onScrollToToday,
}: WorkloadToolbarProps) {
  const { year, month, brandFilter } = viewState

  const { goToPrevMonth, goToNextMonth, goToToday } = useMonthNavigation(
    year, month,
    useCallback((y, m) => {
      if (viewState.year === y && viewState.month === m) return
      onViewStateChange({ ...viewState, year: y, month: m })
    }, [viewState, onViewStateChange]),
    onScrollToToday,
  )

  return (
    <div className="relative z-20 flex items-center gap-4 p-3 border-b border-white/70 flex-wrap" style={GLASS_TOOLBAR_STYLE}>
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

      <div className="h-5 w-px bg-black/[0.06]" />

      {/* 브랜드 필터 */}
      <BrandFilter
        brands={brands}
        value={brandFilter ?? null}
        onChange={(next) => onViewStateChange({ ...viewState, brandFilter: next })}
      />

      <div className="h-5 w-px bg-black/[0.06]" />

      {/* 토글 버튼들 */}
      <button
        onClick={() => onHideWeekendsChange(!hideWeekends)}
        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
          hideWeekends
            ? 'text-white border-transparent'
            : 'text-gray-400'
        }`}
        style={hideWeekends ? PILL_ACTIVE_STYLE : PILL_INACTIVE_STYLE}
      >
        주말 숨김
      </button>

      <button
        onClick={() => onHideEmptyRowsChange(!hideEmptyRows)}
        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
          hideEmptyRows
            ? 'text-white border-transparent'
            : 'text-gray-400'
        }`}
        style={hideEmptyRows ? PILL_ACTIVE_STYLE : PILL_INACTIVE_STYLE}
      >
        빈 행 숨김
      </button>

      <button
        onClick={() => onAutoFitChange(!autoFit)}
        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
          autoFit
            ? 'text-white border-transparent'
            : 'text-gray-400'
        }`}
        style={autoFit ? PILL_ACTIVE_STYLE : PILL_INACTIVE_STYLE}
      >
        자동맞춤
      </button>

      <button
        onClick={() => onHeatmapModeChange(!heatmapMode)}
        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
          heatmapMode
            ? 'bg-orange-500 text-white border-orange-500'
            : 'text-gray-400'
        }`}
        style={heatmapMode ? undefined : PILL_INACTIVE_STYLE}
      >
        히트맵
      </button>

    </div>
  )
}
