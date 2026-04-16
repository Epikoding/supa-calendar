import CalendarView from '@/components/calendar/CalendarView'

export default function CalendarPage() {
  const now = new Date()
  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      <CalendarView initialYear={now.getFullYear()} initialMonth={now.getMonth() + 1} />
    </div>
  )
}
