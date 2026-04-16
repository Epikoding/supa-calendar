import { useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { CalendarRow } from '@/lib/types/calendar'
import type { ProjectFormPayload } from '@/lib/types/project'
import { getErrorMessage, handleProjectError } from '@/lib/utils/error'
import { calculateNextSortOrder, syncProjectMembers } from '@/lib/utils/project'

export interface ProjectDetailState {
  isOpen: boolean
  projectId: number | null // null = 새 프로젝트 생성
  defaultBrandId: number | null
  defaultParentId: number | null
}

export interface ProjectContextMenu {
  isOpen: boolean
  x: number
  y: number
  projectId: number
  projectName: string
  parentId: number | null
  brandId: number
}

interface UseCalendarProjectsParams {
  rowData: CalendarRow[]
  loadScheduleData: (showLoading?: boolean) => Promise<void>
  suppressRealtime: (tables: string[]) => void
  brandFilter: number[] | null
  setInlineEdit: (value: null) => void
}

export function useCalendarProjects({
  rowData,
  loadScheduleData,
  suppressRealtime,
  brandFilter,
  setInlineEdit,
}: UseCalendarProjectsParams) {
  const [projectModal, setProjectModal] = useState<ProjectDetailState>({
    isOpen: false,
    projectId: null,
    defaultBrandId: null,
    defaultParentId: null,
  })
  const [contextMenu, setContextMenu] = useState<ProjectContextMenu>({
    isOpen: false, x: 0, y: 0, projectId: 0, projectName: '', parentId: null, brandId: 0,
  })

  // 프로젝트 모달용: 현재 편집 중인 프로젝트 정보
  const projectModalData = useMemo(() => {
    if (!projectModal.projectId) return null
    const row = rowData.find((r) => r.projectId === projectModal.projectId)
    if (!row) return null
    return {
      projectId: row.projectId,
      name: row.projectName,
      brandId: row.brandId,
      parentId: row.parentId,
      status: row.status,
      drivePath: row.drivePath,
      dateStart: row.dateStart,
      dateEnd: row.dateEnd,
      roleMembers: row.roleMembers,
    }
  }, [projectModal.projectId, rowData])

  // 새 프로젝트
  const handleCreateProject = useCallback(() => {
    setProjectModal({
      isOpen: true,
      projectId: null,
      defaultBrandId: brandFilter?.[0] ?? null,
      defaultParentId: null,
    })
  }, [brandFilter])

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
        // parent가 바뀌면 새 형제 그룹 끝에 배치
        const currentRow = rowData.find((r) => r.projectId === projectId)
        let sortOrder = currentRow?.sortOrder ?? 0
        if (currentRow && (data.parentId !== currentRow.parentId || data.brandId !== currentRow.brandId)) {
          sortOrder = await calculateNextSortOrder(data.brandId, data.parentId)
        }

        const { error } = await supabase
          .from('projects')
          .update({
            name: data.name.trim(),
            brand_id: data.brandId,
            parent_id: data.parentId,
            status: data.status,
            drive_path: data.drivePath || null,
            date_start: data.dateStart || null,
            date_end: data.dateEnd || null,
            sort_order: sortOrder,
          })
          .eq('id', projectId)
        if (error) throw error

        await syncProjectMembers(projectId, data.membersByRole)

        suppressRealtime(['schedule', 'project'])
      await loadScheduleData(false)
        setProjectModal((prev) => ({ ...prev, isOpen: false }))
      } catch (err: unknown) {
        handleProjectError(getErrorMessage(err), '프로젝트 저장 실패')
      }
    },
    [loadScheduleData, rowData, suppressRealtime],
  )

  const handleProjectDelete = useCallback(
    async (projectId: number) => {
      try {
        const { error } = await supabase.from('projects').delete().eq('id', projectId)
        if (error) throw error
        suppressRealtime(['schedule', 'project'])
      await loadScheduleData(false)
        setProjectModal((prev) => ({ ...prev, isOpen: false }))
      } catch (err: unknown) {
        const msg = getErrorMessage(err)
        console.error('프로젝트 삭제 실패:', msg)
      }
    },
    [loadScheduleData, suppressRealtime],
  )

  const handleProjectCreate = useCallback(
    async (data: ProjectFormPayload) => {
      if (!data.brandId) return
      try {
        const newSortOrder = await calculateNextSortOrder(data.brandId, data.parentId)

        const { data: inserted, error } = await supabase
          .from('projects')
          .insert({
            name: data.name.trim(),
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

        suppressRealtime(['schedule', 'project'])
      await loadScheduleData(false)
        setProjectModal((prev) => ({ ...prev, isOpen: false }))
      } catch (err: unknown) {
        handleProjectError(getErrorMessage(err), '프로젝트 생성 실패')
      }
    },
    [loadScheduleData, suppressRealtime],
  )

  // 우클릭 컨텍스트 메뉴 (커스텀 인터페이스)
  const onCellContextMenu = useCallback((projectId: number, x: number, y: number, row: CalendarRow) => {
    setInlineEdit(null)
    setContextMenu({
      isOpen: true,
      x,
      y,
      projectId: row.projectId,
      projectName: row.projectName,
      parentId: row.parentId,
      brandId: row.brandId,
    })
  }, [setInlineEdit])

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }))
  }, [])

  const handleContextMenuAction = useCallback((projectId: number) => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }))
    setProjectModal({
      isOpen: true,
      projectId,
      defaultBrandId: null,
      defaultParentId: null,
    })
  }, [])

  return {
    projectModal,
    contextMenu,
    projectModalData,
    handleCreateProject,
    handleCloseProjectModal,
    handleProjectSave,
    handleProjectDelete,
    handleProjectCreate,
    onCellContextMenu,
    closeContextMenu,
    handleContextMenuAction,
  }
}
