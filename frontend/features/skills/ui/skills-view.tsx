'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, FileText, Layers, Sparkles, Trash2 } from 'lucide-react'
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
 * The page answers three questions in the order they are asked: what a skill
 * is and how it relates to a harness, which skills exist and exactly what
 * each sends, and how to add one. The template of every skill is shown in
 * full, with the place the typed text goes marked, because "what will this
 * send on my behalf" is the one thing a person should never have to guess.
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

function Tile({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-line-subtle bg-surface p-4">
      <div className="flex items-center gap-2 text-[13.5px] font-medium text-foreground">
        <span className="grid size-7 place-items-center rounded-full bg-surface-sunken text-foreground-secondary">{icon}</span>
        {title}
      </div>
      <p className="mt-2 text-[13px] leading-[1.55] text-foreground-secondary">{children}</p>
    </div>
  )
}

function SkillCard({
  skill,
  canDelete,
  onDelete,
}: {
  skill: Skill
  canDelete: boolean
  onDelete: (skill: Skill) => void
}) {
  return (
    <li className="ae-lift rounded-[18px] border border-line-subtle bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-mono text-[14px] text-foreground">/{skill.id}</span>
        <span className="text-[14px] font-medium text-foreground">{skill.name}</span>
        {skill.deliverable_format && (
          <span className="rounded-full bg-surface-sunken px-2 font-mono text-[11px] uppercase leading-5 text-foreground-secondary">
            {skill.deliverable_format}
          </span>
        )}
        <span className="ml-auto text-[12px] text-foreground-muted">
          {skill.source === 'built_in' ? 'Built in' : `Added by ${skill.author_display_name || skill.author}`}
        </span>
      </div>
      <p className="mt-1 text-[13.5px] leading-[1.55] text-foreground-secondary">{skill.summary}</p>
      <p className="mt-3 rounded-[12px] bg-surface-sunken px-3 py-2.5 font-mono text-[12.5px] leading-[1.65] text-foreground-secondary">
        <Template text={skill.template} />
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-foreground-muted">
        <span className="font-mono" title={`SHA-256 of what this skill sends: ${skill.sha256}`}>
          sha256:{skill.sha256.slice(0, 10)}
        </span>
        <Link
          href={`/console?skill=${encodeURIComponent(skill.id)}`}
          className="inline-flex items-center gap-1 font-medium text-foreground-secondary hover:text-foreground"
        >
          Use in the thread <ArrowRight className="size-3" aria-hidden />
        </Link>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(skill)}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-foreground-muted hover:bg-critical-surface hover:text-critical-text focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            <Trash2 className="size-3.5" aria-hidden /> Delete
          </button>
        )}
      </div>
    </li>
  )
}

const FIELD =
  'w-full rounded-[12px] border border-line-subtle bg-surface px-3 py-2 text-[14px] text-foreground placeholder:text-foreground-muted focus:border-line-default focus:outline-none focus-visible:shadow-[var(--focus-ring)]'

function NewSkill({ taken, onCreated }: { taken: Set<string>; onCreated: (skill: Skill) => void }) {
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
      setName('')
      setId('')
      setIdEdited(false)
      setSummary('')
      setTemplate('')
      setHint('')
      setFormat(null)
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
      className="flex flex-col gap-3.5 rounded-[20px] border border-line-subtle bg-surface p-5"
    >
      <div>
        <h2 className="text-[16px] font-medium text-foreground">Add a skill</h2>
        <p className="mt-1 text-[13px] leading-[1.55] text-foreground-secondary">
          Saved for everyone on this host. Your role can add one; it cannot give the skill anything your role does not have.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-foreground-secondary">Name</span>
        <input className={FIELD} value={name} maxLength={48} onChange={(e) => setName(e.target.value)} placeholder="PSV test interval" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-foreground-secondary">Command</span>
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

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-foreground-secondary">What it does, in one line</span>
        <input
          className={FIELD}
          value={summary}
          maxLength={160}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="The bench-test interval the SOPs set for a relief valve."
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-foreground-secondary">
          Instruction <span className="font-normal text-foreground-muted">— write {'{input}'} where the typed text goes</span>
        </span>
        <textarea
          className={cn(FIELD, 'min-h-[96px] resize-y font-mono text-[13px] leading-[1.6]')}
          value={template}
          maxLength={1500}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder="What bench-test interval do our SOPs set for {input}?"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-foreground-secondary">
          Hint <span className="font-normal text-foreground-muted">— shown in the composer, optional</span>
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
        <span className="text-[12.5px] font-medium text-foreground-secondary">Deliver as</span>
        <div role="radiogroup" aria-label="Deliver as" className="flex flex-wrap gap-1.5">
          {FORMATS.map((f) => (
            <button
              key={f.label}
              type="button"
              role="radio"
              aria-checked={format === f.id}
              onClick={() => setFormat(f.id)}
              className={cn(
                'h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none',
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

      {template.includes('{input}') && problems.length === 0 && (
        <div className="rounded-[12px] bg-surface-sunken px-3 py-2.5">
          <p className="text-[11.5px] font-medium text-foreground-muted">Sent as</p>
          <p className="mt-1 font-mono text-[12.5px] leading-[1.65] text-foreground-secondary">
            <Template text={template.trim()} fill={(hint.split('e.g. ')[1] || hint || 'what you type').trim()} />
          </p>
        </div>
      )}

      {problems.length > 0 && (
        <ul className="flex flex-col gap-1 text-[12.5px] text-critical-text">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && <p className="text-[12.5px] text-critical-text">{error}</p>}

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[12px] text-foreground-muted">Recorded in the audit chain with its hash.</p>
        <Button type="submit" variant="primary" disabled={!ready || saving}>
          {saving ? 'Saving…' : 'Add skill'}
        </Button>
      </div>
    </form>
  )
}

export function SkillsView() {
  const { can, user } = useRole()
  const { push } = useToast()
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .listSkills()
      .then((list) => !cancelled && setSkills(list))
      .catch((err: any) => !cancelled && setError(err?.detail || err?.message || 'The skills could not be read.'))
    return () => {
      cancelled = true
    }
  }, [])

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
        description="Saved instructions anyone can call in the thread by typing /. A skill changes only what a run is asked: every run is still classified, checked against policy, grounded, verified and held where the rules say so."
        meta={[
          { label: 'Built in', value: skills ? builtIn.length : null },
          { label: 'Added here', value: skills ? custom.length : null },
        ]}
      />

      <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-6">
        <div className="grid gap-3 md:grid-cols-3">
          <Tile icon={<span className="font-mono text-[13px]">/</span>} title="Type / in the thread">
            The composer lists every skill and every harness. Pick one, type what it should look at, and send.
          </Tile>
          <Tile icon={<Sparkles className="size-3.5" aria-hidden />} title="A skill shapes one run">
            Its instruction wraps what you typed. The run that follows is an ordinary one, and records which skill
            and which version made its request.
          </Tile>
          <Tile icon={<Layers className="size-3.5" aria-hidden />} title="A harness runs many">
            It fans a list out into governed runs and gathers them into one report a reviewer signs.{' '}
            <Link href="/harnesses" className="font-medium text-foreground underline-offset-2 hover:underline">
              Harnesses
            </Link>
          </Tile>
        </div>

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex flex-col gap-8">
            {error && <p className="text-[13.5px] text-critical-text">{error}</p>}
            {!skills && !error && <p className="text-[13.5px] text-foreground-muted">Reading the skills…</p>}

            {custom.length > 0 && (
              <section aria-labelledby="skills-custom">
                <h2 id="skills-custom" className="mb-3 text-[13px] font-medium text-foreground-secondary">
                  Added on this host
                </h2>
                <ul className="flex flex-col gap-3">
                  {custom.map((skill) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      canDelete={canManage || (canCreate && skill.author === user?.username)}
                      onDelete={remove}
                    />
                  ))}
                </ul>
              </section>
            )}

            {builtIn.length > 0 && (
              <section aria-labelledby="skills-built-in">
                <h2 id="skills-built-in" className="mb-3 flex items-center gap-2 text-[13px] font-medium text-foreground-secondary">
                  Built in
                  <span className="font-normal text-foreground-muted">· files under config/skills/, changed through the repository</span>
                </h2>
                <ul className="flex flex-col gap-3">
                  {builtIn.map((skill) => (
                    <SkillCard key={skill.id} skill={skill} canDelete={false} onDelete={remove} />
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="lg:sticky lg:top-6">
            {canCreate ? (
              <NewSkill
                taken={taken}
                onCreated={(skill) => {
                  setSkills((list) => [...(list ?? []), skill])
                  push({ title: `/${skill.id} added`, detail: 'Type it in the thread to use it.', tone: 'sovereign' })
                }}
              />
            ) : (
              <div className="rounded-[20px] border border-line-subtle bg-surface p-5">
                <FileText className="size-4 text-foreground-muted" aria-hidden />
                <p className="mt-2 text-[13.5px] leading-[1.55] text-foreground-secondary">
                  Engineers, reviewers and administrators add skills. Every skill here is yours to use.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
