export const STATUS_OPTIONS = ['진행전', '진행중', '보류', '완료', '드랍'] as const
export type ProjectStatus = (typeof STATUS_OPTIONS)[number]
