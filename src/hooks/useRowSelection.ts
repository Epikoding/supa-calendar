import { useCallback, useEffect, useRef } from 'react'
import { toKebab } from '@/lib/utils/tree'

const SELECTED_CLASS = 'row-selected'

interface UseRowSelectionParams<T> {
  items: T[]
  getId: (item: T) => number
  getBrandId: (item: T) => number
  getChildren: (id: number) => number[]
  containerRef: React.RefObject<HTMLElement | null>
  rowAttribute: string  // camelCase: 'taskId' | 'projectId' → data-task-id / data-project-id
}

export function useRowSelection<T>({
  items,
  getId,
  getBrandId,
  getChildren,
  containerRef,
  rowAttribute,
}: UseRowSelectionParams<T>) {
  const selectedIdsRef = useRef<Set<number>>(new Set())
  const anchorRef = useRef<number | null>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const getIdRef = useRef(getId)
  getIdRef.current = getId
  const getBrandIdRef = useRef(getBrandId)
  getBrandIdRef.current = getBrandId
  const getChildrenRef = useRef(getChildren)
  getChildrenRef.current = getChildren

  const dataAttr = `data-${toKebab(rowAttribute)}`

  // DOM에 선택 클래스 반영
  const syncDom = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const ids = selectedIdsRef.current
    // 자식 포함 확장
    const expanded = new Set(ids)
    for (const id of ids) {
      for (const childId of getChildrenRef.current(id)) expanded.add(childId)
    }
    container.querySelectorAll<HTMLElement>(`[${dataAttr}]`).forEach(el => {
      const id = parseInt(el.dataset[rowAttribute] || '0')
      if (expanded.has(id)) {
        el.classList.add(SELECTED_CLASS)
      } else {
        el.classList.remove(SELECTED_CLASS)
      }
    })
  }, [containerRef, dataAttr, rowAttribute])

  // 선택된 ID (자식 포함) — 드래그 시 사용
  const getExpandedIds = useCallback((): Set<number> => {
    const ids = selectedIdsRef.current
    const expanded = new Set(ids)
    for (const id of ids) {
      for (const childId of getChildrenRef.current(id)) expanded.add(childId)
    }
    return expanded
  }, [])

  const clearSelection = useCallback(() => {
    if (selectedIdsRef.current.size === 0) return
    selectedIdsRef.current = new Set()
    anchorRef.current = null
    syncDom()
  }, [syncDom])

  const handleRowClick = useCallback((id: number, e: React.MouseEvent) => {
    const _getId = getIdRef.current
    const _getBrandId = getBrandIdRef.current
    const currentItems = itemsRef.current

    const clickedItem = currentItems.find(item => _getId(item) === id)
    if (!clickedItem) return
    const clickedBrandId = _getBrandId(clickedItem)

    if (e.metaKey || e.ctrlKey) {
      // Cmd+Click: 개별 토글 (같은 brand만)
      const prev = selectedIdsRef.current
      if (prev.size > 0) {
        const firstId = prev.values().next().value!
        const firstItem = currentItems.find(item => _getId(item) === firstId)
        if (firstItem && _getBrandId(firstItem) !== clickedBrandId) return
      }
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (next.size === 0) anchorRef.current = null
      } else {
        next.add(id)
        anchorRef.current = id
      }
      selectedIdsRef.current = next
    } else if (e.shiftKey && anchorRef.current !== null) {
      // Shift+Click: 범위 선택 (같은 brand만)
      const anchorId = anchorRef.current
      const anchorItem = currentItems.find(item => _getId(item) === anchorId)
      if (!anchorItem || _getBrandId(anchorItem) !== clickedBrandId) return

      const anchorIdx = currentItems.findIndex(item => _getId(item) === anchorId)
      const targetIdx = currentItems.findIndex(item => _getId(item) === id)
      if (anchorIdx === -1 || targetIdx === -1) return

      const start = Math.min(anchorIdx, targetIdx)
      const end = Math.max(anchorIdx, targetIdx)
      const rangeIds = new Set<number>()
      for (let i = start; i <= end; i++) {
        const item = currentItems[i]
        if (_getBrandId(item) === clickedBrandId) {
          rangeIds.add(_getId(item))
        }
      }
      selectedIdsRef.current = rangeIds
    } else {
      // 일반 Click: 단일 선택
      const prev = selectedIdsRef.current
      if (prev.size === 1 && prev.has(id)) return
      selectedIdsRef.current = new Set([id])
      anchorRef.current = id
    }

    syncDom()
  }, [syncDom])

  // Escape 키로 선택 해제
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIdsRef.current.size > 0) clearSelection()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [clearSelection])

  return {
    getSelectedIds: useCallback(() => selectedIdsRef.current, []),
    getExpandedIds,
    handleRowClick,
    clearSelection,
  }
}
