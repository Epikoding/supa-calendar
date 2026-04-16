'use client'

import { primaryAlpha, primaryHex } from '@/lib/colors'

interface ChevronCircleProps {
  expanded: boolean
  onClick?: (e: React.MouseEvent) => void
  size?: number
}

export default function ChevronCircle({ expanded, onClick, size = 16 }: ChevronCircleProps) {
  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: primaryAlpha(0.08),
      }}
      onClick={onClick}
    >
      <svg
        width={size / 2}
        height={size / 2}
        viewBox="0 0 8 8"
        style={{
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}
      >
        <path
          d="M2 1L6 4L2 7"
          stroke={primaryHex}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  )
}
