'use client'

import { memo, useMemo } from 'react'
import type { ScheduleCell, KeywordMatcher } from '@/lib/types/calendar'
import type { PresenceUser } from '@/hooks/usePresence'
import { primaryHex, primaryAlpha, primaryTextGradientStyle, cardWithTimeBg, cardWithTimeBorder, cardNoTimeBg, cardNoTimeBorder } from '@/lib/colors'

const uncertainBorderStyle: React.CSSProperties = {
  border: '1px solid transparent',
  borderImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect x='0.5' y='0.5' width='calc(100%25 - 1px)' height='calc(100%25 - 1px)' fill='none' rx='3' ry='3' stroke='%236b7280' stroke-dasharray='6%2C4' stroke-width='2'/%3E%3C/svg%3E") 1`,
  borderRadius: '4px',
  padding: '2px 4px',
  opacity: 0.7,
}

interface CalendarCellProps {
  schedules: ScheduleCell[]
  projectId: number
  dateKey: string
  dayWidth: number
  isWeekend: boolean
  isToday: boolean
  isMonday: boolean
  isPast?: boolean
  isStacked?: boolean
  keywordMatchers: KeywordMatcher[]
  presenceUser?: PresenceUser | null
  onMouseDown?: (e: React.MouseEvent) => void
  onMouseOver?: (e: React.MouseEvent) => void
  onClick?: (e: React.MouseEvent) => void
  onDoubleClick?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function ScheduleCard({ s, keywordMatchers, countBadge, stackShadow }: { s: ScheduleCell; keywordMatchers: KeywordMatcher[]; countBadge?: number; stackShadow?: boolean }) {
  const dotColor = s.content
    ? keywordMatchers.find((m) => m.regex.test(s.content!))?.color ?? null
    : null

  const cardStyle: React.CSSProperties = s.time
    ? { background: cardWithTimeBg, border: cardWithTimeBorder, borderLeftWidth: '2.5px', borderLeftColor: primaryHex, borderRadius: '8px', padding: '4px 8px', marginBottom: '3px' }
    : { background: cardNoTimeBg, border: cardNoTimeBorder, borderRadius: '8px', padding: '4px 8px', marginBottom: '3px' }

  if (stackShadow) {
    cardStyle.boxShadow = '2px 2px 0 0 #d0d4db, 4px 4px 0 0 #e0e3e8'
    cardStyle.marginBottom = '0'
  }

  return (
    <div
      className="relative flex flex-col gap-0 overflow-hidden"
      style={s.dateUncertain ? { ...cardStyle, ...uncertainBorderStyle } : cardStyle}
      title={[s.time, s.content].filter(Boolean).join(' ')}
    >
      <div className="flex items-center gap-1 min-w-0">
        {s.time && (
          <span className="text-[11px] mr-0.5 flex-shrink-0" style={{ fontWeight: 700, ...primaryTextGradientStyle }}>{s.time}</span>
        )}
        <span className="truncate">{s.content}</span>
        {dotColor && (
          <span
            className="inline-block w-1.5 h-1.5 rounded-full ml-1 flex-shrink-0"
            style={{ backgroundColor: dotColor }}
          />
        )}
        {countBadge != null && (
          <span
            className="flex-shrink-0 flex items-center justify-center rounded-full text-white"
            style={{ background: primaryHex, width: 14, height: 14, fontSize: 8, fontWeight: 700, marginLeft: 'auto' }}
          >
            {countBadge}
          </span>
        )}
      </div>
      {s.assignees.length > 0 && (
        <div className="text-gray-400 text-[9px]" style={{ marginTop: '1px' }}>{s.assignees.map((a) => a.nameShort).join(', ')}</div>
      )}
      {s.contentInternal && (
        <span
          className="absolute top-0 right-0 w-0 h-0"
          style={{ borderTop: '6px solid #f59e0b', borderLeft: '6px solid transparent' }}
          title={s.contentInternal}
        />
      )}
    </div>
  )
}

export default memo(function CalendarCell({
  schedules,
  projectId,
  dateKey,
  dayWidth,
  isWeekend,
  isToday,
  isMonday,
  isPast = false,
  isStacked = false,
  keywordMatchers,
  presenceUser,
  onMouseDown,
  onMouseOver,
  onClick,
  onDoubleClick,
  onContextMenu,
}: CalendarCellProps) {
  const presenceStyle: React.CSSProperties | undefined = presenceUser
    ? { boxShadow: `inset 0 0 0 2px ${presenceUser.color}` }
    : undefined

  const cellStyle = useMemo<React.CSSProperties>(() => {
    const s: React.CSSProperties = {
      width: dayWidth,
      flexShrink: 0,
      minHeight: 36,
      borderRight: '1px solid rgba(0,0,0,0.04)',
      borderBottom: '1px solid rgba(0,0,0,0.04)',
    }
    if (isToday) s.backgroundColor = primaryAlpha(0.04)
    else if (isWeekend) s.backgroundColor = 'rgba(0,0,0,0.008)'
    if (isMonday) s.borderLeft = '1px solid rgba(0,0,0,0.06)'
    return s
  }, [dayWidth, isToday, isWeekend, isMonday])

  const pastOpacity: React.CSSProperties | undefined = isPast ? { opacity: 0.6 } : undefined

  if (schedules.length === 0) {
    return (
      <div
        data-pid={projectId}
        data-dk={dateKey}
        className="relative"
        style={{ ...cellStyle, ...presenceStyle, ...pastOpacity }}
        onMouseDown={onMouseDown}
        onMouseOver={onMouseOver}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        {presenceUser && <PresenceBadge user={presenceUser} />}
      </div>
    )
  }

  return (
    <div
      data-pid={projectId}
      data-dk={dateKey}
      className="relative"
      style={{ ...cellStyle, padding: '10px 3px', lineHeight: '16px', fontSize: '12px', ...presenceStyle, ...pastOpacity }}
      onMouseDown={onMouseDown}
      onMouseOver={onMouseOver}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {presenceUser && <PresenceBadge user={presenceUser} />}
      {isStacked ? (
        <div style={{ paddingRight: '4px', paddingBottom: '4px' }}>
          <ScheduleCard
            s={schedules[0]}
            keywordMatchers={keywordMatchers}
            countBadge={schedules.length}
            stackShadow
          />
        </div>
      ) : (
        schedules.map((s) => (
          <ScheduleCard key={s.id} s={s} keywordMatchers={keywordMatchers} />
        ))
      )}
    </div>
  )
})

function PresenceBadge({ user }: { user: PresenceUser }) {
  return (
    <div
      className="absolute top-0 right-0 w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold z-10 pointer-events-none"
      style={{ backgroundColor: user.color, transform: 'translate(25%, -25%)' }}
      title={user.email}
    >
      {user.email[0].toUpperCase()}
    </div>
  )
}
