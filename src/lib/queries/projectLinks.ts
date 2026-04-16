import { supabase } from '@/lib/supabase/client'
import type { ProjectLink } from '@/lib/types/database'

/**
 * 프로젝트별 슬랙 링크 조회.
 * 정렬: 열림 우선 → thread_date 오름차순(최신이 아래) → created_at 오름차순.
 */
export async function fetchProjectLinks(projectId: number): Promise<ProjectLink[]> {
  const { data, error } = await supabase
    .from('project_links')
    .select('*')
    .eq('project_id', projectId)
    .order('is_open', { ascending: false })
    .order('thread_date', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`슬랙 링크 조회 실패: ${error.message}`)
  return data ?? []
}

/**
 * 슬랙 링크 일괄 추가 (스마트 페이스트).
 */
export async function insertProjectLinks(
  links: {
    project_id: number
    url: string
    title: string
    link_type: 'channel' | 'message' | 'reply'
    channel_id: string | null
    channel_name?: string | null
    thread_date: string | null
  }[],
): Promise<ProjectLink[]> {
  if (links.length === 0) return []
  const { data, error } = await supabase
    .from('project_links')
    .insert(links)
    .select()
  if (error) throw new Error(`슬랙 링크 추가 실패: ${error.message}`)
  return data ?? []
}

/**
 * 슬랙 링크 제목 수정.
 */
export async function updateProjectLinkTitle(
  id: number,
  title: string,
): Promise<void> {
  const { error } = await supabase
    .from('project_links')
    .update({ title })
    .eq('id', id)
  if (error) throw new Error(`슬랙 링크 수정 실패: ${error.message}`)
}

/**
 * 슬랙 링크 열림/닫힘 토글.
 */
export async function toggleProjectLinkOpen(
  id: number,
  isOpen: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('project_links')
    .update({ is_open: isOpen })
    .eq('id', id)
  if (error) throw new Error(`슬랙 링크 상태 변경 실패: ${error.message}`)
}

/**
 * 슬랙 링크 삭제.
 */
export async function deleteProjectLink(id: number): Promise<void> {
  const { error } = await supabase
    .from('project_links')
    .delete()
    .eq('id', id)
  if (error) throw new Error(`슬랙 링크 삭제 실패: ${error.message}`)
}

/**
 * ProjectTree 배지용 — 프로젝트별 열림 링크 카운트.
 */
export async function fetchProjectLinkCounts(): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from('project_links')
    .select('project_id')
    .eq('is_open', true)
  if (error) throw new Error(`슬랙 링크 카운트 조회 실패: ${error.message}`)

  const counts = new Map<number, number>()
  for (const row of data ?? []) {
    counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1)
  }
  return counts
}
