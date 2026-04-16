const DEPTH_STYLES = [
  { fontSize: 13, fontWeight: 600 },
  { fontSize: 12, fontWeight: 500 },
  { fontSize: 12, fontWeight: 400 },
  { fontSize: 11, fontWeight: 400 },
] as const

export function getDepthStyle(depth: number) {
  return DEPTH_STYLES[Math.min(depth, 3)]
}
