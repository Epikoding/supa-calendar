'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { readJson, writeJson } from '@/lib/storage'
import type { StorageKey } from '@/lib/storage'

interface HasBrandId {
  brandId: number
}

/**
 * 브랜드별 그룹핑 + 접기/펼치기 + localStorage 동기화 훅.
 * 간트차트/캘린더/워크로드에서 공통 사용.
 */
export function useBrandGroups<T extends HasBrandId>(
  tasks: T[],
  storageKey: StorageKey,
) {
  const [collapsedBrands, setCollapsedBrands] = useState<Set<number>>(new Set())

  // localStorage에서 초기값 복원
  useEffect(() => {
    const saved = readJson<number[]>(storageKey)
    if (saved) setCollapsedBrands(new Set(saved))
  }, [storageKey])

  // collapsedBrands 변경 시 localStorage 동기화
  useEffect(() => {
    if (collapsedBrands.size > 0) {
      writeJson(storageKey, [...collapsedBrands])
    } else {
      writeJson(storageKey, null)
    }
  }, [collapsedBrands, storageKey])

  const toggleBrandCollapse = useCallback((brandId: number) => {
    setCollapsedBrands(prev => {
      const next = new Set(prev)
      if (next.has(brandId)) next.delete(brandId)
      else next.add(brandId)
      return next
    })
  }, [])

  const brandGroups = useMemo(() => {
    const groupMap = new Map<number, T[]>()
    const brandOrder: number[] = []
    for (const t of tasks) {
      if (!groupMap.has(t.brandId)) {
        groupMap.set(t.brandId, [])
        brandOrder.push(t.brandId)
      }
      groupMap.get(t.brandId)!.push(t)
    }
    return { groupMap, brandOrder }
  }, [tasks])

  return { brandGroups, collapsedBrands, toggleBrandCollapse }
}
