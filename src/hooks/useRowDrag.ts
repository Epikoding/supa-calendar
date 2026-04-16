import { useState, useCallback, useRef, useEffect } from 'react'
import { isDescendantOf, toKebab } from '@/lib/utils/tree'
import { SORT_GAP } from '@/lib/utils/project'

export interface RowDragUpdate {
  id: number
  parentId: number | null
  sortOrder: number
}

const INDENT = 20  // TreeLines와 동일
const BASE_OFFSET = 16  // 드래그 핸들 영역

interface UseRowDragParams<T> {
  items: T[]
  getId: (item: T) => number
  getParentId: (item: T) => number | null
  getSortOrder: (item: T) => number
  getBrandId: (item: T) => number
  getDepth: (item: T) => number
  containerRef: React.RefObject<HTMLElement | null>
  rowAttribute: string
  getSelectedIds: () => Set<number>
  getChildren: (id: number) => number[]
  onComplete: (updates: RowDragUpdate[], oldValues: RowDragUpdate[]) => Promise<void>
  pushUndo: (actions: { undo: () => Promise<void>; redo: () => Promise<void> }) => void
}

export function useRowDrag<T>({
  items,
  getId, getParentId, getSortOrder, getBrandId, getDepth,
  containerRef,
  rowAttribute,
  getSelectedIds,
  getChildren,
  onComplete,
  pushUndo,
}: UseRowDragParams<T>) {
  const [isDragging, setIsDragging] = useState(false)
  const dragLineRef = useRef<HTMLDivElement>(null)
  const dragInfoRef = useRef<{
    targetId: number
    mode: 'before' | 'after'
    depth: number
  } | null>(null)
  const dragItemIdsRef = useRef<Set<number>>(new Set())
  const dragBrandIdRef = useRef<number>(0)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const getIdRef = useRef(getId)
  getIdRef.current = getId
  const getParentIdRef = useRef(getParentId)
  getParentIdRef.current = getParentId
  const getSortOrderRef = useRef(getSortOrder)
  getSortOrderRef.current = getSortOrder
  const getBrandIdRef = useRef(getBrandId)
  getBrandIdRef.current = getBrandId
  const getDepthRef = useRef(getDepth)
  getDepthRef.current = getDepth

  const dataAttr = `data-${toKebab(rowAttribute)}`

  const handleDragStart = useCallback((e: React.MouseEvent, itemId: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const dragItem = itemsRef.current.find(t => getIdRef.current(t) === itemId)
    if (!dragItem) return

    const currentSelectedIds = getSelectedIds()
    let dragIds: Set<number>
    if (currentSelectedIds.has(itemId)) {
      dragIds = new Set(currentSelectedIds)
    } else {
      dragIds = new Set([itemId])
      for (const childId of getChildren(itemId)) dragIds.add(childId)
    }

    dragItemIdsRef.current = dragIds
    dragBrandIdRef.current = getBrandIdRef.current(dragItem)
    setIsDragging(true)
  }, [getSelectedIds, getChildren])

  useEffect(() => {
    if (!isDragging) return
    const _getId = getIdRef.current
    const _getParentId = getParentIdRef.current
    const _getSortOrder = getSortOrderRef.current
    const _getBrandId = getBrandIdRef.current
    const _getDepth = getDepthRef.current

    // 드래그 중 items/dragIds는 변하지 않으므로 1회만 계산
    const visibleNonDragItems = itemsRef.current.filter(t => !dragItemIdsRef.current.has(_getId(t)))
    const parentMap = new Map<number, number | null>()
    for (const item of itemsRef.current) parentMap.set(_getId(item), _getParentId(item))

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return

      const rows = container.querySelectorAll<HTMLElement>(`[${dataAttr}]`)
      let targetItem: T | null = null
      let rowRect: DOMRect | null = null

      for (const row of rows) {
        const rect = row.getBoundingClientRect()
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const id = parseInt(row.dataset[rowAttribute] || '0')
          targetItem = itemsRef.current.find(t => _getId(t) === id) as T ?? null
          rowRect = rect
          break
        }
      }

      if (!targetItem || !rowRect) {
        if (dragLineRef.current) dragLineRef.current.style.display = 'none'

        dragInfoRef.current = null
        return
      }

      const targetId = _getId(targetItem)
      let isInvalid =
        _getBrandId(targetItem) !== dragBrandIdRef.current ||
        dragItemIdsRef.current.has(targetId)
      if (!isInvalid) {
        for (const dragId of dragItemIdsRef.current) {
          if (isDescendantOf(targetId, dragId, itemsRef.current, _getId, _getParentId, parentMap)) {
            isInvalid = true
            break
          }
        }
      }

      if (isInvalid) {
        if (dragLineRef.current) dragLineRef.current.style.display = 'none'

        dragInfoRef.current = null
        return
      }

      const wrapperRect = container.getBoundingClientRect()
      const relativeTop = rowRect.top - wrapperRect.top
      const mouseYInRow = e.clientY - rowRect.top
      const ratio = mouseYInRow / rowRect.height

      // before/after 판정 (50/50)
      const mode: 'before' | 'after' = ratio < 0.5 ? 'before' : 'after'

      // depth 범위 계산
      const visibleItems = visibleNonDragItems
      const targetIdx = visibleItems.findIndex(t => _getId(t) === targetId)

      let aboveItem: T | undefined
      let belowItem: T | undefined

      if (mode === 'before') {
        aboveItem = targetIdx > 0 ? visibleItems[targetIdx - 1] : undefined
        belowItem = targetItem
      } else {
        aboveItem = targetItem
        belowItem = targetIdx < visibleItems.length - 1 ? visibleItems[targetIdx + 1] : undefined
      }

      const minDepth = belowItem ? _getDepth(belowItem) : 0
      const maxDepth = aboveItem ? _getDepth(aboveItem) + 1 : 0

      // 마우스 X → depth (범위 내 clamp)
      const mouseX = e.clientX - wrapperRect.left
      const rawDepth = Math.round((mouseX - BASE_OFFSET) / INDENT)
      const depth = Math.max(minDepth, Math.min(maxDepth, rawDepth))

      dragInfoRef.current = { targetId, mode, depth }

      // 시각 피드백
      if (dragLineRef.current) {
        dragLineRef.current.style.display = 'block'
        const lineY = mode === 'before' ? relativeTop : relativeTop + rowRect.height
        dragLineRef.current.style.top = `${lineY - 1}px`
        dragLineRef.current.style.left = `${depth * INDENT}px`
      }
    }

    const handleMouseUp = async () => {
      if (dragLineRef.current) dragLineRef.current.style.display = 'none'

      const info = dragInfoRef.current
      dragInfoRef.current = null
      setIsDragging(false)

      if (!info) return

      const currentItems = itemsRef.current
      const dragIds = dragItemIdsRef.current
      const targetItem = currentItems.find(t => _getId(t) === info.targetId)
      if (!targetItem) return

      const topLevelDragItems = currentItems.filter(t => {
        const id = _getId(t)
        const pid = _getParentId(t)
        return dragIds.has(id) && (!pid || !dragIds.has(pid))
      })

      if (topLevelDragItems.length === 0) return

      // depth → parentId 역산
      const dropDepth = info.depth
      let newParentId: number | null = null

      if (dropDepth > 0) {
        const visibleItems = visibleNonDragItems
        const targetIdx = visibleItems.findIndex(t => _getId(t) === info.targetId)
        const searchStart = info.mode === 'before' ? targetIdx - 1 : targetIdx

        for (let i = searchStart; i >= 0; i--) {
          if (_getDepth(visibleItems[i]) === dropDepth - 1) {
            newParentId = _getId(visibleItems[i])
            break
          }
          if (_getDepth(visibleItems[i]) < dropDepth - 1) break
        }

        if (newParentId === null && dropDepth > 0) return
      }

      // sort_order 계산
      const visibleItems = visibleNonDragItems
      const targetVisibleIdx = visibleItems.findIndex(t => _getId(t) === info.targetId)
      const insertAfterVisibleIdx = info.mode === 'before' ? targetVisibleIdx - 1 : targetVisibleIdx

      const siblings = currentItems
        .filter(t =>
          _getParentId(t) === newParentId &&
          _getBrandId(t) === _getBrandId(targetItem) &&
          !dragIds.has(_getId(t))
        )
        .sort((a, b) => _getSortOrder(a) - _getSortOrder(b))

      const updates: RowDragUpdate[] = []
      const oldValues: RowDragUpdate[] = []
      const n = topLevelDragItems.length

      if (siblings.length === 0) {
        topLevelDragItems.forEach((item, idx) => {
          const id = _getId(item)
          oldValues.push({ id, parentId: _getParentId(item), sortOrder: _getSortOrder(item) })
          updates.push({ id, parentId: newParentId, sortOrder: SORT_GAP + idx * SORT_GAP })
        })
      } else {
        // 드롭 위치 기준 prevSibling / nextSibling 찾기
        let prevSibling: T | undefined
        let nextSibling: T | undefined

        for (let i = insertAfterVisibleIdx; i >= 0; i--) {
          const item = visibleItems[i]
          if (_getParentId(item) === newParentId && _getBrandId(item) === _getBrandId(targetItem)) {
            prevSibling = item
            break
          }
        }
        for (let i = insertAfterVisibleIdx + 1; i < visibleItems.length; i++) {
          const item = visibleItems[i]
          if (_getParentId(item) === newParentId && _getBrandId(item) === _getBrandId(targetItem)) {
            nextSibling = item
            break
          }
        }

        let sortOrders: number[]

        if (!prevSibling && nextSibling) {
          const nextSort = _getSortOrder(nextSibling)
          sortOrders = topLevelDragItems.map((_, i) => nextSort - (n - i) * SORT_GAP)
        } else if (prevSibling && !nextSibling) {
          const prevSort = _getSortOrder(prevSibling)
          sortOrders = topLevelDragItems.map((_, i) => prevSort + (i + 1) * SORT_GAP)
        } else if (prevSibling && nextSibling) {
          const prevSort = _getSortOrder(prevSibling)
          const nextSort = _getSortOrder(nextSibling)
          const gap = (nextSort - prevSort) / (n + 1)
          if (gap >= 1) {
            sortOrders = topLevelDragItems.map((_, i) => Math.floor(prevSort + gap * (i + 1)))
          } else {
            sortOrders = topLevelDragItems.map((_, i) => prevSort + (i + 1) * SORT_GAP)
          }
        } else {
          sortOrders = topLevelDragItems.map((_, i) => SORT_GAP + i * SORT_GAP)
        }

        topLevelDragItems.forEach((item, idx) => {
          const id = _getId(item)
          oldValues.push({ id, parentId: _getParentId(item), sortOrder: _getSortOrder(item) })
          updates.push({ id, parentId: newParentId, sortOrder: sortOrders[idx] })
        })
      }

      const hasChange = updates.some((u, i) =>
        u.parentId !== oldValues[i].parentId || u.sortOrder !== oldValues[i].sortOrder
      )
      if (!hasChange) return

      try {
        await onComplete(updates, oldValues)

        pushUndo({
          undo: async () => { await onComplete(oldValues, updates) },
          redo: async () => { await onComplete(updates, oldValues) },
        })
      } catch (err) {
        console.error('프로젝트 이동 실패:', err)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, containerRef, dataAttr, rowAttribute, onComplete, pushUndo])

  return {
    dragLineRef,
    handleDragStart,
  }
}
