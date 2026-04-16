import { useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { GanttTask, ScenarioScheduleItem } from '@/lib/types/gantt'
import { getErrorMessage } from '@/lib/utils/error'

export interface Scenario {
  id: number
  name: string
  description: string | null
}

interface UseGanttScenariosParams {
  loadTasks: (showLoading?: boolean) => Promise<void>
  pushUndo: (actions: { undo: () => Promise<void>; redo: () => Promise<void> }) => void
  suppressRealtime: (tables: string[]) => void
}

export function useGanttScenarios({ loadTasks, pushUndo, suppressRealtime }: UseGanttScenariosParams) {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<number>>(new Set())

  const activeScenarios = useMemo(
    () => scenarios.filter((s) => selectedScenarioIds.has(s.id)),
    [scenarios, selectedScenarioIds],
  )

  const loadScenarios = useCallback(async () => {
    const { data } = await supabase.from('scenarios').select('*').order('id', { ascending: true })
    if (data) setScenarios(data.map((s) => ({ id: s.id, name: s.name, description: s.description })))
  }, [])

  const handleCreateScenario = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('scenarios').insert({ name: '새 시나리오' }).select('id').single()
      if (error) throw error
      await loadScenarios()
      setSelectedScenarioIds((prev) => new Set([...prev, data.id]))
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('시나리오 생성 실패:', msg)
    }
  }, [loadScenarios])

  const handleRenameScenario = useCallback(async (id: number, name: string) => {
    try {
      const { error } = await supabase.from('scenarios').update({ name }).eq('id', id)
      if (error) throw error
      setScenarios((prev) => prev.map((s) => s.id === id ? { ...s, name } : s))
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('시나리오 이름 변경 실패:', msg)
    }
  }, [])

  const handleDeleteScenario = useCallback(async (id: number) => {
    try {
      const { error } = await supabase.from('scenarios').delete().eq('id', id)
      if (error) throw error
      await loadScenarios()
      setSelectedScenarioIds((prev) => { const next = new Set(prev); next.delete(id); return next })
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('시나리오 삭제 실패:', msg)
    }
  }, [loadScenarios])

  const handleSsDelete = useCallback(async (ssId: number) => {
    try {
      const { data: record } = await supabase.from('scenario_schedules').select('id, scenario_id, project_id, date_start, date_end').eq('id', ssId).single()
      const { error } = await supabase.from('scenario_schedules').delete().eq('id', ssId)
      if (error) throw error
      if (record) {
        let restoredId = record.id
        pushUndo({
          undo: async () => {
            const { data: restored } = await supabase.from('scenario_schedules').insert({ scenario_id: record.scenario_id, project_id: record.project_id, date_start: record.date_start, date_end: record.date_end }).select('id').single()
            if (restored) restoredId = restored.id
          },
          redo: async () => { await supabase.from('scenario_schedules').delete().eq('id', restoredId) },
        })
      }
      suppressRealtime(['schedule', 'project', 'scenario'])
      await loadTasks(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('시나리오 스케줄 삭제 실패:', msg)
    }
  }, [loadTasks, pushUndo, suppressRealtime])

  const getTaskSsForScenario = useCallback((task: GanttTask, scenarioId: number): ScenarioScheduleItem | null => {
    return task.scenarioSchedules.find((ss) => ss.scenarioId === scenarioId) ?? null
  }, [])

  return {
    scenarios, setScenarios,
    selectedScenarioIds, setSelectedScenarioIds,
    activeScenarios,
    loadScenarios,
    handleCreateScenario, handleRenameScenario, handleDeleteScenario,
    handleSsDelete, getTaskSsForScenario,
  }
}
