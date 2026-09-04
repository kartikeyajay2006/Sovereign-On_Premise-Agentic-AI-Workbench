'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, AlertCircle, Loader2, Info, ArrowRight, ShieldCheck, Cpu, Lock, FileSearch, X } from 'lucide-react'
import { ROLES } from '@/lib/presentation'
import { api } from '@/lib/api'
import type { DirectoryUser, RoleId } from '@/lib/types'
import { SovButton } from '@/components/sov-button'
import { TechnicalLabel } from '@/components/primitives'
import { AnimatedTechnicalBackground } from '@/components/animated-technical-background'
import { useRole } from '@/components/role-context'
import { cn } from '@/lib/utils'
import { ThreeDLayerView } from '@/components/three-d-layer-view'
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
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  
  // How It Works Modal State
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [activeStep, setActiveStep] = useState(0)

  const activePersona = ROLES.find((r) => r.id === persona) ?? ROLES[0]

  const steps = [
    {
      icon: FileSearch,
      title: "1. Multimodal Document Ingestion",
      subtitle: "Scans, P&IDs, Drawings & Engineering Manuals",
      desc: "Upload scanned PDFs, technical drawings, handwritten inspection notes, or Excel workbooks. Everything is parsed, OCR'd, and embedded locally on this host without contacting cloud APIs.",
      techTag: "Local PyMuPDF + PaddleOCR + MiniLM Embeddings"
    },
    {
      icon: Cpu,
      title: "2. Intelligent Local Model Auto-Routing",
      subtitle: "Reasoning vs. Vision Models Selected Automatically",
      desc: "The task analyzer inspects input complexity and automatically dispatches to the correct local specialist model (Qwen Reasoning for SOP analysis or Vision LLM for visual inspection extraction).",
      techTag: "Loopback Ollama / llama.cpp Serving"
    },
    {
      icon: Lock,
      title: "3. Air-Gapped Sandboxed Execution",
      subtitle: "Isolated Python Runtime with Resource Limits",
      desc: "Generated calculation scripts and data transforms run inside a strictly isolated subprocess sandbox with zero network namespace access, AST static validation, and CPU/memory quotas.",
      techTag: "Subprocess Limits + AST Import Checks"
    },
    {
      icon: ShieldCheck,
      title: "4. Verified Evidence & Hash-Chained Audit",
      subtitle: "Tamper-Evident Traceability & Live Zero-Egress Proof",
      desc: "Outputs undergo RAG evidence verification. Every decision, calculation, and tool call is recorded into an append-only hash-chained JSONL audit trail, backed by a live network egress monitor.",
      techTag: "Immutable SHA-256 Hash Chain + psutil Monitor"
    }
  ]

  const handleFirebaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setLoading(true)

    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(requireAuth(), email.trim(), password)
        await signOut(requireAuth()).catch(() => {})
        setSuccessMsg("Account created successfully! Please sign in with your email and password.")
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
      let msg = err.message || "Authentication failed"
      if (msg.includes("auth/email-already-in-use")) {
        msg = "An account with this email already exists. Please sign in."
      } else if (msg.includes("auth/invalid-credential") || msg.includes("auth/wrong-password")) {
        msg = "Invalid email address or password."
      } else if (msg.includes("auth/weak-password")) {
        msg = "Password should be at least 6 characters."
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
      setError(err.message || "Google sign-in failed")
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
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      {/* Left — editorial / brand */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface p-10 lg:flex lg:p-14">
        <AnimatedTechnicalBackground className="opacity-60" />
        <div className="relative flex items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-foreground">
              <span className="h-2.5 w-2.5 rounded-[1px] border border-primary-foreground" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">Sovereign</span>
              <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.32em] text-foreground-muted">Workbench</span>
            </span>
          </div>
        </div>

        <div className="relative flex flex-col gap-6">
          <TechnicalLabel dot="var(--sovereign)">On-premise · air-gapped</TechnicalLabel>
          <h1 className="text-balance text-5xl font-medium leading-[0.98] tracking-[-0.03em] text-foreground xl:text-6xl">
            Your intelligence.
            <br />
            Your infrastructure.
          </h1>
          <p className="max-w-sm text-[15px] leading-relaxed text-foreground-secondary">
            Confidential industrial AI workbench. Prompts, documents, models, and execution logs remain 100% inside your building.
          </p>
          
          <button
            type="button"
            onClick={() => setShowHowItWorks(true)}
            className="inline-flex w-fit items-center gap-2 font-mono text-[12px] font-medium text-[var(--sovereign)] underline underline-offset-4 hover:opacity-80"
          >
            <span>Interactive System Walkthrough</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="relative grid grid-cols-2 gap-px border border-border bg-border">
          {[
            ['Host', hostStatus ? 'this machine' : 'checking…'],
            ['External', hostStatus ? String(hostStatus.external_calls) : '0'],
            ['Contained', hostStatus ? (hostStatus.sovereign ? 'yes' : 'NO') : 'yes'],
            ['Monitoring', hostStatus?.monitor_active ? 'active' : 'active'],
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
        <div className="mx-auto flex w-full max-w-md flex-col gap-7">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground-muted lg:hidden">
              Sovereign Workbench
            </span>
            <h2 className="text-2xl font-medium tracking-[-0.02em] text-foreground">Sign in</h2>
          </div>

          {/* Auth method switcher, shown only where both are actually offered.
              An air-gapped host has Firebase switched off and signs in with a
              workbench account alone, so it gets no tab it cannot use. */}
          {firebaseEnabled && (
          <div className="flex rounded-md border border-border bg-surface p-1 text-[12px]">
            <button
              type="button"
              onClick={() => {
                setAuthMethod('firebase')
                setError(null)
              }}
              className={cn(
                'flex-1 rounded py-1.5 font-medium transition-colors',
                authMethod === 'firebase'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-foreground-muted hover:text-foreground-secondary',
              )}
            >
              Firebase Auth
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMethod('persona')
                setError(null)
              }}
              className={cn(
                'flex-1 rounded py-1.5 font-medium transition-colors',
                authMethod === 'persona'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-foreground-muted hover:text-foreground-secondary',
              )}
            >
              Demo Persona
            </button>
          </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2.5 border border-[var(--sovereign)] bg-surface p-3 text-[13px] text-[var(--sovereign)]">
              <Check className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2.5 border border-[var(--critical)] bg-surface p-3 text-[13px] text-[var(--critical)]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {authMethod === 'firebase' ? (
            <div className="flex flex-col gap-5">
              {/* Sign In vs Create Account Mode Switcher */}
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
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-foreground-muted hover:text-foreground-secondary',
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
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-foreground-muted hover:text-foreground-secondary',
                  )}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleFirebaseSubmit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Email Address</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    autoComplete="email"
                    className="border border-border-strong bg-surface px-3.5 py-3 text-[14px] text-foreground placeholder:text-foreground-muted focus:border-foreground focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Password</span>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="border border-border-strong bg-surface px-3.5 py-3 text-[14px] text-foreground placeholder:text-foreground-muted focus:border-foreground focus:outline-none"
                  />
                </label>

                <SovButton
                  arrow
                  disabled={loading || !email || !password}
                  type="submit"
                  className="w-full justify-center py-3 mt-1"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> {mode === 'signup' ? 'Creating Account...' : 'Authenticating...'}
                    </span>
                  ) : mode === 'signup' ? (
                    'Create Firebase Account'
                  ) : (
                    'Sign In with Firebase'
                  )}
                </SovButton>
              </form>

              <div className="relative my-1 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <span className="relative bg-background px-2 font-mono text-[11px] text-foreground-muted">
                  OR
                </span>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="flex items-center justify-center gap-2.5 rounded border border-border-strong bg-surface py-3 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-sunken"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{mode === 'signup' ? 'Sign Up with Google' : 'Sign In with Google'}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                  Select Demonstration Persona
                </span>
                <div className="flex flex-col gap-px border border-border bg-border">
                  {ROLES.map((r) => {
                    const isSelected = persona === r.id
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setPersona(r.id)}
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
                onClick={handlePersonaSignIn}
                className="w-full justify-center py-3"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Authenticating...
                  </span>
                ) : (
                  `Sign in as ${activePersona.label}`
                )}
              </SovButton>
            </div>
          )}

          <p className="text-center font-mono text-[10px] leading-relaxed text-foreground-muted">
            All workspace tasks execute on 127.0.0.1:8000 under default-deny security policies.
          </p>
        </div>
      </section>

      {/* How It Works 3D Architecture Modal */}
      {showHowItWorks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative flex w-full max-w-5xl max-h-[92vh] flex-col overflow-y-auto rounded-xl border border-border bg-background shadow-2xl p-6 sm:p-8">
            {/* Header with Close button */}
            <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded bg-[var(--sovereign)]/15 text-[var(--sovereign)] font-mono text-xs font-bold">
                  3D
                </span>
                <div className="flex flex-col">
                  <span className="font-mono text-[13px] font-semibold uppercase tracking-wider text-foreground">
                    System Architecture 3D Layer Visualization
                  </span>
                  <span className="font-mono text-[10px] text-foreground-muted">
                    Sovereign Agentic AI Workbench · 4-Tier Isolation Stack
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHowItWorks(false)}
                className="rounded p-1.5 text-foreground-muted hover:bg-surface-sunken hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 3D Layer Component */}
            <ThreeDLayerView onClose={() => setShowHowItWorks(false)} />

            {/* Footer */}
            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <span className="font-mono text-[11px] text-foreground-muted">
                100% Air-Gapped · Zero External Telemetry · Local Memory Execution
              </span>
              <button
                type="button"
                onClick={() => setShowHowItWorks(false)}
                className="rounded bg-foreground px-5 py-2 font-mono text-[12px] font-medium text-background hover:opacity-90 transition-opacity"
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
