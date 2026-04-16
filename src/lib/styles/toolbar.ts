import type { CSSProperties } from 'react'
import { primaryHex, primaryLightHex, primaryAlpha, primaryGradient } from '@/lib/colors'

export const PILL_ACTIVE_STYLE: CSSProperties = {
  background: primaryGradient,
  boxShadow: `0 2px 6px ${primaryAlpha(0.2)}`,
}

export const PILL_INACTIVE_STYLE: CSSProperties = {
  background: 'rgba(255,255,255,0.55)',
  border: '1px solid rgba(0,0,0,0.04)',
}

export const GLASS_TOOLBAR_STYLE: CSSProperties = {
  background: 'rgba(255,255,255,0.5)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
}

export const GLASS_DROPDOWN_STYLE: CSSProperties = {
  background: 'rgba(255,255,255,0.95)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 10px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
}

export const GLASS_NAV_STYLE: CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderBottom: '1px solid rgba(255,255,255,0.8)',
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 20px rgba(0,0,0,0.02)',
}

export const GLASS_NAV_BTN_STYLE: CSSProperties = {
  background: 'rgba(255,255,255,0.6)',
  border: '1px solid rgba(0,0,0,0.04)',
}

export const MODAL_OVERLAY_STYLE: CSSProperties = {
  backgroundColor: 'rgba(0,0,0,0.25)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}

export const MODAL_CONTAINER_STYLE: CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 10px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
}

export const DROPDOWN_ITEM_INACTIVE_STYLE: CSSProperties = {
  background: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.04)',
}

export function getStatusColor(status?: string): string {
  switch (status) {
    case '진행전': return '#7c3aed'
    case '진행중': return primaryHex
    case '보류': return '#f59e0b'
    case '완료': return '#d1d5db'
    case '드랍': return '#ef4444'
    default: return '#6b7280'
  }
}

export function getStatusColorLight(status?: string): string {
  switch (status) {
    case '진행전': return '#a78bfa'
    case '진행중': return primaryLightHex
    case '보류': return '#fbbf24'
    case '완료': return '#d1d5db'
    case '드랍': return '#f87171'
    default: return '#9ca3af'
  }
}

export function getStatusPillStyle(status: string, active: boolean): CSSProperties {
  const color = getStatusColor(status)
  const colorLight = getStatusColorLight(status)
  if (active) {
    if (status === '완료') return { background: '#d1d5db', color: '#4b5563', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', border: '1px solid transparent' }
    return { background: `linear-gradient(135deg, ${color}, ${colorLight})`, color: '#fff', boxShadow: `0 2px 6px ${color}40`, border: '1px solid transparent' }
  }
  if (status === '완료') return { background: 'rgba(255,255,255,0.55)', color: '#9ca3af', border: '1px solid rgba(0,0,0,0.08)' }
  return { background: 'rgba(255,255,255,0.55)', color, border: `1px solid ${color}33` }
}

export function getStatusSoftStyle(status: string): CSSProperties {
  switch (status) {
    case '진행전':
      return { background: 'rgba(124,58,237,0.10)', color: '#6d28d9' }
    case '진행중':
      return { background: primaryAlpha(0.10), color: primaryHex }
    case '보류':
      return { background: 'rgba(245,158,11,0.12)', color: '#b45309' }
    case '완료':
      return { background: 'rgba(0,0,0,0.04)', color: '#9ca3af' }
    case '드랍':
      return { background: 'rgba(239,68,68,0.10)', color: '#b91c1c' }
    default:
      return { background: 'rgba(0,0,0,0.04)', color: '#6b7280' }
  }
}
