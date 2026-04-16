import { useState, useCallback, useRef, useEffect } from 'react'
import type { GanttTask, ScenarioScheduleItem } from '@/lib/types/gantt'

const DAY_WIDTH = 32

export type TimelineRow = { type: 'brand'; brandId: number; height: number } | { type: 'task'; task: GanttTask; height: number }

export interface SelectionItem {
  type: 'project' | 'ss' | 'schedule'
  id: number
  taskId: number
}

export interface LassoState {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

function selectionKey(type: SelectionItem['type'], id: number): string {
  return `${type}:${id}`
}

// --- 선택 상태 관리 (GanttChart 레벨) ---

export function useSelectionState() {
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectionItem>>(new Map())

  const isSelected = useCallback((type: SelectionItem['type'], id: number): boolean => {
    return selectedItems.has(selectionKey(type, id))
  }, [selectedItems])

  const clearSelection = useCallback(() => {
    setSelectedItems(new Map())
  }, [])

  const toggleSelect = useCallback((item: SelectionItem) => {
    setSelectedItems(prev => {
      const key = selectionKey(item.type, item.id)
      const next = new Map(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, item)
      }
      return next
    })
  }, [])

  const getSelectedItems = useCallback((): SelectionItem[] => {
    return Array.from(selectedItems.values())
  }, [selectedItems])

  // Escape 키로 선택 해제
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [clearSelection])

  return {
    selectedItems,
    setSelectedItems,
    selectedCount: selectedItems.size,
    isSelected,
    clearSelection,
    toggleSelect,
    getSelectedItems,
  }
}

// --- Lasso 선택 로직 (useGanttProjects 이후 호출 가능) ---

interface UseGanttLassoParams {
  timelineRows: TimelineRow[]
  activeScenarios: { id: number; name: string }[]
  calcBarPos: (start: Date, end: Date) => { left: number; width: number } | null
  scrollRef: React.RefObject<HTMLDivElement | null>
  showMainBar: boolean
  showScheduleDots: boolean
  dateIndexMap: Map<string, number>
  getTaskSsForScenario: (task: GanttTask, scenarioId: number) => ScenarioScheduleItem | null
  setSelectedItems: React.Dispatch<React.SetStateAction<Map<string, SelectionItem>>>
  skipNextClickRef: React.RefObject<boolean>
  headerHeight: number
  rowHeightBase: number
}

export function useGanttLasso({
  timelineRows, activeScenarios, calcBarPos, scrollRef,
  showMainBar, showScheduleDots, dateIndexMap, getTaskSsForScenario,
  setSelectedItems, skipNextClickRef, headerHeight, rowHeightBase,
}: UseGanttLassoParams) {
  const [lassoState, setLassoState] = useState<LassoState | null>(null)
  const lassoRef = useRef<LassoState | null>(null)

  // lasso 시작 (Shift + mousedown on timeline area)
  const handleLassoStart = useCallback((e: React.MouseEvent) => {
    if (!e.shiftKey || e.button !== 0) return false
    e.preventDefault()
    e.stopPropagation()

    const container = scrollRef.current
    if (!container) return false

    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left + container.scrollLeft
    const y = e.clientY - rect.top + container.scrollTop

    const state: LassoState = { startX: x, startY: y, currentX: x, currentY: y }
    lassoRef.current = state
    setLassoState(state)
    return true
  }, [scrollRef])

  // lasso 사각형과 바 교차 판정 → 선택 항목 계산
  const computeLassoSelection = useCallback((lasso: LassoState): Map<string, SelectionItem> => {
    const result = new Map<string, SelectionItem>()
    const lx1 = Math.min(lasso.startX, lasso.currentX)
    const lx2 = Math.max(lasso.startX, lasso.currentX)
    const ly1 = Math.min(lasso.startY, lasso.currentY)
    const ly2 = Math.max(lasso.startY, lasso.currentY)

    const ssCount = activeScenarios.length

    // timelineRows를 순회하며 누적 y offset으로 실제 위치 계산
    let yOffset = headerHeight
    for (const row of timelineRows) {
      if (row.type === 'brand') {
        yOffset += row.height
        continue
      }

      const task = row.task
      const rowHeight = row.height
      const rowTop = yOffset
      const rowBottom = rowTop + rowHeight
      yOffset += rowHeight

      if (rowBottom < ly1 || rowTop > ly2) continue

      // 프로젝트 바
      if (showMainBar && task.start && task.end) {
        const bar = calcBarPos(task.start, task.end)
        if (bar) {
          const barLeft = bar.left + 2
          const barRight = barLeft + Math.max(bar.width, 6)
          if (barRight >= lx1 && barLeft <= lx2) {
            const key = selectionKey('project', task.id)
            result.set(key, { type: 'project', id: task.id, taskId: task.id })
          }
        }
      }

      // 스케줄 마커
      if (showScheduleDots) {
        for (const sch of task.schedules) {
          const schIdx = dateIndexMap.get(sch.date)
          if (schIdx === undefined) continue
          const dotLeft = schIdx * DAY_WIDTH
          const dotRight = dotLeft + DAY_WIDTH
          if (dotRight >= lx1 && dotLeft <= lx2) {
            const key = selectionKey('schedule', sch.id)
            result.set(key, { type: 'schedule', id: sch.id, taskId: task.id })
          }
        }
      }

      // 시나리오 바
      activeScenarios.forEach((scenario, sIdx) => {
        const ss = getTaskSsForScenario(task, scenario.id)
        if (!ss) return
        const ssBar = calcBarPos(new Date(ss.dateStart), new Date(ss.dateEnd))
        if (!ssBar) return

        const mainBarHeight = !showMainBar ? 0 : ssCount > 0 ? Math.max(rowHeightBase - 6 - ssCount * 5, 8) : rowHeightBase - 12
        const pinSpace = showScheduleDots ? 15 : 0
        const mainBarTop = showScheduleDots ? pinSpace : Math.floor((rowHeight - mainBarHeight) / 2)
        const ssLineGap = showMainBar ? 5 : 8
        const ssLineHeight = showMainBar ? 4 : 6
        const ssBlockHeight = ssCount * ssLineGap
        const ssStartTop = showMainBar
          ? mainBarTop + mainBarHeight + 2
          : Math.max(2, (rowHeight - ssBlockHeight) / 2)
        const lineTop = rowTop + ssStartTop + sIdx * ssLineGap
        const lineBottom = lineTop + ssLineHeight

        const barLeft = ssBar.left + 2
        const barRight = barLeft + Math.max(ssBar.width, 6)
        if (barRight >= lx1 && barLeft <= lx2 && lineBottom >= ly1 && lineTop <= ly2) {
          const key = selectionKey('ss', ss.id)
          result.set(key, { type: 'ss', id: ss.id, taskId: task.id })
        }
      })
    }

    return result
  }, [timelineRows, headerHeight, rowHeightBase, activeScenarios, calcBarPos, showMainBar, showScheduleDots, dateIndexMap, getTaskSsForScenario])

  // document mousemove/mouseup for lasso
  const isLassoing = lassoState !== null
  useEffect(() => {
    if (!lassoRef.current) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!lassoRef.current) return
      const container = scrollRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left + container.scrollLeft
      const y = e.clientY - rect.top + container.scrollTop

      const updated = { ...lassoRef.current, currentX: x, currentY: y }
      lassoRef.current = updated
      setLassoState(updated)

      setSelectedItems(computeLassoSelection(updated))
    }

    const handleMouseUp = () => {
      if (!lassoRef.current) return
      const finalSelection = computeLassoSelection(lassoRef.current)
      setSelectedItems(finalSelection)
      lassoRef.current = null
      setLassoState(null)
      // lasso 종료 후 click 이벤트가 handleTimelineRowClick을 호출하지 않도록 차단
      skipNextClickRef.current = true
      requestAnimationFrame(() => { skipNextClickRef.current = false })
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isLassoing, computeLassoSelection, scrollRef, setSelectedItems])

  return { lassoState, handleLassoStart }
}
