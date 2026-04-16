import WorkloadView from '@/components/workload/WorkloadView'

export default function WorkloadPage() {
  const now = new Date()
  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      <WorkloadView initialYear={now.getFullYear()} initialMonth={now.getMonth() + 1} />
    </div>
  )
}
