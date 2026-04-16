'use client'

import { useCallback, type RefObject } from 'react'

/**
 * 두 패널의 세로 스크롤을 동기화하는 훅.
 * syncAtoB: refA 스크롤 → refB에 반영
 * syncBtoA: refB 스크롤 → refA에 반영
 */
export function useScrollSync(
  refA: RefObject<HTMLDivElement | null>,
  refB: RefObject<HTMLDivElement | null>,
) {
  const syncAtoB = useCallback(() => {
    if (refA.current && refB.current)
      refB.current.scrollTop = refA.current.scrollTop
  }, [refA, refB])

  const syncBtoA = useCallback(() => {
    if (refA.current && refB.current)
      refA.current.scrollTop = refB.current.scrollTop
  }, [refA, refB])

  return { syncAtoB, syncBtoA }
}
