import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchBrands, fetchMembers, fetchKeywordHighlights } from '@/lib/queries/masterData'
import SettingsPanel from '@/components/settings/SettingsPanel'

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient()
  const [brands, members, keywords] = await Promise.all([
    fetchBrands(supabase).catch(() => undefined),
    fetchMembers(supabase, false).catch(() => undefined),
    fetchKeywordHighlights(supabase).catch(() => undefined),
  ])

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      <SettingsPanel
        initialBrands={brands}
        initialMembers={members}
        initialKeywords={keywords}
      />
    </div>
  )
}
