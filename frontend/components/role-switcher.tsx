'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, LogOut, Shield, User as UserIcon, Server, Lock } from 'lucide-react'
import { ROLES } from '@/lib/presentation'
import { useRole } from './role-context'
import { cn } from '@/lib/utils'

export function RoleSwitcher() {
  const { role, setRole, user, logout } = useRole()
  const router = useRouter()
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const displayName = user?.display_name || role.persona || 'S. Ramanathan'
  const roleLabel = role.label || 'Integrity Engineer'
  const username = user?.username || role.id || 'engineer'
  const classification = user?.max_data_classification?.toUpperCase() || 'CONFIDENTIAL'
  const department = user?.department || 'Asset Integrity Engineering'

  return (
    <div ref={wrapRef} className="relative">
      {/* Logged in Account Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Logged in account profile menu"
        className="group flex items-center gap-2.5 rounded-lg border border-border/80 bg-surface/90 py-1.5 pl-2 pr-2.5 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-foreground hover:shadow"
      >
        {/* Avatar with Live Online Status Indicator */}
        <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground font-mono text-[11px] font-bold text-primary-foreground shadow-sm">
          {displayName.slice(0, 1).toUpperCase()}
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-surface bg-[var(--sovereign)]" />
        </div>

        {/* Account Name & Role Badge */}
        <div className="flex flex-col items-start text-left leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-foreground max-w-[130px] truncate sm:max-w-[170px]">
              {displayName}
            </span>
          </div>
          <span className="font-mono text-[9px] font-medium uppercase tracking-wider text-foreground-muted">
            {roleLabel}
          </span>
        </div>

        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-foreground-muted transition-transform duration-200 group-hover:text-foreground',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* Account Profile & Role Switcher Popover */}
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-[90] w-84 rounded-xl border border-border/90 bg-surface p-1 shadow-[0_20px_50px_rgba(0,0,0,0.12)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 sm:w-96">
          {/* Header: User Profile Card */}
          <div className="rounded-lg border border-border/60 bg-surface-sunken/60 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground font-mono text-sm font-bold text-primary-foreground shadow-sm">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-bold text-foreground">{displayName}</span>
                  <span className="font-mono text-[11px] text-foreground-muted">@{username}</span>
                  <span className="mt-0.5 text-[11px] text-foreground-secondary">{department}</span>
                </div>
              </div>
            </div>

            {/* Security Posture / Clearance Badges */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
              <span className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-foreground">
                <Lock className="h-2.5 w-2.5 text-[var(--sovereign)]" />
                {classification}
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-foreground-muted">
                <Server className="h-2.5 w-2.5 text-foreground-muted" />
                127.0.0.1
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-[var(--sovereign)]/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--sovereign)]">
                ● AIR-GAPPED
              </span>
            </div>
          </div>

          {/* Demonstration Role Switcher Section */}
          <div className="px-3 pt-3 pb-1">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-foreground-muted">
              Demonstration Personas & Roles
            </span>
          </div>

          <div className="space-y-0.5 p-1">
            {switchError && (
              <p className="rounded-md border border-critical/30 bg-critical/10 p-2 text-[11px] leading-snug text-critical">
                {switchError}
              </p>
            )}
            {ROLES.map((r) => {
              const isSelected = r.id === role.id
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRole(r.id).catch((err: any) => {
                      setSwitchError(err?.message ?? 'Could not switch account')
                    })
                    setOpen(false)
                  }}
                  className={cn(
                    'group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150',
                    isSelected
                      ? 'bg-surface-sunken border border-border-strong'
                      : 'hover:bg-surface-sunken/70 hover:border-transparent'
                  )}
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 text-foreground font-bold" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-border-strong group-hover:bg-foreground" />
                    )}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-foreground">{r.label}</span>
                      <span className="font-mono text-[10px] text-foreground-muted">({r.persona})</span>
                    </div>
                    <span className="text-[11px] leading-snug text-foreground-secondary">
                      {r.description}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer: Sign Out Action */}
          <div className="border-t border-border/80 p-1.5 mt-1">
            <button
              type="button"
              onClick={() => {
                logout()
                setOpen(false)
                router.push('/sign-in')
              }}
              className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-foreground-muted transition-colors hover:bg-critical/10 hover:text-critical"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out of workbench
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

