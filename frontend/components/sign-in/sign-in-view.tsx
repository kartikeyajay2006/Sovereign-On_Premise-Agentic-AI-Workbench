'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, AlertCircle, Loader2 } from 'lucide-react'
import { ROLES } from '@/lib/presentation'
import { api } from '@/lib/api'
import type { DirectoryUser, RoleId } from '@/lib/types'
import { SovButton } from '@/components/sov-button'
import { TechnicalLabel } from '@/components/primitives'
import { AnimatedTechnicalBackground } from '@/components/animated-technical-background'
import { useRole } from '@/components/role-context'
import { cn } from '@/lib/utils'

export function SignInView() {
  // Read from the host rather than stated. These three figures are the
  // platform's central claim, so they must be a measurement even here, before
  // anyone has signed in.
  const [hostStatus, setHostStatus] = useState<any>(null)

  useEffect(() => {
    fetch('/api/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setHostStatus)
      .catch(() => setHostStatus(null))
  }, [])

  const router = useRouter()
  const { login } = useRole()
  const [persona, setPersona] = useState<RoleId>('engineer')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [directory, setDirectory] = useState<DirectoryUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const active = ROLES.find((r) => r.id === persona) ?? ROLES[0]

  useEffect(() => {
    api.directory().then(setDirectory).catch(() => {})
  }, [])

  const signIn = async () => {
    setError(null)
    setLoading(true)
    const targetUser = username.trim() || persona
    const targetPass = password || 'workbench'

    try {
      await login(targetUser, targetPass)
      router.push('/')
    } catch (err: any) {
      setError(err.detail || err.message || 'Authentication failed. Default password is "workbench".')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      {/* Left — editorial / brand */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface p-10 lg:flex lg:p-14">
        <AnimatedTechnicalBackground className="opacity-60" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-foreground">
            <span className="h-2.5 w-2.5 rounded-[1px] border border-primary-foreground" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">Sovereign</span>
            <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.32em] text-foreground-muted">Workbench</span>
          </span>
        </div>

        <div className="relative flex flex-col gap-6">
          <TechnicalLabel dot="var(--sovereign)">On-premise · air-gapped</TechnicalLabel>
          <h1 className="text-balance text-5xl font-medium leading-[0.98] tracking-[-0.03em] text-foreground xl:text-6xl">
            Your intelligence.
            <br />
            Your infrastructure.
          </h1>
          <p className="max-w-sm text-[15px] leading-relaxed text-foreground-secondary">
            Authenticate against the local host. Sessions, models and audit records remain entirely on-premise.
          </p>
        </div>

        <div className="relative grid grid-cols-2 gap-px border border-border bg-border">
          {[
            ['Host', hostStatus ? 'this machine' : 'checking…'],
            ['External', hostStatus ? String(hostStatus.external_calls) : '—'],
            ['Contained', hostStatus ? (hostStatus.sovereign ? 'yes' : 'NO') : '—'],
            ['Monitoring', hostStatus?.monitor_active ? 'active' : '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 bg-surface px-4 py-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground-muted">{k}</span>
              <span className="font-mono text-[13px] text-foreground">{v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Right — auth */}
      <section className="flex flex-col justify-center bg-background px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto flex w-full max-w-md flex-col gap-8">
          <div className="flex flex-col gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground-muted lg:hidden">
              Sovereign Workbench
            </span>
            <h2 className="text-2xl font-medium tracking-[-0.02em] text-foreground">Sign in</h2>
            <p className="text-[14px] leading-relaxed text-foreground-secondary">
              Sign in with a local account, or pick a role below to try what it can do.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 border border-[var(--critical)] bg-surface p-3 text-[13px] text-[var(--critical)]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={active.id}
                autoComplete="username"
                className="border border-border-strong bg-surface px-3.5 py-3 text-[14px] text-foreground placeholder:text-foreground-muted focus:border-foreground focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) signIn()
                }}
                placeholder="Default: workbench"
                autoComplete="current-password"
                className="border border-border-strong bg-surface px-3.5 py-3 text-[14px] text-foreground placeholder:text-foreground-muted focus:border-foreground focus:outline-none"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
              Demonstration persona
            </span>
            <div className="flex flex-col gap-px border border-border bg-border">
              {ROLES.map((r) => {
                const isSelected = persona === r.id
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setPersona(r.id)
                      setUsername(r.id)
                      setPassword('workbench')
                    }}
                    className={cn(
                      'flex items-center gap-3 bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-sunken',
                      isSelected && 'bg-surface-sunken',
                    )}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {isSelected && <Check className="h-3.5 w-3.5 text-foreground" />}
                    </span>
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="text-[13px] font-medium text-foreground">{r.label}</span>
                      <span className="text-[12px] leading-snug text-foreground-secondary">{r.description}</span>
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted">{r.id}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <SovButton
            arrow
            disabled={loading}
            onClick={signIn}
            className="w-full justify-center py-3"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Authenticating...
              </span>
            ) : (
              `Sign in as ${active.label}`
            )}
          </SovButton>

          <p className="text-center font-mono text-[10px] leading-relaxed text-foreground-muted">
            Authenticates against 127.0.0.1:8000 · no external identity provider
          </p>
        </div>
      </section>
    </div>
  )
}
