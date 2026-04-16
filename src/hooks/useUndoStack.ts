'use client'

import { useCallback, useEffect, useRef } from 'react'

interface UndoAction {
  undo: () => Promise<void>
  redo: () => Promise<void>
}

const MAX_STACK = 50

export function useUndoStack(onAfterUndo: () => Promise<void>) {
  const undoStackRef = useRef<UndoAction[]>([])
  const redoStackRef = useRef<UndoAction[]>([])
  const afterRef = useRef(onAfterUndo)
  afterRef.current = onAfterUndo

  const pushUndo = useCallback((action: UndoAction) => {
    undoStackRef.current.push(action)
    if (undoStackRef.current.length > MAX_STACK) undoStackRef.current.shift()
    redoStackRef.current = [] // 새 작업 시 redo 스택 초기화
  }, [])

  const undo = useCallback(async () => {
    const action = undoStackRef.current.pop()
    if (!action) return
    try {
      await action.undo()
      redoStackRef.current.push(action)
      if (redoStackRef.current.length > MAX_STACK) redoStackRef.current.shift()
      await afterRef.current()
    } catch (err) {
      console.error('Undo 실패:', err)
    }
  }, [])

  const redo = useCallback(async () => {
    const action = redoStackRef.current.pop()
    if (!action) return
    try {
      await action.redo()
      undoStackRef.current.push(action)
      if (undoStackRef.current.length > MAX_STACK) undoStackRef.current.shift()
      await afterRef.current()
    } catch (err) {
      console.error('Redo 실패:', err)
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'z') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      if (e.shiftKey) {
        redo()
      } else {
        undo()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [undo, redo])

  return { pushUndo }
}
