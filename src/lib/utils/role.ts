import type { ProjectRole } from '@/lib/types/role'

interface ProjectMemberRow {
  member_id: number
  role: string
}

export interface MemberAssignee {
  memberId: number
  nameShort: string
}

/**
 * project_members 배열을 role key별 Member 배열로 그룹핑한다.
 * - roles에 있는 key만 포함 (비활성 role의 기존 데이터는 유지되지만 렌더에서 숨김)
 * - 각 role 내부는 nameShort 한국어 역순 정렬 (기존 동작 유지)
 */
export function groupMembersByRole(
  projectMembers: ProjectMemberRow[],
  memberMap: Map<number, string>,
  roles: ProjectRole[],
): Record<string, MemberAssignee[]> {
  const result: Record<string, MemberAssignee[]> = {}

  for (const role of roles) {
    result[role.key] = []
  }

  for (const pm of projectMembers) {
    if (!(pm.role in result)) continue
    result[pm.role].push({
      memberId: pm.member_id,
      nameShort: memberMap.get(pm.member_id) ?? '',
    })
  }

  for (const key of Object.keys(result)) {
    result[key].sort((a, b) => b.nameShort.localeCompare(a.nameShort, 'ko'))
  }

  return result
}
