// src/lib/colors.ts
import { PRIMARY_COLOR } from './config'

/**
 * hex 색상 정규화: 빈 문자열/null이면 null, '#' 없으면 앞에 붙임.
 * 전체 유효성(길이, 16진수)은 검증하지 않음 — DB 저장 직전 최소 정규화.
 */
export function normalizeHexColor(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === '#') return null
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

export function lighten(hex: string, amount: number): string {
  const a = Math.max(0, Math.min(1, amount))
  const [r, g, b] = hexToRgb(hex)
  const lr = Math.round(r + (255 - r) * a)
  const lg = Math.round(g + (255 - g) * a)
  const lb = Math.round(b + (255 - b) * a)
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`
}

// Primary 파생 색상
export const primaryHex = PRIMARY_COLOR
export const primaryLightHex = lighten(PRIMARY_COLOR, 0.30)
export const primaryLighterHex = lighten(PRIMARY_COLOR, 0.55)

// rgba 헬퍼
export const primaryAlpha = (alpha: number) => hexToRgba(PRIMARY_COLOR, alpha)

// 카드 색상 (CalendarCell, WorkloadCell 공유)
export const cardWithTimeBg = `linear-gradient(135deg, ${hexToRgba(PRIMARY_COLOR, 0.06)}, ${hexToRgba(primaryLighterHex, 0.04)})`
export const cardWithTimeBorder = `1px solid ${hexToRgba(PRIMARY_COLOR, 0.08)}`
export const cardNoTimeBg = hexToRgba(PRIMARY_COLOR, 0.03)
export const cardNoTimeBorder = `1px solid ${hexToRgba(PRIMARY_COLOR, 0.05)}`

// PM 버튼 gradient
export const primaryLighterGradient = `linear-gradient(135deg, ${primaryLighterHex}, ${lighten(primaryLighterHex, 0.3)})`

// 자주 쓰는 gradient
export const primaryGradient = `linear-gradient(135deg, ${primaryHex}, ${primaryLightHex})`
export const primaryTextGradientStyle = {
  background: `linear-gradient(135deg, ${primaryHex}, ${primaryLighterHex})`,
  WebkitBackgroundClip: 'text' as const,
  WebkitTextFillColor: 'transparent' as const,
}
