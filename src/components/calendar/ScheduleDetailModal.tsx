'use client'

import { useState, useCallback, useEffect } from 'react'
import type { ScheduleCell } from '@/lib/types/calendar'
import { MODAL_OVERLAY_STYLE, MODAL_CONTAINER_STYLE } from '@/lib/styles/toolbar'
import { primaryGradient, primaryAlpha } from '@/lib/colors'

interface ScheduleDetailModalProps {
  isOpen: boolean
  onClose: () => void
  schedules: ScheduleCell[]
  projectName: string
  date: string // 'YYYY-MM-DD'
  onSave: (
    scheduleId: number,
    data: { time: string; content: string; contentInternal: string; note: string; dateUncertain: boolean; assigneeIds: number[] }
  ) => void
  onDelete: (scheduleId: number) => void
  onCreate: (data: {
    time: string
    content: string
    contentInternal: string
    note: string
    dateUncertain: boolean
    assigneeIds: number[]
  }) => void
  allMembers: { id: number; nameShort: string }[]
  defaultAssigneeIds?: number[]
}

interface ScheduleFormValues {
  time: string
  content: string
  contentInternal: string
  note: string
}

const EMPTY_FORM: ScheduleFormValues = {
  time: '',
  content: '',
  contentInternal: '',
  note: '',
}

function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return digits.slice(0, 2) + ':' + digits.slice(2)
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const month = d.getMonth() + 1
  const day = d.getDate()
  const dayName = DAY_NAMES[d.getDay()]
  return `${month}월 ${day}일 (${dayName})`
}

function ScheduleEditItem({
  schedule,
  onSave,
  onDelete,
  allMembers,
}: {
  schedule: ScheduleCell
  onSave: ScheduleDetailModalProps['onSave']
  onDelete: ScheduleDetailModalProps['onDelete']
  allMembers: ScheduleDetailModalProps['allMembers']
}) {
  const [form, setForm] = useState<ScheduleFormValues>({
    time: schedule.time ?? '',
    content: schedule.content ?? '',
    contentInternal: schedule.contentInternal ?? '',
    note: schedule.note ?? '',
  })
  const [dateUncertain, setDateUncertain] = useState(schedule.dateUncertain)
  const [assigneeIds, setAssigneeIds] = useState<number[]>(
    () => schedule.assignees.map((a) => a.memberId)
  )

  const handleChange = useCallback(
    (field: keyof ScheduleFormValues) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }))
      },
    []
  )

  const toggleAssignee = useCallback((memberId: number) => {
    setAssigneeIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    )
  }, [])

  return (
    <div className="rounded-xl p-3 space-y-2.5" style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(0,0,0,0.03)' }}>
      <div className="flex gap-3">
        <div className="w-[72px] flex-shrink-0">
          <label className="text-xs text-gray-400 mb-1 block">시각</label>
          <input
            type="text"
            value={form.time}
            onChange={(e) => setForm((prev) => ({ ...prev, time: formatTimeInput(e.target.value) }))}
            placeholder="HH:MM"
            maxLength={5}
            className="rounded-[10px] px-2 py-2 text-sm w-full text-center focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
            style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-400 mb-1 block">일정 내용</label>
          <input
            type="text"
            value={form.content}
            onChange={handleChange('content')}
            className="rounded-[10px] px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
            style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">내부 메모</label>
        <input
          type="text"
          value={form.contentInternal}
          onChange={handleChange('contentInternal')}
          className="rounded-[10px] px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
          style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
        />
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">비고</label>
        <input
          type="text"
          value={form.note}
          onChange={handleChange('note')}
          className="rounded-[10px] px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
          style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">담당자</label>
        <div className="flex flex-wrap gap-1">
          {allMembers.map((m) => {
            const active = assigneeIds.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleAssignee(m.id)}
                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-gray-400'
                }`}
                style={active
                  ? { background: primaryGradient }
                  : { background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.04)' }
                }
              >
                {m.nameShort}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dateUncertain}
            onChange={(e) => setDateUncertain(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
          />
          <span className="text-xs text-gray-400">날짜 미확정</span>
        </label>
        <div className="flex-1" />
        <button
          onClick={() => onSave(schedule.id, { ...form, dateUncertain, assigneeIds })}
          className="px-3 py-1.5 text-white text-xs rounded-[10px] transition-colors"
          style={{ background: primaryGradient, boxShadow: `0 2px 6px ${primaryAlpha(0.2)}` }}
        >
          저장
        </button>
        <button
          onClick={() => onDelete(schedule.id)}
          className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-[10px] hover:bg-red-600 transition-colors"
        >
          삭제
        </button>
      </div>
    </div>
  )
}

function NewScheduleForm({
  onCreate,
  onCancel,
  allMembers,
  defaultAssigneeIds,
}: {
  onCreate: ScheduleDetailModalProps['onCreate']
  onCancel: () => void
  allMembers: ScheduleDetailModalProps['allMembers']
  defaultAssigneeIds?: number[]
}) {
  const [form, setForm] = useState<ScheduleFormValues>(EMPTY_FORM)
  const [dateUncertain, setDateUncertain] = useState(false)
  const [assigneeIds, setAssigneeIds] = useState<number[]>(defaultAssigneeIds ?? [])

  const handleChange = useCallback(
    (field: keyof ScheduleFormValues) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }))
      },
    []
  )

  const toggleAssignee = useCallback((memberId: number) => {
    setAssigneeIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    )
  }, [])

  const handleSubmit = useCallback(() => {
    onCreate({ ...form, dateUncertain, assigneeIds })
    setForm(EMPTY_FORM)
    setDateUncertain(false)
    setAssigneeIds([])
  }, [form, dateUncertain, assigneeIds, onCreate])

  return (
    <div className="rounded-xl p-3 space-y-2.5" style={{ background: 'rgba(255,255,255,0.3)', border: '1px dashed rgba(0,0,0,0.06)' }}>
      <div className="text-xs font-medium text-blue-700 mb-1">
        새 일정 추가
      </div>
      <div className="flex gap-3">
        <div className="w-[72px] flex-shrink-0">
          <label className="text-xs text-gray-400 mb-1 block">시각</label>
          <input
            type="text"
            value={form.time}
            onChange={(e) => setForm((prev) => ({ ...prev, time: formatTimeInput(e.target.value) }))}
            placeholder="HH:MM"
            maxLength={5}
            className="rounded-[10px] px-2 py-2 text-sm w-full text-center focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
            style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-400 mb-1 block">일정 내용</label>
          <input
            type="text"
            value={form.content}
            onChange={handleChange('content')}
            placeholder="일정 내용을 입력하세요"
            className="rounded-[10px] px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
            style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">내부 메모</label>
        <input
          type="text"
          value={form.contentInternal}
          onChange={handleChange('contentInternal')}
          className="rounded-[10px] px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
          style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
        />
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">비고</label>
        <input
          type="text"
          value={form.note}
          onChange={handleChange('note')}
          className="rounded-[10px] px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-500"
          style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,0,0,0.05)' }}
        />
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">담당자</label>
        <div className="flex flex-wrap gap-1">
          {allMembers.map((m) => {
            const active = assigneeIds.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleAssignee(m.id)}
                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-gray-400'
                }`}
                style={active
                  ? { background: primaryGradient }
                  : { background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.04)' }
                }
              >
                {m.nameShort}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dateUncertain}
            onChange={(e) => setDateUncertain(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
          />
          <span className="text-xs text-gray-400">날짜 미확정</span>
        </label>
        <div className="flex-1" />
        <button
          onClick={handleSubmit}
          className="px-3 py-1.5 text-white text-xs rounded-[10px] transition-colors"
          style={{ background: primaryGradient, boxShadow: `0 2px 6px ${primaryAlpha(0.2)}` }}
        >
          추가
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-gray-600 text-xs rounded-[10px] transition-colors"
          style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.04)' }}
        >
          취소
        </button>
      </div>
    </div>
  )
}

export default function ScheduleDetailModal({
  isOpen,
  onClose,
  schedules,
  projectName,
  date,
  onSave,
  onDelete,
  onCreate,
  allMembers,
  defaultAssigneeIds,
}: ScheduleDetailModalProps) {
  const [showNewForm, setShowNewForm] = useState(false)

  // 모달이 닫힐 때 새 일정 폼 초기화
  useEffect(() => {
    if (!isOpen) {
      setShowNewForm(false)
    }
  }, [isOpen])

  // 일정이 없으면 자동으로 새 일정 폼 표시
  const shouldShowNewForm = showNewForm || schedules.length === 0

  const handleCreate = useCallback(
    (data: { time: string; content: string; contentInternal: string; note: string; dateUncertain: boolean; assigneeIds: number[] }) => {
      onCreate(data)
      setShowNewForm(false)
    },
    [onCreate]
  )

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={MODAL_OVERLAY_STYLE}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="rounded-[20px] w-[480px] max-h-[80vh] flex flex-col" style={MODAL_CONTAINER_STYLE}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {projectName}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(date)}</p>
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
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {schedules.map((schedule) => (
            <ScheduleEditItem
              key={schedule.id}
              schedule={schedule}
              onSave={onSave}
              onDelete={onDelete}
              allMembers={allMembers}
            />
          ))}

          {shouldShowNewForm ? (
            <NewScheduleForm
              onCreate={handleCreate}
              onCancel={() => setShowNewForm(false)}
              allMembers={allMembers}
              defaultAssigneeIds={defaultAssigneeIds}
            />
          ) : (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 rounded-xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.3)', border: '1px dashed rgba(0,0,0,0.06)' }}
            >
              + 새 일정 추가
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-600 rounded-[10px] transition-colors"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.04)' }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
