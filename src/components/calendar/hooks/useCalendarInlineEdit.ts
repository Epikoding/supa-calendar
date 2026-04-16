import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { CalendarRow, ScheduleCell } from '@/lib/types/calendar'
import { getErrorMessage, handleProjectError } from '@/lib/utils/error'

export interface InlineEditState {
  active: boolean
  type: 'schedule' | 'project'
  projectId: number
  dateKey: string // schedule only
  value: string
  originalValue: string
  existingSchedules: ScheduleCell[] // schedule only
  rect: { top: number; left: number; width: number; height: number }
}

interface UseCalendarInlineEditParams {
  setRowData: (updater: (rows: CalendarRow[]) => CalendarRow[]) => void
  pushUndo: (actions: { undo: () => Promise<void>; redo: () => Promise<void> }) => void
  suppressRealtime: (tables: string[]) => void
  gridWrapperRef: React.RefObject<HTMLDivElement | null>
}

export function useCalendarInlineEdit({
  setRowData,
  pushUndo,
  suppressRealtime,
  gridWrapperRef,
}: UseCalendarInlineEditParams) {
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null)
  const inlineInputRef = useRef<HTMLTextAreaElement>(null)
  const cancelledRef = useRef(false)
  const savingRef = useRef(false)
  const rowDataRef = useRef<CalendarRow[]>([])

  useEffect(() => {
    if (inlineEdit?.active && inlineInputRef.current) {
      inlineInputRef.current.focus()
      inlineInputRef.current.select()
    }
  }, [inlineEdit?.active])

  // rowData를 외부에서 동기화하기 위한 setter
  const setRowDataRef = useCallback((rows: CalendarRow[]) => {
    rowDataRef.current = rows
  }, [])

  // 스케줄 인라인 에디터 열기
  const handleOpenScheduleInlineEditor = useCallback((projectId: number, dateKey: string, cellElement: HTMLElement) => {
    const row = rowDataRef.current.find(r => r.projectId === projectId)
    if (!row) return
    const existingSchedules = row.schedules[dateKey] ?? []
    const currentValue = existingSchedules.length > 0 ? (existingSchedules[0].content ?? '') : ''

    const cellRect = cellElement.getBoundingClientRect()
    const wrapperRect = gridWrapperRef.current?.getBoundingClientRect()
    if (!cellRect || !wrapperRect) return

    setInlineEdit({
      active: true,
      type: 'schedule',
      projectId,
      dateKey,
      value: currentValue,
      originalValue: currentValue,
      existingSchedules,
      rect: {
        top: cellRect.top - wrapperRect.top,
        left: cellRect.left - wrapperRect.left,
        width: cellRect.width,
        height: cellRect.height,
      },
    })
  }, [gridWrapperRef])

  // 프로젝트명 인라인 에디터 열기
  const handleOpenProjectInlineEditor = useCallback((projectId: number, cellElement: HTMLElement) => {
    const row = rowDataRef.current.find(r => r.projectId === projectId)
    if (!row) return

    const cellRect = cellElement.getBoundingClientRect()
    const wrapperRect = gridWrapperRef.current?.getBoundingClientRect()
    if (!cellRect || !wrapperRect) return

    setInlineEdit({
      active: true,
      type: 'project',
      projectId,
      dateKey: '',
      value: row.projectName,
      originalValue: row.projectName,
      existingSchedules: [],
      rect: {
        top: cellRect.top - wrapperRect.top,
        left: cellRect.left - wrapperRect.left,
        width: cellRect.width,
        height: cellRect.height,
      },
    })
  }, [gridWrapperRef])

  // 인라인 에디터 저장 (스케줄 + 프로젝트 통합)
  const handleInlineSave = useCallback(async () => {
    if (!inlineEdit || cancelledRef.current || savingRef.current) {
      cancelledRef.current = false
      return
    }
    const { type, projectId, dateKey, value, originalValue, existingSchedules } = inlineEdit
    setInlineEdit(null)
    if (value === originalValue) return

    savingRef.current = true
    try {
      suppressRealtime(['schedule', 'project'])

      if (type === 'project') {
        if (!value.trim()) return
        const newName = value.trim()

        // Optimistic update
        setRowData(rows => rows.map(row =>
          row.projectId === projectId ? { ...row, projectName: newName } : row
        ))

        const { error } = await supabase.from('projects').update({ name: newName }).eq('id', projectId)
        if (error) {
          // Rollback
          setRowData(rows => rows.map(row =>
            row.projectId === projectId ? { ...row, projectName: originalValue } : row
          ))
          throw error
        }

        pushUndo({
          undo: async () => { await supabase.from('projects').update({ name: originalValue }).eq('id', projectId) },
          redo: async () => { await supabase.from('projects').update({ name: newName }).eq('id', projectId) },
        })
      } else {
        if (existingSchedules.length > 0) {
          const schedId = existingSchedules[0].id
          const newContent = value || null
          const prevContent = originalValue || null

          // Optimistic update
          setRowData(rows => rows.map(row => {
            if (row.projectId !== projectId) return row
            const schedules = { ...row.schedules }
            const existing = [...(schedules[dateKey] ?? [])]
            existing[0] = { ...existing[0], content: newContent }
            schedules[dateKey] = existing
            return { ...row, schedules }
          }))

          const { error } = await supabase.from('schedule').update({ content: newContent }).eq('id', schedId)
          if (error) {
            // Rollback
            setRowData(rows => rows.map(row => {
              if (row.projectId !== projectId) return row
              const schedules = { ...row.schedules }
              const existing = [...(schedules[dateKey] ?? [])]
              existing[0] = { ...existing[0], content: prevContent }
              schedules[dateKey] = existing
              return { ...row, schedules }
            }))
            throw error
          }

          pushUndo({
            undo: async () => { await supabase.from('schedule').update({ content: prevContent }).eq('id', schedId) },
            redo: async () => { await supabase.from('schedule').update({ content: newContent }).eq('id', schedId) },
          })
        } else if (value.trim()) {
          const { data: inserted, error } = await supabase
            .from('schedule')
            .insert({ project_id: projectId, date: dateKey, content: value })
            .select('id')
            .single()
          if (error) throw error

          // DB 응답 후 state 반영 (ID 필요)
          setRowData(rows => rows.map(row => {
            if (row.projectId !== projectId) return row
            const schedules = { ...row.schedules }
            schedules[dateKey] = [{
              id: inserted.id, time: null, content: value,
              contentInternal: null, note: null, dateUncertain: false, assignees: [],
            }]
            return { ...row, schedules }
          }))

          let currentId = inserted.id
          pushUndo({
            undo: async () => { await supabase.from('schedule').delete().eq('id', currentId) },
            redo: async () => {
              const { data: re } = await supabase.from('schedule')
                .insert({ project_id: projectId, date: dateKey, content: value })
                .select('id').single()
              if (re) currentId = re.id
            },
          })
        }
      }
    } catch (err: unknown) {
      handleProjectError(getErrorMessage(err), `${type === 'project' ? '프로젝트' : '스케줄'} 저장 실패`)
    } finally {
      savingRef.current = false
    }
  }, [inlineEdit, setRowData, pushUndo, suppressRealtime])

  const handleInlineCancel = useCallback(() => {
    cancelledRef.current = true
    setInlineEdit(null)
  }, [])

  const handleInlineKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newValue = ta.value.substring(0, start) + '\n' + ta.value.substring(end)
      setInlineEdit((prev) => prev ? { ...prev, value: newValue } : null)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 1
        ta.style.height = 'auto'
        ta.style.height = ta.scrollHeight + 'px'
      })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleInlineSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleInlineCancel()
    }
  }, [handleInlineSave, handleInlineCancel])

  return {
    inlineEdit,
    setInlineEdit,
    inlineInputRef,
    handleOpenScheduleInlineEditor,
    handleOpenProjectInlineEditor,
    handleInlineSave,
    handleInlineCancel,
    handleInlineKeyDown,
    setRowDataRef,
  }
}
