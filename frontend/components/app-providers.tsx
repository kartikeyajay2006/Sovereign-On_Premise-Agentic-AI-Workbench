'use client'

import type { ReactNode } from 'react'
import { RoleProvider } from './role-context'
import { ToastProvider } from './toast'
import { SovereignCursor } from './sovereign-cursor'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <RoleProvider>
      <ToastProvider>
        <SovereignCursor />
        {children}
      </ToastProvider>
    </RoleProvider>
  )
}

