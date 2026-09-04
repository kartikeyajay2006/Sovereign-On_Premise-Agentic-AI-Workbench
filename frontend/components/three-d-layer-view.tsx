'use client'

import { useState, useEffect } from 'react'
import { FileSearch, Cpu, Lock, ShieldCheck, Layers, Eye, Play, Pause, ChevronRight, Activity, Terminal, CheckCircle2 } from 'lucide-react'
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
  const [isAutoAnimating, setIsAutoAnimating] = useState<boolean>(true)

  // Auto-cycle layers when auto-animate is enabled
  useEffect(() => {
    if (!isAutoAnimating) return
    const interval = setInterval(() => {
      setSelectedLayerIndex((prev) => (prev + 1) % LAYERS.length)
    }, 4500)
    return () => clearInterval(interval)
  }, [isAutoAnimating])

  const selectedLayer = LAYERS[selectedLayerIndex]

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* View Mode Controls & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--sovereign)]/15 text-[var(--sovereign)]">
            <Layers className="h-4 w-4" />
          </span>
          <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-foreground">
            Full Architecture Layer Stack (4 Layers)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto Animation Toggle */}
          <button
            type="button"
            onClick={() => setIsAutoAnimating((prev) => !prev)}
            className={cn(
              'flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-[11px] transition-colors',
              isAutoAnimating ? 'border-[var(--sovereign)]/40 bg-[var(--sovereign)]/10 text-[var(--sovereign)]' : 'border-border bg-surface text-foreground-muted hover:text-foreground'
            )}
          >
            {isAutoAnimating ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isAutoAnimating ? 'Auto-Cycle Active' : 'Auto-Cycle Paused'}</span>
          </button>
        </div>
      </div>

      {/* Main 3D Canvas + Details Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Interactive 3D Perspective Visualizer (7 Columns) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative min-h-[380px] w-full rounded-xl border border-border bg-gradient-to-b from-surface/90 to-background/95 p-6 overflow-hidden flex items-center justify-center shadow-inner">
            {/* Background Tech Grid Lines */}
            <div 
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage: `radial-gradient(var(--border) 1px, transparent 1px)`,
                backgroundSize: '20px 20px'
              }}
            />

            {/* Simulated Data Flow Pulses (vertical dashed line) */}
            <div className="absolute top-10 bottom-10 left-1/2 -translate-x-1/2 w-0.5 border-r-2 border-dashed border-[var(--sovereign)]/30 pointer-events-none" />

            {/* Full Stack Layer Container */}
            <div className="relative w-full max-w-lg flex flex-col gap-2.5 my-2">
              {LAYERS.map((layer, idx) => {
                const isSelected = selectedLayerIndex === idx
                const IconComponent = layer.icon

                return (
                  <div
                    key={layer.id}
                    onClick={() => {
                      setSelectedLayerIndex(idx)
                      setIsAutoAnimating(false)
                    }}
                    className={cn(
                      'group relative w-full cursor-pointer rounded-lg border p-3.5 backdrop-blur-md transition-all',
                      isSelected
                        ? 'border-[var(--sovereign)] bg-surface shadow-[0_0_24px_rgba(16,185,129,0.2)] scale-[1.02] z-30 ring-2 ring-[var(--sovereign)]/50'
                        : 'border-border/80 bg-surface/60 hover:border-border-strong hover:bg-surface/85 z-10 opacity-85 hover:opacity-100'
                    )}
                  >
                    {/* Layer Header Tag */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded text-[11px] font-mono font-bold transition-transform group-hover:scale-110',
                            isSelected ? 'bg-[var(--sovereign)] text-black' : 'bg-surface-sunken text-foreground'
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
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-foreground-muted">
                        {layer.tag}
                      </span>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 font-mono text-[9px] font-medium text-[var(--sovereign)] animate-pulse">
                          <Activity className="h-2.5 w-2.5" /> SELECTED LAYER
                        </span>
                      )}
                    </div>

                    {/* Left Accent Glow line for selected state */}
                    {isSelected && (
                      <div className="absolute top-0 bottom-0 left-0 w-1 rounded-l-lg bg-[var(--sovereign)]" />
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
                    'flex flex-col items-center justify-center rounded border p-2 text-center transition-colors',
                    isSelected
                      ? 'border-[var(--sovereign)] bg-surface text-foreground font-medium'
                      : 'border-border bg-surface/40 text-foreground-muted hover:border-border-strong hover:text-foreground'
                  )}
                >
                  <span className="font-mono text-[10px]">Layer {layer.number}</span>
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
                  Layer {selectedLayer.number} Spec
                </span>
                <span className="font-mono text-[10px] text-foreground-muted">
                  Sovereignty Score: 100%
                </span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">{selectedLayer.title}</h3>
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
