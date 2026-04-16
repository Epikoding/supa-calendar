import type { ProjectStatus } from '@/lib/constants/project'

/**
 * 프로젝트 생성/수정 폼에서 공유되는 공통 페이로드.
 *
 * `ProjectDetailModal`의 onSave/onCreate 콜백과
 * useCalendarProjects / useGanttProjects / ProjectTree의 핸들러가
 * 이 타입을 공유한다.
 */
export interface ProjectFormPayload {
  name: string
  brandId: number | null
  parentId: number | null
  status: ProjectStatus
  drivePath: string
  dateStart: string
  dateEnd: string
  membersByRole: Record<string, number[]>
}
