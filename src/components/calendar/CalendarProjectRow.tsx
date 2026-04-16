'use client'

import { memo } from 'react'
import type { CalendarRow } from '@/lib/types/calendar'
import type { ProjectRole } from '@/lib/types/role'
import TreeLines from '@/components/shared/TreeLines'
import ChevronCircle from '@/components/shared/ChevronCircle'
import AssigneePills from '@/components/shared/AssigneePills'
import { getDepthStyle } from '@/lib/constants/depth'

const ROW_HEIGHT = 36

interface CalendarProjectRowProps {
  task: CalendarRow
  roles: ProjectRole[]
  isLastAtDepth: boolean[]
  hasChildren: boolean
  isCollapsed: boolean
  onToggleCollapse?: (projectId: number) => void
  onContextMenu?: (e: React.MouseEvent) => void
  onDoubleClick?: (e: React.MouseEvent) => void
  onClick?: (e: React.MouseEvent) => void
  onDragHandleMouseDown?: (e: React.MouseEvent) => void
}

export default memo(function CalendarProjectRow({
  task,
  roles,
  isLastAtDepth,
  hasChildren,
  isCollapsed,
  onToggleCollapse,
  onContextMenu,
  onDoubleClick,
  onClick,
  onDragHandleMouseDown,
}: CalendarProjectRowProps) {
  const isMuted = task.status !== '진행중'
  const depthStyle = getDepthStyle(task.depth)

  return (
    <div
      data-project-id={task.projectId}
      className="group/row relative flex items-center border-b border-black/[0.025] cursor-pointer select-none hover:bg-[var(--color-primary-003)]"
      style={{
        minHeight: ROW_HEIGHT,
        paddingLeft: 10,
        paddingRight: 8,
        opacity: isMuted ? 0.5 : 1,
      }}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
    >
      {/* 드래그 핸들 — 맨 왼쪽 */}
      <span
        className="flex-shrink-0 cursor-grab active:cursor-grabbing mr-0.5 select-none text-gray-800 transition-colors duration-150"
        style={{ fontSize: 14, letterSpacing: '1px', lineHeight: 1, width: 16, textAlign: 'center' }}
        onMouseDown={onDragHandleMouseDown}
      >&#x2807;</span>
      {/* 트리 연결선 */}
      <TreeLines depth={task.depth} isLastAtDepth={isLastAtDepth} />
      {/* Chevron 또는 spacer */}
      {hasChildren ? (
        <ChevronCircle
          expanded={!isCollapsed}
          onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(task.projectId) }}
        />
      ) : (
        <span className="flex-shrink-0" style={{ width: 16 }} />
      )}
      {/* 프로젝트명 */}
      <span
        data-project-name
        className="truncate flex-1"
        style={{
          fontSize: depthStyle.fontSize,
          fontWeight: depthStyle.fontWeight,
          color: isMuted ? undefined : (task.depth === 0 ? '#111827' : task.depth <= 2 ? '#1f2937' : '#4b5563'),
        }}
      >
        {task.projectName}
      </span>
      {/* 담당자 pill */}
      <AssigneePills roleMembers={task.roleMembers} roles={roles} muted={isMuted} />
    </div>
  )
})
