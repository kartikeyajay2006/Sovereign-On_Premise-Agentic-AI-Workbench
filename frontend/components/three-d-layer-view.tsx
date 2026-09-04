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
  Activity,
  CheckCircle2,
  Zap,
  AlertTriangle,
  FileText,
  Eye,
  Database,
  Terminal,
  Hash,
  ArrowDown,
  Check,
  Shield,
  Clock,
  Globe,
  Server,
  UserCheck,
  File,
  Image,
  FileSpreadsheet,
  FileCode,
  ArrowRight,
  XCircle,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type LayerId = 'understand' | 'decide' | 'execute' | 'prove'

export interface ArchitectureLayerMeta {
  id: LayerId
  number: string
  conceptTitle: string
  title: string
  subtitle: string
  tag: string
  promise: string
  icon: any
}

const LAYERS: ArchitectureLayerMeta[] = [
  {
    id: 'understand',
    number: '01',
    conceptTitle: 'UNDERSTAND',
    title: 'Multimodal Intelligence Layer',
    subtitle: 'LOCAL OCR + PARSING + EMBEDDING',
    tag: 'LOCAL OCR + VECTOR EMBED',
    promise: 'Documents → Traceable Evidence',
    icon: FileSearch,
  },
  {
    id: 'decide',
    number: '02',
    conceptTitle: 'DECIDE',
    title: 'Intelligent Model Routing Layer',
    subtitle: 'LOCAL LLM AUTO-ROUTER',
    tag: 'DYNAMIC TASK CLASSIFIER',
    promise: 'Right Model · Right Task · Right Budget',
    icon: Cpu,
  },
  {
    id: 'execute',
    number: '03',
    conceptTitle: 'EXECUTE',
    title: 'Air-Gapped Sandbox Layer',
    subtitle: 'SECURE ISOLATED RUNTIME',
    tag: 'ISOLATED SUBPROCESS EXEC',
    promise: 'Code Runs · Network Doesn’t',
    icon: Lock,
  },
  {
    id: 'prove',
    number: '04',
    conceptTitle: 'PROVE',
    title: 'Verification & Sovereignty Layer',
    subtitle: 'TAMPER-EVIDENT AUDIT TRAIL',
    tag: 'CRYPTOGRAPHIC AUDIT LEDGER',
    promise: 'Evidence · Policy · Human · Hash',
    icon: ShieldCheck,
  },
]

export function ThreeDLayerView({ onClose }: { onClose?: () => void }) {
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number>(0)
  const [isAutoAnimating, setIsAutoAnimating] = useState<boolean>(true)
  const [isHoveredOverDetails, setIsHoveredOverDetails] = useState<boolean>(false)

  // Auto-cycle through the 4 architecture layers every 6 seconds unless paused or hovered
  useEffect(() => {
    if (!isAutoAnimating || isHoveredOverDetails) return
    const interval = setInterval(() => {
      setSelectedLayerIndex((prev) => (prev + 1) % LAYERS.length)
    }, 6000)
    return () => clearInterval(interval)
  }, [isAutoAnimating, isHoveredOverDetails])

  const activeLayer = LAYERS[selectedLayerIndex]

  const handleSelectLayer = (index: number) => {
    setSelectedLayerIndex(index)
    setIsAutoAnimating(false)
  }

  return (
    <div className="flex flex-col gap-5 w-full text-[#111111] selection:bg-[#18B663]/20">
      {/* SECOND HEADER ROW */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DFDFDA] pb-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[#18B663]/15 text-[#18B663]">
            <Layers className="h-3.5 w-3.5" />
          </span>
          <span className="font-mono text-[12px] font-bold uppercase tracking-wider text-[#111111]">
            FULL ARCHITECTURE LAYER STACK (4 LAYERS)
          </span>
        </div>

        {/* Auto-Cycle Control */}
        <button
          type="button"
          onClick={() => setIsAutoAnimating((prev) => !prev)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-[11px] font-medium transition-all cursor-pointer shadow-2xs',
            isAutoAnimating
              ? 'border-[#18B663]/40 bg-[#18B663]/10 text-[#18B663] hover:bg-[#18B663]/20'
              : 'border-[#DFDFDA] bg-white text-[#70706C] hover:border-[#111111] hover:text-[#111111]'
          )}
        >
          {isAutoAnimating ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          <span>{isAutoAnimating ? 'Auto-Cycle Active' : 'Auto-Cycle Paused'}</span>
        </button>
      </div>

      {/* MAIN 2-COLUMN LAYOUT: Left Navigation Stack + Right Interactive Layer Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT ARCHITECTURE NAVIGATION (4 Vertically Stacked Cards) */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 relative">
            {LAYERS.map((layer, idx) => {
              const isSelected = selectedLayerIndex === idx
              const IconComp = layer.icon

              return (
                <div key={layer.id} className="relative">
                  {/* Subtle dotted connector line between cards */}
                  {idx < LAYERS.length - 1 && (
                    <div className="absolute left-[26px] top-[60px] bottom-[-16px] z-0 w-0.5 border-l-2 border-dashed border-[#DFDFDA]" />
                  )}

                  <div
                    onClick={() => handleSelectLayer(idx)}
                    className={cn(
                      'group relative z-10 flex flex-col gap-2 rounded-xl border p-4 cursor-pointer transition-all duration-200 text-left',
                      isSelected
                        ? 'border-[#18B663] bg-white ring-2 ring-[#18B663]/30 shadow-[0_4px_20px_rgba(24,182,99,0.12)]'
                        : 'border-[#DFDFDA] bg-white/80 hover:border-[#111111]/40 hover:bg-white'
                    )}
                  >
                    {/* Header: Concept Badge + Number + Icon */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded font-mono text-[11px] font-bold transition-colors',
                            isSelected
                              ? 'bg-[#18B663] text-white shadow-xs'
                              : 'bg-[#F0F0EC] text-[#70706C] group-hover:text-[#111111]'
                          )}
                        >
                          {layer.number}
                        </span>
                        <span className="font-mono text-[10px] font-extrabold uppercase tracking-widest text-[#18B663]">
                          {layer.conceptTitle}
                        </span>
                      </div>

                      <IconComp
                        className={cn(
                          'h-4 w-4 transition-colors shrink-0',
                          isSelected ? 'text-[#18B663]' : 'text-[#70706C] group-hover:text-[#111111]'
                        )}
                      />
                    </div>

                    {/* Main Title & Subtitle */}
                    <div className="flex flex-col pl-8">
                      <h4 className="text-[13px] font-bold text-[#111111] leading-snug">
                        {layer.title}
                      </h4>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[#70706C] pt-0.5">
                        {layer.subtitle}
                      </span>
                    </div>

                    {/* Promise Line */}
                    <div className="pl-8 pt-1 flex items-center justify-between border-t border-[#DFDFDA]/60 mt-1">
                      <span className="font-mono text-[10px] font-medium text-[#18B663]">
                        {layer.promise}
                      </span>
                      {isSelected && (
                        <span className="flex items-center gap-1 font-mono text-[9px] font-bold text-[#18B663]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#18B663] animate-ping" />
                          ACTIVE
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Quick Tab Buttons at bottom of left nav */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {LAYERS.map((layer, idx) => {
              const isSelected = selectedLayerIndex === idx
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => handleSelectLayer(idx)}
                  className={cn(
                    'rounded border py-1.5 px-1 text-center font-mono text-[10px] transition-all cursor-pointer',
                    isSelected
                      ? 'border-[#18B663] bg-[#18B663] text-white font-bold shadow-2xs'
                      : 'border-[#DFDFDA] bg-white text-[#70706C] hover:border-[#111111] hover:text-[#111111]'
                  )}
                >
                  Layer {layer.number}
                </button>
              )
            })}
          </div>
        </div>

        {/* RIGHT INTERACTIVE LAYER VISUALIZATION DISPLAY */}
        <div
          className="lg:col-span-8 flex flex-col gap-4"
          onMouseEnter={() => setIsHoveredOverDetails(true)}
          onMouseLeave={() => setIsHoveredOverDetails(false)}
        >
          {activeLayer.id === 'understand' && <Layer01UnderstandView />}
          {activeLayer.id === 'decide' && <Layer02DecideView />}
          {activeLayer.id === 'execute' && <Layer03ExecuteView />}
          {activeLayer.id === 'prove' && <Layer04ProveView />}
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
 * LAYER 01 — UNDERSTAND (MULTIMODAL INTELLIGENCE LAYER)
 * ============================================================================ */
function Layer01UnderstandView() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#DFDFDA] bg-white p-5 sm:p-6 shadow-sm">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DFDFDA] pb-3.5">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#18B663]">
            LAYER 01 · UNDERSTAND
          </span>
          <h3 className="text-xl font-bold tracking-tight text-[#111111]">Multimodal Intelligence Layer</h3>
          <p className="text-[12px] text-[#70706C]">Local Parse, OCR, Vision & Vector Embedding Engine</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="font-mono text-[10px] text-[#70706C]">Sovereignty Score: <strong className="text-[#18B663]">100%</strong></span>
            <div className="h-1.5 w-24 rounded-full bg-[#E5E7EB] overflow-hidden mt-1">
              <div className="h-full w-full bg-[#18B663]" />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-[#18B663]/30 bg-[#18B663]/10 px-3 py-1.5 text-[11px]">
            <span className="h-2 w-2 rounded-full bg-[#18B663] animate-pulse" />
            <div className="flex flex-col leading-none">
              <span className="font-mono text-[10px] font-bold text-[#111111]">Layer Active</span>
              <span className="font-mono text-[9px] text-[#70706C]">Processing Inputs...</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN VISUAL FLOW: INPUT -> LOCAL CORE -> STRUCTURED OUTPUT */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
        {/* INPUT (ON-PREMISE) */}
        <div className="md:col-span-3 flex flex-col gap-2 rounded-lg border border-[#DFDFDA] bg-[#FAFAF8] p-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#70706C] border-b border-[#DFDFDA] pb-1 flex items-center justify-between">
            <span>INPUT (ON-PREMISE)</span>
            <Lock className="h-3 w-3 text-[#18B663]" />
          </span>

          <div className="flex flex-col gap-1.5 pt-1">
            {[
              { type: 'PDF Reports', ext: 'PDF', icon: FileText },
              { type: 'Images & Scans', ext: 'JPG / PNG', icon: Image },
              { type: 'Spreadsheets', ext: 'XLSX / CSV', icon: FileSpreadsheet },
              { type: 'CAD Drawings', ext: 'P&ID / CAD', icon: File },
              { type: 'Documents', ext: 'DOCX / TXT', icon: FileCode },
            ].map((item, i) => {
              const Icon = item.icon
              return (
                <div key={i} className="flex items-center justify-between rounded border border-[#DFDFDA] bg-white px-2.5 py-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-[#18B663]" />
                    <span className="font-medium text-[#111111]">{item.type}</span>
                  </div>
                  <span className="font-mono text-[9px] font-bold text-[#70706C]">{item.ext}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* CENTER PROCESSING CORE */}
        <div className="md:col-span-6 flex flex-col items-center justify-between gap-3 rounded-lg border border-[#DFDFDA] bg-[#F7F7F4] p-3 text-center">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#70706C] border-b border-[#DFDFDA] w-full pb-1">
            LOCAL MULTIMODAL PROCESSING CORE
          </span>

          {/* 3D Layered Processing Stack Visualizer */}
          <div className="w-full flex flex-col items-center gap-1 my-1">
            {[
              'OCR Engine (PaddleOCR)',
              'Layout & Table Extractor',
              'Diagram & CAD Analyzer',
              'Vision Understanding Model',
              'Vector Embedder (MiniLM-L6)',
            ].map((label, idx) => (
              <div
                key={idx}
                className="w-[90%] rounded border border-[#18B663]/40 bg-white py-1.5 px-3 font-mono text-[10px] font-bold text-[#111111] shadow-2xs flex items-center justify-between"
              >
                <span className="text-[#18B663]">0{idx + 1}</span>
                <span>{label}</span>
                <CheckCircle2 className="h-3 w-3 text-[#18B663]" />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 rounded bg-[#18B663]/10 border border-[#18B663]/30 px-3 py-1 text-[10px] font-mono text-[#18B663] font-bold w-full">
            <Lock className="h-3 w-3" />
            <span>LOCAL PROCESSING · ZERO EXTERNAL CALLS</span>
          </div>
        </div>

        {/* STRUCTURED OUTPUT */}
        <div className="md:col-span-3 flex flex-col gap-2 rounded-lg border border-[#DFDFDA] bg-[#FAFAF8] p-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#70706C] border-b border-[#DFDFDA] pb-1">
            STRUCTURED OUTPUT
          </span>

          <div className="flex flex-col gap-1.5 pt-1">
            {['Text Chunks', 'Tables & Matrices', 'Diagram Crops', 'Identified Entities', 'Vector Embeddings'].map(
              (out, i) => (
                <div key={i} className="flex items-center justify-between rounded border border-[#18B663]/30 bg-white px-2.5 py-1.5 text-[11px]">
                  <span className="font-medium text-[#111111]">{out}</span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#18B663]" />
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* LOWER PREVIEW AREA: EXTRACTED CONTENT & EVIDENCE TRACEABILITY */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Extracted Content Preview */}
        <div className="flex flex-col gap-2 rounded-lg border border-[#DFDFDA] bg-[#FAFAF8] p-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#70706C] border-b border-[#DFDFDA] pb-1">
            EXTRACTED CONTENT (PREVIEW)
          </span>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex flex-col gap-1 font-mono text-[10px] bg-white p-2 rounded border border-[#DFDFDA]">
              <div><span className="text-[#70706C]">Item No:</span> <strong>PV-101</strong></div>
              <div><span className="text-[#70706C]">Equipment:</span> <strong>Pressure Vessel</strong></div>
              <div><span className="text-[#70706C]">Design Press:</span> <strong>10.5 barg</strong></div>
              <div><span className="text-[#70706C]">Inspect Date:</span> <strong>12-03-2024</strong></div>
              <div><span className="text-[#70706C]">Corrosion:</span> <strong>0.12 mm/year</strong></div>
            </div>

            <div className="flex flex-col items-center justify-center bg-white p-2 rounded border border-[#DFDFDA] text-center">
              <span className="font-mono text-[9px] text-[#70706C] uppercase font-bold">P&ID Crop Preview</span>
              <div className="mt-1 h-12 w-full border border-dashed border-[#18B663]/40 bg-[#18B663]/5 rounded flex items-center justify-center text-[10px] font-mono text-[#18B663]">
                Region A2 [PV-101]
              </div>
            </div>
          </div>
        </div>

        {/* Evidence Traceability */}
        <div className="flex flex-col gap-2 rounded-lg border border-[#DFDFDA] bg-[#FAFAF8] p-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#70706C] border-b border-[#DFDFDA] pb-1">
            EVIDENCE TRACEABILITY (PROVENANCE)
          </span>

          <div className="flex flex-col gap-1 text-[10px] font-mono">
            {[
              { src: 'Inspection_Report.pdf', ref: 'Page 3 · Section 2.1' },
              { src: 'P&ID_Unit1.png', ref: 'Region A2 · Equipment Tag' },
              { src: 'Measurements.xlsx', ref: 'Sheet Data · Rows 12–45' },
              { src: 'SOP_Maintenance.docx', ref: 'Page 7 · Clause 4.3' },
            ].map((ev, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-white p-1.5 border border-[#DFDFDA]">
                <span className="font-semibold text-[#111111]">{ev.src}</span>
                <span className="text-[#18B663] font-bold">{ev.ref}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* METRICS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        {[
          { num: '18', label: 'Pages Parsed' },
          { num: '42', label: 'Evidence Units' },
          { num: '24.6s', label: 'Processing Time' },
          { num: '0', label: 'External Calls' },
        ].map((m, i) => (
          <div key={i} className="flex flex-col items-center rounded border border-[#DFDFDA] bg-[#FAFAF8] py-2 text-center">
            <span className="text-lg font-extrabold text-[#111111]">{m.num}</span>
            <span className="font-mono text-[10px] text-[#70706C]">{m.label}</span>
          </div>
        ))}
      </div>

      {/* BOTTOM HIT MESSAGE */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#18B663]/30 bg-[#18B663]/10 px-4 py-3 text-[12px]">
        <div className="flex flex-col">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#111111]">
            RAW DOCUMENT → TRACEABLE EVIDENCE
          </span>
          <span className="text-[11px] text-[#70706C]">
            Every extracted fact retains its original source, page reference, region and context.
          </span>
        </div>
        <span className="font-serif italic text-[#18B663] text-[12px] font-bold">
          “Your data never leaves your infrastructure.”
        </span>
      </div>
    </div>
  )
}

/* ============================================================================
 * LAYER 02 — DECIDE (INTELLIGENT MODEL ROUTING LAYER)
 * ============================================================================ */
function Layer02DecideView() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#DFDFDA] bg-white p-5 sm:p-6 shadow-sm">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DFDFDA] pb-3.5">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#18B663]">
            LAYER 02 · DECIDE
          </span>
          <h3 className="text-xl font-bold tracking-tight text-[#111111]">Intelligent Model Routing Layer</h3>
          <p className="text-[12px] text-[#70706C]">Dynamic Task Analysis & Governed Model Selection</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="font-mono text-[10px] text-[#70706C]">Sovereignty Score: <strong className="text-[#18B663]">100%</strong></span>
            <div className="h-1.5 w-24 rounded-full bg-[#E5E7EB] overflow-hidden mt-1">
              <div className="h-full w-full bg-[#18B663]" />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-[#18B663]/30 bg-[#18B663]/10 px-3 py-1.5 text-[11px]">
            <span className="h-2 w-2 rounded-full bg-[#18B663] animate-pulse" />
            <div className="flex flex-col leading-none">
              <span className="font-mono text-[10px] font-bold text-[#111111]">Layer Active</span>
              <span className="font-mono text-[9px] text-[#70706C]">Routing Task...</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN ROUTING FLOW & GOVERNED DECISION PIPELINE */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* Left / Central Flow (8 Cols) */}
        <div className="md:col-span-8 flex flex-col gap-3">
          {/* User Query Card */}
          <div className="flex flex-col gap-1 rounded-lg border border-[#DFDFDA] bg-[#FAFAF8] p-3">
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#70706C]">
              USER QUERY / TASK
            </span>
            <p className="text-[12px] font-semibold text-[#111111]">
              “Analyze this P&ID and calculate the pressure rating as per API 510.”
            </p>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="h-4 w-4 text-[#18B663]" />
          </div>

          {/* Task Analyzer Card */}
          <div className="flex items-center justify-between rounded-lg border border-[#18B663]/40 bg-[#18B663]/10 p-3 text-[11px]">
            <div className="flex items-center gap-2 font-mono font-bold text-[#111111]">
              <Cpu className="h-4 w-4 text-[#18B663]" />
              <span>TASK ANALYZER</span>
            </div>
            <span className="font-mono text-[10px] text-[#70706C]">Understand · Classify · Plan</span>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="h-4 w-4 text-[#18B663]" />
          </div>

          {/* 3 Model Branches */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Branch 1 */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-[#DFDFDA] bg-[#FAFAF8] p-2.5 text-center">
              <span className="font-mono text-[9px] font-bold text-[#70706C]">Document Reasoning</span>
              <div className="rounded bg-white p-2 border border-[#DFDFDA]">
                <span className="text-[11px] font-bold text-[#111111] block">Reasoning Model</span>
                <span className="font-mono text-[9px] text-[#18B663]">Qwen 2.5 72B</span>
              </div>
              <div className="flex flex-wrap gap-1 justify-center pt-1 font-mono text-[8px]">
                <span className="rounded bg-[#F0F0EC] px-1 py-0.5">Reasoning</span>
                <span className="rounded bg-[#F0F0EC] px-1 py-0.5">RAG</span>
              </div>
            </div>

            {/* Branch 2 */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-[#18B663] bg-white p-2.5 text-center ring-2 ring-[#18B663]/20">
              <span className="font-mono text-[9px] font-bold text-[#18B663]">Calculation & Code</span>
              <div className="rounded bg-[#18B663]/10 p-2 border border-[#18B663]/30">
                <span className="text-[11px] font-bold text-[#111111] block">Coding Model</span>
                <span className="font-mono text-[9px] text-[#18B663]">DeepSeek R1 Distill</span>
              </div>
              <div className="flex flex-wrap gap-1 justify-center pt-1 font-mono text-[8px]">
                <span className="rounded bg-[#18B663]/20 px-1 py-0.5 text-[#18B663] font-bold">Python</span>
                <span className="rounded bg-[#18B663]/20 px-1 py-0.5 text-[#18B663] font-bold">Math</span>
              </div>
            </div>

            {/* Branch 3 */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-[#DFDFDA] bg-[#FAFAF8] p-2.5 text-center">
              <span className="font-mono text-[9px] font-bold text-[#70706C]">Vision & Diagram</span>
              <div className="rounded bg-white p-2 border border-[#DFDFDA]">
                <span className="text-[11px] font-bold text-[#111111] block">Vision Model</span>
                <span className="font-mono text-[9px] text-[#18B663]">Qwen2.5-VL 7B</span>
              </div>
              <div className="flex flex-wrap gap-1 justify-center pt-1 font-mono text-[8px]">
                <span className="rounded bg-[#F0F0EC] px-1 py-0.5">Vision</span>
                <span className="rounded bg-[#F0F0EC] px-1 py-0.5">OCR</span>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="h-4 w-4 text-[#18B663]" />
          </div>

          {/* Response Box */}
          <div className="flex items-center justify-between rounded-lg border border-[#18B663] bg-[#18B663]/15 p-3 text-[11px]">
            <span className="font-bold text-[#111111]">RESPONSE WITH SOURCE & VERIFICATION</span>
            <span className="font-mono text-[10px] text-[#70706C]">Model Output + Evidence + Citations</span>
          </div>
        </div>

        {/* Right Side Panel: Why This Model? + Installed != Authorized (4 Cols) */}
        <div className="md:col-span-4 flex flex-col gap-3">
          {/* Why This Model? */}
          <div className="flex flex-col gap-2 rounded-lg border border-[#DFDFDA] bg-[#FAFAF8] p-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#70706C] border-b border-[#DFDFDA] pb-1">
              WHY THIS MODEL?
            </span>
            <div className="flex flex-col gap-2 text-[11px] font-mono">
              <div className="flex justify-between">
                <span className="text-[#70706C]">Task Match:</span>
                <strong className="text-[#18B663]">96%</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#70706C]">Resource Fit:</span>
                <strong className="text-[#18B663]">91%</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#70706C]">Security Policy:</span>
                <strong className="text-[#18B663]">PASS</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#70706C]">Model Registry:</span>
                <strong className="text-[#18B663]">APPROVED</strong>
              </div>
            </div>
          </div>

          {/* CRITICAL SECURITY WARNING CARD: INSTALLED != AUTHORIZED */}
          <div className="flex flex-col gap-1.5 rounded-lg border border-[#EAB308] bg-[#FEF9C3] p-3 text-[#111111]">
            <div className="flex items-center gap-1.5 text-[#CA8A04] font-mono font-extrabold text-[11px]">
              <AlertTriangle className="h-4 w-4" />
              <span>INSTALLED ≠ AUTHORIZED</span>
            </div>
            <p className="text-[11px] leading-tight text-[#854D0E]">
              Only approved models can be used. All routing decisions are policy-controlled and logged.
            </p>
          </div>

          {/* Available Models */}
          <div className="flex flex-col gap-1.5 rounded-lg border border-[#DFDFDA] bg-[#FAFAF8] p-3 text-[10px] font-mono">
            <span className="font-bold text-[#70706C] border-b border-[#DFDFDA] pb-1 uppercase">LOCAL MODEL REGISTRY</span>
            <div className="flex flex-col gap-1 text-[10px]">
              <div><strong>Qwen 2.5 72B</strong> — Reasoning & RAG (Approved)</div>
              <div><strong>DeepSeek R1</strong> — Code & Math (Approved)</div>
              <div><strong>Qwen2.5-VL</strong> — Diagram OCR (Approved)</div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM HIT MESSAGE */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#18B663]/30 bg-[#18B663]/10 px-4 py-3 text-[12px]">
        <div className="flex flex-col">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#111111]">
            GOVERNED INTELLIGENCE
          </span>
          <span className="text-[11px] text-[#70706C]">
            Every task is routed to the most suitable local model — securely, efficiently and transparently.
          </span>
        </div>
        <span className="font-serif italic text-[#18B663] text-[12px] font-bold">
          “Right intelligence. Within your control.”
        </span>
      </div>
    </div>
  )
}

/* ============================================================================
 * LAYER 03 — EXECUTE (AIR-GAPPED SANDBOX LAYER)
 * ============================================================================ */
function Layer03ExecuteView() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#DFDFDA] bg-white p-5 sm:p-6 shadow-sm">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DFDFDA] pb-3.5">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#18B663]">
            LAYER 03 · EXECUTE
          </span>
          <h3 className="text-xl font-bold tracking-tight text-[#111111]">Air-Gapped Sandbox Layer</h3>
          <p className="text-[12px] text-[#70706C]">Isolated Python Subprocess Execution & AST Validator</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="font-mono text-[10px] text-[#70706C]">Sovereignty Score: <strong className="text-[#18B663]">100%</strong></span>
            <div className="h-1.5 w-24 rounded-full bg-[#E5E7EB] overflow-hidden mt-1">
              <div className="h-full w-full bg-[#18B663]" />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-[#18B663]/30 bg-[#18B663]/10 px-3 py-1.5 text-[11px]">
            <span className="h-2 w-2 rounded-full bg-[#18B663] animate-pulse" />
            <div className="flex flex-col leading-none">
              <span className="font-mono text-[10px] font-bold text-[#111111]">Layer Active</span>
              <span className="font-mono text-[9px] text-[#70706C]">Executing in isolated environment</span>
            </div>
          </div>
        </div>
      </div>

      {/* CENTRAL SANDBOX PIPELINE & BLOCKED EVENT TERMINAL */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* Central Flow (7 Cols) */}
        <div className="md:col-span-7 flex flex-col gap-2.5">
          <div className="flex items-center justify-between rounded-lg border border-[#DFDFDA] bg-[#FAFAF8] p-2.5 text-[11px]">
            <span className="font-bold text-[#111111]">AGENT REQUEST</span>
            <span className="font-mono text-[10px] text-[#70706C]">Execute calculation / analysis</span>
          </div>

          <div className="flex justify-center"><ArrowDown className="h-3.5 w-3.5 text-[#18B663]" /></div>

          <div className="flex items-center justify-between rounded-lg border border-[#18B663]/40 bg-[#18B663]/10 p-2.5 text-[11px]">
            <span className="font-bold text-[#111111]">POLICY CHECK</span>
            <span className="font-mono text-[10px] text-[#18B663] font-bold">✓ PASS</span>
          </div>

          <div className="flex justify-center"><ArrowDown className="h-3.5 w-3.5 text-[#18B663]" /></div>

          <div className="flex items-center justify-between rounded-lg border border-[#18B663]/40 bg-[#18B663]/10 p-2.5 text-[11px]">
            <span className="font-bold text-[#111111]">AST VALIDATION</span>
            <span className="font-mono text-[10px] text-[#18B663] font-bold">✓ PASS</span>
          </div>

          <div className="flex justify-center"><ArrowDown className="h-3.5 w-3.5 text-[#18B663]" /></div>

          {/* 3D GLASS-LIKE ISOLATED SANDBOX CORE */}
          <div className="flex flex-col gap-2 rounded-xl border-2 border-[#18B663] bg-[#18B663]/5 p-4 shadow-sm text-center relative overflow-hidden">
            <span className="font-mono text-[11px] font-extrabold text-[#18B663] uppercase tracking-widest flex items-center justify-center gap-1.5">
              <Lock className="h-4 w-4" /> 3D ISOLATED SANDBOX CORE
            </span>

            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1">
              <div className="flex flex-col gap-1 bg-white p-2 rounded border border-[#DFDFDA] text-left">
                <div className="text-[#18B663] font-bold border-b border-[#DFDFDA] pb-0.5">CAPABILITIES</div>
                <div>File Access: Scoped ✓</div>
                <div>Memory Limit: 2 GB ✓</div>
                <div>CPU Limit: 2 vCPU ✓</div>
              </div>

              <div className="flex flex-col gap-1 bg-white p-2 rounded border border-[#DFDFDA] text-left">
                <div className="text-[#EF4444] font-bold border-b border-[#DFDFDA] pb-0.5">RESTRICTIONS</div>
                <div className="text-[#EF4444] font-bold">Network: Blocked 0.0.0.0 ✗</div>
                <div>System Calls: Restricted ✓</div>
                <div>External Tools: Allowlisted ✓</div>
              </div>
            </div>
          </div>

          <div className="flex justify-center"><ArrowDown className="h-3.5 w-3.5 text-[#18B663]" /></div>

          <div className="flex items-center justify-between rounded-lg border border-[#18B663] bg-[#18B663]/15 p-2.5 text-[11px]">
            <span className="font-bold text-[#111111]">EXECUTION RESULT</span>
            <span className="font-mono text-[10px] text-[#70706C]">Return output with logs & metrics</span>
          </div>
        </div>

        {/* Right Side: Metrics & Real-Time Terminal Log (5 Cols) */}
        <div className="md:col-span-5 flex flex-col gap-3">
          {/* Metrics */}
          <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
            <div className="rounded border border-[#DFDFDA] bg-[#FAFAF8] p-2 text-center">
              <div className="text-base font-extrabold text-[#111111]">12.4s</div>
              <div className="text-[#70706C]">Exec Time</div>
            </div>
            <div className="rounded border border-[#DFDFDA] bg-[#FAFAF8] p-2 text-center">
              <div className="text-base font-extrabold text-[#111111]">3.2 MB</div>
              <div className="text-[#70706C]">Memory Used</div>
            </div>
            <div className="rounded border border-[#DFDFDA] bg-[#FAFAF8] p-2 text-center">
              <div className="text-base font-extrabold text-[#111111]">7</div>
              <div className="text-[#70706C]">Files Read</div>
            </div>
            <div className="rounded border border-[#DFDFDA] bg-[#FAFAF8] p-2 text-center">
              <div className="text-base font-extrabold text-[#18B663]">0</div>
              <div className="text-[#70706C]">External Calls</div>
            </div>
          </div>

          {/* REAL-TIME SANDBOX LOG (Dark Terminal Panel with Red Blocked Action) */}
          <div className="flex flex-col gap-1 rounded-lg border border-[#111111] bg-[#111111] p-3 text-white font-mono text-[10px]">
            <div className="flex items-center justify-between border-b border-[#333333] pb-1 mb-1 text-[#70706C]">
              <span>REAL-TIME SANDBOX LOG</span>
              <span className="text-[#18B663]">ACTIVE</span>
            </div>
            <div className="text-[#A3A3A3]">01 Initializing isolated environment...</div>
            <div className="text-[#A3A3A3]">02 Loading allowed libraries...</div>
            <div className="text-[#A3A3A3]">03 Executing: calculate_thickness.py</div>
            <div className="text-[#18B663]">04 [OK] Execution completed in 12.4s</div>
            <div className="text-[#EF4444] font-bold bg-[#EF4444]/20 p-1 rounded my-0.5">
              05 [BLOCKED] socket.connect(8.8.8.8)
            </div>
            <div className="text-[#EF4444]">06 Denied by network policy</div>
            <div className="text-[#A3A3A3]">07 Result saved to /sandbox/output/</div>
          </div>

          {/* BLOCKED ACTION CARD */}
          <div className="flex flex-col gap-1 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 p-2.5 text-[10px] font-mono">
            <span className="font-bold text-[#EF4444] flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5" /> BLOCKED ACTION (EXAMPLE)
            </span>
            <div className="text-[#111111] font-bold">socket.connect(8.8.8.8)</div>
            <div className="text-[#EF4444] font-semibold">DENIED BY POLICY · No external network access</div>
          </div>
        </div>
      </div>

      {/* BOTTOM SECURITY GUARANTEE */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#18B663]/30 bg-[#18B663]/10 px-4 py-3 text-[12px]">
        <div className="flex flex-col">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#111111]">
            ISOLATION & SECURITY GUARANTEE
          </span>
          <span className="text-[11px] text-[#70706C]">
            Restricted environment · No internet access · AST code validation · cgroup limits · Allowlisted tools
          </span>
        </div>
        <span className="font-mono font-extrabold text-[#18B663] text-[11px] tracking-wider uppercase">
          EXECUTION WITHOUT UNCONTROLLED AGENCY.
        </span>
      </div>
    </div>
  )
}

/* ============================================================================
 * LAYER 04 — PROVE (VERIFICATION & SOVEREIGNTY LAYER)
 * ============================================================================ */
function Layer04ProveView() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#DFDFDA] bg-white p-5 sm:p-6 shadow-sm">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DFDFDA] pb-3.5">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#18B663]">
            LAYER 04 · PROVE
          </span>
          <h3 className="text-xl font-bold tracking-tight text-[#111111]">Verification & Sovereignty Layer</h3>
          <p className="text-[12px] text-[#70706C]">Cryptographic Verification, Audit Trail & Sovereignty Monitor</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="font-mono text-[10px] text-[#70706C]">Sovereignty Score: <strong className="text-[#18B663]">100%</strong></span>
            <div className="h-1.5 w-24 rounded-full bg-[#E5E7EB] overflow-hidden mt-1">
              <div className="h-full w-full bg-[#18B663]" />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-[#18B663]/30 bg-[#18B663]/10 px-3 py-1.5 text-[11px]">
            <span className="h-2 w-2 rounded-full bg-[#18B663] animate-pulse" />
            <div className="flex flex-col leading-none">
              <span className="font-mono text-[10px] font-bold text-[#111111]">Layer Active</span>
              <span className="font-mono text-[9px] text-[#70706C]">Verifying and Logging...</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN VERIFICATION FLOW & TAMPER-EVIDENT AUDIT CHAIN */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* Left Audit Context Panel (3 Cols) */}
        <div className="md:col-span-3 flex flex-col gap-2 rounded-lg border border-[#DFDFDA] bg-[#FAFAF8] p-3 text-[10px] font-mono">
          <span className="font-bold text-[#70706C] border-b border-[#DFDFDA] pb-1 uppercase">AUDIT CONTEXT</span>
          <div className="flex flex-col gap-2 pt-1">
            <div>
              <span className="text-[#70706C] block">User Query:</span>
              <span className="font-bold text-[#111111]">Pressure vessel design assessment</span>
            </div>
            <div>
              <span className="text-[#70706C] block">Model Used:</span>
              <span className="font-bold text-[#111111]">Reasoning LLM</span>
            </div>
            <div>
              <span className="text-[#70706C] block">Tools Executed:</span>
              <span className="font-bold text-[#111111]">Python (sandboxed)</span>
            </div>
            <div>
              <span className="text-[#70706C] block">Documents:</span>
              <span className="font-bold text-[#111111]">API 510, Plant Docs</span>
            </div>
            <div>
              <span className="text-[#70706C] block">Timestamp:</span>
              <span className="font-bold text-[#111111]">2025-01-21 14:32:18</span>
            </div>
          </div>
        </div>

        {/* Center Verification Pipeline Flowchart (5 Cols) */}
        <div className="md:col-span-5 flex flex-col gap-1.5 items-center">
          <div className="w-full flex items-center justify-between rounded border border-[#DFDFDA] bg-[#FAFAF8] px-3 py-1.5 text-[11px]">
            <span className="font-bold text-[#111111]">AI OUTPUT</span>
            <span className="font-mono text-[9px] text-[#70706C]">Answer · Code · Report</span>
          </div>

          <ArrowDown className="h-3 w-3 text-[#18B663]" />

          <div className="w-full flex items-center justify-between rounded border border-[#18B663]/30 bg-white px-3 py-1.5 text-[11px]">
            <span className="font-semibold text-[#111111]">Evidence Check</span>
            <span className="text-[#18B663] font-mono text-[10px] font-bold">✓</span>
          </div>

          <ArrowDown className="h-3 w-3 text-[#18B663]" />

          <div className="w-full flex items-center justify-between rounded border border-[#18B663]/30 bg-white px-3 py-1.5 text-[11px]">
            <span className="font-semibold text-[#111111]">Calculation Check</span>
            <span className="text-[#18B663] font-mono text-[10px] font-bold">✓</span>
          </div>

          <ArrowDown className="h-3 w-3 text-[#18B663]" />

          <div className="w-full flex items-center justify-between rounded border border-[#18B663]/30 bg-white px-3 py-1.5 text-[11px]">
            <span className="font-semibold text-[#111111]">Policy Compliance</span>
            <span className="text-[#18B663] font-mono text-[10px] font-bold">✓</span>
          </div>

          <ArrowDown className="h-3 w-3 text-[#18B663]" />

          <div className="w-full flex items-center justify-between rounded border border-[#18B663]/30 bg-white px-3 py-1.5 text-[11px]">
            <span className="font-semibold text-[#111111]">Network Check</span>
            <span className="text-[#18B663] font-mono text-[10px] font-bold">✓</span>
          </div>

          <ArrowDown className="h-3 w-3 text-[#18B663]" />

          {/* HUMAN APPROVAL GATE WITH AMBER HIGHLIGHT */}
          <div className="w-full flex items-center justify-between rounded border-2 border-[#F59E0B] bg-[#FEF3C7] px-3 py-1.5 text-[11px]">
            <span className="font-bold text-[#92400E]">HUMAN APPROVAL</span>
            <span className="rounded bg-[#F59E0B] px-2 py-0.5 text-[9px] font-mono font-bold text-white uppercase">
              Required
            </span>
          </div>

          <ArrowDown className="h-3 w-3 text-[#18B663]" />

          <div className="w-full flex items-center justify-between rounded border-2 border-[#18B663] bg-[#18B663]/15 px-3 py-2 text-[11px]">
            <span className="font-bold text-[#111111]">VERIFIED & APPROVED OUTPUT</span>
            <span className="font-mono text-[9px] text-[#18B663] font-bold">Released with Audit Record</span>
          </div>
        </div>

        {/* Right Side: Metrics & Tamper-Evident Audit Log Chain (4 Cols) */}
        <div className="md:col-span-4 flex flex-col gap-3">
          {/* Metrics */}
          <div className="grid grid-cols-2 gap-2 text-center font-mono text-[10px]">
            <div className="rounded border border-[#DFDFDA] bg-[#FAFAF8] p-2">
              <div className="text-base font-extrabold text-[#111111]">5</div>
              <div className="text-[#70706C]">Verification Checks</div>
            </div>
            <div className="rounded border border-[#DFDFDA] bg-[#FAFAF8] p-2">
              <div className="text-base font-extrabold text-[#18B663]">100%</div>
              <div className="text-[#70706C]">Policy Compliant</div>
            </div>
            <div className="rounded border border-[#DFDFDA] bg-[#FAFAF8] p-2">
              <div className="text-base font-extrabold text-[#111111]">0</div>
              <div className="text-[#70706C]">External Calls</div>
            </div>
            <div className="rounded border border-[#DFDFDA] bg-[#FAFAF8] p-2">
              <div className="text-base font-extrabold text-[#111111]">1.8s</div>
              <div className="text-[#70706C]">Verification Time</div>
            </div>
          </div>

          {/* AUDIT LOG CHAIN (TAMPER-EVIDENT) */}
          <div className="flex flex-col gap-1.5 rounded-lg border border-[#DFDFDA] bg-[#FAFAF8] p-3 text-[10px] font-mono">
            <div className="flex items-center justify-between border-b border-[#DFDFDA] pb-1">
              <span className="font-bold text-[#70706C] uppercase">AUDIT LOG CHAIN (TAMPER-EVIDENT)</span>
              <span className="text-[#18B663] font-bold">✓ Verified</span>
            </div>

            {[
              { id: '#042', hash: 'Hash: 9AF2...7D3C', desc: 'User query received', time: '14:32:13' },
              { id: '#043', hash: 'Hash: C81D...2B9E', desc: 'Model execution', time: '14:32:14' },
              { id: '#044', hash: 'Hash: 7E12...9F6A', desc: 'Verification completed', time: '14:32:16' },
              { id: '#045', hash: 'Hash: 1D3B...4C8E', desc: 'Approved & released', time: '14:32:18' },
            ].map((block, i) => (
              <div key={i} className="flex flex-col gap-0.5 rounded bg-white p-1.5 border border-[#DFDFDA]">
                <div className="flex justify-between">
                  <strong className="text-[#18B663]">{block.id}</strong>
                  <span className="text-[#70706C] text-[9px]">{block.time}</span>
                </div>
                <div className="text-[#111111] font-semibold">{block.hash}</div>
                <div className="text-[#70706C] text-[9px]">{block.desc}</div>
              </div>
            ))}
          </div>

          {/* Sovereignty Guarantee Box */}
          <div className="flex flex-col gap-1 rounded-lg border border-[#18B663]/30 bg-[#18B663]/10 p-2.5 text-[10px]">
            <div className="font-mono font-bold text-[#18B663] uppercase">SOVEREIGNTY GUARANTEE</div>
            <div className="flex items-center justify-between font-mono text-[#70706C]">
              <span>Local Infra · Immutable Ledger</span>
              <span className="font-bold text-[#18B663]">YOUR CONTROL</span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM HIT MESSAGE */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#18B663]/30 bg-[#18B663]/10 px-4 py-3 text-[12px]">
        <div className="flex flex-col">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#111111]">
            EVERY ANSWER HAS A PROVABLE HISTORY.
          </span>
          <span className="text-[11px] text-[#70706C]">
            From input to output — verified, logged and under your control.
          </span>
        </div>
        <span className="font-serif italic text-[#18B663] text-[12px] font-bold">
          “Trust through transparency.”
        </span>
      </div>
    </div>
  )
}
