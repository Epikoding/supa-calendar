import { useCallback } from 'react'
import { getPrevMonth, getNextMonth } from '@/lib/utils/calendar'

export function useMonthNavigation(
  year: number,
  month: number,
  onChange: (year: number, month: number) => void,
  onToday?: () => void,
) {
  const goToPrevMonth = useCallback(() => {
    const prev = getPrevMonth(year, month)
    onChange(prev.year, prev.month)
  }, [year, month, onChange])

  const goToNextMonth = useCallback(() => {
    const next = getNextMonth(year, month)
    onChange(next.year, next.month)
  }, [year, month, onChange])

  const goToToday = useCallback(() => {
    const now = new Date()
    onChange(now.getFullYear(), now.getMonth() + 1)
    onToday?.()
  }, [onChange, onToday])

  return { goToPrevMonth, goToNextMonth, goToToday }
}
