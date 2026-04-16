import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { SlackMessageInfo } from '@/lib/utils/slack'

const SLACK_TOKEN = process.env.SLACK_USER_TOKEN
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

/**
 * Slack API 프록시 — 메시지/쓰레드의 상세 정보를 가져온다.
 * GET /api/slack?channel={channelId}&ts={threadTs}&replyTs={replyTs}
 *
 * - ts: conversations.replies의 기준 ts (thread 시작 또는 메시지 자체)
 * - replyTs (optional): reply URL일 때 특정 reply의 ts. 이 값이 있으면 해당 reply의 텍스트를 반환.
 *
 * 반환: { text, channelName, authorName, createdAt }
 */
export async function GET(req: NextRequest) {
  if (!SLACK_TOKEN) {
    return NextResponse.json({ error: 'SLACK_USER_TOKEN not configured' }, { status: 500 })
  }

  const channel = req.nextUrl.searchParams.get('channel')
  const ts = req.nextUrl.searchParams.get('ts')
  const replyTs = req.nextUrl.searchParams.get('replyTs')

  if (!channel) {
    return NextResponse.json({ error: 'channel is required' }, { status: 400 })
  }

  const headers = { Authorization: `Bearer ${SLACK_TOKEN}` }

  const result: SlackMessageInfo = {
    text: null,
    channelName: null,
    authorName: null,
    createdAt: null,
  }

  // 채널 링크 (ts 없음) → conversations.info 1건만
  if (!ts) {
    const channelRes = await fetch(
      `https://slack.com/api/conversations.info?channel=${channel}`,
      { headers },
    )
    const channelData = await channelRes.json()
    if (channelData.ok) {
      const ch = channelData.channel
      result.channelName = ch?.name ?? null
      result.createdAt = ch?.created
        ? new Date(ch.created * 1000).toISOString()
        : null
      result.text = ch?.purpose?.value || ch?.topic?.value || null
    }
    return NextResponse.json(result)
  }

  // 메시지/Reply → conversations.replies 1건만
  const repliesUrl = replyTs
    ? `https://slack.com/api/conversations.replies?channel=${channel}&ts=${ts}&oldest=${replyTs}&latest=${replyTs}&inclusive=true&limit=1`
    : `https://slack.com/api/conversations.replies?channel=${channel}&ts=${ts}&limit=1`

  const repliesRes = await fetch(repliesUrl, { headers })
  const repliesData = await repliesRes.json()

  const messages = repliesData.ok ? repliesData.messages : null
  const targetMessage = replyTs && messages?.length > 1
    ? messages[messages.length - 1]
    : messages?.[0]

  if (targetMessage) {
    let text = targetMessage.text ?? ''

    // 텍스트 내 <@UserId> 치환: DB 캐시 → 미스만 Slack API → DB에 저장
    const userIds = [...new Set([...text.matchAll(/<@([A-Z0-9]+)>/g)].map(m => m[1]))]
    if (userIds.length > 0) {
      // 1. DB 캐시에서 조회
      const { data: cached } = await supabaseAdmin
        .from('slack_users')
        .select('slack_id, name')
        .in('slack_id', userIds)
      const nameMap = new Map<string, string>()
      for (const row of cached ?? []) {
        nameMap.set(row.slack_id, row.name)
      }

      // 2. DB에 없는 유저만 Slack API 조회 + DB 저장
      const uncached = userIds.filter((uid) => !nameMap.has(uid))
      if (uncached.length > 0) {
        const newUsers: { slack_id: string; name: string }[] = []
        await Promise.all(
          uncached.map(async (uid) => {
            try {
              const res = await fetch(`https://slack.com/api/users.info?user=${uid}`, { headers })
              const data = await res.json()
              if (data.ok) {
                const name = data.user?.profile?.display_name || data.user?.real_name || uid
                nameMap.set(uid, name)
                newUsers.push({ slack_id: uid, name })
              }
            } catch { /* ignore */ }
          }),
        )
        if (newUsers.length > 0) {
          await supabaseAdmin.from('slack_users').upsert(newUsers, { onConflict: 'slack_id' })
        }
      }

      text = text.replace(/<@([A-Z0-9]+)>/g, (_: string, uid: string) =>
        `@${nameMap.get(uid) ?? uid}`,
      )
    }

    result.text = text
    result.createdAt = targetMessage.ts
      ? new Date(parseFloat(targetMessage.ts) * 1000).toISOString()
      : null
    result.authorName = targetMessage.user ?? null
  }

  return NextResponse.json(result)
}
