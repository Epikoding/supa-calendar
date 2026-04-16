/** camelCase → kebab-case (DOM dataset 속성 조회용) */
export function toKebab(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

/**
 * 트리 구조 배열을 DFS 순서로 재정렬.
 * parentId/sortOrder 변경 후 시각적 순서를 맞추기 위해 사용.
 */
export function resortTreeItems<T>(
  items: T[],
  getId: (t: T) => number,
  getParentId: (t: T) => number | null,
  getSortOrder: (t: T) => number,
  getBrandId: (t: T) => number,
  setDepth?: (item: T, depth: number) => T,
): T[] {
  // 브랜드별 그룹 (원래 배열의 브랜드 순서 유지)
  const brandOrder: number[] = []
  const byBrand = new Map<number, T[]>()
  for (const item of items) {
    const bid = getBrandId(item)
    if (!byBrand.has(bid)) {
      brandOrder.push(bid)
      byBrand.set(bid, [])
    }
    byBrand.get(bid)!.push(item)
  }

  const result: T[] = []
  for (const bid of brandOrder) {
    const brandItems = byBrand.get(bid)!
    // parent → children 맵 빌드
    const childrenMap = new Map<number | null, T[]>()
    for (const item of brandItems) {
      const pid = getParentId(item)
      if (!childrenMap.has(pid)) childrenMap.set(pid, [])
      childrenMap.get(pid)!.push(item)
    }
    // sortOrder로 정렬
    for (const children of childrenMap.values()) {
      children.sort((a, b) => getSortOrder(a) - getSortOrder(b))
    }
    // DFS (depth 계산 포함)
    const dfs = (parentId: number | null, depth: number) => {
      const children = childrenMap.get(parentId) ?? []
      for (const child of children) {
        result.push(setDepth ? setDepth(child, depth) : child)
        dfs(getId(child), depth + 1)
      }
    }
    dfs(null, 0)
  }
  return result
}

/** 주어진 id의 모든 자손 id를 재귀적으로 수집 */
export function getDescendantIds<T>(
  id: number,
  items: T[],
  getId: (item: T) => number,
  getParentId: (item: T) => number | null,
): number[] {
  const childrenMap = new Map<number | null, number[]>()
  for (const item of items) {
    const pid = getParentId(item)
    let arr = childrenMap.get(pid)
    if (!arr) { arr = []; childrenMap.set(pid, arr) }
    arr.push(getId(item))
  }
  const result: number[] = []
  const collect = (parentId: number) => {
    const children = childrenMap.get(parentId)
    if (!children) return
    for (const childId of children) {
      result.push(childId)
      collect(childId)
    }
  }
  collect(id)
  return result
}

export function isDescendantOf<T>(
  childId: number,
  ancestorId: number,
  items: T[],
  getId: (item: T) => number,
  getParentId: (item: T) => number | null,
  parentMap?: Map<number, number | null>,
): boolean {
  if (parentMap) {
    let currentId: number | null = childId
    while (currentId !== null) {
      const pid: number | null = parentMap.get(currentId) ?? null
      if (pid === ancestorId) return true
      currentId = pid
    }
    return false
  }
  let current = items.find((item) => getId(item) === childId)
  while (current && getParentId(current)) {
    if (getParentId(current) === ancestorId) return true
    current = items.find((item) => getId(item) === getParentId(current!))
  }
  return false
}
