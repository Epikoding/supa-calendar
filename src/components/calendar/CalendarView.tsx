'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { supabase } from '@/lib/supabase/client'
import { fetchScheduleData } from '@/lib/queries/calendar'
import { fetchBrands, fetchMembers, fetchKeywordHighlights } from '@/lib/queries/masterData'
import { flattenProjects, formatDateKey, getDayLabel, getPrevMonth } from '@/lib/utils/calendar'
import { useDateColumns } from '@/hooks/useDateColumns'
import DateHeader, { DATE_HEADER_HEIGHT } from '@/components/shared/DateHeader'
import { computeIsLastAtDepth } from '@/lib/utils/treeLines'
import { resortTreeItems, getDescendantIds } from '@/lib/utils/tree'
import { getErrorMessage } from '@/lib/utils/error'
import type { CalendarData, CalendarRow, CalendarViewState, ScheduleCell } from '@/lib/types/calendar'
import type { KeywordHighlight } from '@/lib/types/database'
import { useKeywordMatchers } from '@/hooks/useKeywordMatchers'
import { primaryGradient } from '@/lib/colors'
import { useRoles } from '@/hooks/useRoles'
import { useCellClipboard, type ClipboardAction } from '@/hooks/useCellClipboard'
import { useUndoStack } from '@/hooks/useUndoStack'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { usePresence } from '@/hooks/usePresence'
import { useScheduleModal, type MutationContext } from '@/hooks/useScheduleModal'
import { useScrollSync } from '@/hooks/useScrollSync'
import { usePanelResize } from '@/hooks/usePanelResize'
import { useBrandGroups } from '@/hooks/useBrandGroups'
import { useDateLayout } from '@/hooks/useDateLayout'
import { useScrollToToday } from '@/hooks/useScrollToToday'
import CalendarToolbar from './CalendarToolbar'
import ScheduleDetailModal from './ScheduleDetailModal'
import ProjectDetailModal from './ProjectDetailModal'
import { useCalendarInlineEdit } from './hooks/useCalendarInlineEdit'
import { useCalendarProjects } from './hooks/useCalendarProjects'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useRowDrag, type RowDragUpdate } from '@/hooks/useRowDrag'
import { readJson, readBool, writeJson, writeBool } from '@/lib/storage'
import GlassPanel from '@/components/shared/GlassPanel'
import ChevronCircle from '@/components/shared/ChevronCircle'
import CalendarCell from './CalendarCell'
import CalendarProjectRow from './CalendarProjectRow'

// --- 상수 ---
const HEADER_HEIGHT = DATE_HEADER_HEIGHT
const ROW_HEIGHT = 36
const BRAND_HEADER_HEIGHT = 34
const DEFAULT_LABEL_WIDTH = 300
const MIN_CELL_WIDTH = 60
const CELL_PADDING = 38

interface CalendarViewProps {
  initialYear: number
  initialMonth: number
}

export default function CalendarView({ initialYear, initialMonth }: CalendarViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const pendingScrollToTodayRef = useRef(false)

  const [viewState, setViewState] = useState<CalendarViewState>({
    year: initialYear,
    month: initialMonth,
    statusFilter: ['진행중', '보류'],
    brandFilter: null,
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const bf = readJson<number[]>('brandFilter')
    if (bf) setViewState((prev) => ({ ...prev, brandFilter: bf }))
    const sf = readJson<('진행전' | '진행중' | '보류' | '완료' | '드랍')[]>('statusFilter')
    if (sf) setViewState((prev) => ({ ...prev, statusFilter: sf }))
    if (readBool('hideEmptyRows')) setHideEmptyRows(true)
    if (readBool('hideWeekends')) setHideWeekends(true)
    setReady(true)
  }, [])

  const { roles } = useRoles()

  const [rowData, setRowData] = useState<CalendarRow[]>([])
  const [loading, setLoading] = useState(true)
  const [columnWidth, setColumnWidth] = useState(150)
  const [autoFit, setAutoFit] = useState(true)
  const [hideEmptyRows, setHideEmptyRows] = useState(false)
  const [hideWeekends, setHideWeekends] = useState(false)
  const [brands, setBrands] = useState<CalendarData['brands']>([])
  const [members, setMembers] = useState<CalendarData['members']>([])
  const [keywordHighlights, setKeywordHighlights] = useState<KeywordHighlight[]>([])

  // 공유 훅
  const { syncAtoB: syncLabel, syncBtoA: syncTimeline } = useScrollSync(scrollRef, labelRef)
  const { labelWidth, labelWrapperRef, handleResizeStart } = usePanelResize({
    defaultWidth: DEFAULT_LABEL_WIDTH,
    minWidth: 150,
    maxWidth: 600,
  })

  // 좌측 패널 ↔ 타임라인 행 높이 동기화 (DOM 직접 조작)
  const syncRowHeights = useCallback(() => {
    const scrollEl = scrollRef.current
    const labelEl = labelRef.current
    if (!scrollEl || !labelEl) return
    const timelineRows = scrollEl.querySelectorAll<HTMLElement>('[data-row-pid]')
    timelineRows.forEach(tr => {
      const pid = tr.dataset.rowPid
      if (!pid) return
      const lr = labelEl.querySelector<HTMLElement>(`[data-project-id="${pid}"]`)
      if (lr) lr.style.height = `${tr.offsetHeight}px`
    })
  }, [])

  const viewStateRef = useRef(viewState)
  viewStateRef.current = viewState
  const brandsRef = useRef(brands)
  brandsRef.current = brands
  const membersRef = useRef(members)
  membersRef.current = members
  const rolesRef = useRef(roles)
  rolesRef.current = roles
  const rowDataRef = useRef(rowData)
  rowDataRef.current = rowData

  // --- 마스터 데이터 로드 ---
  const loadMasterData = useCallback(async () => {
    try {
      const [b, m, kw] = await Promise.all([fetchBrands(), fetchMembers(), fetchKeywordHighlights()])
      setBrands(b)
      setMembers(m)
      setKeywordHighlights(kw)
      brandsRef.current = b
      membersRef.current = m
    } catch (error) {
      console.error('마스터 데이터 로드 실패:', error)
    }
  }, [])

  // --- 스케줄 데이터 로드 ---
  const loadScheduleData = useCallback(async (showLoading = true) => {
    // roles가 아직 로딩 중이면 fetch 연기 (roleMembers가 {}로 저장되는 것 방지)
    if (rolesRef.current.length === 0) {
      if (showLoading) setLoading(false)
      return
    }
    const vs = viewStateRef.current
    if (showLoading) setLoading(true)
    try {
      const data = await fetchScheduleData(vs.year, vs.month, {
        statusFilter: vs.statusFilter,
        brandFilter: vs.brandFilter,
      })
      const rows = flattenProjects(
        { brands: brandsRef.current, members: membersRef.current, ...data },
        vs,
        rolesRef.current,
      )
      setRowData(rows)
    } catch (error) {
      console.error('캘린더 데이터 로드 실패:', error)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  const { others, trackCell: presenceTrackCell } = usePresence()
  const trackCell = useCallback((cell: string | null, cellLabel?: string | null) => presenceTrackCell('calendar', cell, cellLabel), [presenceTrackCell])

  // Realtime 구독 (suppressRealtime을 useUndoStack보다 먼저 선언)
  const { suppressRealtime } = useRealtimeSync({
    onScheduleChange: useCallback(() => { loadScheduleData(false) }, [loadScheduleData]),
    onProjectChange: useCallback(() => { loadScheduleData(false) }, [loadScheduleData]),
    onBrandChange: useCallback(() => { loadMasterData() }, [loadMasterData]),
    onMemberChange: useCallback(() => { loadMasterData() }, [loadMasterData]),
    onKeywordHighlightChange: useCallback(() => { loadMasterData() }, [loadMasterData]),
  })

  const { pushUndo } = useUndoStack(useCallback(async () => {
    suppressRealtime(['schedule', 'project'])
    await loadScheduleData(false)
  }, [suppressRealtime, loadScheduleData]))

  // 인라인 에디터
  const {
    inlineEdit, setInlineEdit,
    inlineInputRef,
    handleOpenScheduleInlineEditor,
    handleOpenProjectInlineEditor,
    handleInlineSave,
    handleInlineCancel,
    handleInlineKeyDown,
    setRowDataRef,
  } = useCalendarInlineEdit({
    setRowData,
    pushUndo,
    suppressRealtime,
    gridWrapperRef: gridContainerRef,
  })

  // rowData를 인라인 에디터에 동기화
  useEffect(() => {
    setRowDataRef(rowData)
  }, [rowData, setRowDataRef])

  // 스케줄 모달 (공통 훅)
  const {
    modalState: scheduleModalState,
    openModal: openScheduleModal,
    closeModal: closeScheduleModal,
    handleSave: handleScheduleModalSave,
    handleDelete: handleScheduleModalDelete,
    handleCreate: handleScheduleModalCreate,
  } = useScheduleModal({
    members,
    suppressRealtime,
    pushUndo,
    onMutationComplete: useCallback((ctx?: MutationContext) => {
      if (ctx) {
        setRowData(rows => rows.map(row => {
          if (row.projectId !== ctx.projectId) return row
          const schedules = { ...row.schedules }
          if (ctx.schedules.length > 0) {
            schedules[ctx.dateKey] = ctx.schedules
          } else {
            delete schedules[ctx.dateKey]
          }
          return { ...row, schedules }
        }))
      } else {
        loadScheduleData(false)
      }
    }, [setRowData, loadScheduleData]),
    realtimeTables: ['schedule', 'project'],
  })

  // 초기 로드
  const initialLoadDone = useRef(false)
  useEffect(() => {
    if (!ready) return
    // roles가 아직 로딩 중이면 연기 — roles 도착 시 이 effect 재실행됨
    if (roles.length === 0) return
    initialLoadDone.current = false
    loadMasterData().then(async () => {
      await loadScheduleData()
      initialLoadDone.current = true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, roles])

  // viewState 변경 시 스케줄만 재조회
  const prevViewStateRef = useRef(viewState)
  useEffect(() => {
    if (!ready) return
    const prev = prevViewStateRef.current
    prevViewStateRef.current = viewState
    if (prev === viewState) return
    if (!initialLoadDone.current) return  // 초기 로드 진행 중이면 스킵
    setExpandedPastCells(new Set())
    const monthChanged = prev.year !== viewState.year || prev.month !== viewState.month
    if (!monthChanged) pendingScrollToTodayRef.current = true
    loadScheduleData(monthChanged)
  }, [viewState, loadScheduleData, ready])

  // 프로젝트 모달/컨텍스트 메뉴
  const {
    projectModal, contextMenu,
    projectModalData,
    handleCreateProject,
    handleCloseProjectModal,
    handleProjectSave, handleProjectDelete, handleProjectCreate,
    onCellContextMenu, closeContextMenu, handleContextMenuAction,
  } = useCalendarProjects({
    rowData,
    loadScheduleData,
    suppressRealtime,
    brandFilter: viewState.brandFilter,
    setInlineEdit,
  })

  // --- 키워드 매칭 ---
  const keywordMatchers = useKeywordMatchers(keywordHighlights)

  // 날짜별 헤더 dot 색상 맵
  const shipmentColors = useMemo(() => {
    const map = new Map<string, string[]>()
    const dotMatchers = keywordMatchers.filter((m) => m.showHeaderDot)
    if (dotMatchers.length === 0) return map
    for (const row of rowData) {
      for (const [dk, schedules] of Object.entries(row.schedules)) {
        if (schedules.some((s) => s.content && dotMatchers.some((m) => m.regex.test(s.content!)))) {
          const colors = map.get(dk) ?? []
          const color = row.brandColor || '#6b7280'
          if (!colors.includes(color)) colors.push(color)
          map.set(dk, colors)
        }
      }
    }
    return map
  }, [rowData, keywordMatchers])

  // --- 날짜 배열 ---
  const todayKey = formatDateKey(new Date())
  const prev = getPrevMonth(viewState.year, viewState.month)
  const { dates } = useDateColumns({
    year: prev.year,
    month: prev.month,
    monthsToShow: 3,
    hideWeekends,
    dayWidth: 0,
  })

  // --- 자동 셀 폭 ---
  const autoWidths = useMemo(() => {
    if (!ready || !autoFit) return null
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const widths = new Map<string, number>()
    for (const col of dates) {
      const dateKey = col.dateKey
      let maxWidth = MIN_CELL_WIDTH

      for (const row of rowData) {
        const schedules = row.schedules[dateKey] ?? []
        for (const s of schedules) {
          const contentLines = s.content ? s.content.split('\n') : ['']

          let timeWidth = 0
          if (s.time) {
            ctx.font = '600 11px Arial, Helvetica, sans-serif'
            timeWidth = ctx.measureText(s.time).width + 4
          }

          let assigneeWidth = 0
          if (s.assignees.length > 0) {
            ctx.font = '10px Arial, Helvetica, sans-serif'
            assigneeWidth = ctx.measureText(s.assignees.map((a) => a.nameShort).join(', ')).width + 8
          }

          ctx.font = '12px Arial, Helvetica, sans-serif'
          let contentMaxWidth = 0
          for (let i = 0; i < contentLines.length; i++) {
            let lineWidth = ctx.measureText(contentLines[i]).width
            if (i === 0) lineWidth += timeWidth
            if (i === contentLines.length - 1) lineWidth += assigneeWidth
            contentMaxWidth = Math.max(contentMaxWidth, lineWidth)
          }

          let scheduleMaxWidth = contentMaxWidth
          const hasDot =
            s.dateUncertain ||
            (s.content && keywordMatchers.some((m) => m.regex.test(s.content!)))
          if (hasDot) scheduleMaxWidth += 10

          maxWidth = Math.max(maxWidth, scheduleMaxWidth)
        }
      }
      widths.set(dateKey, Math.ceil(maxWidth + CELL_PADDING))
    }
    return widths
  }, [autoFit, dates, rowData, keywordMatchers])

  // 날짜별 개별 너비 함수
  const getDayWidth = useCallback((dateKey: string) => {
    if (autoWidths) return autoWidths.get(dateKey) ?? columnWidth
    return columnWidth
  }, [autoWidths, columnWidth])

  // 날짜 레이아웃 (공통 훅)
  const { totalWidth, monthOffsets, dateOffsets } = useDateLayout(dates, getDayWidth)

  // 필터 변경 후 dateOffsets 갱신 시 오늘 위치로 스크롤 복원
  useEffect(() => {
    if (!pendingScrollToTodayRef.current) return
    pendingScrollToTodayRef.current = false
    scrollImmediate()
  }, [dateOffsets]) // eslint-disable-line react-hooks/exhaustive-deps -- dateOffsets 변경에만 반응

  // --- 빈 행 필터링 ---
  const displayRowData = useMemo(() => {
    if (!hideEmptyRows) return rowData
    return rowData.filter((r) => r.depth === 0 || Object.keys(r.schedules).length > 0)
  }, [rowData, hideEmptyRows])

  // --- 브랜드 그룹 ---
  const { brandGroups, collapsedBrands, toggleBrandCollapse } = useBrandGroups(displayRowData, 'calendar.collapsedBrands')

  const brandMap = useMemo(() => {
    const map = new Map<number, CalendarData['brands'][number]>()
    for (const b of brands) map.set(b.id, b)
    return map
  }, [brands])

  // isLastAtDepth: 브랜드 그룹 단위로 계산
  const isLastAtDepthMap = useMemo(() => {
    const result = new Map<number, boolean[]>()
    for (const [, groupTasks] of brandGroups.groupMap) {
      const computed = computeIsLastAtDepth(
        groupTasks.map(t => ({ id: t.projectId, parentId: t.parentId, depth: t.depth }))
      )
      for (const [id, arr] of computed) result.set(id, arr)
    }
    return result
  }, [brandGroups])

  // hasChildren 세트
  const hasChildrenSet = useMemo(() => {
    const set = new Set<number>()
    for (const row of displayRowData) {
      if (row.parentId !== null) set.add(row.parentId)
    }
    return set
  }, [displayRowData])

  // 과거 셀 스택 펼침 상태
  const [expandedPastCells, setExpandedPastCells] = useState<Set<string>>(new Set())
  const expandedPastCellsRef = useRef(expandedPastCells)
  expandedPastCellsRef.current = expandedPastCells

  // 자식 접기 상태
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set())
  useEffect(() => {
    const saved = readJson<number[]>('calendar.collapsedProjects')
    if (saved) setCollapsedIds(new Set(saved))
  }, [])
  useEffect(() => {
    if (collapsedIds.size > 0) {
      writeJson('calendar.collapsedProjects', [...collapsedIds])
    } else {
      writeJson('calendar.collapsedProjects', null)
    }
  }, [collapsedIds])
  const toggleCollapse = useCallback((projectId: number) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  // 접힌 프로젝트의 자손을 제외한 visible 목록
  const visibleProjects = useMemo(() => {
    if (collapsedIds.size === 0) return displayRowData
    const result: CalendarRow[] = []
    const hidden = new Set<number>()
    for (const row of displayRowData) {
      if (row.parentId !== null && (hidden.has(row.parentId) || collapsedIds.has(row.parentId))) {
        hidden.add(row.projectId)
        continue
      }
      result.push(row)
    }
    return result
  }, [displayRowData, collapsedIds])

  const visibleProjectIds = useMemo(() => new Set(visibleProjects.map(vp => vp.projectId)), [visibleProjects])

  // --- 클립보드 ---
  const handleClipboardPaste = useCallback(async (action: ClipboardAction) => {
    type ScheduleWithAssignees = { project_id: number; date: string; time: string | null; content: string | null; content_internal: string | null; note: string | null; date_uncertain: boolean; schedule_assignees?: { member_id: number }[] }
    const restoreWithAssignees = async (data: ScheduleWithAssignees[]) => {
      const savedAssignees = data.map(d => d.schedule_assignees?.map(a => a.member_id) ?? [])
      const rows = data.map(({ schedule_assignees: _, ...rest }) => rest)
      const { data: restored } = await supabase.from('schedule').insert(rows).select('id')
      if (restored) {
        const aIns = restored.flatMap((r, i) => savedAssignees[i].map(mid => ({ schedule_id: r.id, member_id: mid })))
        if (aIns.length > 0) await supabase.from('schedule_assignees').insert(aIns)
      }
    }

    let optimistic = false
    try {
      const deleteFilter = action.targets
        .map((t) => `and(project_id.eq.${t.targetProjectId},date.eq.${t.targetDateKey})`)
        .join(',')

      if (action.mode === 'cut' && action.moveOps && action.moveOps.length > 0) {
        const sourceIds = action.moveOps.map((op) => op.scheduleId)
        const sourceIdSet = new Set(sourceIds)
        const scheduleMovePayload = action.moveOps.map(op => ({
          id: op.scheduleId,
          project_id: op.targetProjectId,
          date: op.targetDateKey,
        }))

        // Optimistic: 로컬 state 즉시 업데이트
        // 1. 이동할 스케줄 데이터를 현재 state에서 수집
        const movedSchedules = new Map<number, { cell: ScheduleCell; sourceProjectId: number; sourceDateKey: string }>()
        for (const row of rowData) {
          for (const [dateKey, cells] of Object.entries(row.schedules)) {
            for (const cell of cells) {
              if (sourceIdSet.has(cell.id)) {
                movedSchedules.set(cell.id, { cell, sourceProjectId: row.projectId, sourceDateKey: dateKey })
              }
            }
          }
        }
        // 2. 타겟 위치에 기존 스케줄(이동 대상 아닌) 삭제 + 이동 대상 추가
        const targetSet = new Set(action.targets.map(t => `${t.targetProjectId}:${t.targetDateKey}`))
        setRowData(prev => prev.map(row => {
          const schedules = { ...row.schedules }
          // 소스에서 제거
          for (const [dateKey, cells] of Object.entries(schedules)) {
            const filtered = cells.filter(c => !sourceIdSet.has(c.id))
            if (filtered.length !== cells.length) {
              schedules[dateKey] = filtered.length > 0 ? filtered : []
            }
          }
          // 타겟에서 기존 스케줄 삭제 + 이동 스케줄 추가 (타겟별 그룹핑)
          const targetGrouped = new Map<string, ScheduleCell[]>()
          for (const op of action.moveOps!) {
            if (row.projectId === op.targetProjectId) {
              const key = op.targetDateKey
              if (!targetGrouped.has(key)) targetGrouped.set(key, [])
              const moved = movedSchedules.get(op.scheduleId)
              if (moved) targetGrouped.get(key)!.push(moved.cell)
            }
          }
          for (const [dateKey, movedCells] of targetGrouped) {
            schedules[dateKey] = movedCells
          }
          return { ...row, schedules }
        }))

        // API 호출 (백그라운드)
        const [{ data: originalPositions }, { data: deletedAtTarget }] = await Promise.all([
          supabase.from('schedule').select('id, project_id, date').in('id', sourceIds),
          supabase.from('schedule')
            .select('project_id, date, time, content, content_internal, note, date_uncertain, schedule_assignees(member_id)')
            .or(deleteFilter)
            .not('id', 'in', `(${sourceIds.join(',')})`)
        ])
        const [{ error: delErr }, { error: moveErr }] = await Promise.all([
          supabase.from('schedule').delete().or(deleteFilter).not('id', 'in', `(${sourceIds.join(',')})`),
          supabase.rpc('batch_move_items', { p_schedules: scheduleMovePayload }),
        ])
        if (delErr) throw delErr
        if (moveErr) throw moveErr
        pushUndo({
          undo: async () => {
            if (originalPositions) {
              await supabase.rpc('batch_move_items', {
                p_schedules: originalPositions.map(orig => ({
                  id: orig.id,
                  project_id: orig.project_id,
                  date: orig.date,
                })),
              })
            }
            if (deletedAtTarget && deletedAtTarget.length > 0) {
              await restoreWithAssignees(deletedAtTarget)
            }
          },
          redo: async () => {
            if (deletedAtTarget && deletedAtTarget.length > 0) {
              const delF = action.targets.map((t) => `and(project_id.eq.${t.targetProjectId},date.eq.${t.targetDateKey})`).join(',')
              await supabase.from('schedule').delete().or(delF).not('id', 'in', `(${sourceIds.join(',')})`)
            }
            await supabase.rpc('batch_move_items', {
              p_schedules: scheduleMovePayload,
            })
          },
        })
        optimistic = true
      } else if (action.mode === 'cut') {
        if (deleteFilter) {
          const { data: deletedAtTarget } = await supabase
            .from('schedule')
            .select('project_id, date, time, content, content_internal, note, date_uncertain, schedule_assignees(member_id)')
            .or(deleteFilter)
          const { error } = await supabase.from('schedule').delete().or(deleteFilter)
          if (error) throw error
          if (deletedAtTarget && deletedAtTarget.length > 0) {
            pushUndo({
              undo: async () => { await restoreWithAssignees(deletedAtTarget) },
              redo: async () => { await supabase.from('schedule').delete().or(deleteFilter!) },
            })
          }
        }
      } else {
        let deletedAtTarget: { project_id: number; date: string; time: string | null; content: string | null; content_internal: string | null; note: string | null; date_uncertain: boolean; schedule_assignees?: { member_id: number }[] }[] | null = null
        if (deleteFilter) {
          const { data } = await supabase
            .from('schedule')
            .select('project_id, date, time, content, content_internal, note, date_uncertain, schedule_assignees(member_id)')
            .or(deleteFilter)
          deletedAtTarget = data
          const { error } = await supabase.from('schedule').delete().or(deleteFilter)
          if (error) throw error
        }
        const inserts: { project_id: number; date: string; time: string | null; content: string | null; content_internal: string | null; note: string | null; date_uncertain: boolean }[] = []
        const sourceAssignees: number[][] = []
        for (const target of action.targets) {
          for (const s of target.sourceSchedules) {
            inserts.push({
              project_id: target.targetProjectId,
              date: target.targetDateKey,
              time: s.time,
              content: s.content,
              content_internal: s.contentInternal,
              note: s.note,
              date_uncertain: s.dateUncertain,
            })
            sourceAssignees.push(s.assignees.map(a => a.memberId))
          }
        }
        let insertedIds: number[] = []
        if (inserts.length > 0) {
          const { data: inserted, error } = await supabase.from('schedule').insert(inserts).select('id')
          if (error) throw error
          if (inserted) {
            insertedIds = inserted.map((r) => r.id)
            const assigneeInserts: { schedule_id: number; member_id: number }[] = []
            for (let i = 0; i < inserted.length; i++) {
              for (const memberId of sourceAssignees[i]) {
                assigneeInserts.push({ schedule_id: inserted[i].id, member_id: memberId })
              }
            }
            if (assigneeInserts.length > 0) {
              const { error: aErr } = await supabase.from('schedule_assignees').insert(assigneeInserts)
              if (aErr) throw aErr
            }
          }
        }
        pushUndo({
          undo: async () => {
            if (insertedIds.length > 0) {
              await supabase.from('schedule').delete().in('id', insertedIds)
            }
            if (deletedAtTarget && deletedAtTarget.length > 0) {
              await restoreWithAssignees(deletedAtTarget)
            }
          },
          redo: async () => {
            if (deletedAtTarget && deletedAtTarget.length > 0) {
              const delF = action.targets.map((t) => `and(project_id.eq.${t.targetProjectId},date.eq.${t.targetDateKey})`).join(',')
              await supabase.from('schedule').delete().or(delF)
            }
            if (inserts.length > 0) {
              const { data: reInserted } = await supabase.from('schedule').insert(inserts).select('id')
              if (reInserted) {
                insertedIds = reInserted.map(r => r.id)
                const aIns = reInserted.flatMap((r, i) =>
                  sourceAssignees[i].map(mid => ({ schedule_id: r.id, member_id: mid }))
                )
                if (aIns.length > 0) await supabase.from('schedule_assignees').insert(aIns)
              }
            }
          },
        })
      }

      suppressRealtime(['schedule', 'project'])
      if (!optimistic) await loadScheduleData(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('클립보드 작업 실패:', msg)
      await loadScheduleData(false)
    }
  }, [rowData, loadScheduleData, pushUndo, suppressRealtime])

  // 선택 셀 삭제
  const handleDeleteSelected = useCallback(async (targets: { projectId: number; dateKey: string }[]) => {
    if (targets.length === 0) return
    try {
      const filter = targets.map((t) => `and(project_id.eq.${t.projectId},date.eq.${t.dateKey})`).join(',')
      const { data: deleted } = await supabase.from('schedule').select('project_id, date, time, content, content_internal, note, date_uncertain').or(filter)
      const { error } = await supabase.from('schedule').delete().or(filter)
      if (error) throw error
      if (deleted && deleted.length > 0) {
        pushUndo({
          undo: async () => { await supabase.from('schedule').insert(deleted) },
          redo: async () => { await supabase.from('schedule').delete().or(filter) },
        })
      }
      suppressRealtime(['schedule', 'project'])
      await loadScheduleData(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('선택 셀 삭제 실패:', msg)
    }
  }, [loadScheduleData, pushUndo, suppressRealtime])

  // 셀 선택 + 클립보드 훅
  const { onMouseDown: clipboardMouseDown, onMouseOver: clipboardMouseOver } = useCellClipboard({
    gridWrapperRef: gridContainerRef,
    rowData,
    viewStateRef,
    onClipboardPaste: handleClipboardPaste,
    onDeleteSelected: handleDeleteSelected,
  })

  // --- 행 선택 + 드래그 앤 드랍 ---
  const getCalendarChildrenIds = useCallback((id: number): number[] => {
    return getDescendantIds(id, visibleProjects, r => r.projectId, r => r.parentId)
  }, [visibleProjects])

  const {
    getExpandedIds: getRowExpandedIds,
    handleRowClick: handleRowSelectClick,
  } = useRowSelection({
    items: visibleProjects,
    getId: useCallback((r: CalendarRow) => r.projectId, []),
    getBrandId: useCallback((r: CalendarRow) => r.brandId, []),
    getChildren: getCalendarChildrenIds,
    containerRef: gridContainerRef,
    rowAttribute: 'projectId',
  })

  const handleCalendarRowDragComplete = useCallback(async (
    updates: RowDragUpdate[],
  ) => {
    // Optimistic: 로컬 state 즉시 업데이트
    const updateMap = new Map(updates.map(u => [u.id, u]))
    setRowData(prev => {
      const updated = prev.map(r => {
        const u = updateMap.get(r.projectId)
        return u ? { ...r, parentId: u.parentId, sortOrder: u.sortOrder } : r
      })
      return resortTreeItems(updated, r => r.projectId, r => r.parentId, r => r.sortOrder, r => r.brandId, (r, d) => ({ ...r, depth: d }))
    })

    // API 호출 (백그라운드)
    suppressRealtime(['schedule', 'project'])
    const { error } = await supabase.rpc('batch_move_items', {
      p_projects: updates.map(u => ({
        id: u.id,
        sort_order: u.sortOrder,
        parent_id: u.parentId,
      })),
    })
    if (error) {
      console.error('프로젝트 이동 실패:', error)
      await loadScheduleData(false)
      throw error
    }
  }, [suppressRealtime, loadScheduleData])

  const {
    dragLineRef,
    handleDragStart: handleRowDragStart,
  } = useRowDrag({
    items: visibleProjects,
    getId: useCallback((r: CalendarRow) => r.projectId, []),
    getParentId: useCallback((r: CalendarRow) => r.parentId, []),
    getSortOrder: useCallback((r: CalendarRow) => r.sortOrder, []),
    getBrandId: useCallback((r: CalendarRow) => r.brandId, []),
    getDepth: useCallback((r: CalendarRow) => r.depth, []),
    containerRef: gridContainerRef,
    rowAttribute: 'projectId',
    getSelectedIds: getRowExpandedIds,
    getChildren: getCalendarChildrenIds,
    onComplete: handleCalendarRowDragComplete,
    pushUndo,
  })

  // --- 오늘 스크롤 (공통 훅) ---
  const { handleScrollToToday, scrollImmediate } = useScrollToToday({
    scrollRef,
    dateOffsets,
    labelWidth,
    viewYear: viewState.year,
    viewMonth: viewState.month,
    onNavigateToToday: useCallback(() => {
      const now = new Date()
      setViewState(prev => ({ ...prev, year: now.getFullYear(), month: now.getMonth() + 1 }))
    }, []),
    dataLoaded: rowData.length > 0,
  })

  // 좌측 패널 ↔ 타임라인 행 높이 동기화
  useEffect(() => { syncRowHeights() }, [displayRowData, dates, autoWidths, columnWidth, collapsedIds, syncRowHeights])

  const handleViewStateChange = useCallback((newState: CalendarViewState) => {
    setViewState(newState)
    writeJson('brandFilter', newState.brandFilter)
    writeJson('statusFilter', newState.statusFilter)
  }, [])

  // --- Memoized data ---
  const modalMembers = useMemo(
    () => members.map((m) => ({ id: m.id, nameShort: m.name_short })),
    [members],
  )

  // --- Presence 헬퍼 ---
  const calendarPresenceMap = useMemo(() => {
    const map = new Map<string, typeof others[number]>()
    for (const u of others) {
      if (u.view === 'calendar' && u.cell) map.set(u.cell, u)
    }
    return map
  }, [others])

  const getPresenceUser = useCallback((projectId: number, dateKey: string) => {
    return calendarPresenceMap.get(`${projectId}:${dateKey}`) ?? null
  }, [calendarPresenceMap])

  // --- 셀 이벤트 핸들러 ---
  const handleCellClick = useCallback((e: React.MouseEvent) => {
    const cell = (e.target as HTMLElement).closest('[data-pid][data-dk]') as HTMLElement | null
    if (cell) {
      const pid = cell.getAttribute('data-pid')
      const dk = cell.getAttribute('data-dk')
      if (pid && dk) {
        // Presence tracking
        const row = rowData.find(r => r.projectId === Number(pid))
        const projectName = row?.projectName ?? ''
        const dateLabel = getDayLabel(new Date(dk + 'T00:00:00'))
        trackCell(`${pid}:${dk}`, projectName ? `${projectName} > ${dateLabel}` : dateLabel)

        // 과거 셀 스택 토글
        if (dk < todayKey && (row?.schedules[dk]?.length ?? 0) >= 2) {
          const key = `${pid}::${dk}`
          setExpandedPastCells(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
          })
        }
      }
    }
  }, [trackCell, rowData, todayKey])

  const handleCellDoubleClick = useCallback((e: React.MouseEvent) => {
    const cell = (e.target as HTMLElement).closest('[data-pid][data-dk]') as HTMLElement | null
    if (!cell) return
    const pid = cell.getAttribute('data-pid')
    const dk = cell.getAttribute('data-dk')
    if (!pid || !dk) return
    // 스택 상태(접힌 과거 셀)에서는 인라인 에디터 비활성화
    if (dk < todayKey) {
      const row = rowDataRef.current.find(r => r.projectId === Number(pid))
      if ((row?.schedules[dk]?.length ?? 0) >= 2 && !expandedPastCellsRef.current.has(`${pid}::${dk}`)) return
    }
    handleOpenScheduleInlineEditor(Number(pid), dk, cell)
  }, [handleOpenScheduleInlineEditor, todayKey])

  const handleCellContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const cell = (e.target as HTMLElement).closest('[data-pid][data-dk]') as HTMLElement | null
    if (!cell) return
    const pid = cell.getAttribute('data-pid')
    const dk = cell.getAttribute('data-dk')
    if (!pid || !dk) return
    const row = rowDataRef.current.find(r => r.projectId === Number(pid))
    if (!row) return
    openScheduleModal(row.projectId, row.projectName, dk)
  }, [openScheduleModal])

  // --- 프로젝트 행 이벤트 ---
  const handleProjectContextMenu = useCallback((projectId: number, e: React.MouseEvent) => {
    e.preventDefault()
    const row = rowDataRef.current.find(r => r.projectId === projectId)
    if (!row) return
    setInlineEdit(null)
    const menuHeight = 200
    const y = e.clientY + menuHeight > window.innerHeight
      ? Math.max(8, e.clientY - menuHeight)
      : e.clientY
    // Call the onCellContextMenu from useCalendarProjects directly
    onCellContextMenu(projectId, e.clientX, y, row)
  }, [setInlineEdit, onCellContextMenu])

  const handleProjectDoubleClick = useCallback((projectId: number, e: React.MouseEvent) => {
    const row = (e.target as HTMLElement).closest('[data-project-id]') as HTMLElement | null
    if (!row) return
    const nameEl = row.querySelector('[data-project-name]') as HTMLElement | null
    if (!nameEl) return
    handleOpenProjectInlineEditor(projectId, nameEl)
  }, [handleOpenProjectInlineEditor])

  return (
    <div className="flex flex-col flex-1 h-full">
      <CalendarToolbar
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        brands={brands}
        columnWidth={columnWidth}
        onColumnWidthChange={setColumnWidth}
        autoFit={autoFit}
        onAutoFitChange={setAutoFit}
        hideEmptyRows={hideEmptyRows}
        onHideEmptyRowsChange={(v: boolean) => { setHideEmptyRows(v); writeBool('hideEmptyRows', v) }}
        hideWeekends={hideWeekends}
        onHideWeekendsChange={(v: boolean) => { setHideWeekends(v); writeBool('hideWeekends', v) }}
        onScrollToToday={handleScrollToToday}
      />

      <div ref={gridContainerRef} className="flex flex-1 overflow-hidden relative" style={{ minHeight: 0 }} onContextMenu={(e) => e.preventDefault()}>
        {loading ? (
          <div className="flex items-center justify-center h-full w-full text-gray-500">
            😛 데이터를 불러오는 중... 🤪
          </div>
        ) : (
          <>
            {/* 좌측 패널 */}
            <div ref={labelWrapperRef} className="absolute top-0 left-0 bottom-0 z-[2]" style={{ width: labelWidth }}>
              <GlassPanel ref={labelRef} width={labelWidth} onScroll={syncTimeline}>
                {/* 헤더 스페이서 */}
                <div style={{ height: HEADER_HEIGHT }}>
                  <div className="flex items-center gap-2 w-full h-full px-3">
                    <span className="text-xs font-medium text-gray-600">프로젝트</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCreateProject() }}
                      className="px-1.5 py-0.5 text-white text-[10px] rounded-md hover:shadow-md transition-all leading-tight"
                      style={{ background: primaryGradient }}
                    >
                      +
                    </button>
                    <span className="flex items-center gap-2 text-[10px] font-normal ml-auto">
                      {roles.map((r) => (
                        <span key={r.key} className="flex items-center gap-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full inline-block"
                            style={{ background: r.color ?? '#9ca3af' }}
                          />
                          {r.label}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>

                {brandGroups.brandOrder.map((brandId) => {
                  const brand = brandMap.get(brandId)
                  const brandColor = brand?.color || '#888'
                  const isExpanded = !collapsedBrands.has(brandId)
                  const groupTasks = brandGroups.groupMap.get(brandId) ?? []
                  // Filter by collapsedIds (project-level collapse)
                  const visibleGroupTasks = isExpanded ? groupTasks.filter(t => visibleProjectIds.has(t.projectId)) : []

                  return (
                    <Fragment key={`brand-${brandId}`}>
                      {/* 브랜드 헤더 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '7px 12px',
                          height: BRAND_HEADER_HEIGHT,
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
                        <span className="ml-auto text-[10px] text-gray-400">{groupTasks.length}</span>
                      </div>

                      {/* 프로젝트 행 */}
                      {visibleGroupTasks.map((task) => (
                        <CalendarProjectRow
                          key={task.projectId}
                          task={task}
                          roles={roles}
                          isLastAtDepth={isLastAtDepthMap.get(task.projectId) ?? []}
                          hasChildren={hasChildrenSet.has(task.projectId)}
                          isCollapsed={collapsedIds.has(task.projectId)}
                          onToggleCollapse={toggleCollapse}
                          onContextMenu={(e) => handleProjectContextMenu(task.projectId, e)}
                          onDoubleClick={(e) => handleProjectDoubleClick(task.projectId, e)}
                          onClick={(e) => handleRowSelectClick(task.projectId, e)}
                          onDragHandleMouseDown={(e) => handleRowDragStart(e, task.projectId)}
                        />
                      ))}
                    </Fragment>
                  )
                })}
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
                  renderDayExtra={(dateKey) => {
                    const colors = shipmentColors.get(dateKey)
                    if (!colors || colors.length === 0) return null
                    return (
                      <>
                        {colors.map((color, i) => (
                          <span
                            key={i}
                            className="inline-block w-[7px] h-[7px] rounded-full flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </>
                    )
                  }}
                />

                {/* 셀 그리드 */}
                <div style={{ width: totalWidth }}>
                  {brandGroups.brandOrder.map((brandId) => {
                    const brand = brandMap.get(brandId)
                    const brandColor = brand?.color || '#888'
                    const isExpanded = !collapsedBrands.has(brandId)
                    const groupTasks = brandGroups.groupMap.get(brandId) ?? []
                    const visibleGroupTasks = isExpanded ? groupTasks.filter(t => visibleProjectIds.has(t.projectId)) : []

                    return (
                      <Fragment key={`timeline-brand-${brandId}`}>
                        {/* 브랜드 헤더 행 (타임라인 쪽) */}
                        <div
                          style={{
                            height: BRAND_HEADER_HEIGHT,
                            background: `${brandColor}14`,
                            borderBottom: `1px solid ${brandColor}1C`,
                            opacity: 0.08,
                          }}
                        />
                        {/* 프로젝트 행 → CalendarCell들 */}
                        {visibleGroupTasks.map((task) => (
                          <div key={task.projectId} className="flex" data-row-pid={task.projectId} style={{ minHeight: ROW_HEIGHT }}>
                            {dates.map((col) => (
                              <CalendarCell
                                key={col.dateKey}
                                schedules={task.schedules[col.dateKey] ?? []}
                                projectId={task.projectId}
                                dateKey={col.dateKey}
                                dayWidth={getDayWidth(col.dateKey)}
                                isWeekend={col.isWeekend}
                                isToday={col.isToday}
                                isMonday={col.isMonday}
                                isPast={col.dateKey < todayKey}
                                isStacked={col.dateKey < todayKey && (task.schedules[col.dateKey]?.length ?? 0) >= 2 && !expandedPastCells.has(`${task.projectId}::${col.dateKey}`)}
                                keywordMatchers={keywordMatchers}
                                presenceUser={getPresenceUser(task.projectId, col.dateKey)}
                                onMouseDown={clipboardMouseDown}
                                onMouseOver={clipboardMouseOver}
                                onClick={handleCellClick}
                                onDoubleClick={handleCellDoubleClick}
                                onContextMenu={handleCellContextMenu}
                              />
                            ))}
                          </div>
                        ))}
                      </Fragment>
                    )
                  })}
                </div>
              </div>
          </>
        )}

        {/* 드래그 앤 드랍 시각 피드백 */}
        <div
          ref={dragLineRef}
          className="absolute right-0 pointer-events-none z-20"
          style={{ display: 'none', height: 3, background: '#3b82f6', borderRadius: 2 }}
        />

        {/* 인라인 에디터 */}
        {inlineEdit?.active && (
          <textarea
            ref={inlineInputRef}
            value={inlineEdit.value}
            onChange={(e) => {
              setInlineEdit((prev) => prev ? { ...prev, value: e.target.value } : null)
              e.target.style.height = 'auto'
              e.target.style.height = e.target.scrollHeight + 'px'
            }}
            onKeyDown={handleInlineKeyDown}
            onBlur={handleInlineSave}
            rows={1}
            className="absolute z-10 border-2 border-blue-700 rounded-none px-1 text-xs outline-none bg-white text-gray-900 resize-none overflow-hidden"
            style={{
              top: inlineEdit.rect.top,
              left: inlineEdit.rect.left,
              width: inlineEdit.rect.width,
              minHeight: inlineEdit.rect.height,
              lineHeight: '1.4',
              paddingTop: (inlineEdit.rect.height - 14) / 2,
            }}
          />
        )}
      </div>

      {/* 프로젝트 우클릭 컨텍스트 메뉴 */}
      {contextMenu.isOpen && (() => {
        const parentRow = contextMenu.parentId
          ? rowData.find((r) => r.projectId === contextMenu.parentId)
          : null
        const children = rowData.filter((r) => r.parentId === contextMenu.projectId)
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu() }} />
            <div
              className="fixed z-50 rounded-xl py-1 min-w-[200px] text-sm"
              style={{ left: contextMenu.x, top: contextMenu.y, background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 8px 32px rgba(0,0,0,0.04)' }}
            >
              <button
                onClick={() => handleContextMenuAction(contextMenu.projectId)}
                className="w-full text-left px-3 py-1.5 hover:bg-blue-50/50 text-gray-700"
              >
                편집
              </button>
              <div className="border-t border-black/[0.04] my-0.5" />
              {parentRow ? (
                <button
                  onClick={() => handleContextMenuAction(parentRow.projectId)}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-50/50 text-gray-700 flex items-center gap-1.5"
                >
                  <span className="text-gray-400 text-xs">상위</span>
                  <span>{parentRow.projectName}</span>
                </button>
              ) : (
                <div className="px-3 py-1.5 text-gray-300 flex items-center gap-1.5">
                  <span className="text-xs">상위</span>
                  <span>없음 (최상위)</span>
                </div>
              )}
              <div className="border-t border-black/[0.04] my-0.5" />
              {children.length > 0 ? (
                <>
                  <div className="px-3 pt-1 pb-0.5 text-[10px] text-gray-400 font-medium">하위 프로젝트</div>
                  {children.map((c) => (
                    <button
                      key={c.projectId}
                      onClick={() => handleContextMenuAction(c.projectId)}
                      className="w-full text-left px-3 pl-5 py-1.5 hover:bg-blue-50/50 text-gray-700"
                    >
                      {c.projectName}
                    </button>
                  ))}
                </>
              ) : (
                <div className="px-3 py-1.5 text-gray-300 flex items-center gap-1.5">
                  <span className="text-xs">하위</span>
                  <span>없음</span>
                </div>
              )}
            </div>
          </>
        )
      })()}

      <ScheduleDetailModal
        isOpen={scheduleModalState.isOpen}
        onClose={closeScheduleModal}
        schedules={scheduleModalState.schedules}
        projectName={scheduleModalState.projectName}
        date={scheduleModalState.dateKey}
        onSave={handleScheduleModalSave}
        onDelete={handleScheduleModalDelete}
        onCreate={handleScheduleModalCreate}
        allMembers={modalMembers}
      />

      <ProjectDetailModal
        isOpen={projectModal.isOpen}
        onClose={handleCloseProjectModal}
        project={projectModalData}
        brands={brands}
        members={modalMembers}
        defaultBrandId={projectModal.defaultBrandId}
        defaultParentId={projectModal.defaultParentId}
        onSave={handleProjectSave}
        onDelete={handleProjectDelete}
        onCreate={handleProjectCreate}
      />
    </div>
  )
}
