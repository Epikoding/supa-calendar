import { supabase } from '@/lib/supabase/client'
import type { CalendarData } from '@/lib/types/calendar'
import { getPrevMonth, getNextMonth } from '@/lib/utils/calendar'

/**
 * 프로젝트 + 스케줄만 조회한다 (brands/members 제외).
 * brands/members는 마운트 시 별도 로드 후 Realtime으로 갱신.
 */
export async function fetchScheduleData(
  year: number,
  month: number,
  options: { statusFilter?: string[] | null; brandFilter?: number[] | null } = {},
): Promise<Pick<CalendarData, 'projects' | 'schedules'>> {
  // 이전 월 ~ 다음 월의 날짜 범위 계산 (3개월)
  const prev = getPrevMonth(year, month)
  const next = getNextMonth(year, month)
  const firstDay = `${prev.year}-${String(prev.month).padStart(2, '0')}-01`
  const lastDay = new Date(next.year, next.month, 0)
  const lastDayStr = `${next.year}-${String(next.month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`

  // 2개 쿼리를 병렬로 실행
  const [projectsResult, schedulesResult] = await Promise.all([
    // 1. 프로젝트 + 프로젝트 멤버
    (() => {
      let q = supabase.from('projects').select('*, project_members(member_id, role)')
      if (options.statusFilter && options.statusFilter.length > 0) {
        q = q.in('status', options.statusFilter as ('진행전' | '진행중' | '보류' | '완료' | '드랍')[])
      }
      if (options.brandFilter && options.brandFilter.length > 0) {
        q = q.in('brand_id', options.brandFilter)
      }
      return q
    })(),

    // 2. 해당 월 스케줄 + 스케줄 담당자
    (() => {
      let q = supabase
        .from('schedule')
        .select('*, schedule_assignees(member_id), projects!inner(brand_id)')
        .gte('date', firstDay)
        .lte('date', lastDayStr)
      if (options.brandFilter && options.brandFilter.length > 0) {
        q = q.in('projects.brand_id', options.brandFilter)
      }
      if (options.statusFilter && options.statusFilter.length > 0) {
        q = q.in('projects.status', options.statusFilter as ('진행전' | '진행중' | '보류' | '완료' | '드랍')[])
      }
      return q
    })(),
  ])

  if (projectsResult.error) throw new Error(`프로젝트 조회 실패: ${projectsResult.error.message}`)
  if (schedulesResult.error) throw new Error(`스케줄 조회 실패: ${schedulesResult.error.message}`)

  return {
    projects: projectsResult.data as CalendarData['projects'],
    schedules: schedulesResult.data as CalendarData['schedules'],
  }
}
