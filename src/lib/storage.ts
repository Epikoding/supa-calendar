const STORAGE_KEYS = {
  brandFilter: 'bx-cal-brandFilter',
  statusFilter: 'bx-cal-statusFilter',
  hideEmptyRows: 'bx-cal-hideEmptyRows',
  hideWeekends: 'bx-cal-hideWeekends',
  'gantt.showMainBar': 'bx-cal-gantt-showMainBar',
  'gantt.showScheduleDots': 'bx-cal-gantt-showScheduleDots',
  'gantt.selectedScenarios': 'bx-cal-gantt-selectedScenarios',
  'gantt.collapsedBrands': 'bx-cal-gantt-collapsedBrands',
  'calendar.collapsedBrands': 'bx-cal-calendar-collapsedBrands',
  'calendar.columnWidth': 'bx-cal-calendar-columnWidth',
  'gantt.collapsedProjects': 'bx-cal-gantt-collapsedProjects',
  'calendar.collapsedProjects': 'bx-cal-calendar-collapsedProjects',
  'workload.collapsedBrands': 'bx-cal-workload-collapsedBrands',
  'gantt.compactMode': 'bx-cal-gantt-compactMode',
} as const

export type StorageKey = keyof typeof STORAGE_KEYS

export function readJson<T>(key: StorageKey): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[key])
    return raw ? JSON.parse(raw) as T : null
  } catch { return null }
}

export function readBool(key: StorageKey): boolean {
  try { return localStorage.getItem(STORAGE_KEYS[key]) === 'true' } catch { return false }
}

export function writeJson(key: StorageKey, value: unknown): void {
  try { localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value)) } catch { /* ignore */ }
}

export function writeBool(key: StorageKey, value: boolean): void {
  try { localStorage.setItem(STORAGE_KEYS[key], String(value)) } catch { /* ignore */ }
}
