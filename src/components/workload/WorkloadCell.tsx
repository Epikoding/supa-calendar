'use client'

import { memo, useCallback } from 'react'
import type { WorkloadCell as WorkloadCellType } from '@/lib/types/workload'
import { primaryHex, cardWithTimeBg, cardWithTimeBorder, cardNoTimeBg, cardNoTimeBorder } from '@/lib/colors'

// --- 히트맵 색상 ---
const HEATMAP_COLORS = [
  '',         // 0건
  '#e8f5e9', // 1건
  '#c8e6c9', // 2건
  '#fff9c4', // 3건
  '#ffe0b2', // 4건
  '#ffccbc', // 5건
  '#ffab91', // 6건
  '#ef9a9a', // 7건+
]

function getHeatmapColor(count: number): string {
  if (count === 0) return ''
  if (count >= HEATMAP_COLORS.length) return HEATMAP_COLORS[HEATMAP_COLORS.length - 1]
  return HEATMAP_COLORS[count]
}

function getLoadColor(count: number): string {
  if (count === 0) return ''
  if (count <= 2) return '#e8f5e9'
  if (count <= 4) return '#fff3e0'
  return '#ffebee'
}

interface WorkloadCellProps {
  cells: WorkloadCellType[]
  memberId: number
  dateKey: string
  dayWidth: number
  isWeekend: boolean
  isToday: boolean
  heatmapMode: boolean
  onCellItemClick: (projectId: number, projectName: string, dateKey: string, memberId: number) => void
  onDragStart: (scheduleId: number, memberId: number, dateKey: string) => void
  onDragEnd: () => void
  onDrop: (targetMemberId: number, targetDateKey: string) => void
  onContextMenu: (e: React.MouseEvent, memberId: number, dateKey: string) => void
}

export default memo(function WorkloadCell({
  cells,
  memberId,
  dateKey,
  dayWidth,
  isWeekend,
  isToday,
  heatmapMode,
  onCellItemClick,
  onDragStart,
  onDragEnd,
  onDrop,
  onContextMenu,
}: WorkloadCellProps) {
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add('workload-drag-over')
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.currentTarget.classList.remove('workload-drag-over')
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove('workload-drag-over')
    onDrop(memberId, dateKey)
  }, [onDrop, memberId, dateKey])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // 기존 스케줄 항목 위에서 우클릭했는지 확인
    const target = e.target as HTMLElement
    const scheduleItem = target.closest('[data-project-id]') as HTMLElement | null
    if (scheduleItem) {
      const projectId = Number(scheduleItem.dataset.projectId)
      const projectName = scheduleItem.dataset.projectName ?? ''
      onCellItemClick(projectId, projectName, dateKey, memberId)
      return
    }
    onContextMenu(e, memberId, dateKey)
  }, [onContextMenu, onCellItemClick, memberId, dateKey])

  // 배경색 계산
  let bgColor = ''
  if (heatmapMode) {
    bgColor = getHeatmapColor(cells.length)
  } else {
    bgColor = getLoadColor(cells.length)
  }
  if (isWeekend && !heatmapMode) bgColor = 'rgba(0,0,0,0.008)'

  const style: React.CSSProperties = {
    width: dayWidth,
    flexShrink: 0,
    backgroundColor: bgColor || undefined,
    borderLeft: isToday ? `2px solid var(--color-primary)` : undefined,
  }

  if (heatmapMode) {
    return (
      <div
        data-mid={memberId}
        data-dk={dateKey}
        className="flex items-center justify-center border-r border-b border-black/[0.04]"
        style={style}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
      >
        {cells.length > 0 && <span className="text-sm font-bold text-gray-500">{cells.length}</span>}
      </div>
    )
  }

  return (
    <div
      data-mid={memberId}
      data-dk={dateKey}
      className="flex flex-col gap-1 py-1 px-0.5 text-[11px] leading-tight border-r border-b border-black/[0.04]"
      style={style}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
    >
      {cells.map((cell) => {
        let tip = `[${cell.brandCode}] ${cell.projectName}`
        if (cell.time) tip += ` (${cell.time})`
        if (cell.content) tip += `: ${cell.content}`
        if (cell.note) tip += ` - ${cell.note}`
        if (cell.assignees.length > 0) tip += ` [${cell.assignees.map((a) => a.nameShort).join(', ')}]`
        return (
          <div
            key={cell.scheduleId}
            data-tooltip={tip}
            data-project-id={cell.projectId}
            data-project-name={cell.projectName}
            className="flex items-start gap-1.5 min-w-0 cursor-pointer rounded-lg px-1.5 py-1 workload-draggable workload-tooltip-wrap transition-all"
            style={{
              background: cell.time ? cardWithTimeBg : cardNoTimeBg,
              border: cell.time ? cardWithTimeBorder : cardNoTimeBorder,
              borderLeftWidth: cell.time ? '2.5px' : undefined,
              borderLeftColor: cell.time ? primaryHex : undefined,
            }}
            draggable
            onClick={(e) => {
              e.stopPropagation()
              onCellItemClick(cell.projectId, cell.projectName, dateKey, memberId)
            }}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', String(cell.scheduleId))
              onDragStart(cell.scheduleId, memberId, dateKey)
            }}
            onDragEnd={() => onDragEnd()}
          >
            <span
              className="inline-block w-2 h-2 rounded-full mt-[2px] flex-shrink-0"
              style={{ backgroundColor: cell.brandColor || '#9ca3af' }}
            />
            <span className="min-w-0">
              <span className="font-medium text-gray-800 truncate block">{cell.projectName}</span>
              {cell.time && (
                <span className="text-[10px] font-bold" style={{ color: primaryHex }}>{cell.time} </span>
              )}
              {cell.content && (
                <span className="text-gray-500 text-[10px]">{cell.content}</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
})
