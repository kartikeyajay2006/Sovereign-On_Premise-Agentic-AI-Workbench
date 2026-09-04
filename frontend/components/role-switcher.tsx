'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, LogOut } from 'lucide-react'
import { ROLES } from '@/lib/presentation'
import { useRole } from './role-context'
import { cn } from '@/lib/utils'

export function RoleSwitcher() {
  const { role, setRole, user, logout } = useRole()
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

  const displayName = user?.display_name || role.label
  // Never show an invented persona in place of a real identity: this chip
  // names whoever is about to approve or submit work.
  const subName = user?.username || 'not signed in'

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex items-center gap-2.5 border border-border bg-surface py-1.5 pl-2.5 pr-2 transition-colors hover:border-border-strong"
      >
        <span className="flex h-6 w-6 items-center justify-center bg-foreground font-mono text-[10px] text-primary-foreground">
          {displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="text-[12px] font-medium text-foreground">{displayName}</span>
          <span className="mt-0.5 font-mono text-[10px] text-foreground-muted">{subName}</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-foreground-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-[90] w-80 border border-border bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.14)] animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="border-b border-border px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground-muted">
              Role & Demonstration Persona
            </span>
          </div>
          <div className="divide-y divide-border">
            {switchError && (
              <p className="border-b border-border bg-surface px-3 py-2 text-[12px] leading-relaxed text-critical">
                {switchError}
              </p>
            )}
            {ROLES.map((r) => (
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
                  'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-sunken',
                  r.id === role.id && 'bg-surface-sunken',
                )}
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  {r.id === role.id && <Check className="h-3.5 w-3.5 text-foreground" />}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-foreground">{r.label}</span>
                  <span className="text-[12px] leading-snug text-foreground-secondary">{r.description}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={() => {
                logout()
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-foreground-muted transition-colors hover:bg-surface-sunken hover:text-[var(--critical)]"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
