import { Suspense } from 'react'
import ProjectTree from '@/components/projects/ProjectTree'

export default function ProjectsPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      <Suspense>
        <ProjectTree />
      </Suspense>
    </div>
  )
}
