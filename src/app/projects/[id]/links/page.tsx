'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import SlackLinksSection from '@/components/calendar/SlackLinksSection'

export default function ProjectLinksPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = Number(params.id)
  const [projectName, setProjectName] = useState<string>('')

  useEffect(() => {
    if (!projectId) return
    supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single()
      .then(({ data }) => {
        if (data) setProjectName(data.name)
      })
  }, [projectId])

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      <div className="max-w-2xl mx-auto w-full px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← 뒤로
          </button>
          <h1 className="text-lg font-semibold text-gray-800">
            {projectName || '...'} — 슬랙 링크
          </h1>
        </div>

        {/* 슬랙 링크 전체 목록 */}
        <div
          className="rounded-xl p-4"
          style={{
            background: 'rgba(255,255,255,0.4)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.3)',
          }}
        >
          <SlackLinksSection projectId={projectId} expandText />
        </div>
      </div>
    </div>
  )
}
