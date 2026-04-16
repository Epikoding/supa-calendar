'use client'

import { forwardRef, type ReactNode, type CSSProperties } from 'react'
import { primaryAlpha } from '@/lib/colors'

interface GlassPanelProps {
  children: ReactNode
  width: number
  onScroll?: () => void
  className?: string
  style?: CSSProperties
}

const GLASS_STYLE: CSSProperties = {
  background: 'linear-gradient(135deg, rgba(248,250,255,0.50) 0%, rgba(250,252,255,0.45) 50%, rgba(248,250,255,0.47) 100%)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRight: `1px solid ${primaryAlpha(0.08)}`,
  boxShadow: '6px 0 16px rgba(0,0,0,0.06), 2px 0 4px rgba(0,0,0,0.03)',
  fontFamily: "'Pretendard Variable', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
}

const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  function GlassPanel({ children, width, onScroll, className = '', style }, ref) {
    return (
      <div
        ref={ref}
        onScroll={onScroll}
        className={`h-full overflow-y-auto overflow-x-hidden scrollbar-hide ${className}`}
        style={{ ...GLASS_STYLE, width, ...style }}
      >
        {children}
      </div>
    )
  },
)

export default GlassPanel
