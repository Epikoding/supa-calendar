import { supabase } from '@/lib/supabase/client'
import type { GanttTask, GanttFetchOptions, ScenarioScheduleItem, GanttScheduleItem } from '@/lib/types/gantt'
import type { ProjectRole } from '@/lib/types/role'
import { groupMembersByRole } from '@/lib/utils/role'

function calcDuration(dateStart: string, dateEnd: string): number {
  const start = new Date(dateStart)
  const end = new Date(dateEnd)
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
}

interface ProjectRow {
  id: number
  brand_id: number
  parent_id: number | null
  name: string
  sort_order: number
  drive_path: string | null
  date_start: string | null
  date_end: string | null
  status: '진행전' | '진행중' | '보류' | '완료' | '드랍'
  brands: { code: string; color: string | null } | null
  project_members: { member_id: number; role: string }[]
}

/**
 * 프로젝트를 계층 트리 순서(브랜드 → 부모 → 자식 재귀)로 정렬하여 GanttTask 배열로 반환.
 * date_start/date_end가 없는 프로젝트도 포함 (바 없이 행만 표시).
 * brands는 외부에서 전달받아 별도 조회하지 않는다 (캐싱/Realtime으로 관리).
 */
export async function fetchGanttTasks(
  roles: ProjectRole[],
  options: GanttFetchOptions = {},
  memberMap: Map<number, string> = new Map(),
  brands: { id: number; code: string; color: string | null; sort_order: number }[] = [],
): Promise<GanttTask[]> {
  const { statusFilter = null, brandFilter = null } = options

  // 전체 프로젝트 조회 (필터 적용) + project_members 조인
  let query = supabase
    .from('projects')
    .select('*, brands!projects_brand_id_fkey(code, color), project_members(member_id, role)')

  if (statusFilter && statusFilter.length > 0) {
    query = query.in('status', statusFilter as ('진행전' | '진행중' | '보류' | '완료' | '드랍')[])
  }
  if (brandFilter && brandFilter.length > 0) {
    query = query.in('brand_id', brandFilter)
  }

  const { data, error } = await query
  if (error) throw new Error(`간트 프로젝트 조회 실패: ${error.message}`)

  const projects = data as unknown as ProjectRow[]
  const projectMap = new Map<number, ProjectRow>()
  const childrenMap = new Map<number, ProjectRow[]>()
  const rootsByBrand = new Map<number, ProjectRow[]>()

  for (const p of projects) {
    projectMap.set(p.id, p)
  }

  for (const p of projects) {
    if (p.parent_id === null || !projectMap.has(p.parent_id)) {
      const list = rootsByBrand.get(p.brand_id)
      if (list) list.push(p)
      else rootsByBrand.set(p.brand_id, [p])
    } else {
      const list = childrenMap.get(p.parent_id)
      if (list) list.push(p)
      else childrenMap.set(p.parent_id, [p])
    }
  }

  // 시나리오 스케줄 + 스케줄 조회
  const projectIds = projects.map((p) => p.id)
  const scenarioScheduleMap = new Map<number, ScenarioScheduleItem[]>()
  const scheduleItemMap = new Map<number, GanttScheduleItem[]>()
  if (projectIds.length > 0) {
    const [ssRes, schRes] = await Promise.all([
      supabase
        .from('scenario_schedules')
        .select('*')
        .in('project_id', projectIds)
        .order('scenario_id', { ascending: true }),
      supabase
        .from('schedule')
        .select('id, project_id, date, content, time, date_uncertain')
        .in('project_id', projectIds)
        .order('date', { ascending: true }),
    ])
    if (ssRes.data) {
      for (const row of ssRes.data) {
        const list = scenarioScheduleMap.get(row.project_id) ?? []
        list.push({
          id: row.id,
          scenarioId: row.scenario_id,
          projectId: row.project_id,
          dateStart: row.date_start,
          dateEnd: row.date_end,
        })
        scenarioScheduleMap.set(row.project_id, list)
      }
    }
    if (schRes.data) {
      for (const row of schRes.data) {
        const list = scheduleItemMap.get(row.project_id) ?? []
        list.push({
          id: row.id,
          date: row.date,
          content: row.content,
          time: row.time,
          dateUncertain: row.date_uncertain,
        })
        scheduleItemMap.set(row.project_id, list)
      }
    }
  }

  // 재귀적으로 트리를 flat 배열로 전개
  const result: GanttTask[] = []

  function addProject(p: ProjectRow, depth: number) {
    const brand = p.brands
    const hasRange = p.date_start && p.date_end
    const pm = p.project_members || []
    const roleMembers = groupMembersByRole(pm, memberMap, roles)

    result.push({
      id: p.id,
      text: brand ? `[${brand.code}] ${p.name}` : p.name,
      projectName: p.name,
      start: hasRange ? new Date(p.date_start!) : null,
      end: hasRange ? new Date(p.date_end!) : null,
      duration: hasRange ? calcDuration(p.date_start!, p.date_end!) : 0,
      parent: p.parent_id && projectMap.has(p.parent_id) ? p.parent_id : 0,
      depth,
      sortOrder: p.sort_order ?? 0,
      progress: p.status === '완료' ? 100 : 0,
      open: true,
      brandId: p.brand_id,
      brandCode: brand?.code,
      brandColor: brand?.color ?? null,
      parentId: p.parent_id,
      status: p.status,
      drivePath: p.drive_path,
      dateStart: p.date_start,
      dateEnd: p.date_end,
      roleMembers,
      scenarioSchedules: scenarioScheduleMap.get(p.id) ?? [],
      schedules: scheduleItemMap.get(p.id) ?? [],
    })

    const children = childrenMap.get(p.id)
    if (children) {
      const sorted = [...children].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'ko'))
      for (const child of sorted) {
        addProject(child, depth + 1)
      }
    }
  }

  // 브랜드 sort_order 순으로 순회
  for (const brand of brands) {
    const roots = rootsByBrand.get(brand.id)
    if (!roots) continue
    const sorted = [...roots].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'ko'))
    for (const root of sorted) {
      addProject(root, 0)
    }
  }

  return result
}
