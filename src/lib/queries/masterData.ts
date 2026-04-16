import { supabase } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Brand, Member, KeywordHighlight } from '@/lib/types/database'
import type { ProjectRole } from '@/lib/types/role'

/**
 * 브랜드 목록 조회 (sort_order 순).
 * 서버 컴포넌트에서는 client를 주입, 클라이언트에서는 생략.
 */
export async function fetchBrands(client?: SupabaseClient): Promise<Brand[]> {
  const db = client ?? supabase
  const { data, error } = await db
    .from('brands')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`브랜드 조회 실패: ${error.message}`)
  return data ?? []
}

/**
 * 멤버 목록 조회.
 * activeOnly=true(기본): 활성 멤버만. false: 전체 멤버.
 */
export async function fetchMembers(client?: SupabaseClient, activeOnly = true): Promise<Member[]> {
  const db = client ?? supabase
  let query = db.from('members').select('*')
  if (activeOnly) query = query.eq('active', true)
  if (!activeOnly) query = query.order('active', { ascending: false })
  query = query.order('name_short', { ascending: true })
  const { data, error } = await query
  if (error) throw new Error(`멤버 조회 실패: ${error.message}`)
  return data ?? []
}

/**
 * 키워드 강조 목록 조회 (sort_order 순).
 */
export async function fetchKeywordHighlights(client?: SupabaseClient): Promise<KeywordHighlight[]> {
  const db = client ?? supabase
  const { data, error } = await db
    .from('keyword_highlights')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`키워드 강조 조회 실패: ${error.message}`)
  return data ?? []
}

/**
 * 프로젝트 역할 목록 조회 (sort_order 순).
 * activeOnly=true(기본): 활성 role만. false: 전체.
 */
export async function fetchRoles(client?: SupabaseClient, activeOnly = true): Promise<ProjectRole[]> {
  const db = client ?? supabase
  let query = db.from('project_roles').select('*')
  if (activeOnly) query = query.eq('is_active', true)
  query = query.order('sort_order', { ascending: true })
  const { data, error } = await query
  if (error) throw new Error(`역할 조회 실패: ${error.message}`)
  return data ?? []
}
