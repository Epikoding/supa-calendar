import * as XLSX from 'xlsx'
import type { GanttTask } from '@/lib/types/gantt'
import type { ProjectRole } from '@/lib/types/role'
import { BRAND_LABEL } from '@/lib/config'

interface ExportExcelOptions {
  tasks: GanttTask[]
  roles: ProjectRole[]
  includeScenarios: boolean
  dateRange: { start: string; end: string }
  fileName: string
}

export function exportGanttExcel({ tasks, roles, includeScenarios, dateRange, fileName }: ExportExcelOptions): void {
  const wb = XLSX.utils.book_new()

  // 시트 1: 프로젝트 목록
  const projectHeaders = [
    BRAND_LABEL,
    '프로젝트명',
    '상태',
    '시작일',
    '종료일',
    ...roles.map((r) => r.label),
  ]
  const projectRows = tasks.map((t) => {
    const row: string[] = [
      t.brandCode ?? '',
      (t.depth > 0 ? '└ '.repeat(t.depth) : '') + t.projectName,
      t.status,
      t.dateStart ?? '',
      t.dateEnd ?? '',
    ]
    for (const role of roles) {
      row.push(t.roleMembers[role.key]?.map((m) => m.nameShort).join(', ') ?? '')
    }
    return row
  })
  const ws1 = XLSX.utils.aoa_to_sheet([projectHeaders, ...projectRows])
  ws1['!cols'] = [
    { wch: 8 },
    { wch: 30 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    ...roles.map(() => ({ wch: 20 })),
  ]
  XLSX.utils.book_append_sheet(wb, ws1, '프로젝트')

  // 시트 2: 스케줄 (날짜 범위 필터)
  const scheduleHeaders = [BRAND_LABEL, '프로젝트명', '날짜', '시각', '내용', '날짜미정']
  const scheduleRows: string[][] = []
  for (const t of tasks) {
    for (const s of t.schedules) {
      if (s.date < dateRange.start || s.date > dateRange.end) continue
      scheduleRows.push([
        t.brandCode ?? '',
        t.projectName,
        s.date,
        s.time ?? '',
        s.content ?? '',
        s.dateUncertain ? '✓' : '',
      ])
    }
  }
  scheduleRows.sort((a, b) => a[2].localeCompare(b[2]))
  const ws2 = XLSX.utils.aoa_to_sheet([scheduleHeaders, ...scheduleRows])
  ws2['!cols'] = [
    { wch: 8 }, { wch: 25 }, { wch: 12 }, { wch: 8 }, { wch: 40 }, { wch: 8 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, '스케줄')

  // 시트 3: 시나리오 (날짜 범위 겹치는 것만)
  if (includeScenarios) {
    const scenarioHeaders = [BRAND_LABEL, '프로젝트명', '시나리오', '시작일', '종료일']
    const scenarioRows: string[][] = []
    for (const t of tasks) {
      for (const ss of t.scenarioSchedules) {
        if (ss.dateStart > dateRange.end || ss.dateEnd < dateRange.start) continue
        scenarioRows.push([
          t.brandCode ?? '',
          t.projectName,
          `S${String(ss.scenarioId).padStart(2, '0')}`,
          ss.dateStart,
          ss.dateEnd,
        ])
      }
    }
    const ws3 = XLSX.utils.aoa_to_sheet([scenarioHeaders, ...scenarioRows])
    ws3['!cols'] = [
      { wch: 8 }, { wch: 25 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    ]
    XLSX.utils.book_append_sheet(wb, ws3, '시나리오')
  }

  XLSX.writeFile(wb, fileName)
}
