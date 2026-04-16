import { supabase } from '@/lib/supabase/client'
import type { Brand, Member } from '@/lib/types/database'
import type { WorkloadRow, WorkloadCell } from '@/lib/types/workload'
import { getPrevMonth, getNextMonth } from '@/lib/utils/calendar'

/**
 * 멤버별 워크로드 데이터를 조회한다.
 * schedule_assignees를 기준으로 멤버에게 배정된 일정을 가져온다.
 */
export async function fetchWorkloadData(
  year: number,
  month: number,
  members: Member[],
  brands: Brand[],
  options: { brandFilter?: number[] | null } = {},
): Promise<WorkloadRow[]> {
  // 이전 월 ~ 다음 월의 날짜 범위 계산 (3개월)
  const prev = getPrevMonth(year, month)
  const next = getNextMonth(year, month)
  const firstDay = `${prev.year}-${String(prev.month).padStart(2, '0')}-01`
  const lastDate = new Date(next.year, next.month, 0)
  const lastDay = `${next.year}-${String(next.month).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`

  // 멤버 맵
  const memberMap = new Map<number, Member>()
  for (const m of members) memberMap.set(m.id, m)

  // 브랜드 맵
  const brandMap = new Map<number, Brand>()
  for (const b of brands) brandMap.set(b.id, b)

  // 스케줄 조회
  let q = supabase
    .from('schedule')
    .select('id, project_id, date, time, content, content_internal, note, date_uncertain, schedule_assignees(member_id), projects!inner(name, brand_id, status)')
    .gte('date', firstDay)
    .lte('date', lastDay)
  if (options.brandFilter && options.brandFilter.length > 0) {
    q = q.in('projects.brand_id', options.brandFilter)
  }
  const { data: schedules, error } = await q

  if (error) throw new Error(`워크로드 조회 실패: ${error.message}`)

  // 멤버별 일정 그룹핑
  const memberSchedules = new Map<number, Map<string, WorkloadCell[]>>()

  for (const s of schedules as any[]) {
    const project = s.projects
    if (!project) continue

    const brand = brandMap.get(project.brand_id)
    const assigneeIds: { member_id: number }[] = s.schedule_assignees ?? []

    // 담당자 이름 해석
    const assignees = assigneeIds.map((a) => {
      const member = memberMap.get(a.member_id)
      return { memberId: a.member_id, nameShort: member?.name_short ?? '' }
    })

    for (const a of assigneeIds) {
      if (!memberSchedules.has(a.member_id)) {
        memberSchedules.set(a.member_id, new Map())
      }
      const dateMap = memberSchedules.get(a.member_id)!
      if (!dateMap.has(s.date)) {
        dateMap.set(s.date, [])
      }
      dateMap.get(s.date)!.push({
        scheduleId: s.id,
        projectId: s.project_id,
        projectName: project.name,
        brandCode: brand?.code ?? '',
        brandColor: brand?.color ?? null,
        content: s.content,
        contentInternal: s.content_internal,
        time: s.time,
        note: s.note,
        dateUncertain: s.date_uncertain,
        status: project.status,
        assignees,
      })
    }
  }

  // 멤버 행 생성 (활성 멤버만, 이름순)
  const rows: WorkloadRow[] = members
    .map((m) => {
      const dateMap = memberSchedules.get(m.id)
      const scheduleRecord: Record<string, WorkloadCell[]> = {}
      let totalCount = 0
      if (dateMap) {
        for (const [date, cells] of dateMap) {
          scheduleRecord[date] = cells.sort((a, b) => {
            if (a.time && !b.time) return -1
            if (!a.time && b.time) return 1
            if (a.time && b.time) return a.time.localeCompare(b.time)
            return a.brandCode.localeCompare(b.brandCode)
          })
          totalCount += cells.length
        }
      }

      return {
        memberId: m.id,
        memberName: m.name,
        memberNameShort: m.name_short,
        role: m.role,
        totalScheduleCount: totalCount,
        schedules: scheduleRecord,
      }
    })
    .sort((a, b) => a.memberName.localeCompare(b.memberName, 'ko'))

  return rows
}
