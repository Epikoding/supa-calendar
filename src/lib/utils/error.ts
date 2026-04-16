export function getErrorMessage(err: unknown): string {
  return err && typeof err === 'object' && 'message' in err
    ? (err as { message: string }).message
    : String(err)
}

export function handleProjectError(msg: string, context: string): void {
  if (msg.includes('unique_project_name_per_parent')) {
    alert('같은 위치에 동일한 이름의 프로젝트가 이미 존재합니다.')
  } else {
    console.error(`${context}:`, msg)
  }
}
