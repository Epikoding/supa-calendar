import { NextResponse } from 'next/server'

/**
 * Keepalive endpoint — GET /api/keepalive
 *
 * Vercel Cron이 매일 호출하여 Supabase DB에 가벼운 SELECT을 발생시킨다.
 * Supabase 무료 플랜의 7일 무활동 자동 paused를 방지하는 목적.
 *
 * 배경: GitHub Actions이 사용자 계정 단위로 비활성화된 상태라 .github/workflows/supabase-keepalive.yml
 * 대신 본 라우트가 주(primary) keepalive 경로. GitHub Actions가 재활성화되면 워크플로가 백업으로 동작.
 *
 * 검증: HTTP 200 + JSON 응답 (rows 필드 포함).
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: 'Supabase env vars missing' },
      { status: 500 }
    )
  }

  try {
    const res = await fetch(`${url}/rest/v1/brands?select=code&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, status: res.status, statusText: res.statusText },
        { status: 500 }
      )
    }

    const data = await res.json()
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      rows: Array.isArray(data) ? data.length : 0,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 }
    )
  }
}
