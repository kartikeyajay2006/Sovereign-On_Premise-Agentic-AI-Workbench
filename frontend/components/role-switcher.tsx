'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Loader2, LogOut } from 'lucide-react'
import { ROLES } from '@/lib/presentation'
import type { RoleId } from '@/lib/types'
import { useRole } from './role-context'
import { cn } from '@/lib/utils'

/**
 * The signed-in account, and the demo role switch.
 *
 * Removed from the panel: an "AIR-GAPPED" badge in sovereign green and a
 * "127.0.0.1" server chip. A browser cannot detect an air gap, and the sign-in
 * screen had already retired that claim for exactly that reason; the account
 * menu was still making it on every screen. The green "online" dot on the
 * avatar went with them. It was drawn unconditionally, so it reported
 * nothing.
 *
 * What stays is what the session actually reports: the display name, the
 * username, the department and the clearance ceiling the server assigned.
 */
export function RoleSwitcher() {
  const { role, setRole, user, logout } = useRole()
  const router = useRouter()
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [switching, setSwitching] = useState<RoleId | null>(null)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Identity is shown only as far as the session actually reports it. An
  // absent clearance reads as absent, not as a plausible default.
  const displayName = user?.display_name || role.label
  const username = user?.username || role.id
  const clearance = user?.max_data_classification ?? null
  const department = user?.department ?? null

  const switchTo = async (id: RoleId) => {
    setSwitchError(null)
    setSwitching(id)
    try {
      await setRole(id)
      setOpen(false)
    } catch (err: any) {
      setSwitchError(err?.message ?? 'Could not switch account.')
    } finally {
      setSwitching(null)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account: ${displayName}, ${role.label}`}
        className="hover-decay group flex h-9 items-center gap-2 rounded-[var(--radius)] px-2 hover:bg-surface-sunken focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-surface-sunken font-mono text-ui text-foreground shadow-[0_0_0_1px_var(--control-subtle)]"
        >
          {displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden min-w-0 flex-col items-start text-left sm:flex">
          <span className="max-w-[160px] truncate text-ui font-medium text-foreground">{displayName}</span>
          <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
            {role.label}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 text-foreground-muted transition-transform duration-[var(--micro)] ease-[var(--ease-micro)] motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+8px)] z-[var(--z-menu)] w-80 max-w-[calc(100vw-32px)] overflow-hidden rounded-[var(--radius-md-token)] bg-surface shadow-[var(--elev-2)] animate-in slide-in-from-top-1 duration-[var(--standard)] ease-[var(--ease-standard)] motion-reduce:animate-none"
        >
          <div className="border-b border-line-subtle px-4 py-3">
            <p className="truncate text-body font-medium text-foreground">{displayName}</p>
            <p className="mt-0.5 truncate font-mono text-ui text-foreground-muted">
              @{username}
              {department ? ` · ${department}` : ''}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
              Clearance
              <span className="text-foreground">{clearance ?? 'not reported'}</span>
            </p>
          </div>

          <div className="px-4 pb-1 pt-3">
            <p className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
              Switch demo account
            </p>
          </div>

          {switchError && (
            <p role="alert" className="mx-2 mb-1 rounded-[var(--radius-xs)] bg-critical-surface px-2 py-2 text-ui text-critical-text">
              {switchError}
            </p>
          )}

          <ul className="px-1 pb-1">
            {ROLES.map((r) => {
              const isSelected = r.id === role.id
              const busy = switching === r.id
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isSelected}
                    disabled={switching !== null}
                    onClick={() => (isSelected ? setOpen(false) : void switchTo(r.id))}
                    className={cn(
                      'hover-decay flex w-full items-start gap-3 rounded-[var(--radius-menu-row)] px-3 py-2 text-left',
                      'focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-[var(--opacity-disabled)]',
                      isSelected ? 'bg-[var(--selected-surface)]' : 'hover:bg-surface-sunken',
                    )}
                  >
                    <span aria-hidden className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground-muted motion-reduce:animate-none" />
                      ) : isSelected ? (
                        <Check className="h-3.5 w-3.5 text-foreground" />
                      ) : null}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-ui font-medium text-foreground">{r.label}</span>
                      <span className="text-ui text-foreground-secondary">{r.description}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="border-t border-line-subtle p-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                void logout().finally(() => router.push('/sign-in'))
              }}
              className="hover-decay flex w-full items-center gap-2 rounded-[var(--radius-menu-row)] px-3 py-2 text-ui text-foreground-secondary hover:bg-surface-sunken hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
