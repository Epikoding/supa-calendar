'use client'

import { memo } from 'react'
import { primaryAlpha } from '@/lib/colors'

const INDENT = 20
const LINE_COLOR = primaryAlpha(0.1)

interface TreeLinesProps {
  depth: number
  isLastAtDepth: boolean[]
}

export default memo(function TreeLines({ depth, isLastAtDepth }: TreeLinesProps) {
  if (depth === 0) return null
  return (
    <>
      {Array.from({ length: depth }, (_, i) => {
        const isLast = isLastAtDepth[i] ?? false
        const isCurrentDepth = i === depth - 1
        return (
          <div
            key={i}
            className="flex-shrink-0 relative"
            style={{ width: INDENT }}
          >
            {/* 세로선: 마지막 형제면 행 중앙까지, 아니면 전체 */}
            <div
              className="absolute"
              style={{
                left: INDENT / 2,
                top: 0,
                bottom: isLast ? '50%' : 0,
                width: 1,
                background: LINE_COLOR,
              }}
            />
            {/* 가로선: 현재 depth에서만 표시 */}
            {isCurrentDepth && (
              <div
                className="absolute"
                style={{
                  left: INDENT / 2,
                  top: '50%',
                  width: 8,
                  height: 1,
                  background: LINE_COLOR,
                }}
              />
            )}
          </div>
        )
      })}
    </>
  )
})
