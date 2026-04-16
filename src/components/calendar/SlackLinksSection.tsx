'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ProjectLink } from '@/lib/types/database'
import {
  fetchProjectLinks,
  insertProjectLinks,
  updateProjectLinkTitle,
  toggleProjectLinkOpen,
  deleteProjectLink,
} from '@/lib/queries/projectLinks'
import { supabase } from '@/lib/supabase/client'
import { parseMultipleSlackUrls, extractSlackTs, fetchSlackInfo, decodeSlackText, buildSlackIdMap, extractMessageTs, extractThreadTs } from '@/lib/utils/slack'
import type { SlackMessageInfo } from '@/lib/utils/slack'
import { getErrorMessage } from '@/lib/utils/error'

// link_type별 스타일 정의
const LINK_TYPE_STYLES: Record<string, { icon: string; label: string; borderColor: string; labelBg: string; labelText: string }> = {
  reply:   { icon: '🧵', label: 'Reply',  borderColor: '#e01e5a', labelBg: 'rgba(224,30,90,0.1)',  labelText: '#e01e5a' },
  message: { icon: '💬', label: '메시지', borderColor: '#64748b', labelBg: 'rgba(100,116,139,0.1)', labelText: '#64748b' },
  channel: { icon: '#',  label: '채널',   borderColor: '#475569', labelBg: 'rgba(71,85,105,0.1)',  labelText: '#475569' },
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}/${Number(d)}`
}

// 계층 구조 노드
interface LinkNode {
  link: ProjectLink
  children: LinkNode[]
}

// 링크 목록을 계층 구조로 변환 (채널 → 메시지 → Reply)
function buildHierarchy(allLinks: ProjectLink[]): LinkNode[] {
  const channelMap = new Map<string, ProjectLink>()
  for (const link of allLinks) {
    if (link.link_type === 'channel' && link.channel_id) {
      channelMap.set(link.channel_id, link)
    }
  }

  const messageTsMap = new Map<string, ProjectLink>()
  for (const link of allLinks) {
    if (link.link_type !== 'channel') {
      const msgTs = extractMessageTs(link.url)
      if (msgTs) messageTsMap.set(msgTs, link)
    }
  }

  const childrenMap = new Map<number, ProjectLink[]>()
  const childIds = new Set<number>()

  function addChild(parentId: number, child: ProjectLink) {
    const children = childrenMap.get(parentId) ?? []
    children.push(child)
    childrenMap.set(parentId, children)
    childIds.add(child.id)
  }

  // Reply → Message
  for (const link of allLinks) {
    if (link.link_type === 'reply') {
      const threadTs = extractThreadTs(link.url)
      if (threadTs) {
        const parent = messageTsMap.get(threadTs)
        if (parent && parent.id !== link.id) {
          addChild(parent.id, link)
        }
      }
    }
  }

  // Message → Channel
  for (const link of allLinks) {
    if (link.link_type === 'message' && link.channel_id && !childIds.has(link.id)) {
      const channelLink = channelMap.get(link.channel_id)
      if (channelLink && channelLink.id !== link.id) {
        addChild(channelLink.id, link)
      }
    }
  }

  // 부모 없는 Reply → Channel
  for (const link of allLinks) {
    if (link.link_type === 'reply' && !childIds.has(link.id) && link.channel_id) {
      const channelLink = channelMap.get(link.channel_id)
      if (channelLink && channelLink.id !== link.id) {
        addChild(channelLink.id, link)
      }
    }
  }

  function buildNode(link: ProjectLink): LinkNode {
    const children = (childrenMap.get(link.id) ?? []).map(buildNode)
    return { link, children }
  }

  return allLinks
    .filter((link) => !childIds.has(link.id))
    .map(buildNode)
}

// 계층 트리를 depth-first로 펼쳐서 (link, depth) 쌍 배열로 변환
function flattenHierarchy(nodes: LinkNode[], depth = 0, result: { link: ProjectLink; depth: number }[] = []): { link: ProjectLink; depth: number }[] {
  for (const node of nodes) {
    result.push({ link: node.link, depth })
    flattenHierarchy(node.children, depth + 1, result)
  }
  return result
}

interface SlackLinksSectionProps {
  projectId: number | null // null = 신규 프로젝트 (링크 추가 불가)
  maxItems?: number        // 미지정 시 전체 표시
  onOverflowClick?: () => void  // "더보기" 클릭 핸들러
  expandText?: boolean     // true면 제목 텍스트 줄바꿈 허용 (페이지용)
}

export default function SlackLinksSection({ projectId, maxItems, onOverflowClick, expandText }: SlackLinksSectionProps) {
  const [slackIdMap, setSlackIdMap] = useState<Map<string, string>>(new Map())
  const fetchGenRef = useRef(0)
  const slackInfoCacheRef = useRef(new Map<string, SlackMessageInfo | null>())
  const escapingRef = useRef(false)
  const [links, setLinks] = useState<ProjectLink[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [parsedItems, setParsedItems] = useState<{ url: string; parsed: ReturnType<typeof parseMultipleSlackUrls>[number]['parsed']; title: string; slackInfo: SlackMessageInfo | null }[]>([])
  const [fetchingUrls, setFetchingUrls] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  // editingId 변경 시 escapingRef 리셋 (Escape 후 onBlur 미발생으로 잔류 방지)
  useEffect(() => { escapingRef.current = false }, [editingId])

  // 링크 목록 로드
  const loadLinks = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const data = await fetchProjectLinks(projectId)
      setLinks(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadLinks()
    // slack_id → name_short 맵 구축 (멘션 치환용)
    supabase.from('members').select('slack_id, name_short').then(({ data }) => {
      if (data) setSlackIdMap(buildSlackIdMap(data))
    })
  }, [loadLinks])

  // Slack info → 제목/authorName 적용
  const applySlackInfo = useCallback((
    item: { url: string; parsed: ReturnType<typeof parseMultipleSlackUrls>[number]['parsed']; title: string; slackInfo: SlackMessageInfo | null },
    info: SlackMessageInfo | null,
  ) => {
    if (!info) return item
    let title = item.title
    if (info.text) {
      const firstLine = decodeSlackText(info.text).split('\n')[0]
      title = firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine
    } else if (info.channelName) {
      title = `#${info.channelName}`
    }
    const authorName = info.authorName
      ? (slackIdMap.get(info.authorName) ?? info.authorName)
      : null
    return { ...item, title, slackInfo: { ...info, authorName } }
  }, [slackIdMap])

  // URL 입력 → 파싱 미리보기 + Slack API로 상세 정보 자동 fetch
  const handleUrlChange = async (value: string) => {
    setUrlInput(value)
    setError(null)
    const results = parseMultipleSlackUrls(value)
    const cache = slackInfoCacheRef.current

    // 캐시 히트한 항목은 즉시 slackInfo 적용, 미스한 항목만 기본 제목
    const items = results.map((r) => {
      const style = LINK_TYPE_STYLES[r.parsed.linkType]
      const date = formatDate(r.parsed.threadDate)
      const defaultTitle = date ? `${style.label} · ${date}` : style.label
      const base = { ...r, title: defaultTitle, slackInfo: null as SlackMessageInfo | null }
      const cached = cache.get(r.url)
      if (cached !== undefined) return applySlackInfo(base, cached)
      return base
    })
    setParsedItems(items)

    // 캐시 미스한 URL만 fetch
    const uncachedIndices = items.map((item, i) => cache.has(item.url) ? -1 : i).filter((i) => i >= 0)
    if (uncachedIndices.length === 0) return

    // 파싱 중인 URL 표시
    setFetchingUrls(new Set(uncachedIndices.map((idx) => items[idx].url)))

    const gen = ++fetchGenRef.current
    const fetched = await Promise.all(
      uncachedIndices.map(async (idx) => {
        const item = items[idx]
        const extracted = extractSlackTs(item.url)
        const info = await fetchSlackInfo(
          item.parsed.channelId,
          extracted?.ts ?? null,
          extracted?.replyTs ?? null,
        )
        return { idx, info, url: item.url }
      }),
    )

    if (gen !== fetchGenRef.current) return

    for (const { url, info } of fetched) cache.set(url, info)
    setFetchingUrls(new Set())
    const fetchedMap = new Map(fetched.map((f) => [f.idx, f]))
    setParsedItems((prev) =>
      prev.map((item, i) => {
        const result = fetchedMap.get(i)
        if (!result) return item
        return applySlackInfo(item, result.info)
      }),
    )
  }

  // 제목 입력 업데이트
  const handleTitleChange = (index: number, title: string) => {
    setParsedItems((prev) => prev.map((item, i) => i === index ? { ...item, title } : item))
  }

  // 일괄 저장
  const handleBulkSave = async () => {
    if (!projectId) return
    const incomplete = parsedItems.some((item) => !item.title.trim())
    if (incomplete) {
      setError('모든 항목에 제목을 입력해주세요')
      return
    }
    try {
      const inserted = await insertProjectLinks(
        parsedItems.map((item) => ({
          project_id: projectId,
          url: item.url,
          title: item.title.trim(),
          link_type: item.parsed.linkType,
          channel_id: item.parsed.channelId,
          channel_name: item.slackInfo?.channelName ?? null,
          thread_date: item.parsed.threadDate,
        })),
      )
      setLinks((prev) => [...prev, ...inserted])
      setShowAddForm(false)
      setUrlInput('')
      setParsedItems([])
      setError(null)
      slackInfoCacheRef.current.clear()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  // 제목 편집 저장
  const handleEditSave = async (id: number) => {
    if (!editTitle.trim()) return
    try {
      await updateProjectLinkTitle(id, editTitle.trim())
      setLinks((prev) => prev.map((l) => l.id === id ? { ...l, title: editTitle.trim() } : l))
      setEditingId(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  // 상태 토글
  const handleToggle = async (link: ProjectLink) => {
    try {
      await toggleProjectLinkOpen(link.id, !link.is_open)
      setLinks((prev) => prev.map((l) => l.id === link.id ? { ...l, is_open: !link.is_open } : l))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  // 삭제
  const handleDelete = async (id: number) => {
    if (!confirm('이 링크를 삭제할까요?')) return
    try {
      await deleteProjectLink(id)
      setLinks((prev) => prev.filter((l) => l.id !== id))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  // 개별 링크 아이템 렌더링
  function renderLinkItem(link: ProjectLink, depth: number) {
    const style = LINK_TYPE_STYLES[link.link_type] ?? LINK_TYPE_STYLES.message
    const isEditing = editingId === link.id
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md"
        style={{
          background: link.is_open ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
          borderLeft: `3px solid ${style.borderColor}`,
          opacity: link.is_open ? 1 : 0.5,
          marginLeft: depth * 16,
          marginTop: depth > 0 ? 2 : 0,
        }}
      >
        {/* 자식 연결선 */}
        {depth > 0 && (
          <span className="text-[10px] text-gray-300 shrink-0 -ml-1 mr-0.5">└</span>
        )}

        {/* 상태 배지 */}
        <button
          type="button"
          onClick={() => handleToggle(link)}
          className="text-[9px] px-1.5 py-0.5 rounded-full text-white shrink-0 cursor-pointer"
          style={{ background: link.is_open ? '#22c55e' : '#6b7280' }}
          title={link.is_open ? '닫힘으로 변경' : '열림으로 변경'}
        >
          {link.is_open ? '열림' : '닫힘'}
        </button>

        {/* 유형 라벨 */}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
          style={{ background: style.labelBg, color: style.labelText }}
        >
          {style.icon} {style.label}
        </span>

        {/* 제목 (편집 가능) */}
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { escapingRef.current = true; setEditingId(null) } }}
            onBlur={() => { if (escapingRef.current) { escapingRef.current = false; return } handleEditSave(link.id) }}
            autoFocus
            className="flex-1 text-xs rounded px-1.5 py-0.5 text-gray-900 focus:outline-none focus:ring-1 focus:ring-pink-300"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.1)' }}
          />
        ) : (
          <span
            className={`flex-1 text-xs ${expandText ? 'break-words' : 'truncate'} ${link.is_open ? '' : 'line-through'}`}
            style={{ color: link.is_open ? '#374151' : '#9ca3af' }}
          >
            {decodeSlackText(link.title, slackIdMap)}
          </span>
        )}

        {/* 날짜 */}
        {link.thread_date && (
          <span className="text-[10px] text-gray-400 shrink-0">
            {formatDate(link.thread_date)}
          </span>
        )}

        {/* 슬랙 열기 */}
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-blue-500 hover:text-blue-700 shrink-0"
          title="슬랙에서 열기"
          onClick={(e) => e.stopPropagation()}
        >
          ↗
        </a>

        {/* 편집/삭제 메뉴 */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => { setEditingId(link.id); setEditTitle(link.title) }}
            className="text-[11px] text-gray-400 hover:text-gray-600 px-0.5"
            title="제목 수정"
          >
            ✏️
          </button>
          <button
            type="button"
            onClick={() => handleDelete(link.id)}
            className="text-[11px] text-gray-400 hover:text-red-500 px-0.5"
            title="삭제"
          >
            🗑
          </button>
        </div>
      </div>
    )
  }

  // 계층 트리 → flat 배열 (depth 정보 포함)
  const fullHierarchy = useMemo(() => buildHierarchy(links), [links])
  const flatItems = useMemo(() => flattenHierarchy(fullHierarchy), [fullHierarchy])
  const overflow = maxItems != null && flatItems.length > maxItems
  const remainCount = overflow ? flatItems.length - maxItems : 0

  // 신규 프로젝트 모드
  if (!projectId) {
    return (
      <div>
        <label className="text-xs text-gray-400 mb-1 block">💬 슬랙 링크</label>
        <p className="text-[11px] text-gray-400">프로젝트 저장 후 추가할 수 있습니다</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-400">💬 슬랙 링크</label>
        {!showAddForm && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
          >
            + 추가
          </button>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <p className="text-[11px] text-red-500 mb-1">{error}</p>
      )}

      {/* 추가 폼 (스마트 페이스트) */}
      {showAddForm && (
        <div
          className="mb-2 p-2.5 rounded-lg"
          style={{ background: 'rgba(224,30,90,0.04)', border: '1px dashed rgba(224,30,90,0.2)' }}
        >
          <textarea
            value={urlInput}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="슬랙 URL을 붙여넣으세요 (여러 줄 가능)"
            rows={2}
            className="w-full text-xs rounded-md px-2.5 py-1.5 text-gray-900 focus:outline-none focus:ring-1 focus:ring-pink-300 resize-none"
            style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.08)' }}
          />

          {/* 파싱 미리보기 */}
          {parsedItems.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <p className="text-[11px] text-gray-400">{parsedItems.length}건 감지됨</p>
              {parsedItems.map((item, i) => {
                const style = LINK_TYPE_STYLES[item.parsed.linkType]
                const info = item.slackInfo
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: style.labelBg, color: style.labelText }}
                      >
                        {style.icon} {style.label}
                      </span>
                      {info?.channelName && (
                        <span className="text-[10px] text-gray-400 shrink-0">#{info.channelName}</span>
                      )}
                      {info?.authorName && (
                        <span className="text-[10px] text-gray-500 shrink-0">{info.authorName}</span>
                      )}
                      {item.parsed.threadDate && (
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {formatDate(item.parsed.threadDate)}
                        </span>
                      )}
                    </div>
                    {fetchingUrls.has(item.url) ? (
                      <div
                        className="w-full rounded px-2 py-1 flex items-center"
                        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.08)', height: 26 }}
                      >
                        <div className="rounded-sm h-2.5 w-[70%] bg-[length:200%_100%] animate-shimmer" style={{ background: 'linear-gradient(90deg, rgba(224,30,90,0.08) 0%, rgba(224,30,90,0.18) 25%, rgba(224,30,90,0.08) 50%, rgba(224,30,90,0.18) 75%, rgba(224,30,90,0.08) 100%)', backgroundSize: '200% 100%' }} />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={decodeSlackText(item.title, slackIdMap)}
                        onChange={(e) => handleTitleChange(i, e.target.value)}
                        placeholder="제목 입력..."
                        className="w-full text-xs rounded px-2 py-1 text-gray-900 focus:outline-none focus:ring-1 focus:ring-pink-300"
                        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.08)' }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setUrlInput(''); setParsedItems([]); setError(null); slackInfoCacheRef.current.clear() }}
              className="text-[11px] px-2.5 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors"
              style={{ background: 'rgba(255,255,255,0.65)' }}
            >
              취소
            </button>
            {parsedItems.length > 0 && (
              <button
                type="button"
                onClick={handleBulkSave}
                className="text-[11px] px-2.5 py-1 rounded text-white transition-colors"
                style={{ background: '#e01e5a' }}
              >
                {parsedItems.length}건 저장
              </button>
            )}
          </div>
        </div>
      )}

      {/* 링크 목록 */}
      {loading ? (
        <p className="text-[11px] text-gray-400">로딩 중...</p>
      ) : links.length === 0 && !showAddForm ? (
        <p className="text-[11px] text-gray-400">등록된 링크가 없습니다</p>
      ) : (
        <div className="space-y-1">
          {(overflow ? flatItems.slice(0, maxItems) : flatItems).map(({ link, depth }) => (
            <div key={link.id}>
              {renderLinkItem(link, depth)}
            </div>
          ))}
          {overflow && onOverflowClick && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onOverflowClick}
                className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
              >
                {remainCount}개 더보기 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
