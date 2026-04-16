import GanttChart from '@/components/gantt/GanttChart'

export default function GanttPage() {
  const now = new Date()
  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      <GanttChart initialYear={now.getFullYear()} initialMonth={now.getMonth() + 1} />
    </div>
  )
}
