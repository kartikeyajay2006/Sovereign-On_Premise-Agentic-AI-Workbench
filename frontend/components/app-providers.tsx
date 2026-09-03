'use client'

import type { ReactNode } from 'react'
import { RoleProvider } from './role-context'
import { ToastProvider } from './toast'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <RoleProvider>
      <ToastProvider>{children}</ToastProvider>
    </RoleProvider>
  )
}
