import type { Project } from './database'

// 멤버별 워크로드 행
export interface WorkloadRow {
  memberId: number
  memberName: string
  memberNameShort: string
  role: string | null
  totalScheduleCount: number
  // 날짜별 일정: key = 'YYYY-MM-DD'
  schedules: Record<string, WorkloadCell[]>
}

// 워크로드 셀 (멤버 × 날짜에 배정된 개별 일정)
export interface WorkloadCell {
  scheduleId: number
  projectId: number
  projectName: string
  brandCode: string
  brandColor: string | null
  content: string | null
  contentInternal: string | null
  time: string | null
  note: string | null
  dateUncertain: boolean
  status: Project['status']
  assignees: { memberId: number; nameShort: string }[]
}

// 워크로드 뷰 상태
export interface WorkloadViewState {
  year: number
  month: number
  brandFilter: number[] | null
}
