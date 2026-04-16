'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { fetchBrands, fetchMembers } from '@/lib/queries/masterData'
import { fetchWorkloadData } from '@/lib/queries/workload'
import { getMonthDates, formatDateKey, getPrevMonth, isWeekend as isWeekendDay } from '@/lib/utils/calendar'
import DateHeader, { DATE_HEADER_HEIGHT } from '@/components/shared/DateHeader'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { usePresence } from '@/hooks/usePresence'
import { useUndoStack } from '@/hooks/useUndoStack'
import { useScheduleModal, type MutationContext } from '@/hooks/useScheduleModal'
import { useScrollSync } from '@/hooks/useScrollSync'
import { usePanelResize } from '@/hooks/usePanelResize'
import { useDateColumns } from '@/hooks/useDateColumns'
import { useDateLayout } from '@/hooks/useDateLayout'
import { useScrollToToday } from '@/hooks/useScrollToToday'
import type { Brand, Member, Project } from '@/lib/types/database'
import type { WorkloadRow, WorkloadCell as WorkloadCellType, WorkloadViewState } from '@/lib/types/workload'
import ScheduleDetailModal from '@/components/calendar/ScheduleDetailModal'
import GlassPanel from '@/components/shared/GlassPanel'
import WorkloadToolbar from './WorkloadToolbar'
import WorkloadMemberRow from './WorkloadMemberRow'
import WorkloadCellComponent from './WorkloadCell'
import { readJson, readBool, writeJson, writeBool } from '@/lib/storage'

// --- 드래그 상태 ---
interface DragState {
  scheduleId: number
  sourceMemberId: number
  sourceDateKey: string
}

// --- 컨텍스트 메뉴 상태 ---
interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  dateKey: string
  memberId: number
}

const EMPTY_CONTEXT_MENU: ContextMenuState = {
  isOpen: false,
  x: 0,
  y: 0,
  dateKey: '',
  memberId: 0,
}

// --- 상수 ---
const HEADER_HEIGHT = DATE_HEADER_HEIGHT
const DEFAULT_DAY_WIDTH = 140
const HEATMAP_DAY_WIDTH = 50
const DEFAULT_LABEL_WIDTH = 80
const MIN_CELL_WIDTH = 80
const CELL_PADDING = 32

// --- 메인 컴포넌트 ---
interface WorkloadViewProps {
  initialYear: number
  initialMonth: number
}

export default function WorkloadView({ initialYear, initialMonth }: WorkloadViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)

  const [brands, setBrands] = useState<Brand[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [allRows, setAllRows] = useState<WorkloadRow[]>([])
  const [viewState, setViewState] = useState<WorkloadViewState>({
    year: initialYear,
    month: initialMonth,
    brandFilter: null,
  })
  const [ready, setReady] = useState(false)
  const [hideWeekends, setHideWeekends] = useState(false)
  const [hideEmptyRows, setHideEmptyRows] = useState(false)
  const [heatmapMode, setHeatmapMode] = useState(false)
  const [autoFit, setAutoFit] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const projectsRef = useRef(projects)
  projectsRef.current = projects
  const brandsRef = useRef(brands)
  brandsRef.current = brands
  const membersRef = useRef(members)
  membersRef.current = members
  const loadDataRef = useRef<() => void>(() => {})
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(EMPTY_CONTEXT_MENU)
  const dragStateRef = useRef<DragState | null>(null)

  // 공유 훅
  const { syncAtoB: syncLabel, syncBtoA: syncTimeline } = useScrollSync(scrollRef, labelRef)
  const { labelWidth, labelWrapperRef, handleResizeStart } = usePanelResize({
    defaultWidth: DEFAULT_LABEL_WIDTH,
    minWidth: 60,
    maxWidth: 300,
  })

  const { trackCell } = usePresence()

  useEffect(() => {
    trackCell('workload', null)
  }, [trackCell])

  // localStorage에서 필터 상태 복원
  useEffect(() => {
    const bf = readJson<number[]>('brandFilter')
    if (bf) setViewState((prev) => ({ ...prev, brandFilter: bf }))
    if (readBool('hideWeekends')) setHideWeekends(true)
    if (readBool('hideEmptyRows')) setHideEmptyRows(true)
    setReady(true)
  }, [])

  // 프로젝트 목록 로드 (브랜드 필터 적용)
  const loadProjects = useCallback(async (brandFilter: number[] | null) => {
    let q = supabase
      .from('projects')
      .select('*')
      .in('status', ['진행중', '보류'])
      .order('sort_order', { ascending: true })
    if (brandFilter && brandFilter.length > 0) {
      q = q.in('brand_id', brandFilter)
    }
    const { data } = await q
    if (data) setProjects(data)
  }, [])

  // 마스터 데이터 초기 로드
  useEffect(() => {
    if (!ready) return
    Promise.all([fetchBrands(), fetchMembers()]).then(([b, m]) => {
      setBrands(b)
      setMembers(m)
      brandsRef.current = b
      membersRef.current = m
      loadDataRef.current()
    }).catch((err) => console.error('마스터 데이터 로드 실패:', err))
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // 데이터 로드
  const loadData = useCallback(async () => {
    if (!ready || membersRef.current.length === 0 || brandsRef.current.length === 0) return
    const data = await fetchWorkloadData(
      viewState.year,
      viewState.month,
      membersRef.current,
      brandsRef.current,
      { brandFilter: viewState.brandFilter },
    )
    setAllRows(data)
  }, [ready, viewState.year, viewState.month, viewState.brandFilter])
  loadDataRef.current = loadData

  useEffect(() => {
    loadData()
  }, [loadData])

  // 브랜드 필터 변경 시 프로젝트 목록 재로드
  useEffect(() => {
    if (!ready) return
    loadProjects(viewState.brandFilter)
  }, [ready, viewState.brandFilter, loadProjects])

  // Realtime 구독
  const { suppressRealtime } = useRealtimeSync({
    onScheduleChange: loadData,
    onProjectChange: () => { loadData(); loadProjects(viewState.brandFilter) },
    onBrandChange: async () => {
      const b = await fetchBrands()
      setBrands(b)
    },
    onMemberChange: async () => {
      const m = await fetchMembers()
      setMembers(m)
    },
  })

  // Undo/Redo
  const { pushUndo } = useUndoStack(loadData)

  // 스케줄 모달 (공통 훅)
  const {
    modalState,
    openModal: openScheduleModal,
    closeModal: closeScheduleModal,
    handleSave: handleScheduleSave,
    handleDelete: handleScheduleDelete,
    handleCreate: handleScheduleCreate,
  } = useScheduleModal({
    members,
    suppressRealtime,
    pushUndo,
    minSchedulesForModal: 1,
    onMutationComplete: useCallback((ctx?: MutationContext) => {
      if (!ctx) { loadDataRef.current(); return }
      const project = projectsRef.current.find(p => p.id === ctx.projectId)
      if (!project) { loadDataRef.current(); return }
      const brand = brandsRef.current.find(b => b.id === project.brand_id)
      const newCells: WorkloadCellType[] = ctx.schedules.map(s => ({
        scheduleId: s.id,
        projectId: ctx.projectId,
        projectName: project.name,
        brandCode: brand?.code ?? '',
        brandColor: brand?.color ?? null,
        content: s.content,
        contentInternal: s.contentInternal,
        time: s.time,
        note: s.note,
        dateUncertain: s.dateUncertain,
        status: project.status,
        assignees: s.assignees.map(a => ({ memberId: a.memberId, nameShort: a.nameShort })),
      }))
      setAllRows(prev => prev.map(row => {
        const oldCells = row.schedules[ctx.dateKey] ?? []
        const hadProject = oldCells.some(c => c.projectId === ctx.projectId)
        const memberCells = newCells.filter(c =>
          c.assignees.some(a => a.memberId === row.memberId)
        )
        if (!hadProject && memberCells.length === 0) return row
        const filtered = oldCells.filter(c => c.projectId !== ctx.projectId)
        const updatedCells = [...filtered, ...memberCells]
        const schedules = { ...row.schedules }
        if (updatedCells.length > 0) {
          schedules[ctx.dateKey] = updatedCells
        } else {
          delete schedules[ctx.dateKey]
        }
        const delta = updatedCells.length - oldCells.length
        return { ...row, schedules, totalScheduleCount: row.totalScheduleCount + delta }
      }))
    }, []),
  })

  // 빈 행 숨김 필터
  const rows = useMemo(() => {
    if (!hideEmptyRows) return allRows
    return allRows.filter((r) => r.totalScheduleCount > 0)
  }, [allRows, hideEmptyRows])

  // 이전 월 계산 (autoWidths, useDateColumns에서 공유)
  const prev = getPrevMonth(viewState.year, viewState.month)

  // --- 자동 셀 폭 계산 ---
  const autoWidths = useMemo(() => {
    if (!ready || !autoFit || heatmapMode) return null
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // useDateColumns에 넘길 dates를 직접 계산 (autoWidths가 dayWidth 이전에 필요)
    const allDates = getMonthDates(prev.year, prev.month, 3)
    const filteredDates = hideWeekends ? allDates.filter((d) => !isWeekendDay(d)) : allDates

    const widths = new Map<string, number>()

    for (const date of filteredDates) {
      const dateKey = formatDateKey(date)
      let maxWidth = MIN_CELL_WIDTH

      for (const row of rows) {
        const cells = row.schedules[dateKey] ?? []
        for (const cell of cells) {
          ctx.font = '600 11px Arial, Helvetica, sans-serif'
          const projectWidth = ctx.measureText(cell.projectName).width

          let contentWidth = 0
          if (cell.content) {
            ctx.font = '11px Arial, Helvetica, sans-serif'
            contentWidth = ctx.measureText(` ${cell.content}`).width
          }

          const lineWidth = 8 + projectWidth + contentWidth
          maxWidth = Math.max(maxWidth, lineWidth)
        }
      }
      widths.set(dateKey, Math.ceil(maxWidth + CELL_PADDING))
    }

    return widths
  }, [autoFit, heatmapMode, prev.year, prev.month, hideWeekends, rows])

  // dayWidth: autoWidths가 있으면 그 중 최대값(혹은 고정값), 없으면 기본값
  // useDateColumns 훅에 넘기는 dayWidth는 개별 너비를 쓸 때 의미가 줄어들지만,
  // monthOffsets 계산에는 필요. 개별 너비 사용 시 별도 totalWidth/monthOffsets 계산.
  const uniformDayWidth = heatmapMode ? HEATMAP_DAY_WIDTH : DEFAULT_DAY_WIDTH

  const { dates, dateIndexMap } = useDateColumns({
    year: prev.year,
    month: prev.month,
    monthsToShow: 3,
    hideWeekends,
    dayWidth: uniformDayWidth,
  })

  // 개별 날짜 너비 함수
  const getDayWidth = useCallback((dateKey: string) => {
    if (heatmapMode) return HEATMAP_DAY_WIDTH
    if (autoWidths) return autoWidths.get(dateKey) ?? DEFAULT_DAY_WIDTH
    return DEFAULT_DAY_WIDTH
  }, [heatmapMode, autoWidths])

  // 날짜 레이아웃 (공통 훅)
  const { totalWidth, monthOffsets, dateOffsets } = useDateLayout(dates, getDayWidth)

  // --- 좌측 패널 ↔ 타임라인 행 높이 동기화 ---
  const syncRowHeights = useCallback(() => {
    const scrollEl = scrollRef.current
    const labelEl = labelRef.current
    if (!scrollEl || !labelEl) return
    const timelineRows = scrollEl.querySelectorAll<HTMLElement>('[data-row-mid]')
    timelineRows.forEach(tr => {
      const mid = tr.dataset.rowMid
      if (!mid) return
      const lr = labelEl.querySelector<HTMLElement>(`[data-member-id="${mid}"]`)
      if (lr) lr.style.height = `${tr.offsetHeight}px`
    })
  }, [])

  // --- 드래그로 일정 재배정 ---
  const handleDragStart = useCallback((scheduleId: number, memberId: number, dateKey: string) => {
    dragStateRef.current = { scheduleId, sourceMemberId: memberId, sourceDateKey: dateKey }
  }, [])

  const handleDragEnd = useCallback(() => {
    dragStateRef.current = null
  }, [])

  const handleDrop = useCallback(async (targetMemberId: number, targetDateKey: string) => {
    const drag = dragStateRef.current
    if (!drag) return
    dragStateRef.current = null

    const memberChanged = drag.sourceMemberId !== targetMemberId
    const dateChanged = drag.sourceDateKey !== targetDateKey
    if (!memberChanged && !dateChanged) return

    try {
      suppressRealtime(['schedule'])

      if (memberChanged) {
        const { error: delErr } = await supabase
          .from('schedule_assignees')
          .delete()
          .eq('schedule_id', drag.scheduleId)
          .eq('member_id', drag.sourceMemberId)
        if (delErr) throw delErr
        const { error: upsErr } = await supabase
          .from('schedule_assignees')
          .upsert({ schedule_id: drag.scheduleId, member_id: targetMemberId })
        if (upsErr) throw upsErr
      }

      if (dateChanged) {
        const { error } = await supabase
          .from('schedule')
          .update({ date: targetDateKey })
          .eq('id', drag.scheduleId)
        if (error) throw error
      }

      const dragCopy = { ...drag }
      pushUndo({
        undo: async () => {
          suppressRealtime(['schedule'])
          if (memberChanged) {
            await supabase.from('schedule_assignees').delete()
              .eq('schedule_id', dragCopy.scheduleId).eq('member_id', targetMemberId)
            await supabase.from('schedule_assignees')
              .upsert({ schedule_id: dragCopy.scheduleId, member_id: dragCopy.sourceMemberId })
          }
          if (dateChanged) {
            await supabase.from('schedule').update({ date: dragCopy.sourceDateKey })
              .eq('id', dragCopy.scheduleId)
          }
        },
        redo: async () => {
          suppressRealtime(['schedule'])
          if (memberChanged) {
            await supabase.from('schedule_assignees').delete()
              .eq('schedule_id', dragCopy.scheduleId).eq('member_id', dragCopy.sourceMemberId)
            await supabase.from('schedule_assignees')
              .upsert({ schedule_id: dragCopy.scheduleId, member_id: targetMemberId })
          }
          if (dateChanged) {
            await supabase.from('schedule').update({ date: targetDateKey })
              .eq('id', dragCopy.scheduleId)
          }
        },
      })
    } catch (err: unknown) {
      console.error('스케줄 이동 실패:', err)
    }

    await loadData()
  }, [suppressRealtime, loadData, pushUndo])

  // --- 우클릭 컨텍스트 메뉴 ---
  const handleCellContextMenu = useCallback((e: React.MouseEvent, memberId: number, dateKey: string) => {
    e.preventDefault()
    setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, dateKey, memberId })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(EMPTY_CONTEXT_MENU)
  }, [])

  const handleContextMenuProjectClick = useCallback((projectId: number, projectName: string) => {
    const { dateKey, memberId } = contextMenu
    closeContextMenu()
    const memberIds = memberId ? [memberId] : undefined
    openScheduleModal(projectId, projectName, dateKey, memberIds, memberIds)
  }, [contextMenu, closeContextMenu, openScheduleModal])

  // 셀 아이템 클릭 → 멤버 필터 적용하여 모달 열기
  const handleCellItemClick = useCallback((projectId: number, projectName: string, dateKey: string, cellMemberId: number) => {
    const memberIds = [cellMemberId]
    openScheduleModal(projectId, projectName, dateKey, memberIds, memberIds)
  }, [openScheduleModal])

  // 프로젝트 목록 브랜드별 그룹
  const projectsByBrand = useMemo(() => {
    const brandMap = new Map(brands.map((b) => [b.id, b]))
    const grouped = new Map<number, { brand: Brand; projects: Project[] }>()
    for (const p of projects) {
      if (!grouped.has(p.brand_id)) {
        const brand = brandMap.get(p.brand_id)
        if (brand) grouped.set(p.brand_id, { brand, projects: [] })
      }
      grouped.get(p.brand_id)?.projects.push(p)
    }
    return Array.from(grouped.values())
  }, [projects, brands])

  // 좌측 패널 ↔ 타임라인 행 높이 동기화
  useEffect(() => { syncRowHeights() }, [rows, dates, autoWidths, heatmapMode, syncRowHeights])

  // --- 오늘 스크롤 (공통 훅) ---
  const { handleScrollToToday } = useScrollToToday({
    scrollRef,
    dateOffsets,
    labelWidth,
    viewYear: viewState.year,
    viewMonth: viewState.month,
    onNavigateToToday: useCallback(() => {
      const now = new Date()
      setViewState(prev => ({ ...prev, year: now.getFullYear(), month: now.getMonth() + 1 }))
    }, []),
    dataLoaded: rows.length > 0,
  })

  const allMembersForModal = useMemo(() =>
    members.map((m) => ({ id: m.id, nameShort: m.name_short })),
    [members]
  )

  return (
    <div className="flex flex-col h-full">
      <WorkloadToolbar
        viewState={viewState}
        onViewStateChange={(newState) => {
          setViewState(newState)
          writeJson('brandFilter', newState.brandFilter)
        }}
        brands={brands}
        hideWeekends={hideWeekends}
        onHideWeekendsChange={(v: boolean) => { setHideWeekends(v); writeBool('hideWeekends', v) }}
        hideEmptyRows={hideEmptyRows}
        onHideEmptyRowsChange={(v: boolean) => { setHideEmptyRows(v); writeBool('hideEmptyRows', v) }}
        heatmapMode={heatmapMode}
        onHeatmapModeChange={setHeatmapMode}
        autoFit={autoFit}
        onAutoFitChange={setAutoFit}
        onScrollToToday={handleScrollToToday}
      />

      {/* Grid Container */}
      <div className="flex flex-1 overflow-hidden relative" onContextMenu={(e) => e.preventDefault()}>
        {/* 좌측 패널 */}
        <div ref={labelWrapperRef} className="absolute top-0 left-0 bottom-0 z-[2]" style={{ width: labelWidth }}>
          <GlassPanel ref={labelRef} width={labelWidth} onScroll={syncTimeline}>
            {/* 헤더 스페이서 */}
            <div style={{ height: HEADER_HEIGHT }} />
            {/* 멤버 행 */}
            {rows.map((row) => (
              <WorkloadMemberRow
                key={row.memberId}
                memberName={row.memberName}
                memberId={row.memberId}
              />
            ))}
          </GlassPanel>
          {/* 리사이즈 핸들 */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors z-30"
            onMouseDown={handleResizeStart}
          />
        </div>

        {/* 타임라인 */}
          <div ref={scrollRef} className="flex-1 overflow-auto h-full" onScroll={syncLabel}>
            <DateHeader
              dates={dates}
              monthOffsets={monthOffsets}
              totalWidth={totalWidth}
              getDayWidth={getDayWidth}
              inlineDayLabel
            />

            {/* 셀 그리드 */}
            <div style={{ width: totalWidth }}>
              {rows.map((row) => (
                  <div key={row.memberId} className="flex" data-row-mid={row.memberId} style={{ minHeight: heatmapMode ? 36 : 52 }}>
                    {dates.map((col) => (
                      <WorkloadCellComponent
                        key={col.dateKey}
                        cells={row.schedules[col.dateKey] ?? []}
                        memberId={row.memberId}
                        dateKey={col.dateKey}
                        dayWidth={getDayWidth(col.dateKey)}
                        isWeekend={col.isWeekend}
                        isToday={col.isToday}
                        heatmapMode={heatmapMode}
                        onCellItemClick={handleCellItemClick}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDrop={handleDrop}
                        onContextMenu={handleCellContextMenu}
                      />
                    ))}
                  </div>
                ))}
            </div>
          </div>
      </div>

      {/* 우클릭 컨텍스트 메뉴 - 프로젝트 선택 */}
      {contextMenu.isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu() }} />
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[220px] max-h-[400px] overflow-y-auto text-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="px-3 py-1.5 text-xs font-medium text-gray-400 border-b border-gray-100">
              일정 추가할 프로젝트 선택
            </div>
            {projectsByBrand.map(({ brand, projects: projs }) => (
              <div key={brand.id}>
                <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50 flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: brand.color || '#9ca3af' }}
                  />
                  {brand.name}
                </div>
                {projs.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleContextMenuProjectClick(p.id, p.name)}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-gray-700 flex items-center gap-1.5"
                  >
                    {p.parent_id && <span className="text-gray-300 ml-2">&#x2514;</span>}
                    <span className={p.parent_id ? '' : 'font-medium'}>{p.name}</span>
                  </button>
                ))}
              </div>
            ))}
            {projectsByBrand.length === 0 && (
              <div className="px-3 py-2 text-gray-400 text-center">프로젝트 없음</div>
            )}
          </div>
        </>
      )}

      <ScheduleDetailModal
        isOpen={modalState.isOpen}
        onClose={closeScheduleModal}
        schedules={modalState.schedules}
        projectName={modalState.projectName}
        date={modalState.dateKey}
        onSave={handleScheduleSave}
        onDelete={handleScheduleDelete}
        onCreate={handleScheduleCreate}
        allMembers={allMembersForModal}
        defaultAssigneeIds={modalState.defaultAssigneeIds}
      />
    </div>
  )
}
