'use client'

/**
 * Ask — questions against documents that are already on the host.
 *
 * The console is for dispatching a piece of work: attach a scan, get a signed
 * approval note back. Plenty of the time nobody wants a deliverable at all,
 * they want to know what a procedure says, and the document they would attach
 * was uploaded weeks ago by somebody else.
 *
 * So this screen starts from what is already here. Pick the documents, ask the
 * question, read the answer with the passages it came from. Nothing is
 * uploaded, no file is written, and the answer cites the organisation's own
 * text rather than the model's recollection of industry practice.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Library, Loader2, Search, Send, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { EvidenceItem, KnowledgeDocument, StoredFile } from '@/lib/types'
import { useEventStream } from '@/hooks/use-event-stream'
import { PageHeader } from '@/components/page-header'
import { SovButton } from '@/components/sov-button'
import { TechnicalLabel, formatBytes } from '@/components/primitives'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/utils'

/** A document the user can put in scope, from either store. */
interface Selectable {
  id: string
  name: string
  detail: string
  origin: 'upload' | 'knowledge'
}

type Phase = 'idle' | 'asking' | 'answered'

/**
 * A question in progress survives leaving the page.
 *
 * The run happens on the server, so navigating to Tasks and back never
 * stopped it — but this screen kept no note of it, so you came back to an
 * empty box with no way to reach the answer. The id is parked here and picked
 * up on mount: finished questions render their answer, running ones
 * re-attach to the stream.
 */
const IN_FLIGHT = 'workbench_ask_in_flight'

function remember(taskId: string, question: string) {
  try {
    window.sessionStorage.setItem(IN_FLIGHT, JSON.stringify({ taskId, question }))
  } catch {
    // Private browsing or blocked site data. The question still runs; it just
    // will not be waiting when you come back.
  }
}

function forget() {
  try {
    window.sessionStorage.removeItem(IN_FLIGHT)
  } catch {
    /* nothing to clean up */
  }
}

const SUGGESTIONS = [
  'What severity applies when cladding damage exceeds 20% of an insulated section?',
  'Who must approve continued operation after a Category 3 finding?',
  'What is the maximum inspection interval for a Class 1 pressure vessel?',
]

export function AskView() {
  const [uploads, setUploads] = useState<StoredFile[]>([])
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  const [question, setQuestion] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [stage, setStage] = useState('')
  const [answer, setAnswer] = useState('')
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [error, setError] = useState<string | null>(null)

  const { push } = useToast()
  const answerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    Promise.all([
      api.listFiles().catch(() => [] as StoredFile[]),
      api.knowledgeDocuments().catch(() => [] as KnowledgeDocument[]),
    ])
      .then(([files, docs]) => {
        if (!live) return
        setUploads(files || [])
        setDocuments(docs || [])
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  // Uploads can be asked about directly; knowledge documents are already
  // indexed, so naming them here narrows retrieval rather than attaching them.
  const selectable = useMemo<Selectable[]>(() => {
    const fromUploads: Selectable[] = (uploads || []).map((f) => ({
      id: f.id,
      name: f.filename,
      detail: `${formatBytes(f.size_bytes)} · ${f.classification}`,
      origin: 'upload',
    }))
    const fromKnowledge: Selectable[] = (documents || []).map((d) => ({
      id: d.id,
      name: d.title,
      detail: `${d.department || 'general'} · v${d.version || '1.0'}`,
      origin: 'knowledge',
    }))
    return [...fromUploads, ...fromKnowledge]
  }, [uploads, documents])

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return selectable
    return selectable.filter((item) => item.name.toLowerCase().includes(needle))
  }, [selectable, filter])

  const attachable = useMemo(
    () => selected.filter((id) => selectable.find((s) => s.id === id)?.origin === 'upload'),
    [selected, selectable],
  )

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const handleEvent = useCallback((event: any) => {
    const { event: name, data } = event
    if (!data) return

    if (name === 'task.stage') {
      const status = (data.status || '').toLowerCase()
      setStage(data.message || status)

      if (['delivered', 'approved', 'awaiting_approval', 'failed', 'cancelled'].includes(status)) {
        if (data.task?.answer) setAnswer(data.task.answer)
        if (data.task?.evidence) setEvidence(data.task.evidence)
        if (status === 'failed') {
          setError(data.task?.error || 'The workbench could not complete this question.')
        }
        setPhase('answered')
      }
    }

    if (name === 'task.evidence' && data.evidence) {
      setEvidence((prev) => [...prev, data.evidence])
    }

    if (name === 'task.finished') {
      if (data.task?.answer) setAnswer(data.task.answer)
      if (data.task?.evidence) setEvidence(data.task.evidence)
      setPhase('answered')
    }

    if (name === 'task.failed') {
      setError(data.error || data.message || 'The workbench could not complete this question.')
      setPhase('answered')
    }
  }, [])

  useEventStream({ taskId, enabled: phase === 'asking', onEvent: handleEvent })

  // Pick up a question left running when the page was last open.
  useEffect(() => {
    let parked: { taskId?: string; question?: string } | null = null
    try {
      parked = JSON.parse(window.sessionStorage.getItem(IN_FLIGHT) || 'null')
    } catch {
      parked = null
    }
    if (!parked?.taskId) return

    let live = true
    setQuestion(parked.question || '')
    setTaskId(parked.taskId)
    setPhase('asking')
    setStage('Reconnecting to a question already running')

    api
      .getTask(parked.taskId)
      .then((task) => {
        if (!live) return
        if (task.answer) setAnswer(task.answer)
        if (task.evidence) setEvidence(task.evidence)
        const settled = ['delivered', 'approved', 'awaiting_approval', 'failed', 'cancelled']
        if (settled.includes(String(task.status).toLowerCase())) {
          if (String(task.status).toLowerCase() === 'failed') {
            setError(task.error || 'That question did not complete.')
          }
          setPhase('answered')
          forget()
        }
      })
      .catch(() => {
        if (!live) return
        // The task is gone — most likely the server restarted under it.
        forget()
        setPhase('idle')
        setTaskId(null)
        setStage('')
      })

    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (phase === 'answered') forget()
    if (phase === 'answered' && answerRef.current) {
      answerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [phase])

  const ask = async () => {
    const text = question.trim()
    if (!text) return

    setPhase('asking')
    setAnswer('')
    setEvidence([])
    setError(null)
    setStage('Classifying the question')

    // Named documents go into the prompt so retrieval is steered toward them
    // even for the knowledge base, where there is no file to attach.
    const named = selected
      .map((id) => selectable.find((s) => s.id === id)?.name)
      .filter(Boolean)
    const scoped = named.length
      ? `${text}\n\nAnswer using these documents where they apply: ${named.join(', ')}.`
      : text

    try {
      const task = await api.createTask(scoped, attachable, 'answer')
      setTaskId(task.id)
      remember(task.id, text)
    } catch (err: any) {
      setError(err?.detail || err?.message || 'The workbench could not be reached.')
      setPhase('answered')
      push({ title: 'Question failed', detail: 'See the message on the page.', tone: 'critical' })
    }
  }

  const reset = () => {
    forget()
    setQuestion('')
    setAnswer('')
    setEvidence([])
    setError(null)
    setTaskId(null)
    setStage('')
    setPhase('idle')
  }

  const nothingHere = !loading && selectable.length === 0

  return (
    <div className="flex flex-col">
      <PageHeader
        eyebrow="Ask your documents"
        title={<>Ask a question.<br />Get the clause back.</>}
        description="Put a question to the procedures, reports and drawings already on this host. The answer quotes your own documents, and nothing is sent anywhere to produce it."
        meta={[
          { label: 'Uploaded files', value: String(uploads.length) },
          { label: 'Registry documents', value: String(documents.length) },
          {
            label: 'In scope',
            value: selected.length ? `${selected.length} selected` : 'All indexed',
          },
          { label: 'Execution', value: '127.0.0.1' },
        ]}
      />

      <div className="mx-auto grid w-full max-w-[1400px] gap-10 px-5 py-12 lg:grid-cols-[340px_1fr] lg:px-10">
        {/* ------------------------------------------------------ scope */}
        <aside className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <TechnicalLabel>Documents on this host</TechnicalLabel>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="font-mono text-[11px] text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
              >
                Clear {selected.length}
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-muted" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name"
              aria-label="Filter documents"
              className="w-full border border-border bg-surface py-2.5 pl-9 pr-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-border-strong"
            />
          </div>

          <div className="flex max-h-[520px] flex-col overflow-y-auto border border-border bg-surface">
            {loading && (
              <p className="flex items-center gap-2 p-4 font-mono text-[12px] text-foreground-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the stores…
              </p>
            )}

            {nothingHere && (
              <p className="p-4 text-[13px] leading-relaxed text-foreground-secondary">
                No documents yet. Upload one from the{' '}
                <a href="/" className="underline underline-offset-4">Console</a>, or add a
                procedure to the{' '}
                <a href="/registry" className="underline underline-offset-4">Registry</a>, and it
                will appear here.
              </p>
            )}

            {!loading && !nothingHere && visible.length === 0 && (
              <p className="p-4 text-[13px] text-foreground-secondary">
                Nothing matches “{filter}”.
              </p>
            )}

            {visible.map((item) => {
              const chosen = selected.includes(item.id)
              const Icon = item.origin === 'knowledge' ? Library : FileText
              return (
                <button
                  key={`${item.origin}-${item.id}`}
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-pressed={chosen}
                  className={cn(
                    'flex items-start gap-3 border-b border-border p-3 text-left transition-colors last:border-b-0',
                    chosen ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/60',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border',
                      chosen ? 'border-sovereign bg-sovereign' : 'border-border-strong',
                    )}
                  >
                    {chosen && <span className="h-1.5 w-1.5 bg-surface" />}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-[13px] leading-snug text-foreground">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-foreground-muted" />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted">
                      {item.origin === 'knowledge' ? 'Registry' : 'Upload'} · {item.detail}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <p className="text-[12px] leading-relaxed text-foreground-muted">
            Select nothing and the question is put to every indexed document. Selecting narrows
            the search to what you name.
          </p>
        </aside>

        {/* -------------------------------------------------- the question */}
        <section className="flex flex-col gap-6">
          <div className="border border-border bg-surface">
            <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
              <TechnicalLabel>Your question</TechnicalLabel>
              <span className="font-mono text-[11px] text-foreground-muted">
                {selected.length > 0
                  ? `${selected.length} document${selected.length === 1 ? '' : 's'} in scope`
                  : 'All indexed documents'}
              </span>
            </div>

            <div className="p-5">
              <label htmlFor="ask-question" className="sr-only">
                What do you want to know?
              </label>
              <textarea
                id="ask-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') ask()
                }}
                rows={4}
                disabled={phase === 'asking'}
                placeholder="e.g. What severity applies when cladding damage exceeds 20% of an insulated section, and who must approve it?"
                className="w-full resize-y border border-border bg-background p-3.5 text-[14px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-border-strong disabled:opacity-60"
              />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-[11px] text-foreground-muted">
                  {phase === 'asking' ? stage || 'Working…' : 'Ctrl + Enter to ask'}
                </span>
                <div className="flex items-center gap-2">
                  {phase === 'answered' && (
                    <SovButton variant="ghost" onClick={reset}>
                      Ask another
                    </SovButton>
                  )}
                  <SovButton
                    onClick={ask}
                    disabled={phase === 'asking' || !question.trim()}
                    aria-busy={phase === 'asking'}
                  >
                    {phase === 'asking' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Asking
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" /> Ask
                      </>
                    )}
                  </SovButton>
                </div>
              </div>
            </div>
          </div>

          {/* Suggestions only while the page is still empty. */}
          {phase === 'idle' && !question && (
            <div className="flex flex-col gap-2">
              <TechnicalLabel>Try one of these</TechnicalLabel>
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setQuestion(s)}
                    className="border border-border bg-surface px-4 py-3 text-left text-[13px] leading-snug text-foreground-secondary transition-colors hover:border-border-strong hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------ answer */}
          {(phase === 'asking' || phase === 'answered') && (
            <div ref={answerRef} className="flex flex-col gap-6">
              <div className="border border-border bg-surface">
                <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
                  <TechnicalLabel>Answer</TechnicalLabel>
                  {taskId && (
                    <a
                      href={`/tasks`}
                      className="font-mono text-[11px] text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
                    >
                      task {taskId.slice(0, 8)}
                    </a>
                  )}
                </div>

                <div className="p-5">
                  {error ? (
                    <p className="flex items-start gap-2.5 border border-critical/30 bg-critical/[0.04] p-4 text-[13px] leading-relaxed text-critical">
                      <X className="mt-px h-4 w-4 shrink-0" />
                      {error}
                    </p>
                  ) : answer ? (
                    <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-foreground">
                      {answer.split('\n').filter(Boolean).map((line, index) => (
                        <p key={index}>{line}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 font-mono text-[12px] text-foreground-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {stage || 'Reading your documents…'}
                    </p>
                  )}
                </div>
              </div>

              {evidence.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <TechnicalLabel>Where this came from</TechnicalLabel>
                    <span className="font-mono text-[11px] text-foreground-muted">
                      {evidence.length} passage{evidence.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {evidence.map((item, index) => (
                      <figure
                        key={item.id || index}
                        className="border border-border bg-surface p-4"
                      >
                        <figcaption className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="font-mono text-[11px] text-sovereign">
                            [{item.id || index + 1}]
                          </span>
                          <span className="text-[13px] text-foreground">
                            {item.source_document || 'Indexed document'}
                          </span>
                          {item.location && (
                            <span className="font-mono text-[11px] text-foreground-muted">
                              {item.location}
                            </span>
                          )}
                        </figcaption>
                        <blockquote className="border-l-2 border-border pl-3 text-[13px] leading-relaxed text-foreground-secondary">
                          {item.excerpt}
                        </blockquote>
                      </figure>
                    ))}
                  </div>
                </div>
              )}

              {phase === 'answered' && !error && evidence.length === 0 && answer && (
                <p className="border border-approval/30 bg-approval/[0.04] p-4 text-[13px] leading-relaxed text-approval">
                  This answer carries no citations, which means nothing in your indexed documents
                  matched closely enough to quote. Treat it as the model's general knowledge, not
                  as your organisation's procedure.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
