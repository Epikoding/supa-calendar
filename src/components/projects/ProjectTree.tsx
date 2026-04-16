'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { getErrorMessage, handleProjectError } from '@/lib/utils/error'
import { calculateNextSortOrder, syncProjectMembers } from '@/lib/utils/project'
import { fetchGanttTasks } from '@/lib/queries/gantt'
import { fetchBrands, fetchMembers } from '@/lib/queries/masterData'
import type { GanttTask, GanttFetchOptions } from '@/lib/types/gantt'
import type { ProjectFormPayload } from '@/lib/types/project'
import ProjectDetailModal from '@/components/calendar/ProjectDetailModal'
import AssigneePills from '@/components/shared/AssigneePills'
import TreeLines from '@/components/shared/TreeLines'
import BrandFilter from '@/components/shared/BrandFilter'
import { computeIsLastAtDepth } from '@/lib/utils/treeLines'
import { getDepthStyle } from '@/lib/constants/depth'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { useRoles } from '@/hooks/useRoles'
import { groupMembersByRole } from '@/lib/utils/role'
import { readJson, writeJson } from '@/lib/storage'
import { STATUS_OPTIONS } from '@/lib/constants/project'
import { fetchProjectLinkCounts } from '@/lib/queries/projectLinks'
import {
  GLASS_TOOLBAR_STYLE,
  getStatusPillStyle,
  getStatusSoftStyle,
} from '@/lib/styles/toolbar'
import { primaryAlpha, primaryGradient, primaryHex } from '@/lib/colors'

interface Brand {
  id: number
  code: string
  name: string
  color: string | null
}

interface MemberInfo {
  id: number
  nameShort: string
}

interface ProjectDetailState {
  isOpen: boolean
  projectId: number | null
  defaultBrandId: number | null
  defaultParentId: number | null
  defaultDateStart: string | null
  initialView?: 'edit' | 'links'
}


export default function ProjectTree() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [mastersLoaded, setMastersLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string[]>(['진행중', '보류'])
  const [brandFilter, setBrandFilter] = useState<number[] | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const bf = readJson<number[]>('brandFilter')
    if (bf) setBrandFilter(bf)
    setReady(true)
  }, [])
  const [projectModal, setProjectModal] = useState<ProjectDetailState>({
    isOpen: false,
    projectId: null,
    defaultBrandId: null,
    defaultParentId: null,
    defaultDateStart: null,
  })
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  // URL query param으로 슬랙 링크 모달 자동 오픈 (필터 무관하게 직접 조회).
  // 접근 제어는 Supabase RLS에 의존 — 프런트 필터(statusFilter/brandFilter)는 표시 제한용일 뿐.
  const openedSlackLinksIdRef = useRef<number | null>(null)
  const [urlProjectData, setUrlProjectData] = useState<{
    projectId: number; name: string; brandId: number; parentId: number | null;
    status: '진행전' | '진행중' | '보류' | '완료' | '드랍'; drivePath: string | null;
    dateStart: string | null; dateEnd: string | null;
    roleMembers: Record<string, { memberId: number; nameShort: string }[]>;
  } | null>(null)
  const { roles } = useRoles()

  // slackLinks 쿼리 파라미터만 선택적으로 제거. 최신 window.location을 읽어
  // 비동기 완료 시점의 URL 변경(다른 쿼리 파라미터 추가/삭제)을 덮어쓰지 않도록 한다.
  // pathname 은 usePathname() 로 동적 조회 — basePath/locale 이 있어도 정상 동작.
  const clearSlackLinksFromUrl = useCallback(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (!params.has('slackLinks')) return
    params.delete('slackLinks')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname])

  useEffect(() => {
    const slackLinksIdStr = searchParams.get('slackLinks')
    if (!slackLinksIdStr) {
      // URL 파라미터가 사라지면 다음 딥링크가 다시 동작하도록 리셋.
      openedSlackLinksIdRef.current = null
      return
    }
    const pid = Number(slackLinksIdStr)
    // PK 는 양의 정수. 음수/소수/Infinity/지수표기 모두 차단.
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      openedSlackLinksIdRef.current = null
      clearSlackLinksFromUrl()
      return
    }
    // 동일 id 재오픈 방지(members/roles 갱신에 반응해서 매번 열리는 문제 차단).
    if (openedSlackLinksIdRef.current === pid) return
    // mastersLoaded 대기 — 빈 memberMap 으로 클로저가 굳으면 roleMembers.nameShort 가 비게 됨.
    if (!mastersLoaded) return
    // roles 로딩 대기 — 빈 배열 상태로 모달 저장 시 project_members 가 통째로 삭제될 수 있음.
    // 역할 DB 가 실제로 비어 있으면 이 경로는 영구 차단되지만, 데이터 무결성 우선.
    if (roles.length === 0) return

    openedSlackLinksIdRef.current = pid

    ;(async () => {
      try {
        const { data: proj, error } = await supabase
          .from('projects')
          .select('id, name, brand_id, parent_id, status, drive_path, date_start, date_end, project_members(member_id, role)')
          .eq('id', pid)
          .single()
        // Stale response guard — 응답 도착 전에 URL이 다른 id로 바뀌었거나 사라졌으면 무시.
        if (openedSlackLinksIdRef.current !== pid) return
        if (!proj) {
          // PGRST116 (no rows) 또는 error 없음 = 존재하지 않는/권한 없는 ID → URL 정리.
          // 네트워크·일시 장애는 URL 유지 → 새로고침으로 재시도 가능하게 함.
          openedSlackLinksIdRef.current = null
          const code = (error as { code?: string } | null | undefined)?.code
          if (!error || code === 'PGRST116') {
            clearSlackLinksFromUrl()
          } else {
            console.error('슬랙 링크 딥링크 조회 실패:', error)
          }
          return
        }

        const memberMap = new Map(members.map(m => [m.id, m.nameShort]))
        const pm = (proj.project_members as { member_id: number; role: string }[]) ?? []
        setUrlProjectData({
          projectId: proj.id,
          name: proj.name,
          brandId: proj.brand_id,
          parentId: proj.parent_id,
          status: proj.status,
          drivePath: proj.drive_path,
          dateStart: proj.date_start,
          dateEnd: proj.date_end,
          roleMembers: groupMembersByRole(pm, memberMap, roles),
        })
        setProjectModal({
          isOpen: true,
          projectId: pid,
          defaultBrandId: null,
          defaultParentId: null,
          defaultDateStart: null,
          initialView: 'links',
        })
      } catch (err) {
        // 네트워크 reject 등 unhandled rejection 방지 + ref 리셋해 재시도 가능하게 함.
        console.error('슬랙 링크 딥링크 처리 실패:', err)
        if (openedSlackLinksIdRef.current === pid) openedSlackLinksIdRef.current = null
      }
    })()
  }, [searchParams, members, roles, mastersLoaded, clearSlackLinksFromUrl])
  const [linkCounts, setLinkCounts] = useState<Map<number, number>>(new Map())

  const brandsRef = useRef(brands)
  brandsRef.current = brands

  // 브랜드 + 멤버 조회 (마운트 시 1회, Realtime으로 갱신)
  const loadMasterData = useCallback(async () => {
    try {
      const [brandsData, membersData] = await Promise.all([fetchBrands(), fetchMembers()])
      const mapped = brandsData.map((b) => ({ id: b.id, code: b.code, name: b.name, color: b.color }))
      setBrands(mapped)
      brandsRef.current = mapped
      setMembers(membersData.map((m) => ({ id: m.id, nameShort: m.name_short })))
      setMastersLoaded(true)
    } catch (error) {
      console.error('마스터 데이터 로드 실패:', error)
    }
  }, [])

  useEffect(() => { loadMasterData() }, [loadMasterData])

  const memberMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const m of members) map.set(m.id, m.nameShort)
    return map
  }, [members])

  const isLastAtDepthMap = useMemo(() => {
    const combined = new Map<number, boolean[]>()
    const byBrand = new Map<number, typeof tasks>()
    for (const t of tasks) {
      let arr = byBrand.get(t.brandId)
      if (!arr) { arr = []; byBrand.set(t.brandId, arr) }
      arr.push(t)
    }
    for (const group of byBrand.values()) {
      const partial = computeIsLastAtDepth(
        group.map((t) => ({ id: t.id, parentId: t.parentId, depth: t.depth })),
      )
      for (const [id, arr] of partial) combined.set(id, arr)
    }
    return combined
  }, [tasks])

  const loadTasks = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const options: GanttFetchOptions = {
        statusFilter: statusFilter.length > 0 ? statusFilter : null,
        brandFilter,
      }
      const brandsForQuery = brandsRef.current.map((b) => ({ id: b.id, code: b.code, color: b.color, sort_order: 0 }))
      const data = await fetchGanttTasks(roles, options, memberMap, brandsForQuery)
      setTasks(data)
    } catch (error) {
      console.error('프로젝트 데이터 로드 실패:', error)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [statusFilter, brandFilter, memberMap, roles])

  // Realtime 구독
  const { suppressRealtime } = useRealtimeSync({
    onProjectChange: useCallback(() => { loadTasks(false) }, [loadTasks]),
    onBrandChange: useCallback(() => { loadMasterData() }, [loadMasterData]),
    onMemberChange: useCallback(() => { loadMasterData() }, [loadMasterData]),
  })

  // roles가 로딩되기 전에 loadTasks를 실행하면 fetchGanttTasks가 빈 roleMembers를 만들어
  // 사용자가 편집 모달에서 저장할 때 project_members가 통째로 삭제될 수 있다.
  useEffect(() => { if (ready && roles.length > 0) loadTasks() }, [loadTasks, ready, roles])

  useEffect(() => {
    fetchProjectLinkCounts().then(setLinkCounts).catch((err) => console.error('슬랙 링크 카운트 조회 실패:', err))
  }, [])

  // 모달 닫힐 때 배지 카운트 갱신
  const prevModalOpenRef = useRef(projectModal.isOpen)
  useEffect(() => {
    if (prevModalOpenRef.current && !projectModal.isOpen) {
      fetchProjectLinkCounts().then(setLinkCounts).catch((err) => console.error('슬랙 링크 카운트 조회 실패:', err))
    }
    prevModalOpenRef.current = projectModal.isOpen
  }, [projectModal.isOpen])

  const toggleStatus = useCallback((status: (typeof STATUS_OPTIONS)[number]) => {
    setStatusFilter((prev) => {
      const isActive = prev.includes(status)
      return isActive ? prev.filter((s) => s !== status) : [...prev, status]
    })
  }, [])

  // 새 프로젝트 (툴바)
  const handleCreateProject = useCallback(() => {
    setProjectModal({
      isOpen: true,
      projectId: null,
      defaultBrandId: brandFilter?.[0] ?? null,
      defaultParentId: null,
      defaultDateStart: null,
    })
  }, [brandFilter])

  // 편집
  const handleEditProject = useCallback((task: GanttTask) => {
    setProjectModal({
      isOpen: true,
      projectId: task.id,
      defaultBrandId: null,
      defaultParentId: null,
      defaultDateStart: null,
    })
  }, [])

  // + 하위 추가
  const handleAddChild = useCallback((task: GanttTask) => {
    setProjectModal({
      isOpen: true,
      projectId: null,
      defaultBrandId: task.brandId,
      defaultParentId: task.id,
      defaultDateStart: null,
    })
  }, [])

  // 삭제
  const handleDeleteProject = useCallback(async (taskId: number) => {
    if (deleteConfirmId !== taskId) {
      setDeleteConfirmId(taskId)
      return
    }
    try {
      const { error } = await supabase.from('projects').delete().eq('id', taskId)
      if (error) throw error
      setDeleteConfirmId(null)
      suppressRealtime(['project'])
      await loadTasks(false)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('프로젝트 삭제 실패:', msg)
    }
  }, [deleteConfirmId, loadTasks, suppressRealtime])

  const handleCloseProjectModal = useCallback(() => {
    setProjectModal((prev) => ({ ...prev, isOpen: false }))
    clearSlackLinksFromUrl()
  }, [clearSlackLinksFromUrl])

  const handleProjectSave = useCallback(
    async (
      projectId: number,
      data: ProjectFormPayload,
    ) => {
      if (!data.brandId) return
      try {
        const { error } = await supabase
          .from('projects')
          .update({
            name: data.name.trim(),
            brand_id: data.brandId,
            parent_id: data.parentId,
            status: data.status,
            drive_path: data.drivePath || null,
            date_start: data.dateStart || null,
            date_end: data.dateEnd || null,
          })
          .eq('id', projectId)
        if (error) throw error

        await syncProjectMembers(projectId, data.membersByRole)

        suppressRealtime(['project'])
        await loadTasks(false)
        handleCloseProjectModal()
      } catch (err: unknown) {
        handleProjectError(getErrorMessage(err), '프로젝트 저장 실패')
      }
    },
    [loadTasks, suppressRealtime, handleCloseProjectModal],
  )

  const handleProjectDelete = useCallback(
    async (projectId: number) => {
      try {
        const { error } = await supabase.from('projects').delete().eq('id', projectId)
        if (error) throw error
        suppressRealtime(['project'])
        await loadTasks(false)
        handleCloseProjectModal()
      } catch (err: unknown) {
        console.error('프로젝트 삭제 실패:', getErrorMessage(err))
      }
    },
    [loadTasks, suppressRealtime, handleCloseProjectModal],
  )

  const handleProjectCreate = useCallback(
    async (data: ProjectFormPayload) => {
      if (!data.brandId) return
      try {
        const newSortOrder = await calculateNextSortOrder(data.brandId, data.parentId)

        const { data: inserted, error } = await supabase
          .from('projects')
          .insert({
            name: data.name.trim(),
            brand_id: data.brandId,
            parent_id: data.parentId,
            status: data.status,
            drive_path: data.drivePath || null,
            date_start: data.dateStart || null,
            date_end: data.dateEnd || null,
            sort_order: newSortOrder,
          })
          .select('id')
          .single()
        if (error) throw error

        await syncProjectMembers(inserted.id, data.membersByRole)

        suppressRealtime(['project'])
        await loadTasks(false)
        handleCloseProjectModal()
      } catch (err: unknown) {
        handleProjectError(getErrorMessage(err), '프로젝트 생성 실패')
      }
    },
    [loadTasks, suppressRealtime, handleCloseProjectModal],
  )

  // --- Memoized data for modal ---

  const projectModalData = useMemo(() => {
    if (!projectModal.projectId) return null
    const task = tasks.find((t) => t.id === projectModal.projectId)
    if (task) {
      return {
        projectId: task.id,
        name: task.projectName,
        brandId: task.brandId,
        parentId: task.parentId,
        status: task.status,
        drivePath: task.drivePath,
        dateStart: task.dateStart,
        dateEnd: task.dateEnd,
        roleMembers: task.roleMembers,
      }
    }
    // tasks에 없으면 URL 직접 조회 데이터 사용 (필터에 걸린 프로젝트)
    if (urlProjectData?.projectId === projectModal.projectId) return urlProjectData
    return null
  }, [projectModal.projectId, tasks, urlProjectData])

  // 외부 클릭으로 삭제 확인 리셋
  useEffect(() => {
    if (deleteConfirmId === null) return
    const handleClick = () => setDeleteConfirmId(null)
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick, { once: true })
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [deleteConfirmId])

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: primaryAlpha(0.02) }}
    >
      {/* 툴바 */}
      <div
        className="relative z-20 flex items-center gap-4 p-3"
        style={{
          ...GLASS_TOOLBAR_STYLE,
          borderBottom: `1px solid ${primaryAlpha(0.06)}`,
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-0.5">상태</span>
          {STATUS_OPTIONS.map((status) => {
            const active = statusFilter.includes(status)
            return (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                aria-pressed={active}
                className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                style={getStatusPillStyle(status, active)}
              >
                {status}
              </button>
            )
          })}
        </div>
        <div className="h-5 w-px" style={{ background: primaryAlpha(0.12) }} />
        <BrandFilter
          brands={brands}
          value={brandFilter}
          onChange={(next) => {
            setBrandFilter(next)
            writeJson('brandFilter', next)
          }}
        />
        <div className="h-5 w-px" style={{ background: primaryAlpha(0.12) }} />
        <button
          onClick={handleCreateProject}
          className="px-3 py-1 text-white text-sm rounded-lg transition-opacity hover:opacity-90"
          style={{
            background: primaryGradient,
            boxShadow: `0 2px 6px ${primaryAlpha(0.2)}`,
          }}
        >
          + 프로젝트
        </button>
        <div className="ml-auto text-xs text-slate-500">
          {tasks.length}개 프로젝트
        </div>
      </div>

      {/* 프로젝트 트리 */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-gray-500">데이터를 불러오는 중...</div>
      ) : tasks.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-gray-400">표시할 프로젝트가 없습니다</div>
      ) : (
        <div
          className="flex-1 overflow-y-auto"
          style={{
            background:
              'linear-gradient(135deg, rgba(248,250,255,0.85) 0%, rgba(250,252,255,0.78) 100%)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          {tasks.map((task) => {
            const isMuted = task.status !== '진행중'
            const isLastAtDepth = isLastAtDepthMap.get(task.id) ?? []
            const depthStyle = getDepthStyle(task.depth)
            const slackCount = linkCounts.get(task.id) ?? 0

            return (
              <div
                key={task.id}
                className={`flex items-center border-b hover:bg-[rgba(255,255,255,0.55)] transition-colors group ${isMuted ? 'opacity-50' : ''}`}
                style={{
                  paddingLeft: 16,
                  borderColor: primaryAlpha(0.05),
                }}
              >
                {/* 트리 연결선 (depth ≥ 1) */}
                <TreeLines depth={task.depth} isLastAtDepth={isLastAtDepth} />

                {/* 프로젝트명 */}
                <div className="flex items-center min-w-0 flex-1 py-2.5">
                  {task.depth === 0 && (
                    <span
                      style={{ backgroundColor: task.brandColor || '#888' }}
                      className="text-[10px] text-white px-1.5 py-0.5 rounded mr-2 font-medium inline-block leading-tight flex-shrink-0"
                    >
                      {task.brandCode}
                    </span>
                  )}
                  <span
                    className="truncate"
                    style={{
                      fontSize: depthStyle.fontSize,
                      fontWeight: depthStyle.fontWeight,
                      color: isMuted
                        ? undefined
                        : task.depth === 0
                          ? '#111827'
                          : task.depth <= 2
                            ? '#1f2937'
                            : '#4b5563',
                    }}
                  >
                    {task.projectName}
                  </span>
                </div>

                {/* 상태 */}
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                  style={getStatusSoftStyle(task.status)}
                  aria-label={`상태: ${task.status}`}
                >
                  {task.status}
                </span>

                {/* 기간 */}
                <span className="text-xs text-gray-400 w-[140px] text-center flex-shrink-0 mx-3">
                  {task.dateStart && task.dateEnd
                    ? `${task.dateStart.slice(5)} ~ ${task.dateEnd.slice(5)}`
                    : task.dateStart
                      ? `${task.dateStart.slice(5)} ~`
                      : '기간 미설정'}
                </span>

                {/* 담당자 */}
                <div className="w-[140px] flex-shrink-0 flex items-center">
                  <AssigneePills roleMembers={task.roleMembers} roles={roles} muted={isMuted} />
                </div>

                {/* 드라이브 경로 */}
                <span className="text-xs text-gray-700 w-[200px] truncate flex-shrink-0 mx-2">
                  {task.drivePath ? (
                    <a
                      href={`https://drive.google.com/drive/folders/${task.drivePath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-500 hover:underline transition-colors"
                      title={task.drivePath}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {task.drivePath}
                    </a>
                  ) : ''}
                </span>

                {/* 슬랙 링크 카운트 */}
                {slackCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      router.replace(`/projects?slackLinks=${task.id}`, { scroll: false })
                      setProjectModal({
                        isOpen: true,
                        projectId: task.id,
                        defaultBrandId: null,
                        defaultParentId: null,
                        defaultDateStart: null,
                        initialView: 'links',
                      })
                    }}
                    className="text-[11px] px-2 py-0.5 rounded-full shrink-0 transition-colors hover:opacity-80"
                    style={{ background: 'rgba(224,30,90,0.1)', color: '#e01e5a' }}
                    title="슬랙 링크 보기"
                  >
                    💬 {slackCount}
                  </button>
                )}

                {/* 액션 버튼 */}
                <div className="flex items-center gap-1 flex-shrink-0 ml-2 mr-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleAddChild(task)}
                    className="text-[11px] px-2 py-0.5 rounded transition-colors whitespace-nowrap bg-transparent hover:bg-[var(--color-primary-006)]"
                    style={{
                      border: `1px solid ${primaryAlpha(0.25)}`,
                      color: primaryHex,
                    }}
                  >
                    + 하위
                  </button>
                  <button
                    onClick={() => handleEditProject(task)}
                    className="text-[11px] px-2 py-0.5 rounded transition-colors text-slate-500 bg-transparent hover:bg-[var(--color-primary-005)]"
                    style={{
                      border: `1px solid ${primaryAlpha(0.15)}`,
                    }}
                  >
                    편집
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteProject(task.id) }}
                    className={`text-[11px] px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
                      deleteConfirmId === task.id
                        ? 'bg-red-600 text-white border border-transparent hover:bg-red-700'
                        : 'bg-transparent text-red-700/85 border border-red-500/30 hover:bg-red-500/10'
                    }`}
                  >
                    {deleteConfirmId === task.id ? '확인' : '삭제'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 프로젝트 상세 모달 */}
      <ProjectDetailModal
        isOpen={projectModal.isOpen}
        onClose={handleCloseProjectModal}
        project={projectModalData}
        brands={brands}
        members={members}

        defaultBrandId={projectModal.defaultBrandId}
        defaultParentId={projectModal.defaultParentId}
        defaultDateStart={projectModal.defaultDateStart}
        initialView={projectModal.initialView}
        onSave={handleProjectSave}
        onDelete={handleProjectDelete}
        onCreate={handleProjectCreate}
      />
    </div>
  )
}
