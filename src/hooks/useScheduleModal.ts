import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { ScheduleCell } from '@/lib/types/calendar'

// --- 타입 ---
export interface ScheduleModalState {
  isOpen: boolean
  projectId: number
  projectName: string
  dateKey: string
  schedules: ScheduleCell[]
  defaultAssigneeIds?: number[]
  filterMemberIds?: number[]
}

export interface ScheduleFormData {
  time: string
  content: string
  contentInternal: string
  note: string
  dateUncertain: boolean
  assigneeIds: number[]
}

interface ScheduleModalMember {
  id: number
  name_short: string
}

export interface MutationContext {
  projectId: number
  dateKey: string
  schedules: ScheduleCell[]
}

interface UseScheduleModalOptions {
  members: ScheduleModalMember[]
  suppressRealtime: (tables: string[]) => void
  pushUndo: (ops: { undo: () => Promise<void>; redo: () => Promise<void> }) => void
  onMutationComplete: (context?: MutationContext) => void
  realtimeTables?: string[]
  minSchedulesForModal?: number
}

const EMPTY_MODAL: ScheduleModalState = {
  isOpen: false,
  projectId: 0,
  projectName: '',
  dateKey: '',
  schedules: [],
}

// --- 훅 ---
export function useScheduleModal({
  members,
  suppressRealtime,
  pushUndo,
  onMutationComplete,
  realtimeTables = ['schedule'],
  minSchedulesForModal = 2,
}: UseScheduleModalOptions) {
  const [modalState, setModalState] = useState<ScheduleModalState>(EMPTY_MODAL)
  const modalStateRef = useRef(modalState)
  modalStateRef.current = modalState

  // DB에서 스케쥴 fetch → ScheduleCell[] 매핑
  const fetchSchedules = useCallback(async (projectId: number, dateKey: string, filterMemberIds?: number[]): Promise<ScheduleCell[]> => {
    const { data, error } = await supabase
      .from('schedule')
      .select('id, time, content, content_internal, note, date_uncertain, schedule_assignees(member_id)')
      .eq('project_id', projectId)
      .eq('date', dateKey)
      .order('time', { ascending: true, nullsFirst: false })

    if (error || !data) return []

    const memberMap = new Map(members.map((m) => [m.id, m.name_short]))
    const all = data.map((s) => ({
      id: s.id,
      time: s.time,
      content: s.content,
      contentInternal: s.content_internal,
      note: s.note,
      dateUncertain: s.date_uncertain,
      assignees: (s.schedule_assignees ?? []).map((a: { member_id: number }) => ({
        memberId: a.member_id,
        nameShort: memberMap.get(a.member_id) ?? '',
      })),
    }))

    if (filterMemberIds && filterMemberIds.length > 0) {
      return all.filter(s => s.assignees.some(a => filterMemberIds.includes(a.memberId)))
    }
    return all
  }, [members])

  // mutation 후 모달 리프레시 + 뷰 갱신
  const refreshAfterMutation = useCallback(async () => {
    const prev = modalStateRef.current
    if (!prev.isOpen || !prev.projectId || !prev.dateKey) {
      onMutationComplete()
      return
    }
    const allSchedules = await fetchSchedules(prev.projectId, prev.dateKey)
    const displaySchedules = prev.filterMemberIds && prev.filterMemberIds.length > 0
      ? allSchedules.filter(s => s.assignees.some(a => prev.filterMemberIds!.includes(a.memberId)))
      : allSchedules
    if (displaySchedules.length >= minSchedulesForModal) {
      setModalState((p) => ({ ...p, schedules: displaySchedules }))
    } else {
      setModalState(EMPTY_MODAL)
    }
    suppressRealtime(realtimeTables)
    onMutationComplete({ projectId: prev.projectId, dateKey: prev.dateKey, schedules: allSchedules })
  }, [fetchSchedules, onMutationComplete, minSchedulesForModal, suppressRealtime, realtimeTables])

  // 모달 열기
  const openModal = useCallback(async (
    projectId: number,
    projectName: string,
    dateKey: string,
    defaultAssigneeIds?: number[],
    filterMemberIds?: number[],
  ) => {
    const schedules = await fetchSchedules(projectId, dateKey, filterMemberIds)
    setModalState({ isOpen: true, projectId, projectName, dateKey, schedules, defaultAssigneeIds, filterMemberIds })
  }, [fetchSchedules])

  // 모달 닫기
  const closeModal = useCallback(() => {
    setModalState(EMPTY_MODAL)
  }, [])

  // --- Save ---
  const handleSave = useCallback(async (scheduleId: number, data: ScheduleFormData) => {
    try {
      suppressRealtime(realtimeTables)

      const schedule = modalStateRef.current.schedules.find(s => s.id === scheduleId)
      const prev = schedule ? {
        time: schedule.time, content: schedule.content,
        content_internal: schedule.contentInternal, note: schedule.note,
        date_uncertain: schedule.dateUncertain,
      } : null

      const { error } = await supabase.rpc('save_schedule', {
        p_schedule_id: scheduleId,
        p_time: data.time || null,
        p_content: data.content || null,
        p_content_internal: data.contentInternal || null,
        p_note: data.note || null,
        p_date_uncertain: data.dateUncertain,
        p_assignee_ids: data.assigneeIds,
      })
      if (error) throw error

      if (prev) {
        const savedData = { ...data }
        const oldMemberIds = schedule!.assignees.map(a => a.memberId)
        pushUndo({
          undo: async () => {
            suppressRealtime(realtimeTables)
            await supabase.rpc('save_schedule', {
              p_schedule_id: scheduleId,
              p_time: prev.time, p_content: prev.content,
              p_content_internal: prev.content_internal, p_note: prev.note,
              p_date_uncertain: prev.date_uncertain,
              p_assignee_ids: oldMemberIds,
            })
          },
          redo: async () => {
            suppressRealtime(realtimeTables)
            await supabase.rpc('save_schedule', {
              p_schedule_id: scheduleId,
              p_time: savedData.time || null, p_content: savedData.content || null,
              p_content_internal: savedData.contentInternal || null, p_note: savedData.note || null,
              p_date_uncertain: savedData.dateUncertain,
              p_assignee_ids: savedData.assigneeIds,
            })
          },
        })
      }

      await refreshAfterMutation()
    } catch (err) {
      console.error('스케줄 저장 실패:', err)
    }
  }, [suppressRealtime, realtimeTables, pushUndo, refreshAfterMutation])

  // --- Delete ---
  const handleDelete = useCallback(async (scheduleId: number) => {
    try {
      suppressRealtime(realtimeTables)

      const schedule = modalStateRef.current.schedules.find(s => s.id === scheduleId)
      const { projectId, dateKey } = modalStateRef.current
      const prev = schedule ? {
        project_id: projectId, date: dateKey,
        time: schedule.time, content: schedule.content,
        content_internal: schedule.contentInternal, note: schedule.note,
        date_uncertain: schedule.dateUncertain,
      } : null

      const { error } = await supabase.rpc('delete_schedule', { p_schedule_id: scheduleId })
      if (error) throw error

      if (prev) {
        const oldMemberIds = schedule!.assignees.map(a => a.memberId)
        let restoredId = scheduleId
        pushUndo({
          undo: async () => {
            suppressRealtime(realtimeTables)
            const { data: newId } = await supabase.rpc('create_schedule', {
              p_project_id: prev.project_id, p_date: prev.date,
              p_time: prev.time, p_content: prev.content,
              p_content_internal: prev.content_internal, p_note: prev.note,
              p_date_uncertain: prev.date_uncertain,
              p_assignee_ids: oldMemberIds,
            })
            if (newId) restoredId = newId as number
          },
          redo: async () => {
            suppressRealtime(realtimeTables)
            await supabase.rpc('delete_schedule', { p_schedule_id: restoredId })
          },
        })
      }

      await refreshAfterMutation()
    } catch (err) {
      console.error('스케줄 삭제 실패:', err)
    }
  }, [suppressRealtime, realtimeTables, pushUndo, refreshAfterMutation])

  // --- Create ---
  const handleCreate = useCallback(async (data: ScheduleFormData) => {
    const { projectId, dateKey } = modalStateRef.current
    if (!projectId) return

    try {
      suppressRealtime(realtimeTables)

      const { data: newId, error } = await supabase.rpc('create_schedule', {
        p_project_id: projectId,
        p_date: dateKey,
        p_time: data.time || null,
        p_content: data.content || null,
        p_content_internal: data.contentInternal || null,
        p_note: data.note || null,
        p_date_uncertain: data.dateUncertain,
        p_assignee_ids: data.assigneeIds,
      })
      if (error) throw error

      if (newId) {
        const savedData = { ...data }
        const savedProjectId = projectId
        const savedDateKey = dateKey
        let createdId = newId as number
        pushUndo({
          undo: async () => {
            suppressRealtime(realtimeTables)
            await supabase.rpc('delete_schedule', { p_schedule_id: createdId })
          },
          redo: async () => {
            suppressRealtime(realtimeTables)
            const { data: recreatedId } = await supabase.rpc('create_schedule', {
              p_project_id: savedProjectId, p_date: savedDateKey,
              p_time: savedData.time || null, p_content: savedData.content || null,
              p_content_internal: savedData.contentInternal || null,
              p_note: savedData.note || null, p_date_uncertain: savedData.dateUncertain,
              p_assignee_ids: savedData.assigneeIds,
            })
            if (recreatedId) createdId = recreatedId as number
          },
        })
      }

      await refreshAfterMutation()
    } catch (err) {
      console.error('스케줄 생성 실패:', err)
    }
  }, [suppressRealtime, realtimeTables, pushUndo, refreshAfterMutation])

  return {
    modalState,
    openModal,
    closeModal,
    handleSave,
    handleDelete,
    handleCreate,
  }
}
