export interface GanttScheduleItem {
  id: number
  date: string
  content: string | null
  time: string | null
  dateUncertain: boolean
}

export interface ScenarioScheduleItem {
  id: number
  scenarioId: number
  projectId: number
  dateStart: string
  dateEnd: string
}

export interface GanttTask {
  id: number
  text: string           // [브랜드코드] 프로젝트명
  projectName: string    // 프로젝트명 (브랜드코드 없이)
  start: Date | null
  end: Date | null
  duration: number
  parent: number
  depth: number
  sortOrder: number
  progress: number
  open?: boolean
  brandId: number
  brandCode?: string
  brandColor?: string | null
  parentId: number | null
  status: '진행전' | '진행중' | '보류' | '완료' | '드랍'
  drivePath: string | null
  dateStart: string | null   // 원본 string (모달용)
  dateEnd: string | null
  roleMembers: Record<string, { memberId: number; nameShort: string }[]>
  scenarioSchedules: ScenarioScheduleItem[]
  schedules: GanttScheduleItem[]
}

export interface GanttFetchOptions {
  statusFilter?: string[] | null
  brandFilter?: number[] | null
}
