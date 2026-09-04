'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { api, setAuthToken } from '@/lib/api'
import { ROLES } from '@/lib/presentation'
import type { Role, RoleId, User } from '@/lib/types'

interface RoleContextValue {
  user: User | null
  role: Role
  loading: boolean
  authenticated: boolean
  setRole: (id: RoleId) => Promise<void>
  login: (username: string, password?: string) => Promise<void>
  logout: () => Promise<void>
  can: (capabilityOrPermission: string) => boolean
}

const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({ children }: { children: ReactNode }) {
  const [roleId, setRoleId] = useState<RoleId>('engineer')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const role = ROLES.find((r) => r.id === roleId) ?? ROLES[0]

  const refreshUser = useCallback(async () => {
    // Ask regardless of what is in storage.
    //
    // The session also lives in an HttpOnly cookie, which survives a browser
    // restart when sessionStorage does not. Checking only storage meant the
    // API happily served an authenticated user while the interface showed
    // them as signed out — including on the chip that names whoever is about
    // to approve something.
    try {
      const current = await api.me()
      setUser(current)
      const mappedRole = ROLES.find((r) => r.id === current.role)
      if (mappedRole) {
        setRoleId(mappedRole.id)
      }
    } catch {
      // If session invalid, clear token
      setAuthToken(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = async (username: string, password: string = 'workbench') => {
    setLoading(true)
    try {
      const session = await api.login(username, password)
      setUser(session.user)
      const mapped = ROLES.find((r) => r.id === session.user.role)
      if (mapped) {
        setRoleId(mapped.id)
      }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await api.logout()
    setUser(null)
  }

  const setRoleAndSwitch = async (id: RoleId) => {
    // The label follows the server, it never leads it.
    //
    // Setting the role locally and then swallowing a failed sign-in left the
    // interface showing a reviewer's screens while the server still saw an
    // engineer: approving then failed with a bare permission error and no
    // explanation of why. The role only changes if the sign-in succeeded.
    setLoading(true)
    try {
      await login(id, 'workbench')
      setRoleId(id)
    } catch (err: any) {
      throw new Error(
        err?.detail ||
          `Could not sign in as '${id}'. That account may not exist on this ` +
            `host, or it does not use the default password.`
      )
    } finally {
      setLoading(false)
    }
  }

  const can = (capabilityOrPermission: string): boolean => {
    if (user && user.permissions) {
      if (user.permissions.includes(capabilityOrPermission)) return true
      if (user.permissions.includes('task.read.all') && capabilityOrPermission === 'Read all tasks') return true
      if (user.permissions.includes('approval.decide') && capabilityOrPermission === 'Release deliverables') return true
      if (user.permissions.includes('system.admin') && capabilityOrPermission === 'Manage policies') return true
    }
    return role.capabilities.includes(capabilityOrPermission)
  }

  const value: RoleContextValue = {
    user,
    role,
    loading,
    authenticated: Boolean(user),
    setRole: setRoleAndSwitch,
    login,
    logout,
    can,
  }

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole must be used within RoleProvider')
  return ctx
}
