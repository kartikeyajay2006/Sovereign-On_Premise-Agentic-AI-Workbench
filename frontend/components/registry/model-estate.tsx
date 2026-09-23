'use client'

import { ClassificationTag } from '@/components/primitives'
import { EmptyState } from '@/shared/ui/data/empty-state'
import { LEDGER_MUTED, Readout, ReadoutRow } from '@/shared/ui/data/ledger'
import { cn } from '@/lib/utils'
import type { ModelDescriptor, ModelsStatus, RuntimeModel } from './api'
import { formatBytes } from './tables'

function mb(value: number) {
  return value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${value} MB`
}

function runtimeName(m: RuntimeModel) {
  return m.name || m.model || 'unnamed'
}

/**
 * The models on this host, read from it.
 *
 * Two readings side by side. GET /api/models is the registry: what is
 * declared, and whether the provider actually has it installed. GET
 * /api/models/status adds what the runtime holds in memory right now and the
 * host memory the manager measured when it answered. Throughput is still not
 * shown, because nothing measures it; a tokens-per-second figure would be
 * the first number on this tab that the host did not produce.
 */
export function ModelEstate({ status, models }: { status: ModelsStatus; models: ModelDescriptor[] }) {
  const resident = new Set(
    status.resident_in_runtime.flatMap((m) => [m.name, m.model].filter((x): x is string => Boolean(x))),
  )
  const residency = status.residency
  const roles = Object.entries(status.roles).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Runtime" className="flex flex-col gap-3 rounded-[var(--radius)] bg-surface p-4 shadow-[var(--elev-0)]">
        <ReadoutRow>
          <Readout
            label="Provider"
            value={`${status.provider ?? 'unset'} · ${status.reachable ? 'reachable' : 'unreachable'}`}
            tone={status.reachable ? 'default' : 'critical'}
            hint={status.base_url ?? undefined}
          />
          <Readout label="Endpoint" value={status.base_url ?? 'not configured'} />
          <Readout label="Available" value={`${status.available} of ${status.registered} registered`} />
          {/* total_mb is 0 when the host's memory could not be read. */}
          <Readout
            label="Host memory"
            value={residency.total_mb > 0 ? `${mb(residency.available_mb)} free of ${mb(residency.total_mb)}` : 'not measured'}
            tone={residency.total_mb > 0 ? 'default' : 'muted'}
          />
          <Readout label="Loads · evictions" value={`${residency.loads} · ${residency.evictions}`} hint="Since the service started" />
        </ReadoutRow>
        <div className="flex flex-col gap-1">
          <span className={LEDGER_MUTED}>In memory now</span>
          {status.resident_in_runtime.length === 0 ? (
            <span className="text-ui text-foreground-secondary">
              {status.reachable
                ? 'The runtime reports no model loaded.'
                : 'Unknown: the runtime could not be asked.'}
            </span>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {status.resident_in_runtime.map((m) => (
                <li key={runtimeName(m)} className="font-mono text-ui text-foreground">
                  {runtimeName(m)}
                  {typeof m.size === 'number' && (
                    <span className="text-foreground-muted"> {formatBytes(m.size)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {models.length === 0 ? (
        <EmptyState
          className="rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]"
          title="No models are registered on this host"
          body="The router has nothing it is permitted to route to."
        />
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--elev-0)]">
          {models.map((model) => {
            const inMemory = resident.has(model.provider_model)
            return (
              <li
                key={model.id}
                className="grid grid-cols-1 gap-x-6 gap-y-2 border-b border-line-subtle px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-body font-medium text-foreground">{model.display_name}</span>
                    <span
                      className={cn(
                        'flex items-center gap-1 font-mono text-ledger uppercase tracking-[var(--ls-ledger)]',
                        model.available ? 'text-sovereign-text' : 'text-foreground-muted',
                      )}
                    >
                      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', model.available ? 'bg-sovereign' : 'bg-control-strong')} />
                      {model.available ? 'installed' : 'not installed'}
                    </span>
                    {inMemory && (
                      <span className="rounded-[var(--radius-xs)] px-1 font-mono text-ledger uppercase tracking-[var(--ls-ledger)] text-foreground shadow-[0_0_0_1px_var(--control-default)]">
                        in memory
                      </span>
                    )}
                  </span>
                  <span className="truncate font-mono text-ui text-foreground-muted" title={model.provider_model}>
                    {model.provider_model}
                  </span>
                  {model.notes && <span className="text-ui text-foreground-secondary">{model.notes}</span>}
                </div>
                <div className="tabular flex flex-col gap-1 font-mono text-ui text-foreground-secondary">
                  <span>
                    <span className="text-foreground-muted">role </span>
                    {model.role}
                  </span>
                  <span>
                    <span className="text-foreground-muted">context </span>
                    {model.context_window.toLocaleString()}
                    {model.parameters_b ? (
                      <>
                        <span className="text-foreground-muted"> · params </span>
                        {model.parameters_b}B
                      </>
                    ) : null}
                    {model.quantization ? (
                      <>
                        <span className="text-foreground-muted"> · </span>
                        {model.quantization}
                      </>
                    ) : null}
                  </span>
                  <span>
                    <span className="text-foreground-muted">on disk </span>
                    {model.size_bytes ? formatBytes(model.size_bytes) : 'not reported'}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className={LEDGER_MUTED}>Cleared for</span>
                  <span className="flex flex-wrap gap-1">
                    {model.approved_classifications.length === 0 ? (
                      <span className="text-ui text-foreground-muted">no classification</span>
                    ) : (
                      model.approved_classifications.map((c) => <ClassificationTag key={c} level={c} />)
                    )}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {roles.length > 0 && (
        <section aria-label="Routing roles" className="flex flex-col gap-2">
          <h3 className={LEDGER_MUTED}>Available to each routing role</h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[160px_minmax(0,1fr)]">
            {roles.map(([role, ids]) => (
              <div key={role} className="contents">
                <dt className="font-mono text-ui text-foreground-secondary">{role}</dt>
                <dd className={cn('font-mono text-ui', ids.length ? 'text-foreground' : 'text-approval-text')}>
                  {ids.length ? ids.join(', ') : 'no installed model'}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {status.unregistered_installed.length > 0 && (
        <p className="text-ui text-foreground-secondary">
          Installed on the host but not in the registry, so the router refuses them by policy:{' '}
          <span className="font-mono text-foreground">{status.unregistered_installed.join(', ')}</span>
        </p>
      )}
    </div>
  )
}
