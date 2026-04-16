'use client'

import { PresenceProvider } from '@/hooks/usePresence'
import { RolesProvider } from '@/hooks/useRoles'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <RolesProvider>
      <PresenceProvider>
        {children}
      </PresenceProvider>
    </RolesProvider>
  )
}
