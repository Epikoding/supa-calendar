import type { Brand, Member, Project, Schedule } from './database'

// 프로젝트 계층을 flat row로 펼친 형태
export interface CalendarRow {
  projectId: number
  brandId: number
  brandCode: string
  brandColor: string | null
  projectName: string
  parentId: number | null
  depth: number // 0=최상위, 1=자식, 2=손자
  sortOrder: number
  status: Project['status']
  drivePath: string | null
  dateStart: string | null
  dateEnd: string | null
  roleMembers: Record<string, { memberId: number; nameShort: string }[]>
  // 날짜별 스케줄: key = 'YYYY-MM-DD', value = 해당 날짜 스케줄 배열
  schedules: Record<string, ScheduleCell[]>
}

export interface ScheduleCell {
  id: number
  time: string | null
  content: string | null
  contentInternal: string | null
  note: string | null
  dateUncertain: boolean
  assignees: AssigneeInfo[]
}

export interface AssigneeInfo {
  memberId: number
  nameShort: string
}

// Supabase에서 fetch한 원시 데이터
export interface CalendarData {
  brands: Brand[]
  members: Member[]
  projects: (Project & {
    project_members: { member_id: number; role: string }[]
  })[]
  schedules: (Schedule & {
    schedule_assignees: { member_id: number }[]
  })[]
}

// 키워드 매칭
export interface KeywordMatcher {
  regex: RegExp
  color: string
  showHeaderDot: boolean
}

// 캘린더 뷰 상태
export interface CalendarViewState {
  year: number
  month: number // 1-12
  statusFilter: Project['status'][] | null // null = 전체
  brandFilter: number[] | null // null = 전체
}
