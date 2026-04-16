import type { CalendarData, CalendarRow, CalendarViewState, ScheduleCell, AssigneeInfo } from '@/lib/types/calendar'
import type { Brand, Member } from '@/lib/types/database'
import type { ProjectRole } from '@/lib/types/role'
import { groupMembersByRole } from '@/lib/utils/role'

type ProjectWithMembers = CalendarData['projects'][number]
type ScheduleWithAssignees = CalendarData['schedules'][number]

export const KOREAN_DAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** 이전 월의 year, month를 반환한다. */
export function getPrevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

/** 다음 월의 year, month를 반환한다. */
export function getNextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

/**
 * 해당 월의 모든 날짜 배열을 반환한다.
 * months를 지정하면 해당 월부터 연속 months개월의 날짜를 반환한다.
 */
export function getMonthDates(year: number, month: number, months = 1): Date[] {
  const dates: Date[] = []
  for (let m = 0; m < months; m++) {
    const y = month + m > 12 ? year + 1 : year
    const mo = ((month - 1 + m) % 12) + 1
    const daysInMonth = new Date(y, mo, 0).getDate()
    for (let day = 1; day <= daysInMonth; day++) {
      dates.push(new Date(y, mo - 1, day))
    }
  }
  return dates
}

/**
 * Date를 'YYYY-MM-DD' 형식 문자열로 반환한다.
 */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Date를 '3/2(월)' 형식의 한국어 레이블로 반환한다.
 */
export function getDayLabel(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const dayOfWeek = KOREAN_DAYS[date.getDay()]
  return `${month}/${day}(${dayOfWeek})`
}

/**
 * 주말(토, 일) 여부를 반환한다.
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

/**
 * CalendarData를 flat CalendarRow 배열로 변환한다.
 *
 * 정렬 순서:
 *   브랜드 sort_order → 최상위 프로젝트(parent_id=null)를 이름순 →
 *   각 최상위 프로젝트 아래 자식을 재귀적으로 이름순 배치
 *
 * viewState의 year, month를 사용하여 스케줄 레코드를 구성한다.
 */
export function flattenProjects(data: CalendarData, viewState: CalendarViewState, roles: ProjectRole[]): CalendarRow[] {
  const { brands, members, projects, schedules } = data

  // 멤버 맵: id → Member
  const memberMap = new Map<number, Member>()
  const memberNameMap = new Map<number, string>()
  for (const m of members) {
    memberMap.set(m.id, m)
    memberNameMap.set(m.id, m.name_short)
  }

  // 브랜드 맵: id → Brand
  const brandMap = new Map<number, Brand>()
  for (const b of brands) {
    brandMap.set(b.id, b)
  }

  // 스케줄을 project_id + date 키로 그룹핑
  const scheduleMap = new Map<string, ScheduleWithAssignees[]>()
  for (const s of schedules) {
    const key = `${s.project_id}::${s.date}`
    const list = scheduleMap.get(key)
    if (list) {
      list.push(s)
    } else {
      scheduleMap.set(key, [s])
    }
  }

  // 프로젝트를 parent_id로 그룹핑
  const childrenMap = new Map<number, ProjectWithMembers[]>()
  const rootProjects = new Map<number, ProjectWithMembers[]>() // brand_id → root projects

  for (const p of projects) {
    if (p.parent_id === null) {
      const list = rootProjects.get(p.brand_id)
      if (list) {
        list.push(p)
      } else {
        rootProjects.set(p.brand_id, [p])
      }
    } else {
      const list = childrenMap.get(p.parent_id)
      if (list) {
        list.push(p)
      } else {
        childrenMap.set(p.parent_id, [p])
      }
    }
  }

  // 3개월 날짜 키 배열을 한 번만 생성 (이전 월 ~ 다음 월)
  const prev = getPrevMonth(viewState.year, viewState.month)
  const dateKeys = getMonthDates(prev.year, prev.month, 3).map(formatDateKey)

  // 프로젝트의 스케줄을 Record<dateKey, ScheduleCell[]>로 변환
  function buildScheduleRecord(projectId: number): Record<string, ScheduleCell[]> {
    const result: Record<string, ScheduleCell[]> = {}
    for (const dateKey of dateKeys) {
      const key = `${projectId}::${dateKey}`
      const items = scheduleMap.get(key)
      if (items && items.length > 0) {
        result[dateKey] = items
          .map((s) => ({
            id: s.id,
            time: s.time,
            content: s.content,
            contentInternal: s.content_internal,
            note: s.note,
            dateUncertain: s.date_uncertain,
            assignees: s.schedule_assignees.map((sa): AssigneeInfo => {
              const member = memberMap.get(sa.member_id)
              return {
                memberId: sa.member_id,
                nameShort: member?.name_short ?? '',
              }
            }),
          }))
          .sort((a, b) => {
            if (a.time && !b.time) return -1
            if (!a.time && b.time) return 1
            if (a.time && b.time) return a.time.localeCompare(b.time)
            return 0
          })
      }
    }
    return result
  }

  // 프로젝트 멤버를 role key별 배열로 그룹핑
  function extractMembers(project: ProjectWithMembers): Record<string, { memberId: number; nameShort: string }[]> {
    return groupMembersByRole(project.project_members, memberNameMap, roles)
  }

  // 재귀적으로 프로젝트 트리를 flat 배열로 변환
  function addProjectAndChildren(
    project: ProjectWithMembers,
    brand: Brand,
    depth: number,
    rows: CalendarRow[],
  ): void {
    const roleMembers = extractMembers(project)
    rows.push({
      projectId: project.id,
      brandId: brand.id,
      brandCode: brand.code,
      brandColor: brand.color,
      projectName: project.name,
      parentId: project.parent_id,
      depth,
      sortOrder: project.sort_order ?? 0,
      status: project.status,
      drivePath: project.drive_path,
      dateStart: project.date_start,
      dateEnd: project.date_end,
      roleMembers,
      schedules: buildScheduleRecord(project.id),
    })

    // 자식 프로젝트를 sort_order → 이름순으로 정렬 후 재귀
    const children = childrenMap.get(project.id)
    if (children) {
      const sorted = [...children].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'ko'))
      for (const child of sorted) {
        addProjectAndChildren(child, brand, depth + 1, rows)
      }
    }
  }

  // 브랜드 sort_order 순으로 순회
  const rows: CalendarRow[] = []
  const sortedBrands = [...brands].sort((a, b) => a.sort_order - b.sort_order)

  for (const brand of sortedBrands) {
    const roots = rootProjects.get(brand.id)
    if (!roots) continue
    // 최상위 프로젝트를 sort_order → 이름순 정렬
    const sortedRoots = [...roots].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'ko'))
    for (const root of sortedRoots) {
      addProjectAndChildren(root, brand, 0, rows)
    }
  }

  return rows
}
