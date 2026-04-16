'use client'

import { useState, useCallback, useRef } from 'react'

interface UsePanelResizeOptions {
  defaultWidth: number
  minWidth?: number
  maxWidth?: number
}

/**
 * 좌측 패널 드래그 리사이즈 훅.
 * DOM 직접 조작으로 부드러운 드래그, mouseUp 시 state 반영.
 */
export function usePanelResize({
  defaultWidth,
  minWidth = 150,
  maxWidth = 600,
}: UsePanelResizeOptions) {
  const [labelWidth, setLabelWidth] = useState(defaultWidth)
  const labelWrapperRef = useRef<HTMLDivElement>(null)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const wrapper = labelWrapperRef.current
    if (!wrapper) return
    const startWidth = wrapper.offsetWidth

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + ev.clientX - startX))
      wrapper.style.width = `${newWidth}px`
    }
    const onMouseUp = (ev: MouseEvent) => {
      const finalWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + ev.clientX - startX))
      setLabelWidth(finalWidth)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [minWidth, maxWidth])

  return { labelWidth, setLabelWidth, labelWrapperRef, handleResizeStart }
}
