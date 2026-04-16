'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import { supabase } from '@/lib/supabase/client'
import { fetchGanttTasks } from '@/lib/queries/gantt'
import { fetchBrands, fetchMembers, fetchKeywordHighlights } from '@/lib/queries/masterData'
import { useKeywordMatchers } from '@/hooks/useKeywordMatchers'
import type { KeywordHighlight } from '@/lib/types/database'
import type { GanttTask, GanttFetchOptions, GanttScheduleItem } from '@/lib/types/gantt'
import ProjectDetailModal from '@/components/calendar/ProjectDetailModal'
import ScheduleDetailModal from '@/components/calendar/ScheduleDetailModal'
import { useUndoStack } from '@/hooks/useUndoStack'
import { STATUS_OPTIONS } from '@/lib/constants/project'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { usePresence } from '@/hooks/usePresence'
import { useRoles } from '@/hooks/useRoles'
import { useScheduleModal, type MutationContext } from '@/hooks/useScheduleModal'
import { formatDateKey, isWeekend as isWeekendDay } from '@/lib/utils/calendar'
import { useGanttTimeline } from './hooks/useGanttTimeline'
import { useGanttScenarios } from './hooks/useGanttScenarios'
import { useGanttDrag } from './hooks/useGanttDrag'
import { useSelectionState, useGanttLasso, type TimelineRow } from './hooks/useGanttSelection'
import { useGanttProjects } from './hooks/useGanttProjects'
import { useMonthNavigation } from '@/hooks/useMonthNavigation'
import { useScrollSync } from '@/hooks/useScrollSync'
import { usePanelResize } from '@/hooks/usePanelResize'
import { useBrandGroups } from '@/hooks/useBrandGroups'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useRowDrag, type RowDragUpdate } from '@/hooks/useRowDrag'
import { PILL_ACTIVE_STYLE, PILL_INACTIVE_STYLE, GLASS_TOOLBAR_STYLE, GLASS_NAV_BTN_STYLE, getStatusColor, getStatusColorLight, getStatusPillStyle } from '@/lib/styles/toolbar'
import { readJson, readBool, writeJson, writeBool } from '@/lib/storage'
import ChevronCircle from '@/components/shared/ChevronCircle'
import AssigneePills from '@/components/shared/AssigneePills'
import TreeLines from '@/components/shared/TreeLines'
import GlassPanel from '@/components/shared/GlassPanel'
import DateHeader, { DATE_HEADER_HEIGHT } from '@/components/shared/DateHeader'
import { computeIsLastAtDepth } from '@/lib/utils/treeLines'
import { resortTreeItems, getDescendantIds } from '@/lib/utils/tree'
import { useScrollToToday } from '@/hooks/useScrollToToday'
import GanttExportDialog from '@/components/gantt/GanttExportDialog'
import { getDepthStyle } from '@/lib/constants/depth'
import { primaryHex, primaryAlpha, primaryGradient } from '@/lib/colors'
import BrandFilter from '@/components/shared/BrandFilter'

interface GanttChartProps {
  initialYear?: number
  initialMonth?: number
}

interface ViewState {
  year: number
  month: number
  statusFilter: string[]
  brandFilter: number[] | null
}

interface Brand {
  id: number
  code: string
  name: string
  color: string | null
}

interface MemberInfo {
  id: number
  nameShort: string
}

const ROW_HEIGHT_BASE = 36
const ROW_HEIGHT_WITH_PINS = 48
const HEADER_HEIGHT = DATE_HEADER_HEIGHT
const DEFAULT_LABEL_WIDTH = 300
const MIN_LABEL_WIDTH = 150
const MAX_LABEL_WIDTH = 600
const DAY_WIDTH_DEFAULT = 32
const DAY_WIDTH_COMPACT = 16
const SCENARIO_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#6b7280', '#0ea5e9', '#06b6d4', '#84cc16'] as const
const BRAND_HEADER_HEIGHT = 34
const COMPACT_ROW_HEIGHT = 18
const COMPACT_BRAND_HEADER_HEIGHT = 18
const COMPACT_PIN_SIZE = 4
const COMPACT_PIN_PAD = 4
const COMPACT_SS_LINE_HEIGHT = 2
const COMPACT_SS_LINE_GAP = 3
const COMPACT_BAR_HEIGHT = 8
const PIN_SPACE = 15

function getRowHeight(depth: number, baseHeight: number): number {
  if (depth === 0) return baseHeight + 2
  if (depth <= 2) return baseHeight - 2
  return baseHeight - 4
}

export default function GanttChart({ initialYear, initialMonth }: GanttChartProps) {
  const now = new Date()
  const [viewState, setViewState] = useState<ViewState>({
    year: initialYear ?? now.getFullYear(),
    month: initialMonth ?? now.getMonth() + 1,
    statusFilter: ['진행중', '보류'],
    brandFilter: null,
  })
  const [ready, setReady] = useState(false)
  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [autoFitLabel, setAutoFitLabel] = useState(true)
  const [tooltip, setTooltip] = useState<{ task: GanttTask; x: number; y: number } | null>(null)
  const [showMainBar, setShowMainBar] = useState(true)
  const [showScheduleDots, setShowScheduleDots] = useState(true)
  const [hideWeekends, setHideWeekends] = useState(false)
  const [hideEmptyProjects, setHideEmptyProjects] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [compactMode, setCompactMode] = useState(false)
  const [keywordHighlights, setKeywordHighlights] = useState<KeywordHighlight[]>([])
  const keywordMatchers = useKeywordMatchers(keywordHighlights)
  const chartBodyRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const pendingScrollToTodayRef = useRef(false)
  const { labelWidth, setLabelWidth, labelWrapperRef, handleResizeStart: handlePanelResizeStart } = usePanelResize({ defaultWidth: DEFAULT_LABEL_WIDTH, minWidth: MIN_LABEL_WIDTH, maxWidth: MAX_LABEL_WIDTH })
  const { syncAtoB: syncLabel, syncBtoA: syncTimeline } = useScrollSync(scrollRef, labelRef)

  const { roles } = useRoles()

  const { others, trackCell: presenceTrackCell } = usePresence()
  const trackCell = useCallback((cell: string | null, cellLabel?: string | null) => presenceTrackCell('gantt', cell, cellLabel), [presenceTrackCell])
  const ganttPresenceMap = useMemo(() => {
    const map = new Map<string, typeof others[number]>()
    for (const u of others) {
      if (u.view === 'gantt' && u.cell) map.set(u.cell, u)
    }
    return map
  }, [others])

  const { year, month, statusFilter, brandFilter } = viewState

  const DAY_WIDTH = compactMode ? DAY_WIDTH_COMPACT : DAY_WIDTH_DEFAULT

  const {
    monthRange, allDates, timelineStartDate, monthOffsets,
    weekStartOffsets, totalWidth, dateIndexMap,
    getDateIdx, calcBarPos, addVisibleDays,
  } = useGanttTimeline(year, month, hideWeekends, DAY_WIDTH)

  const brandsRef = useRef(brands)
  brandsRef.current = brands

  // 브랜드 + 멤버 + 시나리오 조회 (마운트 시 1회, Realtime으로 갱신)
  const loadMasterData = useCallback(async () => {
    try {
      const [brandsData, membersData, scenariosRes, kwData] = await Promise.all([
        fetchBrands(),
        fetchMembers(),
        supabase.from('scenarios').select('*').order('id', { ascending: true }),
        fetchKeywordHighlights().catch(() => [] as KeywordHighlight[]),
      ])
      setKeywordHighlights(kwData)
      const mappedBrands = brandsData.map((b) => ({ id: b.id, code: b.code, name: b.name, color: b.color }))
      setBrands(mappedBrands)
      brandsRef.current = mappedBrands
      setMembers(membersData.map((m) => ({ id: m.id, nameShort: m.name_short })))
      if (!scenariosRes.error && scenariosRes.data) {
        setScenarios(scenariosRes.data.map((s) => ({ id: s.id, name: s.name, description: s.description })))
        const saved = readJson<number[]>('gantt.selectedScenarios')
        if (saved) {
          const validIds = new Set(scenariosRes.data.map((s) => s.id))
          setSelectedScenarioIds(new Set(saved.filter((id) => validIds.has(id))))
        } else {
          setSelectedScenarioIds(new Set(scenariosRes.data.map((s) => s.id)))
        }
      }
      setReady(true)
    } catch (error) {
      console.error('마스터 데이터 로드 실패:', error)
      setReady(true)
    }
  }, [])

  useEffect(() => {
    // localStorage 복원
    const bf = readJson<number[]>('brandFilter')
    if (bf) setViewState((prev) => ({ ...prev, brandFilter: bf }))
    const sf = readJson<string[]>('statusFilter')
    if (sf) setViewState((prev) => ({ ...prev, statusFilter: sf }))
    if (readBool('hideWeekends')) setHideWeekends(true)
    if (readBool('hideEmptyRows')) setHideEmptyProjects(true)
    if (readJson<boolean>('gantt.showMainBar') === false) setShowMainBar(false)
    if (readJson<boolean>('gantt.showScheduleDots') === false) setShowScheduleDots(false)
    if (readJson<boolean>('gantt.compactMode') === true) setCompactMode(true)
    loadMasterData()
  }, [loadMasterData])

  // 멤버 맵 (id → name_short)
  const memberMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const m of members) map.set(m.id, m.nameShort)
    return map
  }, [members])

  // 간트 데이터 조회 (brands를 외부에서 전달)
  const loadTasks = useCallback(async (showLoading = true) => {
    // roles가 아직 로딩 중이면 fetch 연기 (roleMembers가 {}로 저장되는 것 방지)
    if (roles.length === 0) {
      if (showLoading) setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    try {
      const options: GanttFetchOptions = {
        statusFilter: statusFilter.length > 0 ? statusFilter : null,
        brandFilter,
      }
      const brandsForQuery = brandsRef.current.map((b) => ({ id: b.id, code: b.code, color: b.color, sort_order: 0 }))
      const data = await fetchGanttTasks(roles, options, memberMap, brandsForQuery)
      setTasks(data)
    } catch (error) {
      console.error('간트 데이터 로드 실패:', error)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [statusFilter, brandFilter, memberMap, roles])
  const loadTasksRef = useRef(loadTasks)
  loadTasksRef.current = loadTasks

  // Realtime 구독 (loadTasks/pushUndo보다 먼저 선언)
  const { suppressRealtime } = useRealtimeSync({
    onScheduleChange: useCallback(() => { loadTasks(false) }, [loadTasks]),
    onProjectChange: useCallback(() => { loadTasks(false) }, [loadTasks]),
    onScenarioChange: useCallback(() => { loadTasks(false) }, [loadTasks]),
    onBrandChange: useCallback(() => { loadMasterData() }, [loadMasterData]),
    onMemberChange: useCallback(() => { loadMasterData() }, [loadMasterData]),
  })

  const { pushUndo } = useUndoStack(useCallback(async () => {
    suppressRealtime(['schedule', 'project', 'scenario'])
    await loadTasksRef.current(false)
  }, [suppressRealtime]))

  const {
    scenarios, setScenarios,
    selectedScenarioIds, setSelectedScenarioIds,
    activeScenarios,
    handleCreateScenario, handleRenameScenario, handleDeleteScenario,
    handleSsDelete, getTaskSsForScenario,
  } = useGanttScenarios({ loadTasks, pushUndo, suppressRealtime })

  const ssCount = activeScenarios.length
  const ROW_HEIGHT = compactMode
    ? COMPACT_ROW_HEIGHT
    : (showScheduleDots ? ROW_HEIGHT_WITH_PINS : ROW_HEIGHT_BASE) + ssCount * 5

  const scenarioColorMap = useMemo(() => {
    const map = new Map<number, string>()
    scenarios.forEach((s, idx) => map.set(s.id, SCENARIO_COLORS[idx % SCENARIO_COLORS.length]))
    return map
  }, [scenarios])

  // 다중 선택 상태 — 타임라인 바 선택 (useGanttDrag보다 먼저 초기화)
  const {
    selectedCount, isSelected, clearSelection, toggleSelect, getSelectedItems,
    setSelectedItems,
  } = useSelectionState()

  const {
    dragState,
    dragRef, skipNextClickRef, onBarClickRef,
    hoverLineRef,
    calcBar, calcDragBar, calcSsBar,
    handleBarDragStart, handleEmptyRowDragStart,
    handleScheduleDotDragStart,
    handleSsBarDragStart, handleSsBarResizeStart, handleSsCreateDragStart,
  } = useGanttDrag({
    tasks, setTasks, allDates, calcBarPos, addVisibleDays,
    loadTasks, pushUndo, suppressRealtime,
    scrollRef, setTooltip,
    getSelectedItems, selectedCount, clearSelection, isSelected,
  })

  // 스케줄 모달 (공통 훅)
  const membersForModal = useMemo(() => members.map(m => ({ id: m.id, name_short: m.nameShort })), [members])
  const {
    modalState: scheduleModal,
    openModal: openScheduleModal,
    closeModal: closeScheduleModal,
    handleSave: handleScheduleModalSave,
    handleDelete: handleScheduleModalDelete,
    handleCreate: handleScheduleModalCreate,
  } = useScheduleModal({
    members: membersForModal,
    suppressRealtime,
    pushUndo,
    onMutationComplete: useCallback((ctx?: MutationContext) => {
      if (!ctx) { loadTasksRef.current(false); return }
      setTasks(prev => prev.map(task => {
        if (task.id !== ctx.projectId) return task
        const schedules: GanttScheduleItem[] = [
          ...task.schedules.filter(s => s.date !== ctx.dateKey),
          ...ctx.schedules.map(s => ({
            id: s.id, date: ctx.dateKey, content: s.content,
            time: s.time, dateUncertain: s.dateUncertain,
          })),
        ]
        return { ...task, schedules }
      }))
    }, []),
    realtimeTables: ['schedule', 'project', 'scenario'],
  })

  const initialLoadDoneRef = useRef(false)
  useEffect(() => {
    if (!ready) return
    // roles가 아직 로딩 중이면 연기 — roles 도착 시 이 effect 재실행됨
    if (roles.length === 0) return
    const isFirst = !initialLoadDoneRef.current
    initialLoadDoneRef.current = true
    loadTasksRef.current(isFirst)
  }, [ready, loadTasks, roles])

  const {
    projectModal, setProjectModal,
    inlineEdit, setInlineEdit,
    collapsedIds,
    hasChildren, collapsedDescendants, visibleTasks,
    projectModalData,
    inlineInputRef,
    calcAutoFitWidth,
    toggleCollapse,
    handleProjectClick, handleProjectDoubleClick,
    handleInlineSave, handleInlineCancel, handleInlineKeyDown,
    handleProjectContextMenu, handleTimelineRowClick,
    handleCreateProject, handleInsertProject,
    handleCloseProjectModal, handleProjectSave, handleProjectDelete, handleProjectCreate,
  } = useGanttProjects({
    tasks, setTasks, brands, memberMap, roles, loadTasks, pushUndo, suppressRealtime,
    labelWidth, autoFitLabel, labelWrapperRef, allDates, scrollRef,
    dragRef, skipNextClickRef, onBarClickRef,
    trackCell, brandFilter, hideEmptyProjects, setTooltip, setLabelWidth,
  })

  // 좌측 패널 행 선택 (신규)
  const getChildrenIds = useCallback((id: number): number[] => {
    return getDescendantIds(id, visibleTasks, t => t.id, t => t.parentId)
  }, [visibleTasks])

  const {
    getExpandedIds: getRowExpandedIds,
    handleRowClick: handleRowSelectClick,
    clearSelection: clearRowSelection,
  } = useRowSelection({
    items: visibleTasks,
    getId: useCallback((t: GanttTask) => t.id, []),
    getBrandId: useCallback((t: GanttTask) => t.brandId, []),
    getChildren: getChildrenIds,
    containerRef: labelWrapperRef,
    rowAttribute: 'taskId',
  })

  const handleRowDragComplete = useCallback(async (
    updates: RowDragUpdate[],
  ) => {
    // Optimistic: 로컬 state 즉시 업데이트
    const updateMap = new Map(updates.map(u => [u.id, u]))
    setTasks(prev => {
      const updated = prev.map(t => {
        const u = updateMap.get(t.id)
        return u ? { ...t, parentId: u.parentId, sortOrder: u.sortOrder } : t
      })
      return resortTreeItems(updated, t => t.id, t => t.parentId, t => t.sortOrder, t => t.brandId, (t, d) => ({ ...t, depth: d }))
    })

    // API 호출 (백그라운드)
    suppressRealtime(['schedule', 'project', 'scenario'])
    const { error } = await supabase.rpc('batch_move_items', {
      p_projects: updates.map(u => ({
        id: u.id,
        sort_order: u.sortOrder,
        parent_id: u.parentId,
      })),
    })
    if (error) {
      console.error('프로젝트 이동 실패:', error)
      await loadTasks(false)
      throw error
    }
  }, [suppressRealtime, loadTasks])

  const {
    dragLineRef: rowDragLineRef,
    handleDragStart: handleRowDragStart,
  } = useRowDrag({
    items: visibleTasks,
    getId: useCallback((t: GanttTask) => t.id, []),
    getParentId: useCallback((t: GanttTask) => t.parentId, []),
    getSortOrder: useCallback((t: GanttTask) => t.sortOrder, []),
    getBrandId: useCallback((t: GanttTask) => t.brandId, []),
    getDepth: useCallback((t: GanttTask) => t.depth, []),
    containerRef: labelWrapperRef,
    rowAttribute: 'taskId',
    getSelectedIds: getRowExpandedIds,
    getChildren: getChildrenIds,
    onComplete: handleRowDragComplete,
    pushUndo,
  })

  // dateIndexMap → pixel 기반 dateOffsets (useScrollToToday 훅용)
  const ganttDateOffsets = useMemo(() => {
    const offsets = new Map<string, number>()
    for (const [key, idx] of dateIndexMap) offsets.set(key, idx * DAY_WIDTH)
    return offsets
  }, [dateIndexMap, DAY_WIDTH])

  // 오늘 스크롤 (공통 훅 — 캘린더/워크로드와 동일)
  const { handleScrollToToday: scrollToToday, scrollImmediate } = useScrollToToday({
    scrollRef,
    dateOffsets: ganttDateOffsets,
    labelWidth,
    viewYear: year,
    viewMonth: month,
    onNavigateToToday: useCallback(() => {
      const now = new Date()
      setViewState(prev => ({ ...prev, year: now.getFullYear(), month: now.getMonth() + 1 }))
    }, []),
    dataLoaded: !loading && tasks.length > 0,
  })

  // 컴팩트 모드 전환 후 ganttDateOffsets 갱신 시 오늘 위치로 스크롤 복원
  useEffect(() => {
    if (!pendingScrollToTodayRef.current) return
    pendingScrollToTodayRef.current = false
    scrollImmediate()
  }, [ganttDateOffsets]) // eslint-disable-line react-hooks/exhaustive-deps -- ganttDateOffsets 변경에만 반응

  // 월 변경 시 해당 월 시작으로 스크롤 (오늘이 아닌 다른 월로 이동할 때)
  useEffect(() => {
    if (!scrollRef.current || loading) return
    const today = new Date()
    if (today.getFullYear() === year && today.getMonth() + 1 === month) return // 오늘 월은 useScrollToToday가 처리
    const currentMonthOffset = monthOffsets.find((m) => m.year === year && m.month === month)
    if (currentMonthOffset) {
      scrollRef.current.scrollLeft = Math.max(0, currentMonthOffset.offset - scrollRef.current.clientWidth / 2)
    }
  }, [loading, year, month, monthOffsets])

  // 월 네비게이션
  const { goToPrevMonth, goToNextMonth, goToToday } = useMonthNavigation(
    year, month,
    useCallback((y, m) => setViewState((prev) => ({ ...prev, year: y, month: m })), []),
    scrollToToday,
  )

  const toggleStatus = useCallback((status: (typeof STATUS_OPTIONS)[number]) => {
    setViewState((prev) => {
      const current = prev.statusFilter
      const isActive = current.includes(status)
      const next = isActive ? current.filter((s) => s !== status) : [...current, status]
      writeJson('statusFilter', next)
      return { ...prev, statusFilter: next }
    })
  }, [])

  // 패널 리사이즈 핸들 더블클릭 → 가장 긴 텍스트에 맞춤
  const handlePanelAutoFit = useCallback(() => {
    const w = calcAutoFitWidth()
    if (w) {
      setLabelWidth(w)
      setAutoFitLabel(true)
    }
  }, [calcAutoFitWidth])

  // --- 스케줄 모달 ---

  const handleTimelineRowContextMenu = useCallback((task: GanttTask, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const container = scrollRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const pixelX = e.clientX - rect.left + container.scrollLeft
    const dayIndex = Math.floor(pixelX / DAY_WIDTH)
    if (dayIndex < 0 || dayIndex >= allDates.length) return
    const clickedDate = formatDateKey(allDates[dayIndex])
    openScheduleModal(task.id, task.projectName, clickedDate)
  }, [allDates, openScheduleModal])

  const handleScheduleDotContextMenu = useCallback((task: GanttTask, sch: GanttScheduleItem, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openScheduleModal(task.id, task.projectName, sch.date)
  }, [openScheduleModal])

  // --- Memoized data for modal ---


  const todayStr = formatDateKey(new Date())

  // DateHeader용 날짜 배열 변환
  const headerDates = useMemo(() => {
    return allDates.map((d) => {
      const dk = formatDateKey(d)
      return {
        date: d,
        dateKey: dk,
        isWeekend: isWeekendDay(d),
        isToday: dk === todayStr,
      }
    })
  }, [allDates, todayStr])

  // 오늘/주말 배경 인덱스 (overlay용, headerDates에서 파생)
  const gridBackgrounds = useMemo(() => {
    return headerDates.reduce<{ index: number; isToday: boolean }[]>((acc, h, i) => {
      if (h.isToday || h.isWeekend) acc.push({ index: i, isToday: h.isToday })
      return acc
    }, [])
  }, [headerDates])

  // 브랜드별 그룹화 + 접기/펼치기 (공유 훅)
  const { brandGroups, collapsedBrands, toggleBrandCollapse } = useBrandGroups(visibleTasks, 'gantt.collapsedBrands')

  // 브랜드 맵 (id → brand)
  const brandMap = useMemo(() => {
    const map = new Map<number, Brand>()
    for (const b of brands) map.set(b.id, b)
    return map
  }, [brands])

  // isLastAtDepth: 브랜드 그룹 단위로 계산
  const isLastAtDepthMap = useMemo(() => {
    const result = new Map<number, boolean[]>()
    for (const [, groupTasks] of brandGroups.groupMap) {
      const computed = computeIsLastAtDepth(groupTasks)
      for (const [id, arr] of computed) result.set(id, arr)
    }
    return result
  }, [brandGroups])

  // 타임라인 렌더용 flat 목록: 브랜드 헤더 + 프로젝트 행 (순서 동기화용)
  const timelineRows = useMemo<TimelineRow[]>(() => {
    const rows: TimelineRow[] = []
    for (const brandId of brandGroups.brandOrder) {
      rows.push({ type: 'brand', brandId, height: compactMode ? COMPACT_BRAND_HEADER_HEIGHT : BRAND_HEADER_HEIGHT })
      if (!collapsedBrands.has(brandId)) {
        const groupTasks = brandGroups.groupMap.get(brandId) ?? []
        for (const task of groupTasks) {
          rows.push({ type: 'task', task, height: compactMode ? COMPACT_ROW_HEIGHT : getRowHeight(task.depth, ROW_HEIGHT) })
        }
      }
    }
    return rows
  }, [brandGroups, collapsedBrands, ROW_HEIGHT, compactMode])



  // 스케줄 ID → 키워드 색상 맵 (렌더 루프에서 O(1) 조회용)
  const scheduleKeywordColorMap = useMemo(() => {
    const map = new Map<number, string>()
    if (!showScheduleDots || keywordMatchers.length === 0) return map
    for (const row of timelineRows) {
      if (row.type !== 'task') continue
      for (const sch of row.task.schedules) {
        if (!sch.content) continue
        const matched = keywordMatchers.find((m) => m.regex.test(sch.content!))
        if (matched) map.set(sch.id, matched.color)
      }
    }
    return map
  }, [showScheduleDots, keywordMatchers, timelineRows])

  // 키워드 컬럼 하이라이트: 같은 날짜에 2+ 행에서 키워드 매칭 → 세로 묶음 사각형
  const keywordColumnHighlights = useMemo(() => {
    const result: { left: number; width: number; top: number; height: number; color: string }[] = []
    if (!compactMode || !showScheduleDots || keywordMatchers.length === 0) return result
    // 각 행의 Y 오프셋 계산
    const rowOffsets: number[] = []
    let y = 0
    for (const row of timelineRows) {
      rowOffsets.push(y)
      y += row.height
    }
    // 날짜+색상별로 키워드 매칭 행 수집
    const dateColorMatches = new Map<string, Set<number>>()
    for (let ri = 0; ri < timelineRows.length; ri++) {
      const row = timelineRows[ri]
      if (row.type !== 'task') continue
      for (const sch of row.task.schedules) {
        if (!sch.content) continue
        const matched = keywordMatchers.find((m) => m.showHeaderDot && m.regex.test(sch.content!))
        if (!matched) continue
        const key = `${sch.date}::${matched.color}`
        const existing = dateColorMatches.get(key)
        if (existing) {
          existing.add(ri)
        } else {
          dateColorMatches.set(key, new Set([ri]))
        }
      }
    }
    // 연속된 행끼리만 묶기 (직접 인접한 task만)
    const dotSize = COMPACT_PIN_SIZE
    const pad = COMPACT_PIN_PAD
    for (const [key, rowIdxSet] of dateColorMatches) {
      if (rowIdxSet.size < 2) continue
      const [dateKey, color] = key.split('::')
      const colIdx = dateIndexMap.get(dateKey)
      if (colIdx === undefined) continue
      const sorted = [...rowIdxSet].sort((a, b) => a - b)
      // 연속 그룹 분할 (브랜드 헤더 1행 허용)
      const groups: number[][] = [[sorted[0]]]
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - sorted[i - 1] <= 2) {
          groups[groups.length - 1].push(sorted[i])
        } else {
          groups.push([sorted[i]])
        }
      }
      for (const group of groups) {
        if (group.length < 2) continue
        const top = rowOffsets[group[0]] - pad
        const bottom = rowOffsets[group[group.length - 1]] + dotSize + pad
        result.push({
          left: colIdx * DAY_WIDTH + 3,
          width: DAY_WIDTH - 6,
          top,
          height: bottom - top,
          color,
        })
      }
    }
    return result
  }, [compactMode, showScheduleDots, keywordMatchers, timelineRows, dateIndexMap, DAY_WIDTH])

  // Lasso 선택 (timelineRows 기반 — 브랜드 헤더 + 가변 행 높이 반영)
  const { lassoState, handleLassoStart } = useGanttLasso({
    timelineRows, activeScenarios, calcBarPos, scrollRef,
    showMainBar, showScheduleDots, dateIndexMap,
    getTaskSsForScenario, setSelectedItems, skipNextClickRef,
    headerHeight: HEADER_HEIGHT, rowHeightBase: ROW_HEIGHT_BASE,
  })

  return (
    <div className="flex flex-col flex-1 h-full">
      {/* 툴바 */}
      <div className="relative z-20 flex items-center gap-4 p-3 border-b border-white/70" style={GLASS_TOOLBAR_STYLE}>
        <div className="flex items-center gap-1">
          <button onClick={goToPrevMonth} className="px-2 py-1 rounded-lg text-sm text-gray-400 hover:text-blue-700 transition-all" style={GLASS_NAV_BTN_STYLE} aria-label="이전 달">&lt;</button>
          <span className="text-sm font-semibold min-w-[100px] text-center text-gray-900">{year}년 {month}월</span>
          <button onClick={goToNextMonth} className="px-2 py-1 rounded-lg text-sm text-gray-400 hover:text-blue-700 transition-all" style={GLASS_NAV_BTN_STYLE} aria-label="다음 달">&gt;</button>
          <button onClick={goToToday} className="ml-1 px-2.5 py-1 rounded-lg text-sm text-gray-400 hover:text-blue-700 transition-all" style={GLASS_NAV_BTN_STYLE}>오늘</button>
        </div>
        <div className="h-5 w-px bg-black/[0.06]" />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 mr-0.5">상태</span>
          {STATUS_OPTIONS.map((status) => {
            const active = statusFilter.includes(status)
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
        <div className="h-5 w-px bg-black/[0.06]" />
        <BrandFilter
          brands={brands}
          value={brandFilter ?? null}
          onChange={(next) => {
            setViewState((prev) => ({ ...prev, brandFilter: next }))
            writeJson('brandFilter', next)
          }}
        />
        <div className="h-5 w-px bg-black/[0.06]" />
        <button
          onClick={() => {
            setAutoFitLabel((v) => {
              if (v) setLabelWidth(DEFAULT_LABEL_WIDTH)
              return !v
            })
          }}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${autoFitLabel ? 'text-white border-transparent' : 'text-gray-400'}`}
          style={autoFitLabel ? { ...PILL_ACTIVE_STYLE, border: '1px solid transparent' } : PILL_INACTIVE_STYLE}
        >
          자동 맞춤
        </button>
        <button
          onClick={() => setHideWeekends((v) => { const next = !v; writeBool('hideWeekends', next); return next })}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${hideWeekends ? 'text-white border-transparent' : 'text-gray-400'}`}
          style={hideWeekends ? { ...PILL_ACTIVE_STYLE, border: '1px solid transparent' } : PILL_INACTIVE_STYLE}
        >
          주말 숨김
        </button>
        <button
          onClick={() => setHideEmptyProjects((v) => { const next = !v; writeBool('hideEmptyRows', next); return next })}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${hideEmptyProjects ? 'text-white border-transparent' : 'text-gray-400'}`}
          style={hideEmptyProjects ? { ...PILL_ACTIVE_STYLE, border: '1px solid transparent' } : PILL_INACTIVE_STYLE}
        >
          빈 행 숨김
        </button>
        <div className="h-5 w-px bg-black/[0.06]" />
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowMainBar((v) => { const next = !v; writeJson('gantt.showMainBar', next); return next })}
            className={`px-2 py-1 rounded-full text-[10px] font-medium transition-all ${showMainBar ? 'text-white border-transparent' : 'text-gray-400'}`}
            style={showMainBar ? { background: 'linear-gradient(135deg, #3b82f6, #60a5fa)', boxShadow: '0 2px 6px rgba(59,130,246,0.2)', border: '1px solid transparent' } : PILL_INACTIVE_STYLE}
          >
            기본
          </button>
          <button
            onClick={() => setShowScheduleDots((v) => { const next = !v; writeJson('gantt.showScheduleDots', next); return next })}
            className={`px-2 py-1 rounded-full text-[10px] font-medium transition-all ${showScheduleDots ? 'text-white border-transparent' : 'text-gray-400'}`}
            style={showScheduleDots ? { background: 'linear-gradient(135deg, #4b5563, #6b7280)', boxShadow: '0 2px 6px rgba(75,85,99,0.2)', border: '1px solid transparent' } : PILL_INACTIVE_STYLE}
          >
            스케줄
          </button>
          <button
            onClick={() => setCompactMode((v) => { const next = !v; writeJson('gantt.compactMode', next); pendingScrollToTodayRef.current = true; return next })}
            className={`px-2 py-1 rounded-full text-[10px] font-medium transition-all ${compactMode ? 'text-white border-transparent' : 'text-gray-400'}`}
            style={compactMode ? { background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)', boxShadow: '0 2px 6px rgba(139,92,246,0.2)', border: '1px solid transparent' } : PILL_INACTIVE_STYLE}
          >
            한눈
          </button>
          <span className="text-xs text-gray-500 mr-0.5">시나리오</span>
          {scenarios.length > 0 && (
            <button
              onClick={() => {
                if (selectedScenarioIds.size === scenarios.length) {
                  setSelectedScenarioIds(new Set())
                  writeJson('gantt.selectedScenarios', [])
                } else {
                  const allIds = scenarios.map((s) => s.id)
                  setSelectedScenarioIds(new Set(allIds))
                  writeJson('gantt.selectedScenarios', allIds)
                }
              }}
              className={`px-2 py-1 rounded-full text-[10px] font-medium transition-all ${selectedScenarioIds.size === scenarios.length ? 'text-white border-transparent' : 'text-gray-400'}`}
              style={selectedScenarioIds.size === scenarios.length ? { ...PILL_ACTIVE_STYLE, border: '1px solid transparent' } : PILL_INACTIVE_STYLE}
            >
              전체
            </button>
          )}
          {scenarios.map((s, idx) => {
            const active = selectedScenarioIds.has(s.id)
            const color = SCENARIO_COLORS[idx % SCENARIO_COLORS.length]
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedScenarioIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(s.id)) next.delete(s.id)
                    else next.add(s.id)
                    writeJson('gantt.selectedScenarios', [...next])
                    return next
                  })
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  const action = prompt(`"${s.name}" 시나리오:\n1) 이름변경\n2) 삭제\n\n번호 입력:`)
                  if (action === '1') {
                    const name = prompt('시나리오 이름:', s.name)
                    if (name && name.trim()) handleRenameScenario(s.id, name.trim())
                  } else if (action === '2') {
                    if (confirm(`"${s.name}" 시나리오를 삭제하시겠습니까?`)) handleDeleteScenario(s.id)
                  }
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${active ? 'text-white' : 'text-gray-400'}`}
                style={active ? { backgroundColor: color, color: '#fff', border: `1px solid ${color}`, boxShadow: `0 2px 6px ${color}33` } : PILL_INACTIVE_STYLE}
              >
                {s.name}
              </button>
            )
          })}
          <button
            onClick={handleCreateScenario}
            className="px-2 py-1 rounded-full text-xs text-gray-400 hover:text-blue-700 transition-all"
            style={PILL_INACTIVE_STYLE}
          >
            +
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setExportDialogOpen(true)}
            className="px-2.5 py-1 rounded-full text-xs font-medium text-gray-400 hover:text-blue-700 transition-all"
            style={PILL_INACTIVE_STYLE}
          >
            내보내기
          </button>
          <button
            onClick={handleCreateProject}
            className="px-2.5 py-1 rounded-full text-xs font-medium text-white transition-all hover:shadow-md"
            style={{ background: primaryGradient }}
          >
            + 프로젝트
          </button>
        </div>
      </div>

      {/* 간트 차트 본체 */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-gray-500">😛 데이터를 불러오는 중... 🤪</div>
      ) : tasks.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-gray-400">표시할 프로젝트가 없습니다</div>
      ) : (
        <div ref={chartBodyRef} className="flex flex-1 overflow-hidden relative">
          {/* 좌측 프로젝트 목록 (고정) */}
          <div ref={labelWrapperRef} className="absolute top-0 left-0 bottom-0 z-[2]" style={{ width: labelWidth }}>
            <GlassPanel ref={labelRef} width={labelWidth} onScroll={syncTimeline}>
              {/* 타임라인 헤더와 높이 맞춤 (빈 공간) */}
              <div style={{ height: HEADER_HEIGHT }} />
              {brandGroups.brandOrder.map((brandId) => {
                const brand = brandMap.get(brandId)
                const brandColor = brand?.color || '#888'
                const isExpanded = !collapsedBrands.has(brandId)
                const groupTasks = isExpanded ? (brandGroups.groupMap.get(brandId) ?? []) : []
                return (
                  <Fragment key={`brand-${brandId}`}>
                    {/* 브랜드 그룹 헤더 */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: compactMode ? '2px 8px' : '7px 12px',
                        height: compactMode ? COMPACT_BRAND_HEADER_HEIGHT : BRAND_HEADER_HEIGHT,
                        background: `${brandColor}14`,
                        borderBottom: `1px solid ${brandColor}1C`,
                        cursor: 'pointer',
                      }}
                      onClick={() => toggleBrandCollapse(brandId)}
                    >
                      <ChevronCircle expanded={isExpanded} />
                      <span
                        style={{ background: brandColor }}
                        className="text-[9px] text-white px-2 py-0.5 rounded-[10px] font-semibold ml-1.5 tracking-wide"
                      >
                        {brand?.code ?? ''}
                      </span>
                      <span className="text-[11px] text-gray-500 ml-2 font-medium">{brand?.name ?? ''}</span>
                      <span className="ml-auto text-[10px] text-gray-400">{brandGroups.groupMap.get(brandId)?.length ?? 0}</span>
                    </div>
                    {/* 프로젝트 행 */}
                    {isExpanded && groupTasks.map((task, index) => {
                      const isMuted = task.status !== '진행중'
                      const nextTask = groupTasks[index + 1]
                      const canCollapse = hasChildren.has(task.id)
                      const isCollapsed = collapsedIds.has(task.id)
                      const otherOnRow = ganttPresenceMap.get(String(task.id))
                      const rowHeight = compactMode ? COMPACT_ROW_HEIGHT : getRowHeight(task.depth, ROW_HEIGHT)
                      const depthStyle = getDepthStyle(task.depth)
                      const taskIsLastAtDepth = isLastAtDepthMap.get(task.id) ?? []
                      return (
                        <Fragment key={task.id}>
                          <div
                            data-task-id={task.id}
                            className={`group/row relative flex items-center cursor-pointer select-none hover:bg-[var(--color-primary-003)] ${compactMode ? 'border-b border-gray-200' : 'border-b border-black/[0.025]'}`}
                            style={{
                              height: rowHeight,
                              paddingLeft: 10,
                              paddingRight: 8,
                              opacity: isMuted ? 0.5 : 1,
                            }}
                            onClick={(e) => {
                              if (selectedCount > 0) clearSelection()
                              handleRowSelectClick(task.id, e)
                              handleProjectClick(task, e)
                            }}
                            onDoubleClick={(e) => handleProjectDoubleClick(task, e)}
                            onContextMenu={(e) => handleProjectContextMenu(task, e)}
                          >
                            {otherOnRow && (
                              <div
                                className="absolute left-0 top-0 bottom-0 w-[3px]"
                                style={{ backgroundColor: otherOnRow.color }}
                                title={otherOnRow.email}
                              />
                            )}
                            {/* 드래그 핸들 — 맨 왼쪽 */}
                            <span
                              className="flex-shrink-0 cursor-grab active:cursor-grabbing mr-0.5 select-none text-gray-800 transition-colors duration-150"
                              style={{ fontSize: 14, letterSpacing: '1px', lineHeight: 1, width: 16, textAlign: 'center' }}
                              onMouseDown={(e) => handleRowDragStart(e, task.id)}
                            >&#x2807;</span>
                            {/* 트리 연결선 또는 compact indent */}
                            {compactMode
                              ? <span className="flex-shrink-0" style={{ width: task.depth * 8 }} />
                              : <TreeLines depth={task.depth} isLastAtDepth={taskIsLastAtDepth} />
                            }
                            {/* Chevron 또는 spacer */}
                            {!compactMode && canCollapse ? (
                              <ChevronCircle
                                expanded={!isCollapsed}
                                onClick={(e) => { e.stopPropagation(); toggleCollapse(task.id) }}
                              />
                            ) : !compactMode ? (
                              <span className="flex-shrink-0" style={{ width: 16 }} />
                            ) : null}
                            {/* 프로젝트명 */}
                            <span
                              data-project-name
                              className="truncate flex-1"
                              style={{
                                fontSize: depthStyle.fontSize,
                                fontWeight: depthStyle.fontWeight,
                                color: isMuted ? undefined : (task.depth === 0 ? '#111827' : task.depth <= 2 ? '#1f2937' : '#4b5563'),
                              }}
                            >
                              {task.projectName}
                            </span>
                            {/* 담당자 pill */}
                            {!compactMode && <AssigneePills roleMembers={task.roleMembers} roles={roles} muted={isMuted} />}
                            {!compactMode && !task.start && (
                              <span className="ml-1 text-[10px] text-orange-300 flex-shrink-0">기간 미설정</span>
                            )}
                            {!compactMode && activeScenarios.length > 0 && (
                              <span className="flex items-center gap-0.5 ml-auto mr-1 flex-shrink-0">
                                {activeScenarios.map((scenario) => {
                                  const hasSs = getTaskSsForScenario(task, scenario.id) !== null
                                  if (!hasSs) return null
                                  const color = scenarioColorMap.get(scenario.id) ?? SCENARIO_COLORS[0]
                                  return <span key={scenario.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                })}
                              </span>
                            )}
                          </div>
                          {/* 행 사이 + 버튼 (hover 시 표시) */}
                          <div className="relative" style={{ height: 0, zIndex: 10 }}>
                            <div
                              className="absolute left-0 right-0 flex items-center justify-center group/insert"
                              style={{ top: -8, height: 16, cursor: 'default' }}
                            >
                              <div className="absolute left-2 right-2 top-1/2 h-px bg-[var(--color-primary)]/40 opacity-0 group-hover/insert:opacity-100 transition-opacity pointer-events-none" />
                              <button
                                className="relative w-4 h-4 rounded-full bg-[var(--color-primary)] text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover/insert:opacity-100 transition-opacity hover:bg-[var(--color-primary-light)] shadow-sm"
                                onClick={() => handleInsertProject(task, nextTask)}
                                aria-label="프로젝트 추가"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </Fragment>
                      )
                    })}
                  </Fragment>
                )
              })}
            </GlassPanel>

            {/* 인라인 에디터 */}
            {inlineEdit?.active && (
              <input
                ref={inlineInputRef}
                type="text"
                value={inlineEdit.value}
                onChange={(e) => setInlineEdit((prev) => prev ? { ...prev, value: e.target.value } : null)}
                onKeyDown={handleInlineKeyDown}
                onBlur={handleInlineSave}
                className="absolute z-20 border-2 border-[var(--color-primary)] rounded-none px-1 text-sm outline-none bg-white text-gray-900"
                style={{
                  top: inlineEdit.rect.top,
                  left: inlineEdit.rect.left,
                  width: inlineEdit.rect.width,
                  height: inlineEdit.rect.height,
                  lineHeight: `${inlineEdit.rect.height}px`,
                }}
              />
            )}

            {/* 행 드래그 인디케이터 */}
            <div
              ref={rowDragLineRef}
              className="pointer-events-none absolute z-20"
              style={{ display: 'none', height: 3, right: 0, background: '#3b82f6', borderRadius: 2 }}
            />

            {/* 패널 리사이즈 핸들 */}
            <div
              className="absolute top-0 bottom-0 right-0 w-1 cursor-col-resize z-30 hover:bg-blue-400 active:bg-blue-500 transition-colors"
              onMouseDown={handlePanelResizeStart}
              onDoubleClick={handlePanelAutoFit}
            />
          </div>

          {/* 우측 타임라인 (스크롤) */}
          <div
            ref={scrollRef}
            onScroll={syncLabel}
            className="flex-1 overflow-auto"
            onMouseLeave={() => {
              if (!dragRef.current) setTooltip(null)
              if (hoverLineRef.current) hoverLineRef.current.style.display = 'none'
            }}
            onMouseMove={(e) => {
              if (hoverLineRef.current && scrollRef.current) {
                const rect = scrollRef.current.getBoundingClientRect()
                const x = e.clientX - rect.left + scrollRef.current.scrollLeft
                // 날짜 컬럼 중앙에 스냅
                const colIndex = Math.floor(x / DAY_WIDTH)
                const snappedX = colIndex * DAY_WIDTH + DAY_WIDTH / 2
                hoverLineRef.current.style.display = 'block'
                hoverLineRef.current.style.left = `${snappedX}px`
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div style={{ width: totalWidth, minHeight: '100%' }} className="relative">
              {/* 호버 세로선 */}
              <div ref={hoverLineRef} className="absolute top-0 bottom-0 w-px bg-red-300 pointer-events-none z-20" style={{ display: 'none' }} />
              <DateHeader
                dates={headerDates}
                monthOffsets={monthOffsets}
                totalWidth={totalWidth}
                getDayWidth={() => DAY_WIDTH}
                currentYear={year}
                currentMonth={month}


              />

              {/* 키워드 컬럼 묶음 사각형 */}
              {keywordColumnHighlights.length > 0 && (
                <div className="absolute left-0 right-0 pointer-events-none" style={{ top: HEADER_HEIGHT, zIndex: 1 }}>
                  {keywordColumnHighlights.map((h, i) => (
                    <div
                      key={`kw-col-${i}`}
                      className="absolute"
                      style={{
                        left: h.left,
                        width: h.width,
                        top: h.top,
                        height: h.height,
                        border: `1.5px solid ${h.color}`,
                        borderRadius: 6,
                        opacity: 0.55,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* 그리드 overlay: 구분선 + 오늘/주말 배경 (1회만 렌더) */}
              <div className="absolute left-0 right-0 pointer-events-none" style={{ top: HEADER_HEIGHT, bottom: 0 }}>
                {monthOffsets.map((m) => (
                  <div
                    key={`ol-month-${m.year}-${m.month}`}
                    className={`absolute top-0 bottom-0 ${m.month === 1 ? 'border-l-[3px] border-gray-500' : 'border-l-2 border-gray-300'}`}
                    style={{ left: m.offset }}
                  />
                ))}
                {weekStartOffsets.map((offset) => (
                  <div
                    key={`ol-week-${offset}`}
                    className="absolute top-0 bottom-0 border-l border-gray-300"
                    style={{ left: offset }}
                  />
                ))}
                {gridBackgrounds.map((bg) => (
                  <div
                    key={`ol-bg-${bg.index}`}
                    className={`absolute top-0 bottom-0 ${bg.isToday ? 'bg-[var(--color-primary)]/[0.04]' : ''}`}
                    style={{
                      left: bg.index * DAY_WIDTH,
                      width: DAY_WIDTH,
                      ...(!bg.isToday ? { backgroundColor: 'rgba(0,0,0,0.008)' } : {}),
                    }}
                  />
                ))}
              </div>

              {/* 행별 그리드 + 바 */}
              {timelineRows.map((row) => {
                // 브랜드 헤더 행 (빈 행)
                if (row.type === 'brand') {
                  const brand = brandMap.get(row.brandId)
                  const brandColor = brand?.color || '#888'
                  return (
                    <div
                      key={`brand-tl-${row.brandId}`}
                      className="relative border-b border-black/[0.025]"
                      style={{ height: row.height, background: `${brandColor}14` }}
                    />
                  )
                }

                const task = row.task
                const taskRowHeight = row.height
                const bar = calcBar(task)
                const isCollapsed = collapsedIds.has(task.id)
                const descendants = isCollapsed ? collapsedDescendants.get(task.id) ?? [] : []
                const pinSpace = showScheduleDots && !compactMode ? PIN_SPACE : 0
                const mainBarHeight = compactMode
                  ? (showMainBar ? COMPACT_BAR_HEIGHT : 0)
                  : !showMainBar ? 0 : ssCount > 0 ? Math.max(ROW_HEIGHT_BASE - 6 - ssCount * 5, 8) : ROW_HEIGHT_BASE - 12
                const mainBarTop = compactMode
                  ? Math.floor((taskRowHeight - mainBarHeight) / 2)
                  : showScheduleDots ? pinSpace : Math.floor((taskRowHeight - mainBarHeight) / 2)
                const ssLineHeight = compactMode ? COMPACT_SS_LINE_HEIGHT : (showMainBar ? 4 : 6)
                const ssLineGap = compactMode ? COMPACT_SS_LINE_GAP : (showMainBar ? 5 : 8)
                const ssBlockHeight = ssCount * ssLineGap
                const ssStartTop = compactMode
                  ? Math.max(1, (taskRowHeight - ssBlockHeight) / 2)
                  : showMainBar
                    ? mainBarTop + mainBarHeight + 2
                    : Math.max(2, (taskRowHeight - ssBlockHeight) / 2)
                return (
                  <Fragment key={task.id}>
                    <div
                      className={`relative cursor-pointer ${compactMode ? 'border-b border-gray-200' : 'border-b border-black/[0.025]'}`}
                      style={{ height: taskRowHeight }}
                      onClick={(e) => {
                        if (!skipNextClickRef.current && selectedCount > 0 && !e.shiftKey) clearSelection()
                        handleTimelineRowClick(task, e)
                      }}
                      onContextMenu={(e) => handleTimelineRowContextMenu(task, e)}
                      onMouseDown={(e) => {
                        // Shift+드래그 → lasso 선택
                        if (e.shiftKey) { handleLassoStart(e); return }
                        // 바 없는 행 드래그 → 바 생성
                        if (!task.start) handleEmptyRowDragStart(task, e)
                      }}
                    >
                      {/* 간트 바 */}
                      {showMainBar && (() => {
                        const isDragging = dragState?.taskId === task.id && !dragState.ssId && !dragState.ssCreate && !dragState.schId
                        const displayBar = isDragging ? calcDragBar(dragState) : bar
                        if (!displayBar) return null
                        const barWidth = Math.max(displayBar.width, 6)
                        const handleWidth = Math.min(6, barWidth / 3)
                        const isBarSelected = isSelected('project', task.id)

                        return (
                          <div
                            className={`absolute rounded group ${isDragging ? 'opacity-90 z-10' : 'hover:brightness-110'}`}
                            style={{
                              left: displayBar.left + 2,
                              width: barWidth,
                              top: mainBarTop,
                              height: mainBarHeight,
                              background: task.status === '완료' ? '#d1d5db' : `linear-gradient(90deg, ${getStatusColor(task.status)}, ${getStatusColorLight(task.status)})`,
                              cursor: isDragging ? 'grabbing' : 'grab',
                              transition: isDragging ? 'none' : undefined,
                              boxShadow: isBarSelected ? `0 0 0 2px ${primaryHex}, 0 0 0 4px ${primaryAlpha(0.3)}` : task.status === '완료' ? 'none' : `0 2px 8px ${getStatusColor(task.status)}30`,
                              zIndex: isBarSelected ? 1 : undefined,
                            }}
                            onMouseDown={(e) => {
                              if (e.shiftKey) {
                                e.preventDefault()
                                e.stopPropagation()
                                clearRowSelection()
                                toggleSelect({ type: 'project', id: task.id, taskId: task.id })
                                return
                              }
                              handleBarDragStart(task, 'move', e)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseEnter={(e) => {
                              if (dragRef.current) return
                              const rect = e.currentTarget.getBoundingClientRect()
                              setTooltip({ task, x: rect.left + rect.width / 2, y: rect.top - 8 })
                            }}
                            onMouseLeave={() => { if (!dragRef.current) setTooltip(null) }}
                          >
                            {!compactMode && barWidth > 60 && (
                              <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white truncate font-medium drop-shadow-sm pointer-events-none">
                                {task.projectName}
                              </span>
                            )}
                            {/* 좌측 리사이즈 핸들 */}
                            <div
                              className="absolute left-0 top-0 bottom-0 cursor-col-resize opacity-0 group-hover:opacity-100 rounded-l"
                              style={{ width: handleWidth, backgroundColor: 'rgba(0,0,0,0.2)' }}
                              onMouseDown={(e) => { e.stopPropagation(); handleBarDragStart(task, 'resize-left', e) }}
                            />
                            {/* 우측 리사이즈 핸들 */}
                            <div
                              className="absolute right-0 top-0 bottom-0 cursor-col-resize opacity-0 group-hover:opacity-100 rounded-r"
                              style={{ width: handleWidth, backgroundColor: 'rgba(0,0,0,0.2)' }}
                              onMouseDown={(e) => { e.stopPropagation(); handleBarDragStart(task, 'resize-right', e) }}
                            />
                          </div>
                        )
                      })()}

                      {/* 스케줄 다이아몬드 마커 */}
                      {showScheduleDots && task.schedules.map((sch) => {
                        const isDraggingThis = dragState?.schId === sch.id
                        const displayDate = isDraggingThis ? formatDateKey(dragState.currentStart) : sch.date
                        const schIdx = dateIndexMap.get(displayDate)
                        if (schIdx === undefined) return null
                        const hitSize = DAY_WIDTH
                        const hitLeft = schIdx * DAY_WIDTH
                        const keywordColor = scheduleKeywordColorMap.get(sch.id) ?? null
                        const pinColor = isDraggingThis ? '#dc2626' : (keywordColor ?? (sch.dateUncertain ? '#d97706' : '#374151'))
                        const isSchSelected = isSelected('schedule', sch.id)
                        return (
                          <div
                            key={`sch-${sch.id}`}
                            className="absolute z-[1] flex justify-center items-start"
                            style={{
                              left: hitLeft, top: 0, width: hitSize, height: taskRowHeight,
                              paddingTop: compactMode ? Math.max(mainBarTop - 5, 0) : 1,
                              cursor: isDraggingThis ? 'grabbing' : 'grab',
                              opacity: isDraggingThis ? 0.8 : 1,
                            }}
                            onMouseDown={(e) => {
                              if (e.shiftKey) {
                                e.preventDefault()
                                e.stopPropagation()
                                clearRowSelection()
                                toggleSelect({ type: 'schedule', id: sch.id, taskId: task.id })
                                return
                              }
                              handleScheduleDotDragStart(task, sch, e)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseEnter={(e) => {
                              if (dragRef.current) return
                              const rect = e.currentTarget.getBoundingClientRect()
                              setTooltip({
                                task: {
                                  ...task,
                                  text: sch.content || '(내용 없음)',
                                  start: new Date(sch.date),
                                  end: new Date(sch.date),
                                  duration: 0,
                                } as GanttTask,
                                x: rect.left + rect.width / 2,
                                y: rect.top - 4,
                              })
                            }}
                            onMouseLeave={() => { if (!dragRef.current) setTooltip(null) }}
                            onContextMenu={(e) => handleScheduleDotContextMenu(task, sch, e)}
                          >
                            <div className="pointer-events-none flex flex-col items-center">
                              <div
                                style={{
                                  width: compactMode ? COMPACT_PIN_SIZE : 6,
                                  height: compactMode ? COMPACT_PIN_SIZE : 6,
                                  borderRadius: '50%',
                                  backgroundColor: pinColor,
                                  boxShadow: isSchSelected
                                    ? `0 0 0 2px ${primaryHex}, 0 0 0 4px ${primaryAlpha(0.3)}`
                                    : isDraggingThis ? '0 0 4px rgba(220,38,38,0.5)' : '0 1px 2px rgba(0,0,0,0.15)',
                                }}
                              />
                              {!compactMode && (
                                <div
                                  style={{
                                    width: 1.5,
                                    height: 8,
                                    backgroundColor: pinColor,
                                    opacity: 0.4,
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* 시나리오 일정 (얇은 줄) */}
                      {activeScenarios.map((scenario, sIdx) => {
                        const taskSs = getTaskSsForScenario(task, scenario.id)
                        const color = scenarioColorMap.get(scenario.id) ?? SCENARIO_COLORS[0]
                        const lineTop = ssStartTop + sIdx * ssLineGap
                        const ssBar = taskSs ? (dragState?.ssId === taskSs.id ? calcDragBar(dragState) : calcSsBar(taskSs)) : null
                        const isDraggingCreate = dragState?.ssCreate && dragState.ssScenarioId === scenario.id && dragState.taskId === task.id
                        const createBar = isDraggingCreate ? calcDragBar(dragState) : null
                        return (
                          <Fragment key={`ss-${scenario.id}`}>
                            {ssBar && (() => {
                              const w = Math.max(ssBar.width, 6)
                              const hw = Math.min(6, w / 3)
                              const isDragingSs = dragState?.ssId === taskSs!.id
                              const isSsSelected = isSelected('ss', taskSs!.id)
                              return (
                                <div
                                  data-scenario-line
                                  className={`absolute rounded-sm group/ssbar ${isDragingSs ? 'z-10' : 'z-[1]'}`}
                                  style={{
                                    left: ssBar.left + 2,
                                    width: w,
                                    top: lineTop,
                                    height: ssLineHeight,
                                    backgroundColor: color,
                                    cursor: isDragingSs ? 'grabbing' : 'grab',
                                    transition: isDragingSs ? 'none' : undefined,
                                    boxShadow: isSsSelected ? '0 0 0 1.5px #3b82f6, 0 0 0 3px rgba(59,130,246,0.3)' : undefined,
                                    zIndex: isSsSelected ? 1 : undefined,
                                  }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation()
                                    if (e.shiftKey) {
                                      e.preventDefault()
                                      clearRowSelection()
                                      toggleSelect({ type: 'ss', id: taskSs!.id, taskId: task.id })
                                      return
                                    }
                                    handleSsBarDragStart(taskSs!, e)
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  onContextMenu={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (confirm(`"${scenario.name}" 일정을 삭제하시겠습니까?\n${taskSs!.dateStart} ~ ${taskSs!.dateEnd}`)) handleSsDelete(taskSs!.id)
                                  }}
                                  onMouseEnter={(e) => {
                                    if (dragRef.current) return
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    setTooltip({
                                      task: { ...task, text: `[${scenario.name}] ${task.projectName}`, start: new Date(taskSs!.dateStart), end: new Date(taskSs!.dateEnd), duration: Math.floor((new Date(taskSs!.dateEnd).getTime() - new Date(taskSs!.dateStart).getTime()) / 86400000) + 1 } as GanttTask,
                                      x: rect.left + rect.width / 2,
                                      y: rect.top - 4,
                                    })
                                  }}
                                  onMouseLeave={() => { if (!dragRef.current) setTooltip(null) }}
                                >
                                  <div
                                    className="absolute left-0 top-[-3px] bottom-[-3px] cursor-col-resize opacity-0 group-hover/ssbar:opacity-100 rounded-l"
                                    style={{ width: hw, backgroundColor: 'rgba(0,0,0,0.15)' }}
                                    onMouseDown={(e) => { e.stopPropagation(); handleSsBarResizeStart(taskSs!, 'resize-left', e) }}
                                  />
                                  <div
                                    className="absolute right-0 top-[-3px] bottom-[-3px] cursor-col-resize opacity-0 group-hover/ssbar:opacity-100 rounded-r"
                                    style={{ width: hw, backgroundColor: 'rgba(0,0,0,0.15)' }}
                                    onMouseDown={(e) => { e.stopPropagation(); handleSsBarResizeStart(taskSs!, 'resize-right', e) }}
                                  />
                                </div>
                              )
                            })()}
                            {!taskSs && !createBar && task.start && (
                              <div
                                data-scenario-line
                                className="absolute z-[2] rounded-sm opacity-0 hover:opacity-30 transition-opacity"
                                style={{ left: 0, right: 0, top: lineTop, height: ssLineHeight, backgroundColor: color, cursor: 'crosshair' }}
                                onMouseDown={(e) => { e.stopPropagation(); handleSsCreateDragStart(task.id, scenario.id, e) }}
                              />
                            )}
                            {createBar && (
                              <div
                                data-scenario-line
                                className="absolute rounded-sm z-[1]"
                                style={{ left: createBar.left + 2, width: Math.max(createBar.width, 6), top: lineTop, height: ssLineHeight, backgroundColor: color, opacity: 0.5 }}
                              />
                            )}
                          </Fragment>
                        )
                      })}

                      {/* 접힌 자식 바 (반투명) */}
                      {isCollapsed && showMainBar && descendants.map((child) => {
                        const childBar = calcBar(child)
                        if (!childBar) return null
                        return (
                          <div
                            key={`collapsed-${child.id}`}
                            className="absolute rounded"
                            style={{
                              left: childBar.left + 2,
                              width: Math.max(childBar.width, 6),
                              top: mainBarTop,
                              height: mainBarHeight,
                              background: child.status === '완료' ? '#d1d5db' : `linear-gradient(90deg, ${getStatusColor(child.status)}, ${getStatusColorLight(child.status)})`,
                              opacity: 0.4,
                            }}
                            onMouseEnter={(e) => {
                              if (dragRef.current) return
                              const rect = e.currentTarget.getBoundingClientRect()
                              setTooltip({ task: child, x: rect.left + rect.width / 2, y: rect.top - 8 })
                            }}
                            onMouseLeave={() => { if (!dragRef.current) setTooltip(null) }}
                          />
                        )
                      })}

                      {/* 접힌 자식 시나리오 (반투명) */}
                      {isCollapsed && activeScenarios.map((scenario, sIdx) => {
                        const color = scenarioColorMap.get(scenario.id) ?? SCENARIO_COLORS[0]
                        const lineTop = ssStartTop + sIdx * ssLineGap
                        return descendants.map((child) => {
                          const childSs = getTaskSsForScenario(child, scenario.id)
                          if (!childSs) return null
                          const childSsBar = calcSsBar(childSs)
                          if (!childSsBar) return null
                          return (
                            <div
                              key={`collapsed-ss-${child.id}-${scenario.id}`}
                              data-scenario-line
                              className="absolute rounded-sm"
                              style={{
                                left: childSsBar.left + 2,
                                width: Math.max(childSsBar.width, 6),
                                top: lineTop,
                                height: ssLineHeight,
                                backgroundColor: color,
                                opacity: 0.4,
                              }}
                            />
                          )
                        })
                      })}
                    </div>
                  </Fragment>
                )
              })}

              {/* 오늘 세로선 */}
              {(() => {
                const todayIdx = dateIndexMap.get(todayStr) ?? -1
                if (todayIdx < 0) return null
                return (
                  <div
                    className="absolute top-0 bottom-0 z-[1] pointer-events-none"
                    style={{ left: todayIdx * DAY_WIDTH + DAY_WIDTH / 2, width: 2, backgroundColor: primaryHex }}
                  />
                )
              })()}

              {/* Lasso 선택 사각형 */}
              {lassoState && (
                <div
                  className="absolute z-30 pointer-events-none border-2 border-blue-500 rounded"
                  style={{
                    left: Math.min(lassoState.startX, lassoState.currentX),
                    top: Math.min(lassoState.startY, lassoState.currentY),
                    width: Math.abs(lassoState.currentX - lassoState.startX),
                    height: Math.abs(lassoState.currentY - lassoState.startY),
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  }}
                />
              )}
            </div>
          </div>

          {/* 툴팁 */}
          {tooltip && tooltip.task.start && tooltip.task.end && (
            <div
              className="fixed z-50 bg-gray-900 text-white text-xs rounded px-2.5 py-1.5 shadow-lg pointer-events-none whitespace-nowrap"
              style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
            >
              <div className="font-medium">{tooltip.task.text}</div>
              <div className="text-gray-300 mt-0.5">
                {formatDateKey(tooltip.task.start)} ~ {formatDateKey(tooltip.task.end)} ({tooltip.task.duration}일)
              </div>
              {tooltip.task.status && <div className="text-gray-300">{tooltip.task.status}</div>}
            </div>
          )}

          {/* 드래그 중 날짜 표시 */}
          {dragState && (
            <div className="fixed z-50 bg-blue-600 text-white text-xs rounded px-2.5 py-1.5 shadow-lg pointer-events-none whitespace-nowrap"
              style={{ left: '50%', bottom: 16, transform: 'translateX(-50%)' }}
            >
              {formatDateKey(dragState.currentStart)} ~ {formatDateKey(dragState.currentEnd)}
              {' '}({Math.floor((dragState.currentEnd.getTime() - dragState.currentStart.getTime()) / 86400000) + 1}일)
              {dragState.bulkItems && dragState.bulkItems.length > 0 && (
                <span className="ml-1.5 bg-blue-500 rounded px-1.5">{dragState.bulkItems.length}개 항목</span>
              )}
            </div>
          )}

          {/* 선택 카운트 뱃지 */}
          {selectedCount > 0 && !dragState && (
            <div className="fixed z-50 bg-gray-800 text-white text-xs rounded-full px-3 py-1.5 shadow-lg pointer-events-auto whitespace-nowrap flex items-center gap-2"
              style={{ left: '50%', bottom: 16, transform: 'translateX(-50%)' }}
            >
              <span>{selectedCount}개 선택됨</span>
              <button
                className="text-gray-400 hover:text-white"
                onClick={clearSelection}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* 프로젝트 상세 모달 (캘린더뷰와 동일) */}
      <ProjectDetailModal
        isOpen={projectModal.isOpen}
        onClose={handleCloseProjectModal}
        project={projectModalData}
        brands={brands}
        members={members}
        defaultBrandId={projectModal.defaultBrandId}
        defaultParentId={projectModal.defaultParentId}
        defaultDateStart={projectModal.defaultDateStart}
        onSave={handleProjectSave}
        onDelete={handleProjectDelete}
        onCreate={handleProjectCreate}
      />

      <ScheduleDetailModal
        isOpen={scheduleModal.isOpen}
        onClose={closeScheduleModal}
        schedules={scheduleModal.schedules}
        projectName={scheduleModal.projectName}
        date={scheduleModal.dateKey}
        onSave={handleScheduleModalSave}
        onDelete={handleScheduleModalDelete}
        onCreate={handleScheduleModalCreate}
        allMembers={members}
      />
      <GanttExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        tasks={tasks}
        chartRef={chartBodyRef}
        year={year}
        month={month}
        scenariosVisible={selectedScenarioIds.size > 0}
        allDates={allDates}
        dateIndexMap={dateIndexMap}
        dayWidth={DAY_WIDTH}
      />
    </div>
  )
}
