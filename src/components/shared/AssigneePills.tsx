'use client'

import { useMemo } from 'react'
import { hexToRgba } from '@/lib/colors'
import type { ProjectRole } from '@/lib/types/role'
import type { MemberAssignee } from '@/lib/utils/role'

interface AssigneePillsProps {
  roleMembers: Record<string, MemberAssignee[]>
  roles: ProjectRole[]
  muted?: boolean
}

const DEFAULT_ROLE_COLOR = '#9ca3af'

/**
 * role별 pill 스타일(bg/color)을 roles/muted가 바뀔 때만 재계산.
 * - color가 null이면 gray(#9ca3af) fallback
 * - muted=true면 더 낮은 alpha + 연한 텍스트
 */
export default function AssigneePills({ roleMembers, roles, muted }: AssigneePillsProps) {
  const roleStyles = useMemo(() => {
    const map: Record<string, { background: string; color: string }> = {}
    for (const role of roles) {
      const colorHex = role.color ?? DEFAULT_ROLE_COLOR
      map[role.key] = {
        background: hexToRgba(colorHex, muted ? 0.06 : 0.1),
        color: muted ? hexToRgba(colorHex, 0.6) : colorHex,
      }
    }
    return map
  }, [roles, muted])

  const hasAny = roles.some((r) => (roleMembers[r.key]?.length ?? 0) > 0)
  if (!hasAny) return null

  return (
    <div className="flex gap-[3px] flex-shrink-0 ml-1">
      {roles.map((role) =>
        (roleMembers[role.key] ?? []).map((m) => (
          <span
            key={`${role.key}-${m.memberId}`}
            className="text-[9px] font-medium px-1.5 py-px rounded-lg"
            style={roleStyles[role.key]}
          >
            {m.nameShort}
          </span>
        ))
      )}
    </div>
  )
}
