'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { CalendarRow, CalendarViewState, ScheduleCell } from '@/lib/types/calendar'
import { getMonthDates, formatDateKey } from '@/lib/utils/calendar'

interface CellPos {
  projectId: number
  dateKey: string
}

interface ClipboardEntry {
  rowOffset: number
  colOffset: number
  sourceProjectId: number
  sourceDateKey: string
  schedules: ScheduleCell[]
}

export interface PasteTarget {
  targetProjectId: number
  targetDateKey: string
  sourceSchedules: ScheduleCell[]
}

export interface ClipboardAction {
  mode: 'cut' | 'copy'
  targets: PasteTarget[]
  moveOps?: { scheduleId: number; targetProjectId: number; targetDateKey: string }[]
}

interface DeleteTarget {
  projectId: number
  dateKey: string
}

interface Options {
  gridWrapperRef: React.RefObject<HTMLDivElement | null>
  rowData: CalendarRow[]
  viewStateRef: React.MutableRefObject<CalendarViewState>
  onClipboardPaste: (action: ClipboardAction) => Promise<void>
  onDeleteSelected: (targets: DeleteTarget[]) => Promise<void>
  onSelectionChange?: (dateKeys: string[]) => void
}

function getCoordsFromElement(el: HTMLElement): CellPos | null {
  const cell = el.closest('[data-pid][data-dk]') as HTMLElement | null
  if (!cell) return null
  const pid = cell.getAttribute('data-pid')
  const dk = cell.getAttribute('data-dk')
  if (!pid || !dk) return null
  return { projectId: Number(pid), dateKey: dk }
}

export function useCellClipboard(options: Options) {
  const { gridWrapperRef, viewStateRef } = options

  const selectedCells = useRef<Set<string>>(new Set())
  const dragStart = useRef<CellPos | null>(null)
  const isDragging = useRef(false)
  const clipboard = useRef<{
    mode: 'cut' | 'copy'
    entries: ClipboardEntry[]
    sourceKeys: string[]
  } | null>(null)

  const rowDataRef = useRef(options.rowData)
  rowDataRef.current = options.rowData
  const pasteRef = useRef(options.onClipboardPaste)
  pasteRef.current = options.onClipboardPaste
  const deleteRef = useRef(options.onDeleteSelected)
  deleteRef.current = options.onDeleteSelected
  const selectionChangeRef = useRef(options.onSelectionChange)
  selectionChangeRef.current = options.onSelectionChange

  // --- Helpers ---

  const coordsCache = useRef<{
    year: number; month: number; pidsKey: string
    dates: string[]; pids: number[]
    dateIdx: Map<string, number>; pidIdx: Map<number, number>
  } | null>(null)

  const getCoords = useCallback(() => {
    const vs = viewStateRef.current
    const pids = rowDataRef.current.map((r) => r.projectId)
    const pidsKey = pids.join(',')
    const cached = coordsCache.current
    if (cached && cached.year === vs.year && cached.month === vs.month && cached.pidsKey === pidsKey) {
      return cached
    }
    const dates = getMonthDates(vs.year, vs.month, 2).map(formatDateKey)
    const dateIdx = new Map(dates.map((d, i) => [d, i]))
    const pidIdx = new Map(pids.map((p, i) => [p, i]))
    const result = { year: vs.year, month: vs.month, pidsKey, dates, pids, dateIdx, pidIdx }
    coordsCache.current = result
    return result
  }, [viewStateRef])

  const computeRect = useCallback((a: CellPos, b: CellPos): Set<string> => {
    const { dates, pids, dateIdx, pidIdx } = getCoords()
    const r1 = pidIdx.get(a.projectId) ?? -1, r2 = pidIdx.get(b.projectId) ?? -1
    const c1 = dateIdx.get(a.dateKey) ?? -1, c2 = dateIdx.get(b.dateKey) ?? -1
    if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return new Set()
    const res = new Set<string>()
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++)
        res.add(`${pids[r]}::${dates[c]}`)
    return res
  }, [getCoords])

  const setDomClass = useCallback((sel: Set<string>, cls: string) => {
    const w = gridWrapperRef.current
    if (!w) return
    w.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls))
    for (const key of sel) {
      const [pid, dk] = key.split('::')
      const cell = w.querySelector(`[data-pid="${pid}"][data-dk="${dk}"]`)
      if (cell) cell.classList.add(cls)
    }
  }, [gridWrapperRef])

  const applyHeaderHighlight = useCallback((sel: Set<string>) => {
    const w = gridWrapperRef.current
    if (!w) return
    w.querySelectorAll('.header-col-selected').forEach((el) => el.classList.remove('header-col-selected'))
    const dateKeys = new Set<string>()
    for (const key of sel) dateKeys.add(key.split('::')[1])
    for (const dk of dateKeys) {
      const header = w.querySelector(`[data-header-dk="${dk}"]`)
      if (header) header.classList.add('header-col-selected')
    }
    selectionChangeRef.current?.([...dateKeys].sort())
  }, [gridWrapperRef])

  const applySelection = useCallback((s: Set<string>) => {
    setDomClass(s, 'cell-selected')
    applyHeaderHighlight(s)
  }, [setDomClass, applyHeaderHighlight])

  const applyCutMark = useCallback((keys: string[]) => setDomClass(new Set(keys), 'cell-cut'), [setDomClass])

  // --- Shift+드래그 전용 셀 선택 ---

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const coords = getCoordsFromElement(e.target as HTMLElement)
    if (!coords) return
    dragStart.current = coords
    isDragging.current = true
    // 시작 셀 즉시 선택
    const sel = new Set([`${coords.projectId}::${coords.dateKey}`])
    selectedCells.current = sel
    applySelection(sel)
  }, [applySelection])

  const onMouseOver = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !dragStart.current) return
    const coords = getCoordsFromElement(e.target as HTMLElement)
    if (!coords) return
    const sel = computeRect(dragStart.current, coords)
    selectedCells.current = sel
    applySelection(sel)
  }, [computeRect, applySelection])

  // document mouseup → 드래그 종료
  useEffect(() => {
    const onUp = () => { isDragging.current = false }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [])

  // --- 키보드: Ctrl+C/X/V, Delete, Escape ---

  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'Escape') {
        if (clipboard.current) {
          clipboard.current = null
          applyCutMark([])
        }
        selectedCells.current = new Set()
        applySelection(new Set())
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = selectedCells.current
        if (sel.size === 0) return
        e.preventDefault()
        const targets: DeleteTarget[] = []
        for (const k of sel) {
          const [pid, dk] = k.split('::')
          targets.push({ projectId: Number(pid), dateKey: dk })
        }
        deleteRef.current(targets).then(() => {
          selectedCells.current = new Set()
          applySelection(new Set())
        })
        return
      }

      if (!(e.metaKey || e.ctrlKey)) return

      // Cut / Copy
      if (e.key === 'x' || e.key === 'c') {
        e.preventDefault()
        const sel = selectedCells.current
        if (sel.size === 0) return

        const { dates, pids, dateIdx, pidIdx } = getCoords()
        let minR = Infinity, minC = Infinity
        const positions: { r: number; c: number; key: string }[] = []
        for (const k of sel) {
          const [pid, dk] = k.split('::')
          const r = pidIdx.get(Number(pid)) ?? -1, c = dateIdx.get(dk) ?? -1
          if (r >= 0 && c >= 0) {
            positions.push({ r, c, key: k })
            if (r < minR) minR = r
            if (c < minC) minC = c
          }
        }

        const entries: ClipboardEntry[] = positions.map(({ r, c, key: k }) => {
          const [pid, dk] = k.split('::')
          const rowObj = rowDataRef.current.find((row) => row.projectId === Number(pid))
          return {
            rowOffset: r - minR,
            colOffset: c - minC,
            sourceProjectId: Number(pid),
            sourceDateKey: dk,
            schedules: rowObj?.schedules[dk] ?? [],
          }
        })

        const mode = e.key === 'x' ? 'cut' as const : 'copy' as const
        clipboard.current = { mode, entries, sourceKeys: [...sel] }
        applyCutMark(mode === 'cut' ? [...sel] : [])
      }

      // Paste
      if (e.key === 'v') {
        e.preventDefault()
        const cb = clipboard.current
        if (!cb) return
        const sel = selectedCells.current
        if (sel.size === 0) return

        const { dates, pids, dateIdx, pidIdx } = getCoords()
        let minR = Infinity, minC = Infinity
        for (const k of sel) {
          const [pid, dk] = k.split('::')
          const r = pidIdx.get(Number(pid)) ?? -1, c = dateIdx.get(dk) ?? -1
          if (r >= 0 && c >= 0) {
            if (r < minR) minR = r
            if (c < minC) minC = c
          }
        }
        if (minR === Infinity) return

        const targets: PasteTarget[] = []
        const moveOps: NonNullable<ClipboardAction['moveOps']> = []

        for (const entry of cb.entries) {
          const tr = minR + entry.rowOffset, tc = minC + entry.colOffset
          if (tr < 0 || tr >= pids.length || tc < 0 || tc >= dates.length) continue
          targets.push({
            targetProjectId: pids[tr],
            targetDateKey: dates[tc],
            sourceSchedules: entry.schedules,
          })
          if (cb.mode === 'cut') {
            for (const s of entry.schedules) {
              moveOps.push({ scheduleId: s.id, targetProjectId: pids[tr], targetDateKey: dates[tc] })
            }
          }
        }

        if (targets.length > 0) {
          await pasteRef.current({
            mode: cb.mode,
            targets,
            moveOps: cb.mode === 'cut' ? moveOps : undefined,
          })
        }

        if (cb.mode === 'cut') {
          applyCutMark([])
          clipboard.current = null
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [getCoords, applyCutMark, applySelection])

  return { onMouseDown, onMouseOver }
}
