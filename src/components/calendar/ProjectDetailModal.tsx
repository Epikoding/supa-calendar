'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { STATUS_OPTIONS, type ProjectStatus } from '@/lib/constants/project'
import { MODAL_OVERLAY_STYLE, MODAL_CONTAINER_STYLE } from '@/lib/styles/toolbar'
import { primaryGradient, primaryAlpha, hexToRgba } from '@/lib/colors'
import { BRAND_LABEL } from '@/lib/config'
import { useRoles } from '@/hooks/useRoles'
import type { ProjectRole } from '@/lib/types/role'
import type { ProjectFormPayload } from '@/lib/types/project'
import SlackLinksSection from './SlackLinksSection'

interface ProjectFormValues {
  name: string
  brandId: number | null
  parentId: number | null
  status: ProjectStatus
  drivePath: string
  dateStart: string
  dateEnd: string
}

interface ProjectInfo {
  projectId: number
  name: string
  brandId: number
  parentId: number | null
  status: ProjectStatus
  drivePath: string | null
  dateStart: string | null
  dateEnd: string | null
  roleMembers: Record<string, { memberId: number; nameShort: string }[]>
}

interface TreeOption {
  id: number
  name: string
  depth: number
  prefix: string
}

type ModalView = 'edit' | 'links'

interface ProjectDetailModalProps {
  isOpen: boolean
  onClose: () => void
  project: ProjectInfo | null // null = 새 프로젝트 생성
  brands: { id: number; code: string; name: string; color: string | null }[]
  members: { id: number; nameShort: string }[]
  defaultBrandId?: number | null
  defaultParentId?: number | null
  defaultDateStart?: string | null
  initialView?: ModalView  // 'links'이면 슬랙 링크 뷰로 열기
  onSave: (projectId: number, data: ProjectFormPayload) => void
  onDelete: (projectId: number) => void
  onCreate: (data: ProjectFormPayload) => void
}

const EMPTY_FORM: ProjectFormValues = {
  name: '',
  brandId: null,
  parentId: null,
  status: '진행중',
  drivePath: '',
  dateStart: '',
  dateEnd: '',
}

/** Flat project list → tree-ordered options with prefix strings (self + descendants excluded) */
function buildTreeOptions(
  projects: { id: number; name: string; parent_id: number | null }[],
  excludeId: number | null,
): TreeOption[] {
  const childrenMap = new Map<number | null, typeof projects>()
  for (const p of projects) {
    const arr = childrenMap.get(p.parent_id) || []
    arr.push(p)
    childrenMap.set(p.parent_id, arr)
  }

  // Collect self + all descendants to exclude (prevents circular reference)
  const excludeIds = new Set<number>()
  if (excludeId !== null) {
    excludeIds.add(excludeId)
    const collect = (pid: number) => {
      for (const c of childrenMap.get(pid) || []) {
        excludeIds.add(c.id)
        collect(c.id)
      }
    }
    collect(excludeId)
  }

  const result: TreeOption[] = []
  const walk = (parentId: number | null, depth: number, ancestorIsLast: boolean[]) => {
    const children = (childrenMap.get(parentId) || [])
      .filter((c) => !excludeIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    for (let i = 0; i < children.length; i++) {
      const isLast = i === children.length - 1
      let prefix = ''
      if (depth > 0) {
        for (let d = 0; d < depth - 1; d++) {
          prefix += ancestorIsLast[d] ? '   ' : '│  '
        }
        prefix += isLast ? '└─ ' : '├─ '
      }
      result.push({ id: children[i].id, name: children[i].name, depth, prefix })
      walk(children[i].id, depth + 1, [...ancestorIsLast, isLast])
    }
  }
  walk(null, 0, [])
  return result
}

/** Get ancestor chain names for breadcrumb */
function getAncestorPath(
  projectId: number,
  projects: { id: number; name: string; parent_id: number | null }[],
): string[] {
  const map = new Map(projects.map((p) => [p.id, p]))
  const path: string[] = []
  let cur = map.get(projectId)
  while (cur) {
    path.unshift(cur.name)
    cur = cur.parent_id !== null ? map.get(cur.parent_id) : undefined
  }
  return path
}

function DateInputWithPicker({
  label,
  value,
  onChange,
  onPickerChange,
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPickerChange: (value: string) => void
}) {
  const pickerRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      <div className="flex gap-1">
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder="YYYY-MM-DD"
          maxLength={10}
          className="rounded-[10px] px-3 py-2 text-sm w-full text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
              style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
        />
        <input
          ref={pickerRef}
          type="date"
          value={value}
          onChange={(e) => onPickerChange(e.target.value)}
          className="sr-only"
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => pickerRef.current?.showPicker()}
          className="flex items-center px-2 py-2 rounded-[10px] text-gray-500 hover:text-blue-700 transition-colors shrink-0"
          style={{ border: '1px solid rgba(0,0,0,0.05)' }}
          title={`${label} 선택`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="12" height="12" rx="1.5" />
            <path d="M2 6.5h12" />
            <path d="M5.5 1.5v3M10.5 1.5v3" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function RoleMemberSelector({
  role,
  members,
  selected,
  onToggle,
}: {
  role: ProjectRole
  members: { id: number; nameShort: string }[]
  selected: number[]
  onToggle: (memberId: number) => void
}) {
  const activeBg = role.color ? hexToRgba(role.color, 0.85) : primaryGradient
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 flex items-center">
        <span
          className="inline-block w-2 h-2 rounded-full mr-1.5"
          style={{ background: role.color ?? '#9ca3af' }}
        />
        {role.label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => {
          const active = selected.includes(m.id)
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggle(m.id)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? 'text-white border-transparent'
                  : 'text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
              style={active ? { background: activeBg } : { background: 'rgba(255,255,255,0.65)' }}
            >
              {m.nameShort}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function ProjectDetailModal({
  isOpen,
  onClose,
  project,
  brands,
  members,
  defaultBrandId,
  defaultParentId,
  defaultDateStart,
  initialView = 'edit',
  onSave,
  onDelete,
  onCreate,
}: ProjectDetailModalProps) {
  const { roles } = useRoles()
  const rolesRef = useRef(roles)
  useEffect(() => {
    rolesRef.current = roles
  }, [roles])
  const [view, setView] = useState<ModalView>(initialView)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState<ProjectFormValues>(EMPTY_FORM)
  const [membersByRole, setMembersByRole] = useState<Record<string, number[]>>({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [projectTree, setProjectTree] = useState<{ id: number; name: string; parent_id: number | null }[]>([])
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false)
  const [parentSearch, setParentSearch] = useState('')
  const parentSearchRef = useRef<HTMLInputElement>(null)
  const parentDropdownRef = useRef<HTMLDivElement>(null)

  // View: 모달 open/close 시에만 뷰 전환 (project 변경으로 리셋 방지)
  useEffect(() => {
    if (isOpen) {
      setView(initialView)
    } else {
      setShowDeleteConfirm(false)
      setParentDropdownOpen(false)
      setParentSearch('')
      setDuplicateError(null)
      setCopied(false)
    }
  }, [isOpen, initialView])

  // Form: project/defaults 변경 시 폼 초기화
  // roles는 rolesRef로 읽어 deps에서 제외 — 사용자가 멤버 토글 중
  // roles Realtime 변경으로 입력이 덮어써지는 것을 방지.
  useEffect(() => {
    if (!isOpen) return
    const init: Record<string, number[]> = {}
    for (const role of rolesRef.current) init[role.key] = []
    if (project) {
      setForm({
        name: project.name,
        brandId: project.brandId,
        parentId: project.parentId,
        status: project.status,
        drivePath: project.drivePath ?? '',
        dateStart: project.dateStart ?? '',
        dateEnd: project.dateEnd ?? '',
      })
      for (const [roleKey, roleMemberList] of Object.entries(project.roleMembers ?? {})) {
        init[roleKey] = roleMemberList.map((m) => m.memberId)
      }
      setMembersByRole(init)
    } else {
      setForm({
        ...EMPTY_FORM,
        brandId: defaultBrandId ?? null,
        parentId: defaultParentId ?? null,
        dateStart: defaultDateStart ?? '',
      })
      setMembersByRole(init)
    }
  }, [isOpen, project, defaultBrandId, defaultParentId, defaultDateStart])

  // roles가 모달 open 이후 나중에 로드/추가되면 기존 key는 유지하고 미존재 key만 보완
  useEffect(() => {
    if (!isOpen || roles.length === 0) return
    setMembersByRole((prev) => {
      let changed = false
      const next = { ...prev }
      for (const role of roles) {
        if (!(role.key in next)) {
          next[role.key] = []
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [isOpen, roles])

  // Fetch project tree on brand change
  useEffect(() => {
    if (!isOpen || !form.brandId) {
      setProjectTree([])
      return
    }
    supabase
      .from('projects')
      .select('id, name, parent_id')
      .eq('brand_id', form.brandId)
      .then(({ data }) => setProjectTree(data ?? []))
  }, [isOpen, form.brandId])

  // Close parent dropdown on outside click
  useEffect(() => {
    if (!parentDropdownOpen) {
      setParentSearch('')
      return
    }
    setTimeout(() => parentSearchRef.current?.focus(), 0)
    const handler = (e: MouseEvent) => {
      if (parentDropdownRef.current && !parentDropdownRef.current.contains(e.target as Node)) {
        setParentDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [parentDropdownOpen])

  const handleChange = useCallback(
    (field: keyof ProjectFormValues) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.value
        setForm((prev) => {
          const updated = {
            ...prev,
            [field]:
              field === 'brandId' || field === 'parentId'
                ? value === '' ? null : Number(value)
                : value,
          }
          if (field === 'brandId') updated.parentId = null
          return updated
        })
        if (field === 'brandId') setParentDropdownOpen(false)
        if (field === 'name' || field === 'parentId' || field === 'brandId') setDuplicateError(null)
      },
    []
  )

  const handleDateChange = useCallback(
    (field: 'dateStart' | 'dateEnd') =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 8)
        let v = digits
        if (digits.length > 4) {
          let mm = digits.slice(4, 6)
          if (mm.length === 2) {
            const n = parseInt(mm, 10)
            if (n < 1) mm = '01'
            else if (n > 12) mm = '12'
          }
          v = digits.slice(0, 4) + '-' + mm
          if (digits.length > 6) {
            let dd = digits.slice(6)
            if (dd.length === 2) {
              const n = parseInt(dd, 10)
              if (n < 1) dd = '01'
              else if (n > 31) dd = '31'
            }
            v += '-' + dd
          }
        }
        setForm((prev) => ({ ...prev, [field]: v }))
      },
    []
  )

  const toggleMember = useCallback(
    (memberId: number, roleKey: string) => {
      setMembersByRole((prev) => {
        const current = prev[roleKey] ?? []
        const next = current.includes(memberId)
          ? current.filter((id) => id !== memberId)
          : [...current, memberId]
        return { ...prev, [roleKey]: next }
      })
    },
    []
  )

  const handleSubmit = useCallback(() => {
    const trimmedName = form.name.trim()
    if (!trimmedName) return
    if (!form.brandId) return

    // 같은 브랜드 + 같은 부모 아래 중복 이름 체크
    const duplicate = projectTree.find(
      (p) =>
        p.name.trim() === trimmedName &&
        p.parent_id === form.parentId &&
        (!project || p.id !== project.projectId)
    )
    if (duplicate) {
      setDuplicateError('같은 위치에 동일한 이름의 프로젝트가 이미 존재합니다.')
      return
    }
    setDuplicateError(null)

    const payload = { ...form, name: trimmedName, membersByRole }
    if (project) {
      onSave(project.projectId, payload)
    } else {
      onCreate(payload)
    }
  }, [form, membersByRole, project, projectTree, onSave, onCreate])

  const handleDelete = useCallback(() => {
    if (!project) return
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true)
      return
    }
    onDelete(project.projectId)
  }, [project, showDeleteConfirm, onDelete])

  const selectParent = useCallback((parentId: number | null) => {
    setForm((prev) => ({ ...prev, parentId }))
    setParentDropdownOpen(false)
    setDuplicateError(null)
  }, [])

  // Tree options (exclude self + descendants)
  const treeOptions = useMemo(
    () => buildTreeOptions(projectTree, project?.projectId ?? null),
    [projectTree, project?.projectId],
  )

  const filteredTreeOptions = useMemo(() => {
    if (!parentSearch.trim()) return treeOptions
    const q = parentSearch.trim().toLowerCase()
    return treeOptions.filter((opt) => opt.name.toLowerCase().includes(q))
  }, [treeOptions, parentSearch])

  // Breadcrumb path for current project
  const breadcrumb = useMemo(() => {
    if (!project || projectTree.length === 0) return null
    const brand = brands.find((b) => b.id === project.brandId)
    const path = getAncestorPath(project.projectId, projectTree)
    return brand ? [`[${brand.code}]`, ...path] : path
  }, [project, projectTree, brands])

  // Selected parent display name
  const selectedParentName = useMemo(() => {
    if (!form.parentId) return null
    return projectTree.find((p) => p.id === form.parentId)?.name ?? null
  }, [form.parentId, projectTree])

  if (!isOpen) return null

  const isEdit = !!project

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={MODAL_OVERLAY_STYLE}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="rounded-[20px] w-[520px] max-h-[85vh] flex flex-col" style={MODAL_CONTAINER_STYLE}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/[0.04]">
          <div className="flex items-center gap-1">
            {isEdit ? (
              <>
                <button
                  type="button"
                  onClick={() => setView('edit')}
                  className={`text-sm px-2 py-0.5 rounded transition-colors ${view === 'edit' ? 'font-semibold text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  프로젝트 편집
                </button>
                <span className="text-gray-300 text-xs">|</span>
                <button
                  type="button"
                  onClick={() => setView('links')}
                  className={`text-sm px-2 py-0.5 rounded transition-colors ${view === 'links' ? 'font-semibold text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  💬 슬랙 링크
                </button>
                {view === 'links' && project && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/projects?slackLinks=${project.projectId}`
                      navigator.clipboard.writeText(url)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="text-[11px] px-1.5 py-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors ml-1"
                    title="링크 복사"
                  >
                    {copied ? '✓ 복사됨' : '🔗'}
                  </button>
                )}
              </>
            ) : (
              <h2 className="text-sm font-semibold text-gray-900">새 프로젝트</h2>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="닫기"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Body */}
        {view === 'links' && project ? (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <SlackLinksSection projectId={project.projectId} expandText key="slack-links" />
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* 프로젝트명 */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">프로젝트명 *</label>
            <input
              type="text"
              value={form.name}
              onChange={handleChange('name')}
              placeholder="프로젝트명을 입력하세요"
              className="rounded-[10px] px-3 py-2 text-sm w-full text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
              style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
            />
          </div>

          {/* 브랜드 + 상태 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{BRAND_LABEL} *</label>
              <select
                value={form.brandId?.toString() ?? ''}
                onChange={handleChange('brandId')}
                className="rounded-[10px] px-3 py-2 text-sm w-full text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
                style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
              >
                <option value="">선택</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id.toString()}>
                    {b.code} - {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">상태</label>
              <select
                value={form.status}
                onChange={handleChange('status')}
                className="rounded-[10px] px-3 py-2 text-sm w-full text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
                style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 상위 프로젝트 */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">상위 프로젝트</label>
            {breadcrumb && breadcrumb.length > 1 && (
              <div className="text-[11px] text-gray-400 mb-1.5 truncate">
                {breadcrumb.join(' › ')}
              </div>
            )}
            <div ref={parentDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => form.brandId && setParentDropdownOpen(!parentDropdownOpen)}
                className={`rounded-[10px] px-3 py-2 text-sm w-full text-left flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500 ${form.brandId ? 'text-gray-900' : 'text-gray-400 cursor-not-allowed'}`}
                style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
              >
                <span className={selectedParentName ? 'text-gray-900' : 'text-gray-400'}>
                  {selectedParentName ?? '없음 (최상위)'}
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 shrink-0 ml-2">
                  <path d={parentDropdownOpen ? 'M3 7.5l3-3 3 3' : 'M3 4.5l3 3 3-3'} />
                </svg>
              </button>
              {parentDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-[14px] flex flex-col max-h-64" style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
                  <div className="px-2 py-1.5 border-b border-gray-100 shrink-0">
                    <input
                      ref={parentSearchRef}
                      type="text"
                      value={parentSearch}
                      onChange={(e) => setParentSearch(e.target.value)}
                      placeholder="프로젝트명 검색..."
                      className="w-full px-2 py-1.5 text-sm rounded-[8px] focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
                      style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
                    />
                  </div>
                  <div className="overflow-y-auto py-1">
                    {!parentSearch.trim() && (
                      <div
                        onClick={() => selectParent(null)}
                        className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${form.parentId === null ? 'bg-blue-50 text-blue-800 font-medium' : 'text-gray-700'}`}
                      >
                        없음 (최상위)
                      </div>
                    )}
                    {filteredTreeOptions.map((opt) => {
                      const isOriginalParent = isEdit && opt.id === project!.parentId
                      const isSelected = opt.id === form.parentId
                      return (
                        <div
                          key={opt.id}
                          onClick={() => selectParent(opt.id)}
                          className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50 transition-colors flex items-center ${isSelected ? 'bg-blue-50 text-blue-800 font-medium' : 'text-gray-700'}`}
                        >
                          {!parentSearch.trim() && opt.prefix && (
                            <span className="font-mono text-gray-300 whitespace-pre text-xs">{opt.prefix}</span>
                          )}
                          <span className="truncate">{opt.name}</span>
                          {isOriginalParent && !isSelected && (
                            <span className="text-[10px] text-gray-400 ml-auto shrink-0 pl-2">현재 상위</span>
                          )}
                        </div>
                      )
                    })}
                    {filteredTreeOptions.length === 0 && (
                      <div className="px-3 py-1.5 text-xs text-gray-400">
                        {parentSearch.trim() ? '검색 결과 없음' : '선택 가능한 프로젝트 없음'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 기간 */}
          <div className="grid grid-cols-2 gap-3">
            <DateInputWithPicker
              label="시작일"
              value={form.dateStart}
              onChange={handleDateChange('dateStart')}
              onPickerChange={(v) => setForm((prev) => ({ ...prev, dateStart: v }))}
            />
            <DateInputWithPicker
              label="종료일"
              value={form.dateEnd}
              onChange={handleDateChange('dateEnd')}
              onPickerChange={(v) => setForm((prev) => ({ ...prev, dateEnd: v }))}
            />
          </div>

          {/* 드라이브 경로 */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">드라이브 경로</label>
            <p className="text-[11px] text-gray-400 mb-1.5">
              Google Drive 폴더 URL에서 <span className="font-mono text-gray-500">drive/folders/</span> 뒤의 값을 입력하세요
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.drivePath}
                onChange={handleChange('drivePath')}
                placeholder="예: 1sr53zhFEsW-yCUxeOV8vleSAAsH1HDWt"
                className="rounded-[10px] px-3 py-2 text-sm w-full text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
              style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
              />
              {form.drivePath && (
                <a
                  href={form.drivePath.startsWith('http') ? form.drivePath : `https://drive.google.com/drive/folders/${form.drivePath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center px-2.5 py-2 rounded-[10px] text-gray-500 hover:text-blue-700 transition-colors shrink-0"
                  style={{ border: '1px solid rgba(0,0,0,0.05)' }}
                  title="드라이브 열기"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 8.5V12.5C12 13.0523 11.5523 13.5 11 13.5H3.5C2.94772 13.5 2.5 13.0523 2.5 12.5V5C2.5 4.44772 2.94772 4 3.5 4H7.5" />
                    <path d="M10 2.5H13.5V6" />
                    <path d="M7 9L13.5 2.5" />
                  </svg>
                </a>
              )}
            </div>
          </div>

          {/* 슬랙 링크 — 요약 (edit 뷰, 최대 5개) */}
          <SlackLinksSection
            projectId={project?.projectId ?? null}
            maxItems={5}
            onOverflowClick={() => setView('links')}
                     />

          {/* 담당자: 역할별 (동적) */}
          {roles.map((role) => (
            <RoleMemberSelector
              key={role.key}
              role={role}
              members={members}
              selected={membersByRole[role.key] ?? []}
              onToggle={(memberId) => toggleMember(memberId, role.key)}
            />
          ))}
        </div>
        )}

        {/* Footer — edit 뷰에서만 표시 */}
        {view === 'edit' && (
          <>
            {duplicateError && (
              <div className="px-5 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">
                {duplicateError}
              </div>
            )}
            <div className="flex items-center justify-between px-5 py-3 border-t border-black/[0.04]">
              <div>
                {isEdit && (
                  <button
                    onClick={handleDelete}
                    className={`px-3 py-1.5 text-xs rounded-[10px] transition-colors ${
                      showDeleteConfirm
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'text-red-500 border border-red-300 hover:bg-red-50'
                    }`}
                  >
                    {showDeleteConfirm ? '정말 삭제 (하위 프로젝트+일정 포함)' : '삭제'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 text-sm text-gray-600 rounded-[10px] hover:bg-gray-50 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.05)' }}
                >
                  취소
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!form.name.trim() || !form.brandId}
                  className="px-4 py-1.5 text-sm text-white rounded-[10px] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  style={!form.name.trim() || !form.brandId ? undefined : { background: primaryGradient, boxShadow: `0 4px 12px ${primaryAlpha(0.25)}` }}
                >
                  {isEdit ? '저장' : '생성'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
