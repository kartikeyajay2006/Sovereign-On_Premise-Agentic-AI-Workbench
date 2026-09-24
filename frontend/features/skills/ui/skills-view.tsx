'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { Skill, SkillDraft } from '@/lib/types'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { useRole } from '@/components/role-context'
import { useToast } from '@/components/toast'
import { Button } from '@/shared/ui/controls/button'

/**
 * Skills: the saved instructions "/" offers in the thread.
 *
 * One list, one line per skill -- its command, its name, what it does, and a
 * way to use it. What it sends, its hash and who added it open under the row,
 * because "what will this send on my behalf" must never need guessing but
 * does not need to fill the screen. Adding one is a button, not a form that
 * sits beside the list whether you want it or not.
 */

const FORMATS: { id: SkillDraft['deliverable_format']; label: string }[] = [
  { id: null, label: 'Answer' },
  { id: 'docx', label: 'DOCX' },
  { id: 'xlsx', label: 'XLSX' },
  { id: 'pptx', label: 'PPTX' },
  { id: 'md', label: 'Markdown' },
]

const ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 32)
}

/** Every "{name}" a template uses, as the server's validator reads them. */
function placeholders(template: string): string[] {
  return Array.from(template.matchAll(/\{([^{}]*)\}/g), (m) => m[1])
}

/** The template, with the place the typed text goes set apart. */
function Template({ text, fill }: { text: string; fill?: string }) {
  const parts = text.split(/(\{input\})/g)
  return (
    <>
      {parts.map((part, i) =>
        part === '{input}' ? (
          <span
            key={i}
            className={cn(
              'rounded-[5px] px-1 py-px',
              fill ? 'bg-foreground text-background' : 'bg-active-surface text-active-text',
            )}
          >
            {fill || '{input}'}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

function SkillRow({
  skill,
  canDelete,
  onDelete,
}: {
  skill: Skill
  canDelete: boolean
  onDelete: (skill: Skill) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className="border-b border-line-subtle last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] text-left focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <ChevronRight
            aria-hidden
            className={cn('size-4 shrink-0 text-foreground-muted transition-transform duration-150', open && 'rotate-90')}
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className="font-mono text-[14px] text-foreground">/{skill.id}</span>
              <span className="text-[14px] font-medium text-foreground">{skill.name}</span>
              {skill.deliverable_format && (
                <span className="rounded-full bg-surface-sunken px-2 font-mono text-[10.5px] uppercase leading-5 text-foreground-secondary">
                  {skill.deliverable_format}
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-foreground-secondary">{skill.summary}</span>
          </span>
        </button>
        <Link
          href={`/console?skill=${encodeURIComponent(skill.id)}`}
          className="btn shrink-0"
          data-variant="secondary"
          data-size="sm"
          data-ground="paper"
        >
          Use
        </Link>
      </div>
      {open && (
        <div className="pb-4 pl-10 pr-3 sm:pl-[3.1rem] sm:pr-4">
          <p className="m-0 rounded-[12px] bg-surface-sunken px-3 py-2.5 font-mono text-[12.5px] leading-[1.65] text-foreground-secondary">
            <Template text={skill.template} />
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-foreground-muted">
            <span>
              {skill.source === 'built_in'
                ? `Built in · config/skills/${skill.id}.yaml`
                : `Added by ${skill.author_display_name || skill.author}`}
            </span>
            <span className="font-mono" title={`SHA-256 of what this skill sends: ${skill.sha256}`}>
              sha256:{skill.sha256.slice(0, 10)}
            </span>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(skill)}
                className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-critical-surface hover:text-critical-text focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                <Trash2 className="size-3.5" aria-hidden /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

const FIELD =
  'w-full rounded-[12px] border border-line-subtle bg-surface px-3 py-2 text-[14px] text-foreground placeholder:text-foreground-muted focus:border-line-default focus:outline-none focus-visible:shadow-[var(--focus-ring)]'
const LABEL = 'text-[12.5px] font-medium text-foreground-secondary'

function NewSkill({
  taken,
  onCreated,
  onCancel,
}: {
  taken: Set<string>
  onCreated: (skill: Skill) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [idEdited, setIdEdited] = useState(false)
  const [summary, setSummary] = useState('')
  const [template, setTemplate] = useState('')
  const [hint, setHint] = useState('')
  const [format, setFormat] = useState<SkillDraft['deliverable_format']>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const command = idEdited ? id : slug(name)
  const names = placeholders(template)
  const problems = [
    command && !ID_PATTERN.test(command) && 'The command is 2 to 32 lower-case letters, digits or dashes, starting with a letter.',
    command && taken.has(command) && `/${command} is already taken.`,
    template && !names.includes('input') && 'Mark where the typed text goes with {input}.',
    names.some((n) => n !== 'input') && 'The only placeholder a skill may use is {input}.',
  ].filter(Boolean) as string[]
  const ready = Boolean(name.trim() && command && summary.trim() && template.trim().length >= 8) && problems.length === 0

  const submit = async () => {
    if (!ready || saving) return
    setSaving(true)
    setError(null)
    try {
      const skill = await api.createSkill({
        id: command,
        name: name.trim(),
        summary: summary.trim(),
        template: template.trim(),
        deliverable_format: format,
        input_hint: hint.trim() || null,
      })
      onCreated(skill)
    } catch (err: any) {
      setError(err?.detail || err?.message || 'The skill could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="rounded-[20px] border border-line-default bg-surface p-5 shadow-[var(--elev-2)] sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[16px] font-medium text-foreground">New skill</h2>
        <p className="m-0 text-[12.5px] text-foreground-muted">
          Saved for everyone on this host. It cannot give a run anything your role does not have.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Name</span>
          <input className={FIELD} value={name} maxLength={48} onChange={(e) => setName(e.target.value)} placeholder="PSV test interval" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Command</span>
          <span className="flex items-center rounded-[12px] border border-line-subtle bg-surface focus-within:border-line-default">
            <span className="pl-3 font-mono text-[14px] text-foreground-muted">/</span>
            <input
              className="w-full bg-transparent py-2 pl-0.5 pr-3 font-mono text-[14px] text-foreground focus:outline-none"
              value={command}
              maxLength={32}
              onChange={(e) => {
                setIdEdited(true)
                setId(e.target.value.toLowerCase())
              }}
              placeholder="psv-interval"
            />
          </span>
        </label>
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className={LABEL}>What it does, in one line</span>
          <input
            className={FIELD}
            value={summary}
            maxLength={160}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="The bench-test interval the SOPs set for a relief valve."
          />
        </label>
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className={LABEL}>
            Instruction <span className="font-normal text-foreground-muted">— write {'{input}'} where the typed text goes</span>
          </span>
          <textarea
            className={cn(FIELD, 'min-h-[84px] resize-y font-mono text-[13px] leading-[1.6]')}
            value={template}
            maxLength={1500}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="What bench-test interval do our SOPs set for {input}?"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>
            Hint <span className="font-normal text-foreground-muted">— optional, shown in the composer</span>
          </span>
          <input
            className={FIELD}
            value={hint}
            maxLength={120}
            onChange={(e) => setHint(e.target.value)}
            placeholder="The valve, e.g. PSV-2104A in fouling service"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Deliver as</span>
          <div role="radiogroup" aria-label="Deliver as" className="flex flex-wrap gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f.label}
                type="button"
                role="radio"
                aria-checked={format === f.id}
                onClick={() => setFormat(f.id)}
                className={cn(
                  'h-9 rounded-full border px-3 text-[12.5px] font-medium transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
                  format === f.id
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-line-subtle text-foreground-secondary hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {template.includes('{input}') && problems.length === 0 && (
        <div className="mt-4 rounded-[12px] bg-surface-sunken px-3 py-2.5">
          <p className="m-0 text-[11.5px] font-medium text-foreground-muted">Sent as</p>
          <p className="m-0 mt-1 font-mono text-[12.5px] leading-[1.65] text-foreground-secondary">
            <Template text={template.trim()} fill={(hint.split('e.g. ')[1] || hint || 'what you type').trim()} />
          </p>
        </div>
      )}

      {problems.length > 0 && (
        <ul className="m-0 mt-4 flex list-none flex-col gap-1 p-0 text-[12.5px] text-critical-text">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-[12.5px] text-critical-text">{error}</p>}

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!ready || saving}>
          {saving ? 'Saving…' : 'Add skill'}
        </Button>
      </div>
    </form>
  )
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0 flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium text-foreground-secondary">
        {title}
        {note ? <span className="font-normal text-foreground-muted">{note}</span> : null}
      </h2>
      <ul className="m-0 list-none rounded-[18px] border border-line-subtle bg-surface p-0">{children}</ul>
    </section>
  )
}

export function SkillsView() {
  const { can, user } = useRole()
  const { push } = useToast()
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // A skill is used by starting a run, so a role that cannot start one has
  // none to list -- and asking would only write a refusal to the audit chain.
  const canRun = can('task.create')
  useEffect(() => {
    if (!canRun) return
    let cancelled = false
    api
      .listSkills()
      .then((list) => !cancelled && setSkills(list))
      .catch((err: any) => !cancelled && setError(err?.detail || err?.message || 'The skills could not be read.'))
    return () => {
      cancelled = true
    }
  }, [canRun])

  const builtIn = useMemo(() => (skills ?? []).filter((s) => s.source === 'built_in'), [skills])
  const custom = useMemo(() => (skills ?? []).filter((s) => s.source === 'custom'), [skills])
  const taken = useMemo(() => new Set((skills ?? []).map((s) => s.id)), [skills])
  const canCreate = can('skill.create')
  const canManage = can('skill.manage')

  const remove = async (skill: Skill) => {
    try {
      await api.deleteSkill(skill.id)
      setSkills((list) => (list ?? []).filter((s) => s.id !== skill.id))
      push({ title: `/${skill.id} deleted`, detail: 'The deletion is recorded in the audit chain.', tone: 'default' })
    } catch (err: any) {
      push({ title: `Could not delete /${skill.id}`, detail: err?.detail || err?.message, tone: 'critical' })
    }
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="Skills"
        description="Saved instructions you call in the thread with /. A skill shapes what a run is asked; every run still meets every check."
        actions={
          canCreate && !creating ? (
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              New skill
            </Button>
          ) : null
        }
      />

      {/* The page's own column, so the list starts under the title; the
          list keeps a reading width inside it. */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 pt-6 sm:px-6">
        {creating && (
          <NewSkill
            taken={taken}
            onCancel={() => setCreating(false)}
            onCreated={(skill) => {
              setSkills((list) => [...(list ?? []), skill])
              setCreating(false)
              push({ title: `/${skill.id} added`, detail: 'Type it in the thread to use it.', tone: 'sovereign' })
            }}
          />
        )}

        {!canRun && (
          <p className="m-0 text-[13.5px] text-foreground-secondary">
            Your role reviews work rather than running it, so it has no skills to call. Every run a skill started is in
            the audit chain, with the skill and the hash it was run at.
          </p>
        )}
        {error && <p className="m-0 text-[13.5px] text-critical-text">{error}</p>}
        {canRun && !skills && !error && <p className="m-0 text-[13.5px] text-foreground-muted">Reading the skills…</p>}

        {custom.length > 0 && (
          <Group title="Added on this host">
            {custom.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                canDelete={canManage || (canCreate && skill.author === user?.username)}
                onDelete={remove}
              />
            ))}
          </Group>
        )}

        {builtIn.length > 0 && (
          <Group title="Built in" note="· changed through the repository">
            {builtIn.map((skill) => (
              <SkillRow key={skill.id} skill={skill} canDelete={false} onDelete={remove} />
            ))}
          </Group>
        )}

        {skills && (
          <p className="m-0 text-[13px] text-foreground-muted">
            Need many runs and one signed report instead of one run?{' '}
            <Link href="/harnesses" className="font-medium text-foreground-secondary underline-offset-2 hover:text-foreground hover:underline">
              That is a harness
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  )
}
