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

const DEFAULT_DEMO_USER: User = {
  id: 'usr_engineer_01',
  username: 'engineer',
  display_name: 'S. Ramanathan',
  role: 'engineer',
  department: 'Asset Integrity Engineering',
  active: true,
  permissions: ['task.read.all', 'task.create', 'evidence.inspect', 'sandbox.execute'],
  max_data_classification: 'confidential',
}

const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({ children }: { children: ReactNode }) {
  const [roleId, setRoleId] = useState<RoleId>('engineer')
  const [user, setUser] = useState<User | null>(DEFAULT_DEMO_USER)
  const [loading, setLoading] = useState(false)

  const role = ROLES.find((r) => r.id === roleId) ?? ROLES[0]

  const refreshUser = useCallback(async () => {
    try {
      const current = await api.me()
      setUser(current)
      const mappedRole = ROLES.find((r) => r.id === current.role)
      if (mappedRole) {
        setRoleId(mappedRole.id)
      }
    } catch {
      // If no server session, maintain default demo user so workbench is immediately accessible
      setUser((prev) => prev || DEFAULT_DEMO_USER)
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
    } catch {
      // Fallback for preview/offline mode
      const mapped = ROLES.find((r) => r.id === username) || ROLES[0]
      setRoleId(mapped.id)
      setUser({
        id: `usr_${mapped.id}_01`,
        username: mapped.id,
        display_name: mapped.persona,
        role: mapped.id,
        department:
          mapped.id === 'reviewer'
            ? 'Regulatory Compliance & Quality Assurance'
            : mapped.id === 'admin'
            ? 'Host Infrastructure & Security Operations'
            : 'Asset Integrity Engineering',
        active: true,
        permissions: mapped.capabilities,
        max_data_classification: mapped.id === 'admin' ? 'restricted' : 'confidential',
      })
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      // ignore offline logout
    }
    setUser(null)
  }

  const setRoleAndSwitch = async (id: RoleId) => {
    setLoading(true)
    try {
      await login(id, 'workbench')
      setRoleId(id)
    } catch {
      const mapped = ROLES.find((r) => r.id === id)
      if (mapped) {
        setRoleId(mapped.id)
        setUser({
          id: `usr_${mapped.id}_01`,
          username: mapped.id,
          display_name: mapped.persona,
          role: mapped.id,
          department:
            mapped.id === 'reviewer'
              ? 'Regulatory Compliance & Quality Assurance'
              : mapped.id === 'admin'
              ? 'Host Infrastructure & Security Operations'
              : 'Asset Integrity Engineering',
          active: true,
          permissions: mapped.capabilities,
          max_data_classification: mapped.id === 'admin' ? 'restricted' : 'confidential',
        })
      }
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
