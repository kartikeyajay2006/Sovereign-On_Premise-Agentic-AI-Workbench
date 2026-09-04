'use client'

import { useState, useEffect } from 'react'
import {
  FileSearch,
  Cpu,
  Lock,
  ShieldCheck,
  Layers,
  Play,
  Pause,
  ChevronRight,
  Activity,
  Terminal,
  CheckCircle2,
  Zap,
  AlertTriangle,
  Sliders,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ArchitectureLayer {
  id: string
  number: string
  title: string
  subtitle: string
  icon: any
  tag: string
  techStack: string[]
  description: string
  inputs: string[]
  outputs: string[]
  securityMeasure: string
  color: string
}

const LAYERS: ArchitectureLayer[] = [
  {
    id: 'ingestion',
    number: '01',
    title: 'Multimodal Ingestion Layer',
    subtitle: 'Local Parse, OCR & Vector Embedding',
    icon: FileSearch,
    tag: 'LOCAL OCR + VECTOR EMBED',
    techStack: ['PyMuPDF', 'PaddleOCR', 'MiniLM-L6-v2', 'FastAPI multipart'],
    description: 'Scans, P&IDs, engineering drawings, scanned PDFs, and Excel workbooks are ingested and converted into local structured text chunks and vector embeddings entirely on host memory without cloud APIs.',
    inputs: ['Scanned PDF / TIFF drawings', 'Handwritten inspection notes', 'CSV / XLSX thickness surveys'],
    outputs: ['Extracted OCR Markdown', 'High-res CAD region crops', 'Normalized JSON Schema'],
    securityMeasure: 'Direct memory buffer parsing; zero disk writes to temporary unencrypted cache.',
    color: '#10b981', // green
  },
  {
    id: 'routing',
    number: '02',
    title: 'Intelligent Model Routing Layer',
    subtitle: 'Dynamic Task Complexity & Model Selection',
    icon: Cpu,
    tag: 'LOCAL LLM AUTO-ROUTER',
    techStack: ['Qwen 2.5 72B Instruct', 'Qwen 2.5 VL 7B', 'DeepSeek R1 Distill', 'Ollama / llama.cpp'],
    description: 'Autonomous meta-prompter inspects task domain and routes calculation-heavy requests to local reasoning LLMs, and visual inspection requests to local vision models running on localhost loopback.',
    inputs: ['Parsed engineering task prompt', 'Extracted visual cropped regions'],
    outputs: ['Optimized Execution Plan', 'Executable Python Code Block', 'SOP Citation References'],
    securityMeasure: 'Strict loopback 127.0.0.1 binding; external internet routing disabled.',
    color: '#3b82f6', // blue
  },
  {
    id: 'sandbox',
    number: '03',
    title: 'Air-Gapped Sandbox Layer',
    subtitle: 'Isolated Python Subprocess Execution',
    icon: Lock,
    tag: 'SECURE ISOLATED RUNTIME',
    techStack: ['Python AST Validator', 'Subprocess Quotas', 'cgroups Resource Limits', 'Default-Deny Policy'],
    description: 'Generated calculation scripts run inside an isolated Python execution environment with static AST validation (blocking network sockets and system calls) and strict CPU/Memory bounds.',
    inputs: ['Generated Python calculation code', 'Verified numerical parameters'],
    outputs: ['Computed Remaining Life (RL)', 'Corrosion Rate (CR)', 'Generated Word/PDF Reports'],
    securityMeasure: 'AST module whitelist filtering out socket, os.system, requests, and urllib.',
    color: '#8b5cf6', // purple
  },
  {
    id: 'audit',
    number: '04',
    title: 'Audit & Sovereignty Proof Layer',
    subtitle: 'Cryptographic Hash-Chain & Egress Monitor',
    icon: ShieldCheck,
    tag: 'TAMPER-EVIDENT AUDIT TRAIL',
    techStack: ['SHA-256 Hash Chain', 'JSONL Immutable Log', 'psutil Monitor', 'RAG Verifier'],
    description: 'Every prompt, model routing event, script execution result, and file download is signed into an append-only hash-chained ledger. Live socket monitor confirms 0 external egress.',
    inputs: ['Tool call execution trace', 'Generated deliverable hash', 'Live socket activity'],
    outputs: ['Verifiable Audit Record', 'SHA-256 Parent Block Hash', 'Sovereignty Compliance Proof'],
    securityMeasure: 'Cryptographic link ($H_n = \\text{SHA256}(H_{n-1} \\parallel \\text{Record}_n)$) preventing retrospective tampering.',
    color: '#f59e0b', // amber
  },
]

export function ThreeDLayerView({ onClose }: { onClose?: () => void }) {
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number>(0)
  const [isAutoAnimating, setIsAutoAnimating] = useState<boolean>(false)
  const [is3DExploded, setIs3DExploded] = useState<boolean>(true)
  const [explosionDepth, setExplosionDepth] = useState<number>(36)
  const [simulatingBreach, setSimulatingBreach] = useState<boolean>(false)
  const [breachIntercepted, setBreachIntercepted] = useState<boolean>(false)

  // Auto-cycle layers when auto-animate is enabled
  useEffect(() => {
    if (!isAutoAnimating) return
    const interval = setInterval(() => {
      setSelectedLayerIndex((prev) => (prev + 1) % LAYERS.length)
    }, 4500)
    return () => clearInterval(interval)
  }, [isAutoAnimating])

  const selectedLayer = LAYERS[selectedLayerIndex]

  const triggerBreachSimulation = () => {
    if (simulatingBreach) return
    setSimulatingBreach(true)
    setBreachIntercepted(false)
    setSelectedLayerIndex(2) // Jump to Sandbox layer

    setTimeout(() => {
      setBreachIntercepted(true)
    }, 900)

    setTimeout(() => {
      setSimulatingBreach(false)
      setBreachIntercepted(false)
    }, 3800)
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* View Mode Controls & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--sovereign)]/15 text-[var(--sovereign)]">
            <Layers className="h-4 w-4" />
          </span>
          <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-foreground">
            3D Isometric Architecture Sandbox (4 Layers)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Simulate Air Gap Breach Test */}
          <button
            type="button"
            onClick={triggerBreachSimulation}
            disabled={simulatingBreach}
            className={cn(
              'flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-all',
              simulatingBreach
                ? 'border-critical bg-critical/20 text-critical animate-pulse'
                : 'border-border bg-surface text-foreground hover:border-critical hover:text-critical'
            )}
          >
            <Zap className="h-3.5 w-3.5 text-critical" />
            {simulatingBreach ? 'Intercepting Socket…' : 'Test Egress Deflection'}
          </button>

          {/* 3D Exploded Perspective Toggle */}
          <button
            type="button"
            onClick={() => setIs3DExploded((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-[11px] transition-colors',
              is3DExploded
                ? 'border-[var(--active)]/40 bg-[var(--active)]/10 text-[var(--active)]'
                : 'border-border bg-surface text-foreground-muted hover:text-foreground'
            )}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>{is3DExploded ? '3D Exploded' : 'Flat Stack'}</span>
          </button>

          {/* Auto Animation Toggle */}
          <button
            type="button"
            onClick={() => setIsAutoAnimating((prev) => !prev)}
            className={cn(
              'flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-[11px] transition-colors',
              isAutoAnimating
                ? 'border-[var(--sovereign)]/40 bg-[var(--sovereign)]/10 text-[var(--sovereign)]'
                : 'border-border bg-surface text-foreground-muted hover:text-foreground'
            )}
          >
            {isAutoAnimating ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isAutoAnimating ? 'Auto-Cycle' : 'Paused'}</span>
          </button>
        </div>
      </div>

      {/* Main 3D Canvas + Details Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Interactive 3D Perspective Visualizer (7 Columns) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative min-h-[440px] w-full rounded-xl border border-border bg-gradient-to-b from-surface/90 to-background/95 p-6 overflow-hidden flex items-center justify-center shadow-inner perspective-[1000px]">
            {/* Background Tech Grid Lines */}
            <div
              className="absolute inset-0 opacity-25 pointer-events-none"
              style={{
                backgroundImage: `radial-gradient(var(--border) 1px, transparent 1px)`,
                backgroundSize: '24px 24px',
              }}
            />

            {/* Exploded Depth Slider overlay */}
            {is3DExploded && (
              <div className="absolute top-4 left-4 z-40 flex items-center gap-2 rounded bg-surface/80 px-2.5 py-1 border border-border text-[10px] font-mono text-foreground-muted">
                <span>3D Spacing:</span>
                <input
                  type="range"
                  min={10}
                  max={60}
                  value={explosionDepth}
                  onChange={(e) => setExplosionDepth(Number(e.target.value))}
                  className="w-20 accent-[var(--sovereign)] cursor-pointer"
                />
                <span className="w-5 text-foreground">{explosionDepth}px</span>
              </div>
            )}

            {/* Breach Alert Notification */}
            {breachIntercepted && (
              <div className="absolute top-4 right-4 z-40 flex items-center gap-2 rounded-lg border border-critical bg-critical/15 p-2.5 text-critical backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                <AlertTriangle className="h-4 w-4 shrink-0 animate-bounce" />
                <div className="flex flex-col text-left">
                  <span className="font-mono text-[10px] font-bold">AIR-GAP BREACH INTERCEPTED</span>
                  <span className="font-mono text-[9px] text-foreground">
                    Layer 3 AST Validator blocked `import socket`
                  </span>
                </div>
              </div>
            )}

            {/* Full Stack Layer Container with 3D Isometric Transform */}
            <div
              className={cn(
                'relative w-full max-w-md flex flex-col my-4 transition-transform duration-500 ease-out',
                is3DExploded && 'rotate-x-[36deg] rotate-z-[-18deg] scale-95'
              )}
              style={{
                gap: is3DExploded ? `${explosionDepth}px` : '10px',
                transformStyle: 'preserve-3d',
              }}
            >
              {LAYERS.map((layer, idx) => {
                const isSelected = selectedLayerIndex === idx
                const IconComponent = layer.icon
                const isTargetOfBreach = simulatingBreach && idx === 2

                return (
                  <div
                    key={layer.id}
                    onClick={() => {
                      setSelectedLayerIndex(idx)
                      setIsAutoAnimating(false)
                    }}
                    style={{
                      transform: is3DExploded
                        ? `translateZ(${idx * 16}px)`
                        : undefined,
                    }}
                    className={cn(
                      'group relative w-full cursor-pointer rounded-xl border p-4 backdrop-blur-md transition-all duration-300',
                      isTargetOfBreach && breachIntercepted
                        ? 'border-critical bg-critical/20 ring-4 ring-critical/50 shadow-[0_0_36px_rgba(220,38,38,0.5)] scale-105 z-40'
                        : isSelected
                        ? 'border-[var(--sovereign)] bg-surface shadow-[0_0_30px_rgba(16,185,129,0.25)] scale-[1.02] z-30 ring-2 ring-[var(--sovereign)]/60'
                        : 'border-border/80 bg-surface/75 hover:border-border-strong hover:bg-surface/95 z-10 opacity-90 hover:opacity-100'
                    )}
                  >
                    {/* Layer Header Tag */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded text-[11px] font-mono font-bold transition-transform group-hover:scale-110',
                            isSelected
                              ? 'bg-[var(--sovereign)] text-black'
                              : 'bg-surface-sunken text-foreground'
                          )}
                        >
                          {layer.number}
                        </span>
                        <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-foreground">
                          {layer.title}
                        </span>
                      </div>

                      <IconComponent
                        className={cn(
                          'h-4 w-4 transition-colors',
                          isSelected ? 'text-[var(--sovereign)]' : 'text-foreground-muted'
                        )}
                      />
                    </div>

                    {/* Subtitle / Tech Tag */}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-foreground-muted">
                        {layer.tag}
                      </span>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 font-mono text-[9px] font-medium text-[var(--sovereign)] animate-pulse">
                          <Activity className="h-2.5 w-2.5" /> ACTIVE LAYER
                        </span>
                      )}
                    </div>

                    {/* Left Accent Glow line */}
                    {isSelected && (
                      <div className="absolute top-0 bottom-0 left-0 w-1.5 rounded-l-xl bg-[var(--sovereign)]" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick Step Indicators below canvas */}
          <div className="grid grid-cols-4 gap-2">
            {LAYERS.map((layer, idx) => {
              const isSelected = selectedLayerIndex === idx
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => {
                    setSelectedLayerIndex(idx)
                    setIsAutoAnimating(false)
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center rounded border p-2.5 text-center transition-all',
                    isSelected
                      ? 'border-[var(--sovereign)] bg-surface text-foreground font-semibold shadow-sm'
                      : 'border-border bg-surface/40 text-foreground-muted hover:border-border-strong hover:text-foreground'
                  )}
                >
                  <span className="font-mono text-[10px]">Layer {layer.number}</span>
                  <span className="text-[10px] truncate max-w-[80px] text-foreground-muted">
                    {layer.id}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right Side: Dynamic Layer Deep-Dive Specs (5 Columns) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
            {/* Header */}
            <div className="flex flex-col gap-1 border-b border-border pb-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--sovereign)] font-semibold">
                  Layer {selectedLayer.number} Architecture Spec
                </span>
                <span className="font-mono text-[10px] text-[var(--sovereign)] font-bold">
                  Sovereignty: 100%
                </span>
              </div>
              <h3 className="text-lg font-bold text-foreground">{selectedLayer.title}</h3>
              <p className="text-[12px] text-foreground-secondary">{selectedLayer.subtitle}</p>
            </div>

            {/* Description */}
            <p className="text-[13px] leading-relaxed text-foreground-secondary">
              {selectedLayer.description}
            </p>

            {/* Tech Stack Pills */}
            <div className="flex flex-wrap gap-1.5 my-1">
              {selectedLayer.techStack.map((tech) => (
                <span
                  key={tech}
                  className="rounded border border-border bg-surface-sunken px-2 py-0.5 font-mono text-[10px] text-foreground-secondary"
                >
                  {tech}
                </span>
              ))}
            </div>

            {/* Inputs & Outputs Grid */}
            <div className="grid grid-cols-1 gap-3 pt-2">
              <div className="flex flex-col gap-1.5 rounded border border-border bg-background/50 p-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-foreground-muted flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-[var(--sovereign)]" /> Primary Inputs
                </span>
                <ul className="flex flex-col gap-1 pl-4 list-disc text-[12px] text-foreground">
                  {selectedLayer.inputs.map((inp, i) => (
                    <li key={i}>{inp}</li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-1.5 rounded border border-border bg-background/50 p-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-foreground-muted flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-[var(--sovereign)]" /> Layer Deliverables
                </span>
                <ul className="flex flex-col gap-1 pl-4 list-disc text-[12px] text-foreground">
                  {selectedLayer.outputs.map((out, i) => (
                    <li key={i}>{out}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Security Guarantee Box */}
            <div className="flex items-start gap-2.5 rounded border border-[var(--sovereign)]/30 bg-[var(--sovereign)]/10 p-3 text-[12px] text-foreground">
              <CheckCircle2 className="h-4 w-4 text-[var(--sovereign)] shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[10px] uppercase tracking-wider font-semibold text-[var(--sovereign)]">
                  Isolation & Security Guarantee
                </span>
                <span className="text-[11px] leading-snug text-foreground-secondary">
                  {selectedLayer.securityMeasure}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
