import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { GanttTask, ScenarioScheduleItem, GanttScheduleItem } from '@/lib/types/gantt'
import { formatDateKey } from '@/lib/utils/calendar'
import { getErrorMessage } from '@/lib/utils/error'
import type { SelectionItem } from './useGanttSelection'

const DAY_WIDTH = 32

export interface BulkDragItem {
  type: 'project' | 'ss' | 'schedule'
  id: number
  taskId: number
  originalStart: Date
  originalEnd: Date
}

interface DragState {
  taskId: number
  mode: 'move' | 'resize-left' | 'resize-right' | 'create'
  startX: number           // mousedown 시점 clientX
  scrollLeftAtStart: number // mousedown 시점 스크롤 위치
  originalStart: Date
  originalEnd: Date
  currentStart: Date
  currentEnd: Date
  ssId?: number            // scenario_schedule 드래그 시 해당 레코드 id
  ssCreate?: boolean       // scenario_schedule 신규 생성 드래그
  ssScenarioId?: number    // 신규 생성 시 대상 시나리오 id
  schId?: number           // schedule 다이아몬드 드래그 시 해당 레코드 id
  bulkItems?: BulkDragItem[] // 다중 선택 일괄 드래그
  bulkProjectMap?: Map<number, BulkDragItem> // projectId → BulkDragItem O(1) 조회
  bulkByTaskId?: Map<number, BulkDragItem[]> // taskId → ss/schedule 항목
  dayDelta?: number        // 일괄 드래그 시 dayDelta 추적
}

interface UseGanttDragParams {
  tasks: GanttTask[]
  setTasks: React.Dispatch<React.SetStateAction<GanttTask[]>>
  allDates: Date[]
  calcBarPos: (start: Date, end: Date) => { left: number; width: number } | null
  addVisibleDays: (date: Date, days: number) => Date
  loadTasks: (showLoading?: boolean) => Promise<void>
  pushUndo: (actions: { undo: () => Promise<void>; redo: () => Promise<void> }) => void
  suppressRealtime: (tables: string[]) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  setTooltip: React.Dispatch<React.SetStateAction<{ task: GanttTask; x: number; y: number } | null>>
  // 다중 선택 관련
  getSelectedItems?: () => SelectionItem[]
  selectedCount?: number
  clearSelection?: () => void
  isSelected?: (type: SelectionItem['type'], id: number) => boolean
}

export function useGanttDrag({
  tasks, setTasks, allDates, calcBarPos, addVisibleDays,
  loadTasks, pushUndo, suppressRealtime,
  scrollRef, setTooltip,
  getSelectedItems, selectedCount, clearSelection, isSelected,
}: UseGanttDragParams) {
  const [dragState, setDragState] = useState<DragState | null>(null)

  const dragRef = useRef<DragState | null>(null)
  const onBarClickRef = useRef<(taskId: number) => void>(() => {})
  const skipNextClickRef = useRef(false)
  const hoverLineRef = useRef<HTMLDivElement>(null)

  // 바 위치/크기 계산
  const calcBar = useCallback((task: GanttTask) => {
    if (!task.start || !task.end) return null
    return calcBarPos(task.start, task.end)
  }, [calcBarPos])

  // --- 드래그로 바 기간 조정 ---

  // 선택된 항목들로부터 BulkDragItem 배열 + 인덱스 생성
  const buildBulkItems = useCallback((): { items: BulkDragItem[]; projectMap: Map<number, BulkDragItem>; byTaskId: Map<number, BulkDragItem[]> } | undefined => {
    if (!getSelectedItems || !selectedCount || selectedCount < 2) return undefined
    const selected = getSelectedItems()
    const result: BulkDragItem[] = []
    for (const item of selected) {
      if (item.type === 'project') {
        const task = tasks.find(t => t.id === item.id)
        if (task?.start && task?.end) {
          result.push({ type: 'project', id: task.id, taskId: task.id, originalStart: task.start, originalEnd: task.end })
        }
      } else if (item.type === 'ss') {
        const task = tasks.find(t => t.id === item.taskId)
        const ss = task?.scenarioSchedules.find(s => s.id === item.id)
        if (ss && task) {
          result.push({ type: 'ss', id: ss.id, taskId: task.id, originalStart: new Date(ss.dateStart), originalEnd: new Date(ss.dateEnd) })
        }
      } else if (item.type === 'schedule') {
        const task = tasks.find(t => t.id === item.taskId)
        const sch = task?.schedules.find(s => s.id === item.id)
        if (sch && task) {
          const d = new Date(sch.date)
          result.push({ type: 'schedule', id: sch.id, taskId: task.id, originalStart: d, originalEnd: d })
        }
      }
    }
    if (result.length === 0) return undefined
    // 인덱스 빌드 (mousemove에서 O(1) 조회용)
    const projectMap = new Map<number, BulkDragItem>()
    const byTaskId = new Map<number, BulkDragItem[]>()
    for (const bi of result) {
      if (bi.type === 'project') {
        projectMap.set(bi.id, bi)
      } else {
        const list = byTaskId.get(bi.taskId) ?? []
        list.push(bi)
        byTaskId.set(bi.taskId, list)
      }
    }
    return { items: result, projectMap, byTaskId }
  }, [getSelectedItems, selectedCount, tasks])

  const handleBarDragStart = useCallback((task: GanttTask, mode: DragState['mode'], e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    if (!task.start || !task.end) return

    // 다중 선택된 상태에서 선택된 바를 드래그 → 일괄 이동
    const isBulk = mode === 'move' && isSelected?.('project', task.id) && (selectedCount ?? 0) >= 2
    const bulk = isBulk ? buildBulkItems() : undefined

    const state: DragState = {
      taskId: task.id,
      mode,
      startX: e.clientX,
      scrollLeftAtStart: scrollRef.current?.scrollLeft ?? 0,
      originalStart: task.start,
      originalEnd: task.end,
      currentStart: task.start,
      currentEnd: task.end,
      bulkItems: bulk?.items,
      bulkProjectMap: bulk?.projectMap,
      bulkByTaskId: bulk?.byTaskId,
      dayDelta: 0,
    }
    dragRef.current = state
    setDragState(state)
    setTooltip(null)

    // 비선택 바를 드래그하면 선택 해제
    if (!isBulk && clearSelection && (selectedCount ?? 0) > 0 && !e.shiftKey) {
      clearSelection()
    }
  }, [scrollRef, setTooltip, isSelected, selectedCount, buildBulkItems, clearSelection])

  // 바 없는 프로젝트 행 드래그 → 기간 직접 설정
  const handleEmptyRowDragStart = useCallback((task: GanttTask, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const container = scrollRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const pixelX = e.clientX - rect.left + container.scrollLeft
    const dayIndex = Math.floor(pixelX / DAY_WIDTH)
    if (dayIndex < 0 || dayIndex >= allDates.length) return
    const clickedDate = allDates[dayIndex]

    const state: DragState = {
      taskId: task.id,
      mode: 'create',
      startX: e.clientX,
      scrollLeftAtStart: container.scrollLeft,
      originalStart: clickedDate,
      originalEnd: clickedDate,
      currentStart: clickedDate,
      currentEnd: clickedDate,
    }
    dragRef.current = state
    setDragState(state)
    setTooltip(null)
  }, [allDates, scrollRef, setTooltip])

  const handleDragSave = useCallback(async (state: DragState) => {
    const newStart = formatDateKey(state.currentStart)
    const newEnd = formatDateKey(state.currentEnd)
    const prevStart = state.mode === 'create' ? null : formatDateKey(state.originalStart)
    const prevEnd = state.mode === 'create' ? null : formatDateKey(state.originalEnd)
    const taskId = state.taskId
    try {
      const { error } = await supabase
        .from('projects')
        .update({ date_start: newStart, date_end: newEnd })
        .eq('id', taskId)
      if (error) throw error

      // 기간을 처음 설정하는 경우(create 모드) 착수 스케줄 자동 생성
      if (state.mode === 'create') {
        await supabase
          .from('schedule')
          .insert({ project_id: taskId, date: newStart, content: '착수' })
      }

      pushUndo({
        undo: async () => {
          await supabase.from('projects').update({ date_start: prevStart, date_end: prevEnd }).eq('id', taskId)
          if (state.mode === 'create') {
            await supabase.from('schedule').delete().eq('project_id', taskId).eq('content', '착수').eq('date', newStart)
          }
        },
        redo: async () => {
          await supabase.from('projects').update({ date_start: newStart, date_end: newEnd }).eq('id', taskId)
          if (state.mode === 'create') {
            await supabase.from('schedule').insert({ project_id: taskId, date: newStart, content: '착수' })
          }
        },
      })
      suppressRealtime(['schedule', 'project', 'scenario'])
      await loadTasks(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('기간 변경 실패:', msg)
      await loadTasks(false)
    }
  }, [loadTasks, pushUndo, suppressRealtime])

  const handleSsDragSave = useCallback(async (state: DragState) => {
    const newStart = formatDateKey(state.currentStart)
    const newEnd = formatDateKey(state.currentEnd)
    try {
      if (state.ssCreate && state.ssScenarioId) {
        const { data: inserted, error } = await supabase
          .from('scenario_schedules')
          .insert({ scenario_id: state.ssScenarioId, project_id: state.taskId, date_start: newStart, date_end: newEnd })
          .select('id')
          .single()
        if (error) throw error
        pushUndo({
          undo: async () => { await supabase.from('scenario_schedules').delete().eq('id', inserted.id) },
          redo: async () => { await supabase.from('scenario_schedules').insert({ scenario_id: state.ssScenarioId!, project_id: state.taskId, date_start: newStart, date_end: newEnd }) },
        })
        suppressRealtime(['schedule', 'project', 'scenario'])
        await loadTasks(false)
      } else if (state.ssId) {
        const prevStart = formatDateKey(state.originalStart)
        const prevEnd = formatDateKey(state.originalEnd)
        const ssId = state.ssId
        const { error } = await supabase
          .from('scenario_schedules')
          .update({ date_start: newStart, date_end: newEnd })
          .eq('id', ssId)
        if (error) throw error
        pushUndo({
          undo: async () => { await supabase.from('scenario_schedules').update({ date_start: prevStart, date_end: prevEnd }).eq('id', ssId) },
          redo: async () => { await supabase.from('scenario_schedules').update({ date_start: newStart, date_end: newEnd }).eq('id', ssId) },
        })
        suppressRealtime(['schedule', 'project', 'scenario'])
        await loadTasks(false)
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('시나리오 스케줄 저장 실패:', msg)
      await loadTasks(false)
    }
  }, [loadTasks, pushUndo, suppressRealtime])

  // --- 일괄 드래그 저장 ---
  const handleBulkDragSave = useCallback(async (bulkItems: BulkDragItem[], dayDelta: number) => {
    try {
      // 항목을 테이블별로 분류
      const pProjects: { id: number; date_start: string; date_end: string }[] = []
      const pSchedules: { id: number; date: string }[] = []
      const pSs: { id: number; date_start: string; date_end: string }[] = []

      for (const item of bulkItems) {
        const newStart = formatDateKey(addVisibleDays(item.originalStart, dayDelta))
        const newEnd = formatDateKey(addVisibleDays(item.originalEnd, dayDelta))
        if (item.type === 'project') {
          pProjects.push({ id: item.id, date_start: newStart, date_end: newEnd })
        } else if (item.type === 'ss') {
          pSs.push({ id: item.id, date_start: newStart, date_end: newEnd })
        } else {
          pSchedules.push({ id: item.id, date: newStart })
        }
      }

      // RPC 1건으로 3개 테이블 일괄 업데이트
      const { error } = await supabase.rpc('batch_move_items', {
        p_projects: pProjects,
        p_schedules: pSchedules,
        p_scenario_schedules: pSs,
      })
      if (error) throw error

      // Undo/Redo 등록 (RPC 사용, suppressRealtime+loadTasks는 useUndoStack의 onAfterUndo가 처리)
      pushUndo({
        undo: async () => {
          const undoProjects: typeof pProjects = []
          const undoSchedules: typeof pSchedules = []
          const undoSs: typeof pSs = []
          for (const item of bulkItems) {
            const origStart = formatDateKey(item.originalStart)
            const origEnd = formatDateKey(item.originalEnd)
            if (item.type === 'project') {
              undoProjects.push({ id: item.id, date_start: origStart, date_end: origEnd })
            } else if (item.type === 'ss') {
              undoSs.push({ id: item.id, date_start: origStart, date_end: origEnd })
            } else {
              undoSchedules.push({ id: item.id, date: origStart })
            }
          }
          await supabase.rpc('batch_move_items', {
            p_projects: undoProjects,
            p_schedules: undoSchedules,
            p_scenario_schedules: undoSs,
          })
        },
        redo: async () => {
          await supabase.rpc('batch_move_items', {
            p_projects: pProjects,
            p_schedules: pSchedules,
            p_scenario_schedules: pSs,
          })
        },
      })
      suppressRealtime(['schedule', 'project', 'scenario'])
      await loadTasks(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('일괄 이동 실패:', msg)
      await loadTasks(false)
    }
  }, [addVisibleDays, loadTasks, pushUndo, suppressRealtime])

  const handleSchDragSave = useCallback(async (state: DragState) => {
    const newDate = formatDateKey(state.currentStart)
    const prevDate = formatDateKey(state.originalStart)
    const schId = state.schId!
    try {
      const { error } = await supabase
        .from('schedule')
        .update({ date: newDate })
        .eq('id', schId)
      if (error) throw error
      pushUndo({
        undo: async () => { await supabase.from('schedule').update({ date: prevDate }).eq('id', schId) },
        redo: async () => { await supabase.from('schedule').update({ date: newDate }).eq('id', schId) },
      })
      suppressRealtime(['schedule', 'project', 'scenario'])
      await loadTasks(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('스케줄 날짜 이동 실패:', msg)
      await loadTasks(false)
    }
  }, [loadTasks, pushUndo, suppressRealtime])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragRef.current
      if (!state) return

      const scrollDelta = (scrollRef.current?.scrollLeft ?? 0) - state.scrollLeftAtStart
      const pixelDelta = e.clientX - state.startX + scrollDelta
      const dayDelta = Math.round(pixelDelta / DAY_WIDTH)
      if (dayDelta === 0 && state.currentStart.getTime() === state.originalStart.getTime()) return

      let newStart: Date
      let newEnd: Date

      if (state.mode === 'move') {
        newStart = addVisibleDays(state.originalStart, dayDelta)
        newEnd = addVisibleDays(state.originalEnd, dayDelta)
      } else if (state.mode === 'resize-left') {
        newStart = addVisibleDays(state.originalStart, dayDelta)
        newEnd = state.originalEnd
        if (newStart > newEnd) newStart = newEnd
      } else if (state.mode === 'create') {
        const anchor = state.originalStart
        const target = addVisibleDays(anchor, dayDelta)
        if (dayDelta >= 0) {
          newStart = anchor
          newEnd = target
        } else {
          newStart = target
          newEnd = anchor
        }
      } else {
        newStart = state.originalStart
        newEnd = addVisibleDays(state.originalEnd, dayDelta)
        if (newEnd < newStart) newEnd = newStart
      }

      const updated = { ...state, currentStart: newStart, currentEnd: newEnd, dayDelta }
      dragRef.current = updated
      setDragState(updated)

      // 일괄 드래그: 모든 선택 항목 실시간 업데이트 (인덱스 기반 O(1) 조회)
      if (state.bulkItems && state.bulkItems.length > 0) {
        const pMap = state.bulkProjectMap
        const byTask = state.bulkByTaskId
        setTasks(prev => prev.map(task => {
          let modified = false
          let updatedTask = task

          // 프로젝트 바 (Map으로 O(1) 조회)
          const projectItem = pMap?.get(task.id)
          if (projectItem) {
            const ns = addVisibleDays(projectItem.originalStart, dayDelta)
            const ne = addVisibleDays(projectItem.originalEnd, dayDelta)
            const dur = Math.floor((ne.getTime() - ns.getTime()) / 86400000) + 1
            updatedTask = { ...updatedTask, start: ns, end: ne, dateStart: formatDateKey(ns), dateEnd: formatDateKey(ne), duration: dur }
            modified = true
          }

          // ss/schedule (Map으로 O(1) 조회)
          const taskItems = byTask?.get(task.id)
          if (taskItems) {
            const ssMap = new Map<number, typeof taskItems[number]>()
            const schMap = new Map<number, typeof taskItems[number]>()
            for (const bi of taskItems) {
              if (bi.type === 'ss') ssMap.set(bi.id, bi)
              else if (bi.type === 'schedule') schMap.set(bi.id, bi)
            }

            if (ssMap.size > 0) {
              const updatedSs = updatedTask.scenarioSchedules.map(ss => {
                const match = ssMap.get(ss.id)
                if (!match) return ss
                return {
                  ...ss,
                  dateStart: formatDateKey(addVisibleDays(match.originalStart, dayDelta)),
                  dateEnd: formatDateKey(addVisibleDays(match.originalEnd, dayDelta)),
                }
              })
              updatedTask = { ...updatedTask, scenarioSchedules: updatedSs }
              modified = true
            }

            if (schMap.size > 0) {
              const updatedSchedules = updatedTask.schedules.map(sch => {
                const match = schMap.get(sch.id)
                if (!match) return sch
                return { ...sch, date: formatDateKey(addVisibleDays(match.originalStart, dayDelta)) }
              })
              updatedTask = { ...updatedTask, schedules: updatedSchedules }
              modified = true
            }
          }

          return modified ? updatedTask : task
        }))
      }
    }

    const handleMouseUp = () => {
      const state = dragRef.current
      if (!state) return
      dragRef.current = null

      const changed =
        state.currentStart.getTime() !== state.originalStart.getTime() ||
        state.currentEnd.getTime() !== state.originalEnd.getTime()

      // 일괄 드래그 완료
      if (state.bulkItems && state.bulkItems.length > 0 && state.dayDelta !== undefined) {
        if (changed && state.dayDelta !== 0) {
          setDragState(null)
          handleBulkDragSave(state.bulkItems, state.dayDelta)
          skipNextClickRef.current = true
          requestAnimationFrame(() => { skipNextClickRef.current = false })
        } else {
          setDragState(null)
        }
        return
      }

      // schedule 다이아몬드 드래그
      if (state.schId) {
        if (changed) {
          setDragState(null)
          handleSchDragSave(state)
          skipNextClickRef.current = true
          requestAnimationFrame(() => { skipNextClickRef.current = false })
        } else {
          setDragState(null)
        }
        return
      }

      // scenario schedule 드래그 (생성 또는 수정)
      if (state.ssId || state.ssCreate) {
        if (changed) {
          setDragState(null)
          handleSsDragSave(state)
          skipNextClickRef.current = true
          requestAnimationFrame(() => { skipNextClickRef.current = false })
        } else {
          setDragState(null)
        }
        return
      }

      if (state.mode === 'create') {
        if (changed) {
          // 드래그 완료: 기간 설정
          setTasks((prev) =>
            prev.map((t) => {
              if (t.id !== state.taskId) return t
              const dur = Math.floor((state.currentEnd.getTime() - state.currentStart.getTime()) / 86400000) + 1
              return {
                ...t,
                start: state.currentStart,
                end: state.currentEnd,
                dateStart: formatDateKey(state.currentStart),
                dateEnd: formatDateKey(state.currentEnd),
                duration: dur,
              }
            }),
          )
          setDragState(null)
          handleDragSave(state)
          // 클릭 이벤트 차단 (하위 프로젝트 생성 모달 방지)
          skipNextClickRef.current = true
          requestAnimationFrame(() => { skipNextClickRef.current = false })
        } else {
          // 이동 없음 = 클릭 → handleTimelineRowClick이 처리
          setDragState(null)
        }
        return
      }

      if (changed) {
        // optimistic update: 로컬 tasks를 먼저 갱신하여 바가 제자리에 머무르게 함
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== state.taskId) return t
            const dur = Math.floor((state.currentEnd.getTime() - state.currentStart.getTime()) / 86400000) + 1
            return {
              ...t,
              start: state.currentStart,
              end: state.currentEnd,
              dateStart: formatDateKey(state.currentStart),
              dateEnd: formatDateKey(state.currentEnd),
              duration: dur,
            }
          }),
        )
        setDragState(null)
        handleDragSave(state)
      } else {
        setDragState(null)
        // 이동 없이 놓음 = 클릭 → 프로젝트 상세 모달
        onBarClickRef.current(state.taskId)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [addVisibleDays, handleDragSave, handleSsDragSave, handleSchDragSave, handleBulkDragSave, scrollRef, setTasks])

  // 드래그 중인 바의 위치 계산
  const calcDragBar = useCallback((state: DragState) => {
    return calcBarPos(state.currentStart, state.currentEnd)
  }, [calcBarPos])

  const handleScheduleDotDragStart = useCallback((task: GanttTask, sch: GanttScheduleItem, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const date = new Date(sch.date)

    const isBulk = isSelected?.('schedule', sch.id) && (selectedCount ?? 0) >= 2
    const bulk = isBulk ? buildBulkItems() : undefined

    const state: DragState = {
      taskId: task.id,
      mode: 'move',
      startX: e.clientX,
      scrollLeftAtStart: scrollRef.current?.scrollLeft ?? 0,
      originalStart: date,
      originalEnd: date,
      currentStart: date,
      currentEnd: date,
      schId: sch.id,
      bulkItems: bulk?.items,
      bulkProjectMap: bulk?.projectMap,
      bulkByTaskId: bulk?.byTaskId,
      dayDelta: 0,
    }
    dragRef.current = state
    setDragState(state)
    setTooltip(null)

    if (!isBulk && clearSelection && (selectedCount ?? 0) > 0 && !e.shiftKey) {
      clearSelection()
    }
  }, [scrollRef, setTooltip, isSelected, selectedCount, buildBulkItems, clearSelection])

  const handleSsBarDragStart = useCallback((ss: ScenarioScheduleItem, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const start = new Date(ss.dateStart)
    const end = new Date(ss.dateEnd)

    const isBulk = isSelected?.('ss', ss.id) && (selectedCount ?? 0) >= 2
    const bulk = isBulk ? buildBulkItems() : undefined

    const state: DragState = {
      taskId: ss.projectId,
      mode: 'move',
      startX: e.clientX,
      scrollLeftAtStart: scrollRef.current?.scrollLeft ?? 0,
      originalStart: start,
      originalEnd: end,
      currentStart: start,
      currentEnd: end,
      ssId: ss.id,
      bulkItems: bulk?.items,
      bulkProjectMap: bulk?.projectMap,
      bulkByTaskId: bulk?.byTaskId,
      dayDelta: 0,
    }
    dragRef.current = state
    setDragState(state)
    setTooltip(null)

    if (!isBulk && clearSelection && (selectedCount ?? 0) > 0 && !e.shiftKey) {
      clearSelection()
    }
  }, [scrollRef, setTooltip, isSelected, selectedCount, buildBulkItems, clearSelection])

  const handleSsBarResizeStart = useCallback((ss: ScenarioScheduleItem, mode: 'resize-left' | 'resize-right', e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const start = new Date(ss.dateStart)
    const end = new Date(ss.dateEnd)
    const state: DragState = {
      taskId: ss.projectId,
      mode,
      startX: e.clientX,
      scrollLeftAtStart: scrollRef.current?.scrollLeft ?? 0,
      originalStart: start,
      originalEnd: end,
      currentStart: start,
      currentEnd: end,
      ssId: ss.id,
    }
    dragRef.current = state
    setDragState(state)
    setTooltip(null)
  }, [scrollRef, setTooltip])

  const handleSsCreateDragStart = useCallback((taskId: number, scenarioId: number, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const container = scrollRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const pixelX = e.clientX - rect.left + container.scrollLeft
    const dayIndex = Math.floor(pixelX / DAY_WIDTH)
    if (dayIndex < 0 || dayIndex >= allDates.length) return
    const clickedDate = allDates[dayIndex]

    const state: DragState = {
      taskId,
      mode: 'create',
      startX: e.clientX,
      scrollLeftAtStart: container.scrollLeft,
      originalStart: clickedDate,
      originalEnd: clickedDate,
      currentStart: clickedDate,
      currentEnd: clickedDate,
      ssCreate: true,
      ssScenarioId: scenarioId,
    }
    dragRef.current = state
    setDragState(state)
    setTooltip(null)
  }, [allDates, scrollRef, setTooltip])

  // scenario schedule 바 위치 계산
  const calcSsBar = useCallback((ss: ScenarioScheduleItem) => {
    return calcBarPos(new Date(ss.dateStart), new Date(ss.dateEnd))
  }, [calcBarPos])

  return {
    dragState,
    dragRef, skipNextClickRef, onBarClickRef,
    hoverLineRef,
    calcBar, calcDragBar, calcSsBar,
    handleBarDragStart, handleEmptyRowDragStart,
    handleScheduleDotDragStart,
    handleSsBarDragStart, handleSsBarResizeStart, handleSsCreateDragStart,
  }
}
