'use client'

import { useState, useEffect } from 'react'
import { exportGanttPng } from '@/lib/export/gantt-png'
import { exportGanttExcel } from '@/lib/export/gantt-excel'
import type { GanttTask } from '@/lib/types/gantt'
import { formatDateKey } from '@/lib/utils/calendar'
import { primaryGradient } from '@/lib/colors'
import { useRoles } from '@/hooks/useRoles'

interface GanttExportDialogProps {
  open: boolean
  onClose: () => void
  tasks: GanttTask[]
  chartRef: React.RefObject<HTMLElement | null>
  year: number
  month: number
  scenariosVisible: boolean
  /** 타임라인에 표시 중인 전체 날짜 배열 */
  allDates: Date[]
  /** dateKey → 컬럼 인덱스 */
  dateIndexMap: Map<string, number>
  dayWidth: number
}

/** 월의 첫째 날 (YYYY-MM-DD) */
function firstDayOfMonth(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/** 월의 마지막 날 (YYYY-MM-DD) */
function lastDayOfMonth(y: number, m: number): string {
  const d = new Date(y, m, 0).getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function GanttExportDialog({
  open,
  onClose,
  tasks,
  chartRef,
  year,
  month,
  scenariosVisible,
  allDates,
  dateIndexMap,
  dayWidth,
}: GanttExportDialogProps) {
  const [format, setFormat] = useState<'png' | 'excel'>('png')
  const [exporting, setExporting] = useState(false)
  const [dateStart, setDateStart] = useState(firstDayOfMonth(year, month))
  const [dateEnd, setDateEnd] = useState(lastDayOfMonth(year, month))
  const { roles } = useRoles()

  useEffect(() => {
    if (open) {
      setDateStart(firstDayOfMonth(year, month))
      setDateEnd(lastDayOfMonth(year, month))
    }
  }, [open, year, month])

  if (!open) return null

  const monthStr = String(month).padStart(2, '0')
  const fileName = format === 'png'
    ? `간트차트_${year}-${monthStr}.png`
    : `간트차트_${year}-${monthStr}.xlsx`

  /** 날짜 범위에 해당하는 타임라인 픽셀 범위 계산 */
  function calcCropPixels(): { startX: number; endX: number } | null {
    // allDates에서 범위에 포함되는 첫/끝 날짜의 인덱스 찾기
    let firstIdx: number | null = null
    let lastIdx: number | null = null

    for (const d of allDates) {
      const dk = formatDateKey(d)
      if (dk < dateStart || dk > dateEnd) continue
      const idx = dateIndexMap.get(dk)
      if (idx == null) continue
      if (firstIdx === null || idx < firstIdx) firstIdx = idx
      if (lastIdx === null || idx > lastIdx) lastIdx = idx
    }

    if (firstIdx === null || lastIdx === null) return null
    return {
      startX: firstIdx * dayWidth,
      endX: (lastIdx + 1) * dayWidth,
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      if (format === 'png') {
        if (!chartRef.current) return
        const pixels = calcCropPixels()
        await exportGanttPng({
          chartElement: chartRef.current,
          includeScenarios: scenariosVisible,
          fileName,
          crop: pixels ?? undefined,
        })
      } else {
        exportGanttExcel({
          tasks,
          roles,
          includeScenarios: scenariosVisible,
          dateRange: { start: dateStart, end: dateEnd },
          fileName,
        })
      }
      onClose()
    } catch (err) {
      console.error('내보내기 실패', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-[400px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">간트차트 내보내기</h3>

        {/* 형식 선택 */}
        <div className="mb-4">
          <label className="text-sm text-gray-600 mb-2 block">형식</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="format"
                checked={format === 'png'}
                onChange={() => setFormat('png')}
                className="accent-blue-600"
              />
              <span className="text-sm text-gray-800">PNG</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="format"
                checked={format === 'excel'}
                onChange={() => setFormat('excel')}
                className="accent-blue-600"
              />
              <span className="text-sm text-gray-800">Excel</span>
            </label>
          </div>
        </div>

        {/* 날짜 범위 */}
        <div className="mb-6">
          <label className="text-sm text-gray-600 mb-2 block">범위</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <span className="text-sm text-gray-400">~</span>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50"
            style={{ background: primaryGradient }}
          >
            {exporting ? '내보내는 중...' : '내보내기'}
          </button>
        </div>
      </div>
    </div>
  )
}
