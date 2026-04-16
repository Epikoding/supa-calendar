interface TreeNode {
  id: number
  parentId: number | null
  depth: number
}

/**
 * 같은 브랜드 내 tasks에 대해 각 task의 isLastAtDepth를 계산한다.
 * 반드시 브랜드 그룹 단위로 호출해야 한다 (브랜드 간 연결선 누출 방지).
 * isLastAtDepth[d]는 depth d에서 해당 task의 조상(또는 자신)이 마지막 형제인지를 나타낸다.
 */
export function computeIsLastAtDepth(tasks: TreeNode[]): Map<number, boolean[]> {
  // parent → children 순서 맵 빌드 (O(n))
  const childrenMap = new Map<number | null, number[]>()
  for (const task of tasks) {
    let arr = childrenMap.get(task.parentId)
    if (!arr) { arr = []; childrenMap.set(task.parentId, arr) }
    arr.push(task.id)
  }

  // 각 노드가 형제 중 마지막인지 O(1) 조회용 Set
  const lastChildSet = new Set<number>()
  for (const children of childrenMap.values()) {
    lastChildSet.add(children[children.length - 1])
  }

  // 각 task의 조상 경로를 따라가며 isLastAtDepth 계산
  const parentMap = new Map<number, number | null>()
  for (const task of tasks) {
    parentMap.set(task.id, task.parentId)
  }

  const result = new Map<number, boolean[]>()
  for (const task of tasks) {
    const arr: boolean[] = []
    let ancestorId: number | null = task.id
    const ancestors: number[] = []
    while (ancestorId !== null && parentMap.has(ancestorId)) {
      ancestors.push(ancestorId)
      ancestorId = parentMap.get(ancestorId) ?? null
    }
    ancestors.reverse() // depth 0부터 순서대로
    for (let d = 0; d < task.depth; d++) {
      arr.push(ancestors[d] !== undefined && lastChildSet.has(ancestors[d]))
    }
    result.set(task.id, arr)
  }

  return result
}
