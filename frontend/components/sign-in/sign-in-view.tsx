'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Lock,
  FileSearch,
  X,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  Layers,
  Server,
  Shield,
  Users,
  Sparkles,
  CheckCircle2,
} from 'lucide-react'
import { ROLES } from '@/lib/presentation'
import { api } from '@/lib/api'
import type { RoleId } from '@/lib/types'
import { SovButton } from '@/components/sov-button'
import { TechnicalLabel } from '@/components/primitives'
import { AnimatedTechnicalBackground } from '@/components/animated-technical-background'
import { useRole } from '@/components/role-context'
import { cn } from '@/lib/utils'
import { ThreeDLayerView } from '@/components/three-d-layer-view'
import { AegisLogo } from '@/components/aegis-logo'
import {
  googleProvider,
  firebaseEnabled,
  requireAuth,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from '@/lib/firebase'

export function SignInView() {
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
  const [authMethod, setAuthMethod] = useState<'firebase' | 'persona'>(
    firebaseEnabled ? 'firebase' : 'persona',
  )
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // How It Works Modal State
  const [showHowItWorks, setShowHowItWorks] = useState(false)

  const activePersona = ROLES.find((r) => r.id === persona) ?? ROLES[0]

  const handleFirebaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setLoading(true)

    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(requireAuth(), email.trim(), password)
        await signOut(requireAuth()).catch(() => {})
        setSuccessMsg('Account created successfully! Please sign in with your email and password.')
        setMode('signin')
        setPassword('')
        setLoading(false)
        return
      }

      await signInWithEmailAndPassword(requireAuth(), email.trim(), password)
      // Login to local session state
      await login('engineer', 'workbench').catch(() => {})
      router.push('/')
    } catch (err: any) {
      let msg = err.message || 'Authentication failed'
      if (msg.includes('auth/email-already-in-use')) {
        msg = 'An account with this email already exists. Please sign in.'
      } else if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
        msg = 'Invalid email address or password.'
      } else if (msg.includes('auth/weak-password')) {
        msg = 'Password should be at least 6 characters.'
      }
      setError(msg)
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setLoading(true)
    try {
      await signInWithPopup(requireAuth(), googleProvider)
      await login('engineer', 'workbench').catch(() => {})
      router.push('/')
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed')
      setLoading(false)
    }
  }

  const handlePersonaSignIn = async () => {
    setError(null)
    setLoading(true)
    try {
      await login(persona, 'workbench')
      router.push('/')
    } catch (err: any) {
      setError(err.detail || err.message || 'Authentication failed.')
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-12 bg-background selection:bg-foreground selection:text-background">
      {/* Left Column — Sovereign Brand & Architectural Intelligence (7 cols) */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface p-10 lg:flex lg:col-span-6 xl:col-span-7 lg:p-14 xl:p-16">
        <AnimatedTechnicalBackground className="opacity-50" />

        {/* Ambient Top Glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/4 h-[400px] w-[500px] rounded-full bg-gradient-to-b from-[var(--sovereign)]/8 via-transparent to-transparent blur-3xl"
        />

        {/* Brand Header */}
        <div className="relative z-10 flex items-center justify-between">
          <AegisLogo size={36} variant="full" />

          <div className="flex items-center gap-2 rounded-full border border-border bg-surface-sunken/80 px-3 py-1 font-mono text-[10px] text-foreground-secondary">
            <span className="relative flex h-2 w-2">
              <span className="sov-pulse absolute inline-flex h-full w-full rounded-full bg-[var(--sovereign)]" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--sovereign)]" />
            </span>
            <span>AIR-GAPPED 127.0.0.1</span>
          </div>
        </div>

        {/* Hero Narrative */}
        <div className="relative z-10 my-auto flex flex-col gap-6 max-w-xl py-8">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--sovereign)]" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground-muted">
              ON-PREMISE AGENTIC AI
            </span>
          </div>

          <h1 className="text-balance text-5xl font-extrabold leading-[1.02] tracking-[-0.035em] text-foreground xl:text-6xl">
            Your intelligence.
            <br />
            Your infrastructure.
          </h1>

          <p className="text-[15px] leading-relaxed text-foreground-secondary">
            Confidential industrial AI workbench. Models, standard operating procedures,
            sandboxed computations, and immutable audit logs never leave your physical premises.
          </p>

          {/* Interactive 3D Architecture Preview Banner */}
          <button
            type="button"
            onClick={() => setShowHowItWorks(true)}
            className="group mt-2 flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-sunken/60 p-4 text-left transition-all duration-200 hover:border-foreground/40 hover:bg-surface-sunken hover:shadow-sm"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--sovereign)]/30 bg-[var(--sovereign)]/10 text-[var(--sovereign)] transition-colors group-hover:bg-[var(--sovereign)] group-hover:text-white">
                <Layers className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[12px] font-bold text-foreground flex items-center gap-1.5">
                  Interactive System Architecture 3D Stack
                  <span className="rounded bg-[var(--sovereign)]/15 px-1.5 py-0.2 font-mono text-[9px] font-bold text-[var(--sovereign)]">
                    4-TIER
                  </span>
                </span>
                <span className="text-[12px] text-foreground-muted">
                  Explore document parsing, local model routing, gVisor sandbox & hash chain.
                </span>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-foreground-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-foreground" />
          </button>
        </div>

        {/* Industrial Telemetry Grid */}
        <div className="relative z-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded border border-border bg-surface-sunken/50 p-3.5 transition-colors hover:border-foreground/30">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground-muted">HOST INTERFACE</span>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[12px] font-bold text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--sovereign)]" />
              127.0.0.1:8000
            </div>
          </div>

          <div className="rounded border border-border bg-surface-sunken/50 p-3.5 transition-colors hover:border-foreground/30">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground-muted">EXTERNAL EGRESS</span>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[12px] font-bold text-[var(--sovereign)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              0 DETECTED
            </div>
          </div>

          <div className="rounded border border-border bg-surface-sunken/50 p-3.5 transition-colors hover:border-foreground/30">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground-muted">LOCAL RUNTIME</span>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[12px] font-bold text-foreground">
              <Cpu className="h-3.5 w-3.5 text-foreground-muted" />
              Qwen Resident
            </div>
          </div>

          <div className="rounded border border-border bg-surface-sunken/50 p-3.5 transition-colors hover:border-foreground/30">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground-muted">AUDIT INTEGRITY</span>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[12px] font-bold text-[var(--sovereign)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              SHA-256 Valid
            </div>
          </div>
        </div>
      </section>

      {/* Right Column — Executive Auth Station (5 cols) */}
      <section className="flex flex-col justify-center items-center bg-background px-5 py-12 sm:px-10 lg:col-span-6 xl:col-span-5 lg:px-12">
        <div className="w-full max-w-md">
          {/* Main Auth Card Container */}
          <div className="rounded-xl border border-border bg-surface/95 p-7 shadow-[0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-md sm:p-9">
            {/* Header */}
            <div className="flex flex-col gap-1.5 border-b border-border/80 pb-5">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
                SESSION AUTHENTICATION
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Sign in to Aegis
              </h2>
              <p className="text-[13px] text-foreground-secondary">
                Air-gapped access terminal for confidential plant operations.
              </p>
            </div>

            {/* Auth Method Switcher (Firebase vs Demo Persona) */}
            {firebaseEnabled && (
              <div className="mt-6 flex rounded-lg border border-border bg-surface-sunken p-1 text-[12px]">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('firebase')
                    setError(null)
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-md py-2 font-mono text-[11px] font-semibold transition-all',
                    authMethod === 'firebase'
                      ? 'bg-surface text-foreground shadow-xs'
                      : 'text-foreground-muted hover:text-foreground',
                  )}
                >
                  <Shield className="h-3.5 w-3.5" />
                  Firebase Auth
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('persona')
                    setError(null)
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-md py-2 font-mono text-[11px] font-semibold transition-all',
                    authMethod === 'persona'
                      ? 'bg-surface text-foreground shadow-xs'
                      : 'text-foreground-muted hover:text-foreground',
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                  Demo Persona
                </button>
              </div>
            )}

            {/* Notification Messages */}
            {successMsg && (
              <div className="mt-4 flex items-center gap-2.5 rounded border border-[var(--sovereign)] bg-[var(--sovereign)]/5 p-3 text-[13px] text-[var(--sovereign)]">
                <Check className="h-4 w-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-center gap-2.5 rounded border border-[var(--critical)] bg-critical/5 p-3 text-[13px] text-critical">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Mode 1: Firebase Auth */}
            {authMethod === 'firebase' ? (
              <div className="mt-6 flex flex-col gap-5">
                {/* Sign In vs Create Account Tabs */}
                <div className="flex border-b border-border text-[13px]">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin')
                      setError(null)
                    }}
                    className={cn(
                      'border-b-2 px-4 py-2 font-medium transition-colors',
                      mode === 'signin'
                        ? 'border-foreground text-foreground font-semibold'
                        : 'border-transparent text-foreground-muted hover:text-foreground',
                    )}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup')
                      setError(null)
                    }}
                    className={cn(
                      'border-b-2 px-4 py-2 font-medium transition-colors',
                      mode === 'signup'
                        ? 'border-foreground text-foreground font-semibold'
                        : 'border-transparent text-foreground-muted hover:text-foreground',
                    )}
                  >
                    Create Account
                  </button>
                </div>

                {/* Email / Password Form */}
                <form onSubmit={handleFirebaseSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="signin-email"
                      className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted"
                    >
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                      <input
                        id="signin-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="operator@plant.internal"
                        autoComplete="email"
                        className="w-full rounded-md border border-border bg-surface-sunken/40 py-2.5 pl-10 pr-3.5 text-[14px] text-foreground placeholder:text-foreground-muted/60 transition-colors focus:border-foreground focus:bg-surface focus:outline-none focus:ring-2 focus:ring-foreground/10"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="signin-password"
                      className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                      <input
                        id="signin-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        className="w-full rounded-md border border-border bg-surface-sunken/40 py-2.5 pl-10 pr-10 text-[14px] text-foreground placeholder:text-foreground-muted/60 transition-colors focus:border-foreground focus:bg-surface focus:outline-none focus:ring-2 focus:ring-foreground/10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <SovButton
                    arrow
                    disabled={loading || !email || !password}
                    type="submit"
                    className="w-full justify-center py-3 mt-1 text-[13px] font-bold"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />{' '}
                        {mode === 'signup' ? 'Creating Account...' : 'Authenticating...'}
                      </span>
                    ) : mode === 'signup' ? (
                      'Create Firebase Account'
                    ) : (
                      'Sign In with Firebase'
                    )}
                  </SovButton>
                </form>

                {/* Divider */}
                <div className="relative my-1 text-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <span className="relative bg-surface px-3 font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
                    OR CONTINUE WITH
                  </span>
                </div>

                {/* Google SSO Button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="flex items-center justify-center gap-3 rounded-md border border-border bg-surface py-2.5 text-[13px] font-semibold text-foreground transition-all hover:border-foreground hover:bg-surface-sunken hover:shadow-xs disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}</span>
                </button>
              </div>
            ) : (
              /* Mode 2: Demo Persona Selection */
              <div className="mt-6 flex flex-col gap-5">
                <div className="flex flex-col gap-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                    SELECT WORKBENCH CLEARANCE LEVEL
                  </span>
                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[300px] pr-0.5">
                    {ROLES.map((r) => {
                      const isSelected = persona === r.id
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setPersona(r.id)}
                          className={cn(
                            'group flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-all',
                            isSelected
                              ? 'border-foreground bg-surface-sunken ring-1 ring-foreground/20 shadow-xs'
                              : 'border-border bg-surface hover:border-foreground/40 hover:bg-surface-sunken/60',
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-colors',
                                isSelected
                                  ? 'border-foreground bg-foreground text-background'
                                  : 'border-border text-foreground-muted group-hover:border-foreground/60',
                              )}
                            >
                              {isSelected ? '✓' : ''}
                            </span>
                            <div className="flex flex-col">
                              <span className="text-[13px] font-bold text-foreground">
                                {r.label}
                              </span>
                              <span className="text-[11px] text-foreground-secondary line-clamp-1">
                                {r.description}
                              </span>
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[10px] font-semibold uppercase px-2 py-0.5 rounded border border-border bg-surface text-foreground-muted">
                            {r.id}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <SovButton
                  arrow
                  disabled={loading}
                  onClick={handlePersonaSignIn}
                  className="w-full justify-center py-3 text-[13px] font-bold"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Authenticating...
                    </span>
                  ) : (
                    `Authorize & Enter as ${activePersona.label}`
                  )}
                </SovButton>
              </div>
            )}

            {/* Terminal Notice */}
            <div className="mt-6 border-t border-border/80 pt-4 flex items-center justify-center gap-1.5 text-center font-mono text-[10px] text-foreground-muted">
              <Lock className="h-3 w-3 text-[var(--sovereign)]" />
              <span>Default-Deny Policy · 127.0.0.1:8000 · Zero Outbound Egress</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works 3D Architecture Modal */}
      {showHowItWorks && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 sm:p-6 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative flex w-full max-w-[1500px] max-h-[90vh] flex-col overflow-y-auto rounded-[14px] border border-border bg-surface shadow-2xl p-6 sm:p-8 text-foreground">
            {/* Header with Close button */}
            <div className="flex items-center justify-between border-b border-border pb-4 mb-5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--sovereign)]/15 text-[var(--sovereign)] font-mono text-xs font-bold border border-[var(--sovereign)]/30">
                  3D
                </span>
                <div className="flex flex-col">
                  <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-foreground">
                    SYSTEM ARCHITECTURE 3D LAYER VISUALIZATION
                  </span>
                  <span className="font-mono text-[10px] text-foreground-muted">
                    Aegis Agentic AI Workbench · 4-Tier Isolation Stack
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHowItWorks(false)}
                className="rounded-md p-1.5 text-foreground-muted hover:bg-surface-sunken hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 3D Layer Component */}
            <ThreeDLayerView onClose={() => setShowHowItWorks(false)} />

            {/* Footer */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
              <span className="font-mono text-[11px] text-foreground-muted">
                100% Air-Gapped · Zero External Telemetry · Local Memory Execution
              </span>
              <button
                type="button"
                onClick={() => setShowHowItWorks(false)}
                className="rounded-md bg-foreground px-5 py-2 font-mono text-[12px] font-bold text-background hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
              >
                Close 3D View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
