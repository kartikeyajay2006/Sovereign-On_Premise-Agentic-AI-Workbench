'use client'

import { useCallback, type ReactNode } from 'react'
import { PageHeader } from '@/components/page-header'
import { useRole } from '@/components/role-context'
import { useEventStream } from '@/hooks/use-event-stream'
import type { StreamEvent } from '@/lib/types'
import { FailureState, ReadingLine, useReading } from '@/shared/ui/data/reading'
import { isSovereigntyStatus, readSovereignty } from './api'
import { Ago, EgressPanel } from './egress-panel'
import { PolicyPanel } from './policy-panel'
import { SandboxPanel } from './sandbox-panel'

function Section({
  id,
  index,
  title,
  lede,
  children,
}: {
  id: string
  index: string
  title: string
  lede: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-b border-line-default pb-3">
        <h2 id={id} className="flex items-baseline gap-3 text-heading font-medium tracking-[var(--ls-heading)] text-foreground">
          <span className="tabular font-mono text-ledger text-foreground-muted">{index}</span>
          {title}
        </h2>
        <p className="max-w-[80ch] text-body text-foreground-secondary">{lede}</p>
      </div>
      {children}
    </section>
  )
}

/**
 * Assurance: what this host can show about its own conduct.
 *
 * The header used to read "Nothing leaves this host." above a 96px zero, and
 * that zero had been the default when no reading had arrived. What the host
 * can actually show is narrower and is stated at that width: the egress
 * monitor's own counter and when it last sampled, what the sandbox did with
 * real payloads when asked just now, and the policy the gateway is
 * configured with. Each is labelled with what kind of fact it is: a
 * measurement, a test result, or configuration.
 *
 * The egress figures follow the event stream, which carries each new sample
 * (every 2 s as config/app.yaml ships), so the "last sample" readout ages
 * visibly if the stream stops rather than going quietly stale.
 */
export function SecurityView() {
  const { user } = useRole()
  const sovereignty = useReading((signal) => readSovereignty(signal), [])
  const { setData } = sovereignty

  const onEvent = useCallback(
    (event: StreamEvent) => {
      if (event.event === 'sovereignty.status' && isSovereigntyStatus(event.data)) {
        const next = event.data
        setData(() => next)
      }
    },
    [setData],
  )
  const { connected } = useEventStream({ onEvent })

  const status = sovereignty.data

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Assurance"
        description="What this host measured about its own network behaviour, what its sandbox can prove here, and the policy every run is checked against."
        meta={[
          {
            label: 'Egress monitor',
            value: status ? (status.monitor_active ? 'sampling' : 'not running') : '—',
            tone: !status ? 'muted' : status.monitor_active ? 'default' : 'approval',
          },
          {
            label: 'Non-loopback',
            value: status ? String(status.unapproved_connections) : '—',
            tone: !status ? 'muted' : status.unapproved_connections === 0 ? 'default' : 'critical',
            hint: 'Connections from the workbench process tree to anything outside loopback, since the monitor started',
          },
          {
            label: 'Last sample',
            value: status ? <Ago iso={status.last_checked} /> : '—',
            hint: status?.last_checked,
          },
          {
            label: 'Stream',
            value: connected ? 'live' : 'not connected',
            tone: connected ? 'default' : 'muted',
          },
        ]}
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-12 px-4 pb-16 pt-6 sm:px-6">
        <Section
          id="egress"
          index="01"
          title="Egress, as measured"
          lede="A measurement: the monitor samples the network connections of the workbench's own processes and counts any that leave the loopback ranges."
        >
          {status ? (
            <EgressPanel status={status} live={connected} />
          ) : sovereignty.status === 'failed' ? (
            <FailureState failure={sovereignty.failure!} what="the egress monitor" retry={sovereignty.reload} />
          ) : (
            <ReadingLine what="the egress monitor" source="GET /api/sovereignty" startedAt={sovereignty.startedAt} />
          )}
        </Section>

        <Section
          id="sandbox"
          index="02"
          title="Sandbox containment"
          lede="A test result: only what the sandbox did when payloads were submitted just now. Nothing here is carried over from an earlier run."
        >
          <SandboxPanel />
        </Section>

        <Section
          id="policy"
          index="03"
          title="Policy"
          lede="Configuration: what the gateway is told to allow and refuse, read from the policy files by the service. It says what should happen; the audit trail records what did."
        >
          <PolicyPanel currentRole={user?.role ?? null} />
        </Section>
      </div>
    </div>
  )
}
