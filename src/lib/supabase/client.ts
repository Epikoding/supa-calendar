import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'

const globalForSupabase = globalThis as unknown as {
  supabase: ReturnType<typeof createBrowserClient<Database>> | undefined
}

export const supabase = globalForSupabase.supabase ??= createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
