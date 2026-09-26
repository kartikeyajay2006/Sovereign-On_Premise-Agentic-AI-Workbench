'use client'

import { memo, useState } from 'react'
import { ClassificationTag } from '@/components/primitives'
import { LEDGER_MUTED } from '@/shared/ui/data/ledger'
import { FailureState, ReadingLine, type Reading } from '@/shared/ui/data/reading'
import { roleName } from '@/lib/presentation'
import { cn } from '@/lib/utils'
import type { Policies, ToolPolicy } from './api'

/**
 * ALLOW and DENY with a glyph each, in the -text variants, so the matrix
 * reads in greyscale and on a projector. The fill hues were 3.07:1 and 2.97:1
 * as text on paper; a matrix whose two columns cannot be read is worse than
 * one with no colour, because it looks like it is telling you something.
 */
function Verdict({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-sovereign-text">✓ allow</span>
  ) : (
    <span className="font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground-muted">✕ deny</span>
  )
}

function constraintText(tool: ToolPolicy): string[] {
  const out: string[] = []
  if (tool.side_effects) out.push(`side effects: ${tool.side_effects.replace(/_/g, ' ')}`)
  if (tool.requires_approval) out.push('requires approval')
  for (const [key, value] of Object.entries(tool.constraints ?? {})) {
    out.push(`${key.replace(/_/g, ' ')}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
  }
  return out
}

function Matrix({ policies, currentRole }: { policies: Policies; currentRole: string | null }) {
  const [open, setOpen] = useState<string | null>(null)
  // Roles come from the policy file, not from a list typed here: an earlier
  // hardcoded list left out the auditor entirely.
  const roles = Object.keys(policies.roles)
  const tools = Object.entries(policies.tools)

  return (
    <div className="flex flex-col gap-2">
      {/* Phone: one block per tool, with its allowed and denied roles named. */}
      <ul className="overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)] md:hidden">
        {tools.map(([name, tool]) => {
          const allowed = new Set(tool.allowed_roles ?? [])
          return (
            <li key={name} className="flex flex-col gap-1 border-b border-line-subtle px-4 py-3 last:border-b-0">
              <span className="flex items-center justify-between gap-3">
                <span className="font-mono text-ui text-foreground">{name}</span>
                {tool.max_data_classification && <ClassificationTag level={tool.max_data_classification} />}
              </span>
              <span className="text-ui text-foreground-secondary">
                <span className="text-sovereign-text">Allow</span>{' '}
                {roles.filter((r) => allowed.has(r)).map(roleName).join(', ') || 'no role'}
              </span>
              <span className="text-ui text-foreground-muted">
                Deny {roles.filter((r) => !allowed.has(r)).map(roleName).join(', ') || 'no role'}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="hidden overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)] md:block">
        <table className="w-full table-fixed border-collapse">
          <thead className="border-b border-line-default">
            <tr>
              <th className="w-[28%] px-4 py-2 text-left font-mono text-ledger font-normal uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                Tool
              </th>
              {roles.map((role) => (
                <th
                  key={role}
                  scope="col"
                  title={role}
                  className={cn(
                    // Names, not ids: `head_of_inspection` truncated to
                    // `head_of_in…` in an eight-role matrix. A name wraps.
                    'px-2 py-2 text-left align-bottom text-ledger font-normal leading-tight',
                    role === currentRole ? 'bg-[var(--selected-surface)] text-foreground' : 'text-foreground-muted',
                  )}
                >
                  {roleName(role)}
                  {role === currentRole && <span className="block normal-case tracking-normal">you</span>}
                </th>
              ))}
              <th className="w-[15%] px-4 py-2 text-left font-mono text-ledger font-normal uppercase tracking-[var(--ls-ledger)] text-foreground-muted">
                Up to
              </th>
            </tr>
          </thead>
          <tbody>
            {tools.map(([name, tool]) => {
              const allowed = new Set(tool.allowed_roles ?? [])
              const expanded = open === name
              const notes = constraintText(tool)
              return (
                <tr
                  key={name}
                  className="hover-decay cursor-pointer border-b border-line-subtle align-top last:border-b-0 hover:bg-surface-sunken"
                  onClick={() => setOpen(expanded ? null : name)}
                >
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpen(expanded ? null : name)
                      }}
                      className="rounded-[var(--radius-xs)] text-left font-mono text-ui text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                    >
                      {name}
                    </button>
                    {expanded && (
                      <span className="mt-1 flex flex-col gap-0.5">
                        {tool.description && <span className="text-ui text-foreground-secondary">{tool.description}</span>}
                        {notes.map((note) => (
                          <span key={note} className="font-mono text-ledger text-foreground-muted">
                            {note}
                          </span>
                        ))}
                      </span>
                    )}
                  </th>
                  {roles.map((role) => (
                    <td
                      key={role}
                      className={cn('px-2 py-2', role === currentRole && 'bg-[var(--selected-surface)]')}
                    >
                      <Verdict allowed={allowed.has(role)} />
                    </td>
                  ))}
                  <td className="px-4 py-2">
                    {tool.max_data_classification ? (
                      <ClassificationTag level={tool.max_data_classification} />
                    ) : (
                      <span className="text-ui text-foreground-muted">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hidden text-ui text-foreground-muted md:block">Select a tool to see its constraints.</p>
    </div>
  )
}

/**
 * The policy every run is checked against, read from the policy files by the
 * service. This is configuration, not measurement, and is labelled as such:
 * it says what the gateway is told to enforce, not what it has enforced.
 */
export const PolicyPanel = memo(function PolicyPanel({
  policies,
  currentRole,
}: {
  policies: Reading<Policies>
  currentRole: string | null
}) {
  if (policies.status === 'failed' && !policies.data) {
    return <FailureState failure={policies.failure!} what="the policy files" retry={policies.reload} />
  }
  if (!policies.data) {
    return <ReadingLine what="the policy files" source="GET /api/policies" startedAt={policies.startedAt} />
  }
  const p = policies.data
  const egress = p.egress ?? {}

  return (
    <div className="flex flex-col gap-6">
      <Matrix policies={p} currentRole={currentRole} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-label="Denied for every role" className="flex flex-col gap-2">
          <h3 className={LEDGER_MUTED}>No role can do these, and nothing overrides it</h3>
          <ul className="flex flex-wrap gap-1">
            {p.hard_denied_actions.map((action) => (
              <li
                key={action}
                className="rounded-[var(--radius-xs)] px-2 py-0.5 font-mono text-ledger text-foreground-secondary shadow-[0_0_0_1px_var(--control-subtle)]"
              >
                {action}
              </li>
            ))}
          </ul>
          <p className="text-ui text-foreground-muted">
            Egress destinations allowed:{' '}
            <span className="font-mono text-foreground">
              {(egress.allowed_destinations ?? []).length === 0 ? 'none' : egress.allowed_destinations!.join(', ')}
            </span>
            {egress.loopback_only !== undefined && (
              <>
                {' '}
                · loopback only <span className="font-mono text-foreground">{egress.loopback_only ? 'yes' : 'no'}</span>
              </>
            )}
            {egress.monitored_ports && egress.monitored_ports.length > 0 && (
              <>
                {' '}
                · watched ports <span className="font-mono text-foreground">{egress.monitored_ports.join(', ')}</span>
              </>
            )}
          </p>
        </section>

        <section aria-label="Approval rules" className="flex flex-col gap-2">
          <h3 className={LEDGER_MUTED}>A run is held for a person when</h3>
          <ul className="flex flex-col">
            {p.approval_rules.map((rule) => (
              <li key={rule.name} className="flex flex-col gap-0.5 border-b border-line-subtle py-2 last:border-b-0">
                {/* The rule in words, then its name as the policy file and the
                    audit record give it, and who decides. */}
                <span className="text-ui text-foreground">{rule.description || rule.name}</span>
                <span className="font-mono text-ledger text-foreground-muted">
                  {rule.name}
                  {rule.signatures && rule.signatures.length > 1
                    ? ` · signed by ${rule.signatures.map((s) => s.authority).join(', then ')}`
                    : rule.approver_roles && rule.approver_roles.length > 0
                      ? ` · decided by ${rule.approver_roles.map(roleName).join(' or ')}`
                      : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
})
