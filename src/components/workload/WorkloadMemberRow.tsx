'use client'

import { memo } from 'react'

interface WorkloadMemberRowProps {
  memberName: string
  memberId: number
}

export default memo(function WorkloadMemberRow({ memberName, memberId }: WorkloadMemberRowProps) {
  return (
    <div
      data-member-id={memberId}
      className="flex items-center px-2 border-b border-black/[0.04]"
      style={{ minHeight: 52 }}
    >
      <span className="text-[13px] font-semibold text-gray-800 truncate">{memberName}</span>
    </div>
  )
})
