import { supabase } from '@/lib/supabase/client'

export const SORT_GAP = 1000

/**
 * 형제 그룹의 마지막 sort_order + GAP을 계산한다.
 * 프로젝트 생성 시 형제 끝에 배치하기 위해 사용.
 */
export async function calculateNextSortOrder(brandId: number, parentId: number | null): Promise<number> {
  let q = supabase.from('projects').select('sort_order').eq('brand_id', brandId)
  if (parentId) {
    q = q.eq('parent_id', parentId)
  } else {
    q = q.is('parent_id', null)
  }
  const { data } = await q.order('sort_order', { ascending: false }).limit(1)
  return ((data?.[0] as { sort_order: number } | undefined)?.sort_order ?? 0) + SORT_GAP
}

/**
 * project_members를 DELETE all → re-INSERT로 동기화한다.
 */
export async function syncProjectMembers(
  projectId: number,
  membersByRole: Record<string, number[]>,
): Promise<void> {
  const { error: delErr } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
  if (delErr) throw delErr

  const inserts: { project_id: number; member_id: number; role: string }[] = []
  for (const [role, memberIds] of Object.entries(membersByRole)) {
    for (const mid of memberIds) {
      inserts.push({ project_id: projectId, member_id: mid, role })
    }
  }
  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from('project_members').insert(inserts)
    if (insErr) throw insErr
  }
}
