import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { GanttTask } from '@/lib/types/gantt'
import type { ProjectRole } from '@/lib/types/role'
import type { ProjectFormPayload } from '@/lib/types/project'
import { formatDateKey } from '@/lib/utils/calendar'
import { getErrorMessage, handleProjectError } from '@/lib/utils/error'
import { SORT_GAP, calculateNextSortOrder, syncProjectMembers } from '@/lib/utils/project'
import { readJson, writeJson } from '@/lib/storage'

const ROW_HEIGHT = 36
const DAY_WIDTH = 32
const MIN_LABEL_WIDTH = 150
const MAX_LABEL_WIDTH = 600

interface ProjectDetailState {
  isOpen: boolean
  projectId: number | null
  defaultBrandId: number | null
  defaultParentId: number | null
  defaultDateStart: string | null
}

interface InlineEditState {
  active: boolean
  taskId: number
  value: string
  originalValue: string
  rect: { top: number; left: number; width: number; height: number }
}

interface UseGanttProjectsParams {
  tasks: GanttTask[]
  setTasks: React.Dispatch<React.SetStateAction<GanttTask[]>>
  brands: { id: number; code: string; name: string; color: string | null }[]
  memberMap: Map<number, string>
  roles: ProjectRole[]
  loadTasks: (showLoading?: boolean) => Promise<void>
  pushUndo: (actions: { undo: () => Promise<void>; redo: () => Promise<void> }) => void
  suppressRealtime: (tables: string[]) => void
  labelWidth: number
  autoFitLabel: boolean
  labelWrapperRef: React.RefObject<HTMLDivElement | null>
  allDates: Date[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  dragRef: React.RefObject<unknown>
  skipNextClickRef: React.RefObject<boolean>
  onBarClickRef: React.MutableRefObject<(taskId: number) => void>
  trackCell: (cell: string | null, cellLabel?: string | null) => void
  brandFilter: number[] | null
  hideEmptyProjects: boolean
  setTooltip: React.Dispatch<React.SetStateAction<{ task: GanttTask; x: number; y: number } | null>>
  setLabelWidth: React.Dispatch<React.SetStateAction<number>>
}

export function useGanttProjects({
  tasks, setTasks, brands, memberMap, roles, loadTasks, pushUndo, suppressRealtime,
  labelWidth, autoFitLabel, labelWrapperRef, allDates, scrollRef,
  dragRef, skipNextClickRef, onBarClickRef,
  trackCell, brandFilter, hideEmptyProjects, setTooltip, setLabelWidth,
}: UseGanttProjectsParams) {
  const [projectModal, setProjectModal] = useState<ProjectDetailState>({
    isOpen: false,
    projectId: null,
    defaultBrandId: null,
    defaultParentId: null,
    defaultDateStart: null,
  })
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set())
  useEffect(() => {
    const saved = readJson<number[]>('gantt.collapsedProjects')
    if (saved) setCollapsedIds(new Set(saved))
  }, [])
  useEffect(() => {
    if (collapsedIds.size > 0) {
      writeJson('gantt.collapsedProjects', [...collapsedIds])
    } else {
      writeJson('gantt.collapsedProjects', null)
    }
  }, [collapsedIds])
  const inlineInputRef = useRef<HTMLInputElement>(null)

  // 자식이 있는 task 판별
  const hasChildren = useMemo(() => {
    const set = new Set<number>()
    for (const t of tasks) {
      if (t.parentId) set.add(t.parentId)
    }
    return set
  }, [tasks])

  // 접힌 task의 모든 자손 수집 (재귀)
  const collapsedDescendants = useMemo(() => {
    const map = new Map<number, GanttTask[]>()
    if (collapsedIds.size === 0) return map

    function getDescendants(parentId: number): GanttTask[] {
      const children: GanttTask[] = []
      for (const t of tasks) {
        if (t.parentId === parentId) {
          children.push(t)
          children.push(...getDescendants(t.id))
        }
      }
      return children
    }

    for (const id of collapsedIds) {
      map.set(id, getDescendants(id))
    }
    return map
  }, [tasks, collapsedIds])

  // 표시할 task 목록 (접힌 task의 자손 제외 + 빈 프로젝트 숨김)
  const visibleTasks = useMemo(() => {
    let filtered = tasks

    // 빈 프로젝트 숨김: 현재 보이는 날짜 범위에 데이터가 없는 프로젝트 제외
    if (hideEmptyProjects && allDates.length > 0) {
      const rangeStart = allDates[0].getTime()
      const rangeEnd = allDates[allDates.length - 1].getTime()

      // 자식이 있는 부모는 유지해야 하므로, 먼저 데이터 있는 task의 부모 체인을 수집
      const hasDataIds = new Set<number>()
      const taskMap = new Map<number, GanttTask>()
      for (const t of tasks) taskMap.set(t.id, t)

      for (const t of tasks) {
        let hasData = false

        // 메인바 겹침 확인
        if (t.start && t.end) {
          hasData = t.start.getTime() <= rangeEnd && t.end.getTime() >= rangeStart
        }

        // 시나리오 스케줄 겹침 확인
        if (!hasData) {
          for (const ss of t.scenarioSchedules) {
            const ssStart = new Date(ss.dateStart).getTime()
            const ssEnd = new Date(ss.dateEnd).getTime()
            if (ssStart <= rangeEnd && ssEnd >= rangeStart) { hasData = true; break }
          }
        }

        // 스케줄 dot 확인
        if (!hasData) {
          for (const s of t.schedules) {
            const sDate = new Date(s.date).getTime()
            if (sDate >= rangeStart && sDate <= rangeEnd) { hasData = true; break }
          }
        }

        if (hasData) {
          hasDataIds.add(t.id)
          // 부모 체인도 유지
          let parentId = t.parentId
          while (parentId) {
            hasDataIds.add(parentId)
            const parent = taskMap.get(parentId)
            parentId = parent?.parentId ?? null
          }
        }
      }

      filtered = filtered.filter((t) => hasDataIds.has(t.id))
    }

    if (collapsedIds.size === 0) return filtered
    const hiddenIds = new Set<number>()
    for (const descendants of collapsedDescendants.values()) {
      for (const d of descendants) hiddenIds.add(d.id)
    }
    return filtered.filter((t) => !hiddenIds.has(t.id))
  }, [tasks, collapsedIds, collapsedDescendants, hideEmptyProjects, allDates])

  // 프로젝트 패널 자동 폭 계산
  const calcAutoFitWidth = useCallback(() => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const FONT = '"IBM Plex Sans", system-ui, sans-serif'
    let maxWidth = 0

    for (const task of visibleTasks) {
      const indent = task.depth === 0 ? 4 : 4 + task.depth * 24
      const toggleWidth = hasChildren.has(task.id) ? 18 : 0
      const dragWidth = 22

      let textWidth = 0
      if (task.depth === 0) {
        ctx.font = `500 10px ${FONT}`
        const badgeWidth = ctx.measureText(task.brandCode ?? '').width + 12 + 6
        ctx.font = `500 14px ${FONT}`
        textWidth = badgeWidth + ctx.measureText(task.projectName).width
      } else {
        ctx.font = `14px ${FONT}`
        if (!hasChildren.has(task.id)) {
          textWidth = ctx.measureText('ㄴ').width + 4 + ctx.measureText(task.projectName).width
        } else {
          textWidth = ctx.measureText(task.projectName).width
        }
      }

      let assigneeWidth = 0
      const parts: string[] = []
      for (const role of roles) {
        const list = task.roleMembers[role.key] ?? []
        if (list.length > 0) parts.push(list.map((m) => m.nameShort).join(', '))
      }
      if (parts.length > 0) {
        ctx.font = `10px ${FONT}`
        assigneeWidth = 6 + ctx.measureText(parts.join(' · ')).width
      }

      let extraWidth = 0
      if (!task.start) {
        ctx.font = `10px ${FONT}`
        extraWidth = 4 + ctx.measureText('기간 미설정').width
      }

      const rowWidth = indent + dragWidth + toggleWidth + textWidth + assigneeWidth + extraWidth
      maxWidth = Math.max(maxWidth, rowWidth)
    }

    return Math.min(MAX_LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, Math.ceil(maxWidth + 24)))
  }, [visibleTasks, hasChildren, roles])

  useEffect(() => {
    if (!autoFitLabel || typeof document === 'undefined' || visibleTasks.length === 0) return
    const w = calcAutoFitWidth()
    if (w) setLabelWidth(w)
  }, [autoFitLabel, calcAutoFitWidth, visibleTasks])

  const toggleCollapse = useCallback((taskId: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])

  // 좌측 패널 프로젝트명 클릭 → 선택 (인라인 스타일로 hover보다 높은 우선순위 확보)
  const handleProjectClick = useCallback((task: GanttTask, _e: React.MouseEvent) => {
    trackCell(String(task.id), task.projectName)
  }, [trackCell])

  // 좌측 패널 프로젝트명 더블 클릭 → 인라인 에디터
  const handleProjectDoubleClick = useCallback((task: GanttTask, e: React.MouseEvent) => {
    const rowEl = e.currentTarget as HTMLElement
    const wrapperRect = labelWrapperRef.current?.getBoundingClientRect()
    if (!wrapperRect) return

    // 프로젝트명 span 위치 기준으로 인라인 에디터 배치 (캘린더뷰와 동일)
    const nameEl = rowEl.querySelector('[data-project-name]') as HTMLElement | null
    const targetEl = nameEl ?? rowEl
    const targetRect = targetEl.getBoundingClientRect()

    setInlineEdit({
      active: true,
      taskId: task.id,
      value: task.projectName,
      originalValue: task.projectName,
      rect: {
        top: targetRect.top - wrapperRect.top,
        left: targetRect.left - wrapperRect.left,
        width: targetRect.width,
        height: targetRect.height,
      },
    })
  }, [])

  // 인라인 에디터 저장
  const handleInlineSave = useCallback(async () => {
    if (!inlineEdit) return
    const { taskId, value, originalValue } = inlineEdit
    setInlineEdit(null)
    if (value === originalValue || !value.trim()) return

    try {
      const { error } = await supabase
        .from('projects')
        .update({ name: value.trim() })
        .eq('id', taskId)
      if (error) throw error
      const newName = value.trim()
      pushUndo({
        undo: async () => { await supabase.from('projects').update({ name: originalValue }).eq('id', taskId) },
        redo: async () => { await supabase.from('projects').update({ name: newName }).eq('id', taskId) },
      })
      suppressRealtime(['schedule', 'project', 'scenario'])
      await loadTasks(false)
    } catch (err: unknown) {
      handleProjectError(getErrorMessage(err), '프로젝트명 저장 실패')
    }
  }, [inlineEdit, loadTasks, pushUndo, suppressRealtime])

  const handleInlineCancel = useCallback(() => {
    setInlineEdit(null)
  }, [])

  const handleInlineKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleInlineSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleInlineCancel()
    }
  }, [handleInlineSave, handleInlineCancel])

  useEffect(() => {
    if (inlineEdit?.active && inlineInputRef.current) {
      inlineInputRef.current.focus()
      inlineInputRef.current.select()
    }
  }, [inlineEdit?.active])

  // 우클릭 → 프로젝트 상세 모달
  const handleProjectContextMenu = useCallback((task: GanttTask, e: React.MouseEvent) => {
    e.preventDefault()
    setInlineEdit(null)
    setProjectModal({
      isOpen: true,
      projectId: task.id,
      defaultBrandId: null,
      defaultParentId: null,
      defaultDateStart: null,
    })
  }, [])

  // 바 클릭 → 프로젝트 상세 모달
  onBarClickRef.current = (taskId: number) => {
    setProjectModal({
      isOpen: true,
      projectId: taskId,
      defaultBrandId: null,
      defaultParentId: null,
      defaultDateStart: null,
    })
  }

  // 타임라인 행 클릭 (선택 해제 등 공통 처리만 — 모달은 띄우지 않음)
  const handleTimelineRowClick = useCallback((_task: GanttTask, _e: React.MouseEvent) => {
    // 행 클릭 시 추가 동작 없음 (바/스케줄/시나리오 클릭은 별도 핸들러가 처리)
  }, [])

  // 새 프로젝트 (툴바)
  const handleCreateProject = useCallback(() => {
    setProjectModal({
      isOpen: true,
      projectId: null,
      defaultBrandId: brandFilter?.[0] ?? null,
      defaultParentId: null,
      defaultDateStart: null,
    })
  }, [brandFilter])

  // 행 사이 + 버튼 → 프로젝트 추가 (아래 행의 컨텍스트로 생성)
  const handleInsertProject = useCallback((taskAbove: GanttTask, taskBelow: GanttTask | undefined) => {
    const ref = taskBelow ?? taskAbove
    setProjectModal({
      isOpen: true,
      projectId: null,
      defaultBrandId: ref.brandId,
      defaultParentId: ref.parentId,
      defaultDateStart: null,
    })
  }, [])

  const handleCloseProjectModal = useCallback(() => {
    setProjectModal((prev) => ({ ...prev, isOpen: false }))
  }, [])

  const handleProjectSave = useCallback(
    async (
      projectId: number,
      data: ProjectFormPayload,
    ) => {
      if (!data.brandId) return
      try {
        const [{ data: prevProject }, { data: prevMembers }] = await Promise.all([
          supabase.from('projects').select('name, brand_id, parent_id, status, drive_path, date_start, date_end').eq('id', projectId).single(),
          supabase.from('project_members').select('member_id, role').eq('project_id', projectId),
        ])

        const trimmedName = data.name.trim()
        const { error } = await supabase
          .from('projects')
          .update({
            name: trimmedName,
            brand_id: data.brandId,
            parent_id: data.parentId,
            status: data.status,
            drive_path: data.drivePath || null,
            date_start: data.dateStart || null,
            date_end: data.dateEnd || null,
          })
          .eq('id', projectId)
        if (error) throw error

        await syncProjectMembers(projectId, data.membersByRole)

        // undo/redo용 멤버 스냅샷
        const memberInserts: { project_id: number; member_id: number; role: string }[] = []
        for (const [roleKey, memberIds] of Object.entries(data.membersByRole)) {
          for (const mid of memberIds) memberInserts.push({ project_id: projectId, member_id: mid, role: roleKey })
        }

        // 착수 스케줄 동기화: 시작일 변경 시 착수 날짜도 따라감
        let kickoffAction: 'created' | 'updated' | null = null
        let prevKickoffDate: string | null = null
        if (data.dateStart) {
          const { data: existing } = await supabase
            .from('schedule')
            .select('id, date')
            .eq('project_id', projectId)
            .eq('content', '착수')
            .limit(1)
          if (existing && existing.length > 0) {
            // 기존 착수가 있고 날짜가 다르면 업데이트
            if (existing[0].date !== data.dateStart) {
              prevKickoffDate = existing[0].date
              await supabase.from('schedule').update({ date: data.dateStart }).eq('id', existing[0].id)
              kickoffAction = 'updated'
            }
          } else if (!prevProject?.date_start) {
            // 시작일이 처음 설정되면 착수 생성
            await supabase.from('schedule').insert({ project_id: projectId, date: data.dateStart, content: '착수' })
            kickoffAction = 'created'
          }
        }

        if (prevProject) {
          const newProject = { name: trimmedName, brand_id: data.brandId, parent_id: data.parentId, status: data.status, drive_path: data.drivePath || null, date_start: data.dateStart || null, date_end: data.dateEnd || null }
          const newMembers = [...memberInserts]
          const capturedKickoffAction = kickoffAction
          const capturedPrevKickoffDate = prevKickoffDate
          const capturedNewDateStart = data.dateStart
          pushUndo({
            undo: async () => {
              await supabase.from('projects').update(prevProject).eq('id', projectId)
              await supabase.from('project_members').delete().eq('project_id', projectId)
              if (prevMembers && prevMembers.length > 0) {
                await supabase.from('project_members').insert(prevMembers.map((m) => ({ project_id: projectId, member_id: m.member_id, role: m.role })))
              }
              if (capturedKickoffAction === 'created') {
                await supabase.from('schedule').delete().eq('project_id', projectId).eq('content', '착수').eq('date', capturedNewDateStart)
              } else if (capturedKickoffAction === 'updated' && capturedPrevKickoffDate) {
                await supabase.from('schedule').update({ date: capturedPrevKickoffDate }).eq('project_id', projectId).eq('content', '착수').eq('date', capturedNewDateStart)
              }
            },
            redo: async () => {
              await supabase.from('projects').update(newProject).eq('id', projectId)
              await supabase.from('project_members').delete().eq('project_id', projectId)
              if (newMembers.length > 0) {
                await supabase.from('project_members').insert(newMembers)
              }
              if (capturedKickoffAction === 'created') {
                await supabase.from('schedule').insert({ project_id: projectId, date: capturedNewDateStart, content: '착수' })
              } else if (capturedKickoffAction === 'updated' && capturedPrevKickoffDate) {
                await supabase.from('schedule').update({ date: capturedNewDateStart }).eq('project_id', projectId).eq('content', '착수').eq('date', capturedPrevKickoffDate)
              }
            },
          })
        }

        suppressRealtime(['schedule', 'project', 'scenario'])
        await loadTasks(false)
        setProjectModal((prev) => ({ ...prev, isOpen: false }))
      } catch (err: unknown) {
        handleProjectError(getErrorMessage(err), '프로젝트 저장 실패')
      }
    },
    [loadTasks, pushUndo, suppressRealtime],
  )

  const handleProjectDelete = useCallback(
    async (projectId: number) => {
      try {
        const [projRes, membRes, schRes, ssRes] = await Promise.all([
          supabase.from('projects').select('*').eq('id', projectId).single(),
          supabase.from('project_members').select('member_id, role').eq('project_id', projectId),
          supabase.from('schedule').select('*, schedule_assignees(member_id)').eq('project_id', projectId),
          supabase.from('scenario_schedules').select('scenario_id, date_start, date_end').eq('project_id', projectId),
        ])
        const prevProject = projRes.data
        const prevMembers = membRes.data
        const prevSchedules = schRes.data
        const prevSs = ssRes.data

        const { error } = await supabase.from('projects').delete().eq('id', projectId)
        if (error) throw error

        if (prevProject) {
          let restoredPid = projectId
          pushUndo({
            undo: async () => {
              const { data: restored } = await supabase.from('projects').insert({
                name: prevProject.name,
                brand_id: prevProject.brand_id,
                parent_id: prevProject.parent_id,
                status: prevProject.status,
                date_start: prevProject.date_start,
                date_end: prevProject.date_end,
                sort_order: prevProject.sort_order,
              }).select('id').single()
              if (!restored) return
              restoredPid = restored.id
              if (prevMembers && prevMembers.length > 0) {
                await supabase.from('project_members').insert(prevMembers.map((m) => ({ project_id: restoredPid, member_id: m.member_id, role: m.role })))
              }
              if (prevSchedules && prevSchedules.length > 0) {
                const allAssignees: { schedule_id: number; member_id: number }[] = []
                await Promise.all(prevSchedules.map(async (sch) => {
                  const assignees = (sch as Record<string, unknown>).schedule_assignees as { member_id: number }[] ?? []
                  const { data: newSch } = await supabase.from('schedule').insert({
                    project_id: restoredPid, date: sch.date, time: sch.time, content: sch.content,
                    content_internal: sch.content_internal, note: sch.note, date_uncertain: sch.date_uncertain,
                  }).select('id').single()
                  if (newSch && assignees.length > 0) {
                    for (const a of assignees) allAssignees.push({ schedule_id: newSch.id, member_id: a.member_id })
                  }
                }))
                if (allAssignees.length > 0) {
                  await supabase.from('schedule_assignees').insert(allAssignees)
                }
              }
              if (prevSs && prevSs.length > 0) {
                await supabase.from('scenario_schedules').insert(prevSs.map((ss) => ({ project_id: restoredPid, scenario_id: ss.scenario_id, date_start: ss.date_start, date_end: ss.date_end })))
              }
            },
            redo: async () => {
              await supabase.from('projects').delete().eq('id', restoredPid)
            },
          })
        }

        suppressRealtime(['schedule', 'project', 'scenario'])
        await loadTasks(false)
        setProjectModal((prev) => ({ ...prev, isOpen: false }))
      } catch (err: unknown) {
        const msg = getErrorMessage(err)
        console.error('프로젝트 삭제 실패:', msg)
      }
    },
    [loadTasks, pushUndo, suppressRealtime],
  )

  const handleProjectCreate = useCallback(
    async (data: ProjectFormPayload) => {
      if (!data.brandId) return
      try {
        const newSortOrder = await calculateNextSortOrder(data.brandId, data.parentId)

        const trimmedName = data.name.trim()
        const { data: inserted, error } = await supabase
          .from('projects')
          .insert({
            name: trimmedName,
            brand_id: data.brandId,
            parent_id: data.parentId,
            status: data.status,
            drive_path: data.drivePath || null,
            date_start: data.dateStart || null,
            date_end: data.dateEnd || null,
            sort_order: newSortOrder,
          })
          .select('id')
          .single()
        if (error) throw error

        await syncProjectMembers(inserted.id, data.membersByRole)

        // undo/redo용 멤버 스냅샷
        const memberInserts: { project_id: number; member_id: number; role: string }[] = []
        for (const [roleKey, memberIds] of Object.entries(data.membersByRole)) {
          for (const mid of memberIds) memberInserts.push({ project_id: inserted.id, member_id: mid, role: roleKey })
        }

        // 시작일이 있으면 "착수" 스케줄 자동 생성
        if (data.dateStart) {
          await supabase
            .from('schedule')
            .insert({ project_id: inserted.id, date: data.dateStart, content: '착수' })
        }

        pushUndo({
          undo: async () => {
            await supabase.from('projects').delete().eq('id', inserted.id)
          },
          redo: async () => {
            if (!data.brandId) return
            const { data: reInserted } = await supabase.from('projects').insert({
              name: trimmedName, brand_id: data.brandId, parent_id: data.parentId,
              status: data.status, drive_path: data.drivePath || null, date_start: data.dateStart || null, date_end: data.dateEnd || null,
              sort_order: newSortOrder,
            }).select('id').single()
            if (reInserted) {
              if (memberInserts.length > 0) {
                await supabase.from('project_members').insert(memberInserts.map((m) => ({ ...m, project_id: reInserted.id })))
              }
              if (data.dateStart) {
                await supabase.from('schedule').insert({ project_id: reInserted.id, date: data.dateStart, content: '착수' })
              }
            }
          },
        })

        suppressRealtime(['schedule', 'project', 'scenario'])
        await loadTasks(false)
        setProjectModal((prev) => ({ ...prev, isOpen: false }))
      } catch (err: unknown) {
        handleProjectError(getErrorMessage(err), '프로젝트 생성 실패')
      }
    },
    [loadTasks, pushUndo, suppressRealtime],
  )

  const projectModalData = useMemo(() => {
    if (!projectModal.projectId) return null
    const task = tasks.find((t) => t.id === projectModal.projectId)
    if (!task) return null
    return {
      projectId: task.id,
      name: task.projectName,
      brandId: task.brandId,
      parentId: task.parentId,
      status: task.status,
      drivePath: task.drivePath,
      dateStart: task.dateStart,
      dateEnd: task.dateEnd,
      roleMembers: task.roleMembers,
    }
  }, [projectModal.projectId, tasks])

  return {
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
  }
}
