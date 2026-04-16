import { useMemo } from 'react'
import type { KeywordHighlight } from '@/lib/types/database'
import type { KeywordMatcher } from '@/lib/types/calendar'

export function useKeywordMatchers(keywordHighlights: KeywordHighlight[]): KeywordMatcher[] {
  return useMemo<KeywordMatcher[]>(() => {
    return keywordHighlights.map((kw) => {
      if (!kw.keyword?.trim()) return null
      try {
        return {
          regex: kw.is_regex ? new RegExp(kw.keyword) : new RegExp(kw.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
          color: kw.color,
          showHeaderDot: kw.show_header_dot,
        }
      } catch {
        return null
      }
    }).filter((m): m is NonNullable<typeof m> => m !== null)
  }, [keywordHighlights])
}
