export type SlackLinkType = 'channel' | 'message' | 'reply'

export interface ParsedSlackUrl {
  workspace: string
  channelId: string
  linkType: SlackLinkType
  threadDate: string | null // YYYY-MM-DD
}

const SLACK_URL_REGEX = /^https:\/\/([^.]+)\.slack\.com\/archives\/([A-Z0-9]+)(?:\/p(\d+))?/

/**
 * 슬랙 URL을 파싱하여 워크스페이스, 채널 ID, 링크 유형, 날짜를 추출한다.
 * 유효하지 않은 URL이면 null 반환.
 */
export function parseSlackUrl(url: string): ParsedSlackUrl | null {
  const trimmed = url.trim()
  const match = trimmed.match(SLACK_URL_REGEX)
  if (!match) return null

  const [, workspace, channelId, messageTs] = match

  let threadTs: string | null = null
  try {
    threadTs = new URL(trimmed).searchParams.get('thread_ts')
  } catch {
    // URL 파싱 실패 시 thread_ts 없는 것으로 처리
  }

  const linkType: SlackLinkType = threadTs ? 'reply' : messageTs ? 'message' : 'channel'

  const unixTs = threadTs
    ? Math.floor(parseFloat(threadTs))
    : messageTs
      ? Number(messageTs.slice(0, 10))
      : null

  const threadDate = unixTs
    ? new Date(unixTs * 1000).toISOString().slice(0, 10)
    : null

  return { workspace, channelId, linkType, threadDate }
}

/**
 * 텍스트에서 여러 슬랙 URL을 추출하여 파싱한다.
 * 줄바꿈, 공백, 쉼표로 구분된 URL을 지원.
 */
export function parseMultipleSlackUrls(text: string): { url: string; parsed: ParsedSlackUrl }[] {
  const urls = text
    .split(/[\n\r,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('https://'))

  const results: { url: string; parsed: ParsedSlackUrl }[] = []
  for (const url of urls) {
    const parsed = parseSlackUrl(url)
    if (parsed) {
      results.push({ url, parsed })
    }
  }
  return results
}

/** 슬랙 URL인지 간단 검증 */
export function isSlackUrl(url: string): boolean {
  return SLACK_URL_REGEX.test(url.trim())
}

export interface SlackMessageInfo {
  text: string | null
  channelName: string | null
  authorName: string | null
  createdAt: string | null // ISO datetime
}

/**
 * 원본 URL에서 API 호출에 필요한 ts를 추출한다.
 * - ts: conversations.replies의 기준 (thread_ts 또는 메시지 ts)
 * - replyTs: reply URL일 때 특정 reply의 ts (해당 reply 텍스트를 가져오기 위해)
 */
export function extractSlackTs(url: string): { ts: string; replyTs: string | null } | null {
  const trimmed = url.trim()
  const threadTs = extractThreadTs(trimmed)

  // p{timestamp} → Slack ts 형식
  const match = trimmed.match(/\/p(\d{10})(\d+)/)
  const messageTs = match ? `${match[1]}.${match[2]}` : null

  if (threadTs) {
    return { ts: threadTs, replyTs: messageTs }
  }

  if (messageTs) {
    return { ts: messageTs, replyTs: null }
  }

  return null
}

/**
 * API Route를 통해 슬랙 메시지 상세 정보를 가져온다.
 * 반환: { text, channelName, authorName, createdAt }
 */
export async function fetchSlackInfo(
  channelId: string,
  ts?: string | null,
  replyTs?: string | null,
): Promise<SlackMessageInfo | null> {
  try {
    let url = `/api/slack?channel=${channelId}`
    if (ts) url += `&ts=${ts}`
    if (replyTs) url += `&replyTs=${replyTs}`
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Slack mrkdwn 기본 엔티티 디코딩 + 멤버 멘션 치환 */
export function decodeSlackText(
  text: string,
  slackIdToName?: Map<string, string>,
): string {
  let decoded = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  // <@UserId> → @이름
  if (slackIdToName) {
    decoded = decoded.replace(/<@([A-Z0-9]+)>/g, (_: string, uid: string) =>
      `@${slackIdToName.get(uid) ?? uid}`,
    )
  }
  return decoded
}

/** members 배열에서 slack_id → name_short 맵을 생성 */
export function buildSlackIdMap(
  members: { slack_id: string | null; name_short: string }[],
): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of members) {
    if (m.slack_id && m.slack_id !== '—') {
      map.set(m.slack_id, m.name_short)
    }
  }
  return map
}

/**
 * URL에서 메시지 자체의 ts를 추출한다 (p{timestamp} 부분).
 * reply/message 모두 이 ts로 해당 메시지를 식별할 수 있다.
 */
export function extractMessageTs(url: string): string | null {
  const match = url.trim().match(/\/p(\d{10})(\d+)/)
  return match ? `${match[1]}.${match[2]}` : null
}

/**
 * Reply URL에서 thread_ts (부모 메시지의 ts)를 추출한다.
 * Reply가 아니면 null.
 */
export function extractThreadTs(url: string): string | null {
  try {
    return new URL(url.trim()).searchParams.get('thread_ts')
  } catch {
    return null
  }
}
