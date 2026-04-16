'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { BRAND_LABEL, GUEST_EMAIL } from '@/lib/config'
import { normalizeHexColor } from '@/lib/colors'
import { fetchRoles } from '@/lib/queries/masterData'
import type { ProjectRole } from '@/lib/types/role'

// --- Types ---

interface Brand {
  id: number
  code: string
  name: string
  color: string | null
  sort_order: number
  drive_root: string | null
}

interface Member {
  id: number
  name: string
  name_short: string
  role: string | null
  email: string | null
  active: boolean
}

interface KeywordHighlight {
  id: number
  keyword: string
  color: string
  is_regex: boolean
  show_header_dot: boolean
  sort_order: number
}

type Tab = 'brands' | 'members' | 'roles' | 'keywords' | 'account'

// --- Brand Row ---

function BrandRow({
  brand,
  isFirst,
  isLast,
  onSave,
  onDelete,
  onMove,
}: {
  brand: Brand
  isFirst: boolean
  isLast: boolean
  onSave: (id: number, data: Partial<Brand>) => void
  onDelete: (id: number) => void
  onMove: (id: number, direction: 'up' | 'down') => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ code: brand.code, name: brand.name, color: brand.color ?? '', drive_root: brand.drive_root ?? '' })
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = () => {
    onSave(brand.id, { code: form.code, name: form.name, color: normalizeHexColor(form.color), drive_root: form.drive_root || null })
    setEditing(false)
  }

  const handleCancel = () => {
    setForm({ code: brand.code, name: brand.name, color: brand.color ?? '', drive_root: brand.drive_root ?? '' })
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    else if (e.key === 'Escape') handleCancel()
  }

  if (editing) {
    return (
      <tr className="bg-blue-50">
        <td className="px-3 py-2">
          <input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} onKeyDown={handleKeyDown}
            className="border border-blue-300 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-blue-400" autoFocus />
        </td>
        <td className="px-3 py-2">
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} onKeyDown={handleKeyDown}
            className="border border-blue-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <input type="color" value={form.color || '#888888'} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
              className="w-7 h-7 rounded border border-gray-300 cursor-pointer" />
            <input value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} onKeyDown={handleKeyDown}
              className="border border-blue-300 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="#hex" />
          </div>
        </td>
        <td className="px-3 py-2">
          <input value={form.drive_root} onChange={(e) => setForm((p) => ({ ...p, drive_root: e.target.value }))} onKeyDown={handleKeyDown}
            className="border border-blue-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Drive 폴더명" />
        </td>
        <td className="px-3 py-2" />
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={handleCancel} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">취소</button>
            <button onClick={handleSave} className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600">저장</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-gray-50 group">
      <td className="px-3 py-2">
        <span style={{ backgroundColor: brand.color || '#888' }} className="text-[10px] text-white px-1.5 py-0.5 rounded font-medium">
          {brand.code}
        </span>
      </td>
      <td className="px-3 py-2 text-sm text-gray-900">{brand.name}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded" style={{ backgroundColor: brand.color || '#888' }} />
          <span className="text-xs text-gray-500">{brand.color}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-gray-400">{brand.drive_root || '-'}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onMove(brand.id, 'up')} disabled={isFirst}
            className="text-xs px-1 py-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed">▲</button>
          <button onClick={() => onMove(brand.id, 'down')} disabled={isLast}
            className="text-xs px-1 py-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed">▼</button>
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">편집</button>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirmDelete) { onDelete(brand.id); setConfirmDelete(false) } else { setConfirmDelete(true) } }}
            onBlur={() => setConfirmDelete(false)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${confirmDelete ? 'bg-red-600 text-white border-red-600' : 'border-red-300 text-red-400 hover:bg-red-50'}`}
          >
            {confirmDelete ? '확인' : '삭제'}
          </button>
        </div>
      </td>
    </tr>
  )
}

// --- Member Row ---

function MemberRow({
  member,
  onSave,
  onToggleActive,
}: {
  member: Member
  onSave: (id: number, data: Partial<Member>) => void
  onToggleActive: (id: number, active: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: member.name, name_short: member.name_short, role: member.role ?? '', email: member.email ?? '' })

  const handleSave = () => {
    onSave(member.id, { name: form.name, name_short: form.name_short, role: form.role || null, email: form.email || null })
    setEditing(false)
  }

  const handleCancel = () => {
    setForm({ name: member.name, name_short: member.name_short, role: member.role ?? '', email: member.email ?? '' })
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    else if (e.key === 'Escape') handleCancel()
  }

  if (editing) {
    return (
      <tr className="bg-blue-50">
        <td className="px-3 py-2">
          <input value={form.name_short} onChange={(e) => setForm((p) => ({ ...p, name_short: e.target.value }))} onKeyDown={handleKeyDown}
            className="border border-blue-300 rounded px-2 py-1 text-sm w-16 focus:outline-none focus:ring-1 focus:ring-blue-400" autoFocus />
        </td>
        <td className="px-3 py-2">
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} onKeyDown={handleKeyDown}
            className="border border-blue-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </td>
        <td className="px-3 py-2">
          <input value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} onKeyDown={handleKeyDown}
            className="border border-blue-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="역할" />
        </td>
        <td className="px-3 py-2">
          <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} onKeyDown={handleKeyDown}
            className="border border-blue-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="이메일" />
        </td>
        <td className="px-3 py-2" />
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={handleCancel} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">취소</button>
            <button onClick={handleSave} className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600">저장</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className={`hover:bg-gray-50 group ${!member.active ? 'opacity-40' : ''}`}>
      <td className="px-3 py-2 text-sm font-medium text-gray-900">{member.name_short}</td>
      <td className="px-3 py-2 text-sm text-gray-700">{member.name}</td>
      <td className="px-3 py-2 text-xs text-gray-500">{member.role || '-'}</td>
      <td className="px-3 py-2 text-xs text-gray-400">{member.email || '-'}</td>
      <td className="px-3 py-2">
        <button
          onClick={() => onToggleActive(member.id, !member.active)}
          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${member.active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}
        >
          {member.active ? '활성' : '비활성'}
        </button>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">편집</button>
        </div>
      </td>
    </tr>
  )
}

// --- Keyword Row ---

function KeywordRow({
  keyword,
  onSave,
  onDelete,
}: {
  keyword: KeywordHighlight
  onSave: (id: number, data: Partial<KeywordHighlight>) => void
  onDelete: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ keyword: keyword.keyword, color: keyword.color, is_regex: keyword.is_regex, show_header_dot: keyword.show_header_dot })
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = () => {
    // keyword_highlights.color is NOT NULL — fallback '' for null case
    onSave(keyword.id, { keyword: form.keyword, color: normalizeHexColor(form.color) ?? '', is_regex: form.is_regex, show_header_dot: form.show_header_dot })
    setEditing(false)
  }

  const handleCancel = () => {
    setForm({ keyword: keyword.keyword, color: keyword.color, is_regex: keyword.is_regex, show_header_dot: keyword.show_header_dot })
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    else if (e.key === 'Escape') handleCancel()
  }

  if (editing) {
    return (
      <tr className="bg-blue-50">
        <td className="px-3 py-2">
          <input value={form.keyword} onChange={(e) => setForm((p) => ({ ...p, keyword: e.target.value }))} onKeyDown={handleKeyDown}
            className="border border-blue-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400" autoFocus />
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <input type="color" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
              className="w-7 h-7 rounded border border-gray-300 cursor-pointer" />
            <input value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} onKeyDown={handleKeyDown}
              className="border border-blue-300 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="#hex" />
          </div>
        </td>
        <td className="px-3 py-2 text-center">
          <input type="checkbox" checked={form.is_regex} onChange={(e) => setForm((p) => ({ ...p, is_regex: e.target.checked }))}
            className="w-4 h-4 rounded border-gray-300" />
        </td>
        <td className="px-3 py-2 text-center">
          <input type="checkbox" checked={form.show_header_dot} onChange={(e) => setForm((p) => ({ ...p, show_header_dot: e.target.checked }))}
            className="w-4 h-4 rounded border-gray-300" />
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={handleCancel} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">취소</button>
            <button onClick={handleSave} className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600">저장</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-gray-50 group">
      <td className="px-3 py-2 text-sm text-gray-900">{keyword.keyword}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: keyword.color }} />
          <span className="text-xs text-gray-500">{keyword.color}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${keyword.is_regex ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
          {keyword.is_regex ? '정규식' : '텍스트'}
        </span>
      </td>
      <td className="px-3 py-2 text-center">
        {keyword.show_header_dot && (
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: keyword.color }} />
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">편집</button>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirmDelete) { onDelete(keyword.id); setConfirmDelete(false) } else { setConfirmDelete(true) } }}
            onBlur={() => setConfirmDelete(false)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${confirmDelete ? 'bg-red-600 text-white border-red-600' : 'border-red-300 text-red-400 hover:bg-red-50'}`}
          >
            {confirmDelete ? '확인' : '삭제'}
          </button>
        </div>
      </td>
    </tr>
  )
}

// --- Role Row ---

function RoleRow({
  role,
  isFirst,
  isLast,
  isLastActive,
  usageCount,
  onSave,
  onDelete,
  onToggleActive,
  onMove,
}: {
  role: ProjectRole
  isFirst: boolean
  isLast: boolean
  isLastActive: boolean
  usageCount: number
  onSave: (id: number, data: Partial<ProjectRole>) => Promise<boolean>
  onDelete: (id: number) => Promise<void>
  onToggleActive: (id: number, active: boolean) => Promise<void>
  onMove: (id: number, direction: 'up' | 'down') => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ key: role.key, label: role.label, color: role.color ?? '' })
  // confirmKey: key 변경 경고가 한번 뜬 후 확정 버튼으로 저장할 대상 key 스냅샷.
  // null이면 아직 경고 미표시. 사용자가 key input을 다시 바꾸면 null로 되돌려 재확인 강제.
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = async (): Promise<boolean> => {
    // 빈 값 검증: 저장 버튼 disabled로 차단되지만 Enter/프로그래매틱 호출 대비 safety guard
    const normalizedKey = form.key.trim().toLowerCase()
    const trimmedLabel = form.label.trim()
    if (!normalizedKey || !trimmedLabel) return false
    // key가 실제로 바뀌고 사용 중이면 확인 단계 필요
    if (normalizedKey !== role.key && usageCount > 0 && pendingKey !== normalizedKey) {
      setPendingKey(normalizedKey)
      return false
    }
    const ok = await onSave(role.id, { key: normalizedKey, label: trimmedLabel, color: normalizeHexColor(form.color) })
    if (ok) {
      setEditing(false)
      setPendingKey(null)
    }
    return ok
  }

  const handleCancel = () => {
    setForm({ key: role.key, label: role.label, color: role.color ?? '' })
    setEditing(false)
    setPendingKey(null)
  }

  // key input 변경 시: 이미 확인 대기 중이었다면 값이 달라지는 순간 재확인 강제
  const handleKeyChange = (value: string) => {
    setForm((p) => ({ ...p, key: value }))
    if (pendingKey !== null && value.trim().toLowerCase() !== pendingKey) {
      setPendingKey(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleSave()
    else if (e.key === 'Escape') handleCancel()
  }

  if (editing) {
    const trimmedKey = form.key.trim()
    const trimmedLabel = form.label.trim()
    const showKeyConfirm = pendingKey !== null && pendingKey === trimmedKey.toLowerCase()
    const saveDisabled = !trimmedKey || !trimmedLabel
    const saveTitle = !trimmedKey
      ? 'key를 입력하세요.'
      : !trimmedLabel
      ? '표시 이름을 입력하세요.'
      : undefined
    return (
      <tr className="bg-blue-50">
        <td className="px-3 py-2">
          <input value={form.key} onChange={(e) => handleKeyChange(e.target.value)} onKeyDown={handleKeyDown}
            className="border border-blue-300 rounded px-2 py-1 text-sm w-28 focus:outline-none focus:ring-1 focus:ring-blue-400" autoFocus placeholder="key" />
        </td>
        <td className="px-3 py-2">
          <input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} onKeyDown={handleKeyDown}
            className="border border-blue-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="표시 이름" />
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <input type="color" value={form.color || '#888888'} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
              className="w-7 h-7 rounded border border-gray-300 cursor-pointer" />
            <span style={{ background: form.color || '#888' }} className="w-4 h-4 rounded-full inline-block" />
            <input value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} onKeyDown={handleKeyDown}
              className="border border-blue-300 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="#hex" />
          </div>
        </td>
        <td className="px-3 py-2 text-xs text-gray-500">{usageCount}번</td>
        <td className="px-3 py-2" />
        <td className="px-3 py-2" />
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            {showKeyConfirm ? (
              <>
                <span className="text-[11px] text-red-600 mr-1">
                  {`${usageCount}번 이 역할로 배정되어 있습니다. key를 '${role.key}' → '${pendingKey}'로 변경합니다.`}
                </span>
                <button onClick={handleCancel} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">취소</button>
                <button
                  onClick={() => void handleSave()}
                  disabled={saveDisabled}
                  title={saveTitle}
                  className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  확인
                </button>
              </>
            ) : (
              <>
                <button onClick={handleCancel} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">취소</button>
                <button
                  onClick={() => void handleSave()}
                  disabled={saveDisabled}
                  title={saveTitle}
                  className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  저장
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className={`hover:bg-gray-50 group ${!role.is_active ? 'opacity-40' : ''}`}>
      <td className="px-3 py-2">
        <span className="text-xs font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{role.key}</span>
      </td>
      <td className="px-3 py-2 text-sm text-gray-900">{role.label}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full inline-block" style={{ background: role.color || '#888' }} />
          <span className="text-xs text-gray-500">{role.color || '-'}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-gray-500">{usageCount}번</td>
      <td className="px-3 py-2">
        <button
          onClick={() => { void onToggleActive(role.id, !role.is_active) }}
          disabled={role.is_active && isLastActive}
          title={role.is_active && isLastActive ? '최소 1개의 활성 역할이 필요합니다.' : undefined}
          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${role.is_active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}
        >
          {role.is_active ? '활성' : '비활성'}
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => { void onMove(role.id, 'up') }} disabled={isFirst}
            className="text-xs px-1 py-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed">▲</button>
          <button onClick={() => { void onMove(role.id, 'down') }} disabled={isLast}
            className="text-xs px-1 py-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed">▼</button>
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">편집</button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (usageCount > 0) return
              if (confirmDelete) { void onDelete(role.id); setConfirmDelete(false) }
              else { setConfirmDelete(true) }
            }}
            onBlur={() => setConfirmDelete(false)}
            disabled={usageCount > 0}
            title={usageCount > 0 ? '사용 중인 역할은 삭제할 수 없습니다. 먼저 배정된 멤버의 역할을 변경하세요.' : undefined}
            className={`text-xs px-2 py-0.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${confirmDelete ? 'bg-red-600 text-white border-red-600' : 'border-red-300 text-red-400 hover:bg-red-50'}`}
          >
            {confirmDelete ? '확인' : '삭제'}
          </button>
        </div>
      </td>
    </tr>
  )
}

// --- Roles Tab ---

// 공통 에러 알림: 23505(unique 위반) 분기를 포함한 일관된 처리
function notifyRoleError(action: string, error: { code?: string; message: string }) {
  console.error(`${action} 실패:`, error.message)
  if (error.code === '23505') {
    alert(`${action} 실패: 이미 존재하는 key입니다.`)
  } else {
    alert(`${action} 실패: ${error.message}`)
  }
}

function RolesTab({
  roles,
  usageMap,
  reload,
}: {
  roles: ProjectRole[]
  usageMap: Record<string, number>
  reload: () => Promise<void>
}) {
  // 중복 클릭/동시 토글 방지용 ID 집합.
  // UI(disabled) 용도로는 쓰이지 않으므로 ref로 관리해 useCallback deps를 줄이고 불필요한 재렌더 제거.
  const togglingIdsRef = useRef<Set<number>>(new Set())

  const handleSave = useCallback(async (id: number, data: Partial<ProjectRole>): Promise<boolean> => {
    const { error } = await supabase.from('project_roles').update(data).eq('id', id)
    if (error) {
      notifyRoleError('역할 저장', error)
      return false
    }
    await reload()
    return true
  }, [reload])

  const handleAdd = useCallback(async (): Promise<void> => {
    const maxSort = roles.length > 0 ? Math.max(...roles.map((r) => r.sort_order)) : 0
    // key는 유니크 제약 — 기본값이 중복되지 않도록 숫자 접미사 활용
    const base = 'role'
    const existing = new Set(roles.map((r) => r.key))
    let suffix = roles.length + 1
    let key = `${base}${suffix}`
    while (existing.has(key)) {
      suffix += 1
      key = `${base}${suffix}`
    }
    const { error } = await supabase.from('project_roles').insert({
      key,
      label: '새 역할',
      color: '#6b7280',
      sort_order: maxSort + 1,
      is_active: true,
    })
    if (error) {
      notifyRoleError('역할 추가', error)
      return
    }
    await reload()
  }, [roles, reload])

  const handleDelete = useCallback(async (id: number): Promise<void> => {
    const role = roles.find((r) => r.id === id)
    if (!role) return
    const count = usageMap[role.key] ?? 0
    if (count > 0) {
      // 가드: UI에서도 막지만 race condition 대비
      console.warn('사용 중인 역할은 삭제할 수 없습니다.')
      alert('사용 중인 역할은 삭제할 수 없습니다. 먼저 배정된 멤버의 역할을 변경하세요.')
      return
    }
    const { error } = await supabase.from('project_roles').delete().eq('id', id)
    if (error) {
      notifyRoleError('역할 삭제', error)
      return
    }
    await reload()
  }, [roles, usageMap, reload])

  const handleToggleActive = useCallback(async (id: number, active: boolean): Promise<void> => {
    // 중복 클릭/동시 토글 방지
    if (togglingIdsRef.current.has(id)) return
    const role = roles.find((r) => r.id === id)
    if (!role) return
    const activeCount = roles.filter((r) => r.is_active).length
    if (role.is_active && activeCount <= 1 && !active) {
      console.warn('최소 1개의 활성 역할이 필요합니다.')
      alert('최소 1개의 활성 역할이 필요합니다.')
      return
    }
    const count = usageMap[role.key] ?? 0
    if (role.is_active && count > 0 && !active) {
      if (!confirm(`${count}번 이 역할로 배정되어 있습니다. 기존 배정은 유지되고 신규에서만 숨겨집니다. 진행할까요?`)) {
        return
      }
    }
    togglingIdsRef.current.add(id)
    try {
      const { error } = await supabase.from('project_roles').update({ is_active: active }).eq('id', id)
      if (error) {
        notifyRoleError('역할 상태 변경', error)
        return
      }
      await reload()
    } finally {
      togglingIdsRef.current.delete(id)
    }
  }, [roles, usageMap, reload])

  const handleMove = useCallback(async (id: number, direction: 'up' | 'down'): Promise<void> => {
    // fetchRoles가 sort_order ASC 정렬을 보장 — 중복 정렬 불필요
    const sorted = roles
    const idx = sorted.findIndex((r) => r.id === id)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const current = sorted[idx]
    const swap = sorted[swapIdx]
    const [r1, r2] = await Promise.all([
      supabase.from('project_roles').update({ sort_order: swap.sort_order }).eq('id', current.id),
      supabase.from('project_roles').update({ sort_order: current.sort_order }).eq('id', swap.id),
    ])
    if (r1.error || r2.error) {
      // 한쪽만 성공하면 DB 상태가 일관 깨짐 — reload()로 실제 상태 복구
      const err = r1.error ?? r2.error
      if (err) notifyRoleError('역할 순서 변경', err)
      await reload()
      return
    }
    await reload()
  }, [roles, reload])

  const activeRoles = roles.filter((r) => r.is_active)

  return (
    <div className="p-4">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-32">Key</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Label</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-32">컬러</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16">사용</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16">상태</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16">순서</th>
            <th className="px-3 py-2 w-28" />
          </tr>
        </thead>
        <tbody>
          {roles.map((role, idx) => (
            <RoleRow
              key={role.id}
              role={role}
              isFirst={idx === 0}
              isLast={idx === roles.length - 1}
              isLastActive={role.is_active && activeRoles.length <= 1}
              usageCount={usageMap[role.key] ?? 0}
              onSave={handleSave}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
              onMove={handleMove}
            />
          ))}
        </tbody>
      </table>
      <div className="mt-3 px-3">
        <button onClick={handleAdd} className="text-sm text-blue-500 hover:text-blue-600 transition-colors">
          + 역할 추가
        </button>
      </div>
    </div>
  )
}

// --- Account Tab ---

function AccountTab() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email)
    })
  }, [])

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: '새 비밀번호는 6자 이상이어야 합니다.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '새 비밀번호가 일치하지 않습니다.' })
      return
    }

    setLoading(true)

    // 현재 비밀번호 확인
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (signInError) {
      setMessage({ type: 'error', text: '현재 비밀번호가 올바르지 않습니다.' })
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)

    if (error) {
      setMessage({ type: 'error', text: '비밀번호 변경에 실패했습니다.' })
    } else {
      setMessage({ type: 'success', text: '비밀번호가 변경되었습니다.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const isGuest = email === GUEST_EMAIL

  return (
    <div className="p-4 max-w-md">
      <p className="text-sm text-gray-500 mb-4">{email}</p>
      {isGuest ? (
        <p className="text-sm text-gray-400">데모 계정은 비밀번호를 변경할 수 없습니다.</p>
      ) : (
      <form onSubmit={handleChangePassword} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">현재 비밀번호</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 확인</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
        </div>
        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>
        )}
        <button type="submit" disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? '변경 중...' : '비밀번호 변경'}
        </button>
      </form>
      )}
    </div>
  )
}

// --- Main Component ---

interface SettingsPanelProps {
  initialBrands?: Brand[]
  initialMembers?: Member[]
  initialKeywords?: KeywordHighlight[]
}

export default function SettingsPanel({ initialBrands, initialMembers, initialKeywords }: SettingsPanelProps) {
  const hasServerData = initialBrands !== undefined && initialMembers !== undefined && initialKeywords !== undefined
  const [tab, setTab] = useState<Tab>('brands')
  const [brands, setBrands] = useState<Brand[]>(initialBrands ?? [])
  const [members, setMembers] = useState<Member[]>(initialMembers ?? [])
  const [keywords, setKeywords] = useState<KeywordHighlight[]>(initialKeywords ?? [])
  const [roles, setRoles] = useState<ProjectRole[]>([])
  const [rolesUsage, setRolesUsage] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(!hasServerData)

  // --- Data Loading ---

  const loadBrands = useCallback(async () => {
    const { data, error } = await supabase
      .from('brands')
      .select('id, code, name, color, sort_order, drive_root')
      .order('sort_order', { ascending: true })
    if (error) { console.error('브랜드 조회 실패:', error.message); return }
    if (data) setBrands(data)
  }, [])

  const loadMembers = useCallback(async () => {
    const { data, error } = await supabase
      .from('members')
      .select('id, name, name_short, role, email, active')
      .order('active', { ascending: false })
      .order('name_short', { ascending: true })
    if (error) { console.error('멤버 조회 실패:', error.message); return }
    if (data) setMembers(data)
  }, [])

  const loadKeywords = useCallback(async () => {
    const { data, error } = await supabase
      .from('keyword_highlights')
      .select('id, keyword, color, is_regex, show_header_dot, sort_order')
      .order('sort_order', { ascending: true })
    if (error) { console.error('키워드 조회 실패:', error.message); return }
    if (data) setKeywords(data)
  }, [])

  // 설정 UI는 비활성 역할 포함 전체 목록 + project_members 사용량 집계가 필요함.
  // RolesProvider(useRoles)는 activeOnly=true + 사용량 없음이라 여기선 재사용 불가.
  // 비용: 부모 loadRoles 1회 + Realtime 이벤트 시 Provider가 별도로 재fetch (중복 허용).
  // TODO: (다른 PR) alert/confirm 블로킹 UI를 인라인 전환 (showKeyConfirm 패턴 확장)
  // TODO: (다른 PR) project_members 전체 스캔 → get_role_usage_counts RPC 전환
  const loadRoles = useCallback(async () => {
    // 각 응답을 독립적으로 처리하되, 한쪽 실패 시 양쪽 setState 스킵하여
    // roles-rolesUsage 간 일관성을 유지한다.
    const [rolesRes, usageRes] = await Promise.allSettled([
      fetchRoles(undefined, false),
      supabase.from('project_members').select('role'),
    ])
    if (rolesRes.status === 'rejected') {
      const reason = rolesRes.reason instanceof Error ? rolesRes.reason.message : String(rolesRes.reason)
      console.error('역할 조회 실패:', reason)
      return
    }
    if (usageRes.status === 'rejected') {
      const reason = usageRes.reason instanceof Error ? usageRes.reason.message : String(usageRes.reason)
      console.error('역할 사용량 조회 실패:', reason)
      return
    }
    if (usageRes.value.error) {
      console.error('역할 사용량 조회 실패:', usageRes.value.error.message)
      return
    }
    const map: Record<string, number> = {}
    for (const row of usageRes.value.data ?? []) {
      const key = row.role
      if (!key) continue
      map[key] = (map[key] ?? 0) + 1
    }
    setRoles(rolesRes.value)
    setRolesUsage(map)
  }, [])

  useEffect(() => {
    async function load() {
      if (hasServerData) {
        // SSR로 brand/member/keyword는 주입되었지만 roles는 클라이언트에서만 로드
        await loadRoles()
        return
      }
      setLoading(true)
      await Promise.all([loadBrands(), loadMembers(), loadKeywords(), loadRoles()])
      setLoading(false)
    }
    load()
  }, [hasServerData, loadBrands, loadMembers, loadKeywords, loadRoles])

  // --- Brand CRUD ---

  const handleBrandSave = useCallback(async (id: number, data: Partial<Brand>) => {
    const { error } = await supabase.from('brands').update(data).eq('id', id)
    if (error) { console.error('브랜드 저장 실패:', error.message); return }
    await loadBrands()
  }, [loadBrands])

  const handleBrandDelete = useCallback(async (id: number) => {
    const { error } = await supabase.from('brands').delete().eq('id', id)
    if (error) { console.error('브랜드 삭제 실패:', error.message); return }
    await loadBrands()
  }, [loadBrands])

  const handleBrandAdd = useCallback(async () => {
    const maxSort = brands.length > 0 ? Math.max(...brands.map((b) => b.sort_order)) : 0
    const { error } = await supabase.from('brands').insert({ code: 'NEW', name: `새 ${BRAND_LABEL}`, sort_order: maxSort + 1 })
    if (error) { console.error('브랜드 추가 실패:', error.message); return }
    await loadBrands()
  }, [brands, loadBrands])

  const handleBrandMove = useCallback(async (id: number, direction: 'up' | 'down') => {
    const idx = brands.findIndex((b) => b.id === id)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= brands.length) return

    const current = brands[idx]
    const swap = brands[swapIdx]

    const [r1, r2] = await Promise.all([
      supabase.from('brands').update({ sort_order: swap.sort_order }).eq('id', current.id),
      supabase.from('brands').update({ sort_order: current.sort_order }).eq('id', swap.id),
    ])
    if (r1.error || r2.error) {
      console.error('순서 변경 실패:', r1.error?.message ?? r2.error?.message)
      return
    }
    await loadBrands()
  }, [brands, loadBrands])

  // --- Member CRUD ---

  const handleMemberSave = useCallback(async (id: number, data: Partial<Member>) => {
    const { error } = await supabase.from('members').update(data).eq('id', id)
    if (error) { console.error('멤버 저장 실패:', error.message); return }
    await loadMembers()
  }, [loadMembers])

  const handleMemberToggleActive = useCallback(async (id: number, active: boolean) => {
    const { error } = await supabase.from('members').update({ active }).eq('id', id)
    if (error) { console.error('멤버 상태 변경 실패:', error.message); return }
    await loadMembers()
  }, [loadMembers])

  const handleMemberAdd = useCallback(async () => {
    const { error } = await supabase.from('members').insert({ name: '새 멤버', name_short: `멤버${members.length + 1}` })
    if (error) { console.error('멤버 추가 실패:', error.message); return }
    await loadMembers()
  }, [members, loadMembers])

  // --- Keyword CRUD ---

  const handleKeywordSave = useCallback(async (id: number, data: Partial<KeywordHighlight>) => {
    const { error } = await supabase.from('keyword_highlights').update(data).eq('id', id)
    if (error) { console.error('키워드 저장 실패:', error.message); return }
    await loadKeywords()
  }, [loadKeywords])

  const handleKeywordDelete = useCallback(async (id: number) => {
    const { error } = await supabase.from('keyword_highlights').delete().eq('id', id)
    if (error) { console.error('키워드 삭제 실패:', error.message); return }
    await loadKeywords()
  }, [loadKeywords])

  const handleKeywordAdd = useCallback(async () => {
    const maxSort = keywords.length > 0 ? Math.max(...keywords.map((k) => k.sort_order)) : 0
    const { error } = await supabase.from('keyword_highlights').insert({ keyword: '새 키워드', color: '#6b7280', sort_order: maxSort + 1 })
    if (error) { console.error('키워드 추가 실패:', error.message); return }
    await loadKeywords()
  }, [keywords, loadKeywords])

  if (loading) {
    return <div className="flex items-center justify-center flex-1 text-gray-500">데이터를 불러오는 중...</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* 탭 헤더 */}
      <div className="flex items-center border-b border-gray-200 bg-white px-4">
        {(['brands', 'members', 'roles', 'keywords', 'account'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'brands' ? `${BRAND_LABEL} (${brands.length})` : t === 'members' ? `멤버 (${members.length})` : t === 'roles' ? `역할 (${roles.length})` : t === 'keywords' ? `키워드 (${keywords.length})` : '계정'}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      <div className="flex-1 overflow-y-auto bg-white">
        {tab === 'account' ? (
          <AccountTab />
        ) : tab === 'roles' ? (
          <RolesTab roles={roles} usageMap={rolesUsage} reload={loadRoles} />
        ) : tab === 'brands' ? (
          <div className="p-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-24">코드</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">이름</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-32">컬러</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Drive 폴더</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16">순서</th>
                  <th className="px-3 py-2 w-28" />
                </tr>
              </thead>
              <tbody>
                {brands.map((brand, idx) => (
                  <BrandRow
                    key={brand.id}
                    brand={brand}
                    isFirst={idx === 0}
                    isLast={idx === brands.length - 1}
                    onSave={handleBrandSave}
                    onDelete={handleBrandDelete}
                    onMove={handleBrandMove}
                  />
                ))}
              </tbody>
            </table>
            <div className="mt-3 px-3">
              <button onClick={handleBrandAdd} className="text-sm text-blue-500 hover:text-blue-600 transition-colors">
                + {BRAND_LABEL} 추가
              </button>
            </div>
          </div>
        ) : tab === 'members' ? (
          <div className="p-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-20">단축명</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">이름</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">역할</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">이메일</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16">상태</th>
                  <th className="px-3 py-2 w-20" />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    onSave={handleMemberSave}
                    onToggleActive={handleMemberToggleActive}
                  />
                ))}
              </tbody>
            </table>
            <div className="mt-3 px-3">
              <button onClick={handleMemberAdd} className="text-sm text-blue-500 hover:text-blue-600 transition-colors">
                + 멤버 추가
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">키워드</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-32">컬러</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-20">타입</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-20">헤더 dot</th>
                  <th className="px-3 py-2 w-28" />
                </tr>
              </thead>
              <tbody>
                {keywords.map((kw) => (
                  <KeywordRow
                    key={kw.id}
                    keyword={kw}
                    onSave={handleKeywordSave}
                    onDelete={handleKeywordDelete}
                  />
                ))}
              </tbody>
            </table>
            <div className="mt-3 px-3">
              <button onClick={handleKeywordAdd} className="text-sm text-blue-500 hover:text-blue-600 transition-colors">
                + 키워드 추가
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
