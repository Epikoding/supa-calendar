'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useMonthNavigation } from '@/hooks/useMonthNavigation'

// --- Types ---

interface MemberInfo {
  id: number
  nameShort: string
}

interface AttendanceRecord {
  id: number
  date: string
  location: string | null
  note: string | null
  members: { memberId: number; note: string | null }[]
}

interface MonthDotMap {
  [date: string]: number // date → 출근 장소 수
}

const KOREAN_DAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseDateStr(s: string): { year: number; month: number; day: number } {
  const [y, m, d] = s.split('-').map(Number)
  return { year: y, month: m, day: d }
}

// --- Mini Calendar ---

function MiniCalendar({
  year,
  month,
  selectedDate,
  dots,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  onToday,
}: {
  year: number
  month: number
  selectedDate: string
  dots: MonthDotMap
  onSelectDate: (date: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
}) {
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const todayStr = formatDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate())

  const weeks: (number | null)[][] = []
  let week: (number | null)[] = new Array(firstDay).fill(null)

  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }

  return (
    <div className="w-[280px] flex-shrink-0">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrevMonth} className="px-2 py-1 text-gray-500 hover:text-gray-700 text-sm">&lt;</button>
        <span className="text-sm font-semibold text-gray-900">{year}년 {month}월</span>
        <button onClick={onNextMonth} className="px-2 py-1 text-gray-500 hover:text-gray-700 text-sm">&gt;</button>
      </div>
      <button onClick={onToday} className="w-full mb-2 px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors">오늘</button>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {KOREAN_DAYS.map((d, i) => (
          <div key={d} className={`text-center text-[11px] font-medium py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day, di) => {
            if (day === null) return <div key={di} />
            const dateStr = formatDate(year, month, day)
            const isSelected = dateStr === selectedDate
            const isToday = dateStr === todayStr
            const dotCount = dots[dateStr] ?? 0
            const dayOfWeek = new Date(year, month - 1, day).getDay()
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

            return (
              <button
                key={di}
                onClick={() => onSelectDate(dateStr)}
                className={`relative flex flex-col items-center py-1.5 text-xs rounded transition-colors ${
                  isSelected
                    ? 'bg-blue-500 text-white'
                    : isToday
                      ? 'bg-blue-50 text-blue-600 font-bold'
                      : isWeekend
                        ? 'text-red-400 hover:bg-gray-50'
                        : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{day}</span>
                {dotCount > 0 && (
                  <span className={`text-[9px] leading-none mt-0.5 ${isSelected ? 'text-blue-200' : 'text-blue-400'}`}>
                    ({dotCount})
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// --- Location Card ---

function LocationCard({
  record,
  allMembers,
  onToggleMember,
  onUpdateNote,
  onUpdateMemberNote,
  onDelete,
  onUpdateLocation,
}: {
  record: AttendanceRecord
  allMembers: MemberInfo[]
  onToggleMember: (attendanceId: number, memberId: number, isActive: boolean) => void
  onUpdateNote: (attendanceId: number, note: string) => void
  onUpdateMemberNote: (attendanceId: number, memberId: number, note: string) => void
  onDelete: (attendanceId: number) => void
  onUpdateLocation: (attendanceId: number, location: string) => void
}) {
  const [editingLocation, setEditingLocation] = useState(false)
  const [locationValue, setLocationValue] = useState(record.location ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingMemberNote, setEditingMemberNote] = useState<number | null>(null)

  const activeMemberIds = new Set(record.members.map((m) => m.memberId))
  const memberNoteMap = new Map(record.members.map((m) => [m.memberId, m.note ?? '']))

  const handleLocationSave = () => {
    if (locationValue.trim()) {
      onUpdateLocation(record.id, locationValue.trim())
    }
    setEditingLocation(false)
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      {/* 장소 헤더 */}
      <div className="flex items-center justify-between mb-3">
        {editingLocation ? (
          <input
            value={locationValue}
            onChange={(e) => setLocationValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLocationSave(); if (e.key === 'Escape') setEditingLocation(false) }}
            onBlur={handleLocationSave}
            className="text-sm font-semibold text-gray-900 border-b-2 border-blue-400 outline-none bg-transparent px-0 py-0.5"
            autoFocus
          />
        ) : (
          <h3
            className="text-sm font-semibold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
            onClick={() => { setLocationValue(record.location ?? ''); setEditingLocation(true) }}
          >
            {record.location || '(장소 없음)'}
          </h3>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); if (confirmDelete) { onDelete(record.id); setConfirmDelete(false) } else { setConfirmDelete(true) } }}
          onBlur={() => setConfirmDelete(false)}
          className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${confirmDelete ? 'bg-red-600 text-white border-red-600' : 'border-red-200 text-red-400 hover:bg-red-50'}`}
        >
          {confirmDelete ? '확인' : '삭제'}
        </button>
      </div>

      {/* 멤버 토글 */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {allMembers.map((m) => {
          const active = activeMemberIds.has(m.id)
          const memberNote = memberNoteMap.get(m.id) ?? ''
          return (
            <div key={m.id} className="relative">
              <button
                onClick={() => onToggleMember(record.id, m.id, !active)}
                onContextMenu={(e) => { e.preventDefault(); if (active) setEditingMemberNote(editingMemberNote === m.id ? null : m.id) }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                }`}
                title={memberNote ? `메모: ${memberNote}` : '우클릭으로 메모 편집'}
              >
                {m.nameShort}
                {memberNote && <span className="ml-0.5 text-[10px] opacity-75">*</span>}
              </button>
              {/* 멤버 메모 편집 팝업 */}
              {editingMemberNote === m.id && (
                <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded shadow-lg p-2 w-36">
                  <input
                    value={memberNote}
                    onChange={(e) => onUpdateMemberNote(record.id, m.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingMemberNote(null) }}
                    onBlur={() => setEditingMemberNote(null)}
                    className="text-xs border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="반차, 외근 등"
                    autoFocus
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 전체 비고 */}
      <input
        value={record.note ?? ''}
        onChange={(e) => onUpdateNote(record.id, e.target.value)}
        className="text-xs border border-gray-200 rounded px-2.5 py-1.5 w-full text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 placeholder:text-gray-300"
        placeholder="비고"
      />
    </div>
  )
}

// --- Main Component ---

export default function AttendancePanel() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate()))
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [monthDots, setMonthDots] = useState<MonthDotMap>({})
  const [allMembers, setAllMembers] = useState<MemberInfo[]>([])
  const [loading, setLoading] = useState(true)

  // 멤버 로드
  useEffect(() => {
    async function loadMembers() {
      const { data, error } = await supabase
        .from('members')
        .select('id, name_short')
        .eq('active', true)
        .order('name_short')
      if (!error && data) {
        setAllMembers(data.map((m) => ({ id: m.id, nameShort: m.name_short })))
      }
    }
    loadMembers()
  }, [])

  // 월별 도트 로드
  const loadMonthDots = useCallback(async () => {
    const startDate = formatDate(year, month, 1)
    const daysInMonth = new Date(year, month, 0).getDate()
    const endDate = formatDate(year, month, daysInMonth)

    const { data, error } = await supabase
      .from('attendance')
      .select('date')
      .gte('date', startDate)
      .lte('date', endDate)

    if (!error && data) {
      const dots: MonthDotMap = {}
      for (const row of data) {
        dots[row.date] = (dots[row.date] ?? 0) + 1
      }
      setMonthDots(dots)
    }
  }, [year, month])

  useEffect(() => { loadMonthDots() }, [loadMonthDots])

  // 선택 날짜 출근 기록 로드
  const loadRecords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('attendance')
      .select('id, date, location, note, attendance_members(member_id, note)')
      .eq('date', selectedDate)
      .order('location', { ascending: true })

    if (!error && data) {
      const mapped: AttendanceRecord[] = data.map((row) => ({
        id: row.id,
        date: row.date,
        location: row.location,
        note: row.note,
        members: (row.attendance_members ?? []).map((am: { member_id: number; note: string | null }) => ({
          memberId: am.member_id,
          note: am.note,
        })),
      }))
      setRecords(mapped)
    }
    setLoading(false)
  }, [selectedDate])

  useEffect(() => { loadRecords() }, [loadRecords])

  // --- Actions ---

  const handleToggleMember = useCallback(async (attendanceId: number, memberId: number, activate: boolean) => {
    if (activate) {
      const { error } = await supabase.from('attendance_members').insert({ attendance_id: attendanceId, member_id: memberId })
      if (error) { console.error('멤버 추가 실패:', error.message); return }
    } else {
      const { error } = await supabase.from('attendance_members').delete().eq('attendance_id', attendanceId).eq('member_id', memberId)
      if (error) { console.error('멤버 제거 실패:', error.message); return }
    }
    // optimistic update
    setRecords((prev) => prev.map((r) => {
      if (r.id !== attendanceId) return r
      if (activate) {
        return { ...r, members: [...r.members, { memberId, note: null }] }
      } else {
        return { ...r, members: r.members.filter((m) => m.memberId !== memberId) }
      }
    }))
  }, [])

  const handleUpdateNote = useCallback(async (attendanceId: number, note: string) => {
    let snapshot: AttendanceRecord[] | null = null
    setRecords((r) => { snapshot = r; return r.map((rec) => rec.id === attendanceId ? { ...rec, note } : rec) })
    const { error } = await supabase.from('attendance').update({ note: note || null }).eq('id', attendanceId)
    if (error && snapshot) { console.error('비고 저장 실패:', error.message); setRecords(snapshot) }
  }, [])

  const handleUpdateMemberNote = useCallback(async (attendanceId: number, memberId: number, note: string) => {
    let snapshot: AttendanceRecord[] | null = null
    setRecords((r) => {
      snapshot = r
      return r.map((rec) => {
        if (rec.id !== attendanceId) return rec
        return { ...rec, members: rec.members.map((m) => m.memberId === memberId ? { ...m, note: note || null } : m) }
      })
    })
    const { error } = await supabase.from('attendance_members').update({ note: note || null }).eq('attendance_id', attendanceId).eq('member_id', memberId)
    if (error && snapshot) { console.error('멤버 비고 저장 실패:', error.message); setRecords(snapshot) }
  }, [])

  const handleUpdateLocation = useCallback(async (attendanceId: number, location: string) => {
    const { error } = await supabase.from('attendance').update({ location }).eq('id', attendanceId)
    if (error) { console.error('장소 변경 실패:', error.message); return }
    setRecords((prev) => prev.map((r) => r.id === attendanceId ? { ...r, location } : r))
  }, [])

  const handleDeleteRecord = useCallback(async (attendanceId: number) => {
    const { error } = await supabase.from('attendance').delete().eq('id', attendanceId)
    if (error) { console.error('출근 기록 삭제 실패:', error.message); return }
    setRecords((prev) => prev.filter((r) => r.id !== attendanceId))
    await loadMonthDots()
  }, [loadMonthDots])

  const handleAddLocation = useCallback(async () => {
    const { data, error } = await supabase
      .from('attendance')
      .insert({ date: selectedDate, location: '학동' })
      .select('id, date, location, note')
      .single()
    if (error) { console.error('장소 추가 실패:', error.message); return }
    setRecords((prev) => [...prev, { id: data.id, date: data.date, location: data.location, note: data.note, members: [] }])
    await loadMonthDots()
  }, [selectedDate, loadMonthDots])

  // --- Navigation ---

  const { goToPrevMonth, goToNextMonth, goToToday } = useMonthNavigation(
    year, month,
    useCallback((y, m) => { setYear(y); setMonth(m) }, []),
    useCallback(() => {
      const today = new Date()
      setSelectedDate(formatDate(today.getFullYear(), today.getMonth() + 1, today.getDate()))
    }, []),
  )

  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate(date)
    const { year: dy, month: dm } = parseDateStr(date)
    if (dy !== year || dm !== month) {
      setYear(dy)
      setMonth(dm)
    }
  }, [year, month])

  // 선택 날짜 정보
  const selectedDateInfo = useMemo(() => {
    const { year: y, month: m, day: d } = parseDateStr(selectedDate)
    const dayOfWeek = new Date(y, m - 1, d).getDay()
    return { year: y, month: m, day: d, dayName: KOREAN_DAYS[dayOfWeek] }
  }, [selectedDate])

  return (
    <div className="flex h-full">
      {/* 좌측: 미니 캘린더 */}
      <div className="flex-shrink-0 border-r border-gray-200 p-4 bg-gray-50">
        <MiniCalendar
          year={year}
          month={month}
          selectedDate={selectedDate}
          dots={monthDots}
          onSelectDate={handleSelectDate}
          onPrevMonth={goToPrevMonth}
          onNextMonth={goToNextMonth}
          onToday={goToToday}
        />
      </div>

      {/* 우측: 선택 날짜 출근 기록 */}
      <div className="flex-1 overflow-y-auto p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          {selectedDateInfo.month}월 {selectedDateInfo.day}일 ({selectedDateInfo.dayName})
        </h2>

        {loading ? (
          <div className="text-gray-400 text-sm">불러오는 중...</div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <LocationCard
                key={record.id}
                record={record}
                allMembers={allMembers}
                onToggleMember={handleToggleMember}
                onUpdateNote={handleUpdateNote}
                onUpdateMemberNote={handleUpdateMemberNote}
                onDelete={handleDeleteRecord}
                onUpdateLocation={handleUpdateLocation}
              />
            ))}
            {records.length === 0 && (
              <div className="text-gray-300 text-sm">출근 기록이 없습니다</div>
            )}
            <button
              onClick={handleAddLocation}
              className="text-sm text-blue-500 hover:text-blue-600 transition-colors"
            >
              + 장소 추가
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
