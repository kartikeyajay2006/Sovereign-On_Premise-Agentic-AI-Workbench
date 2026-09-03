"use client";

/**
 * Security Center: the containment evidence.
 *
 * The claim "nothing leaves this host" is only worth what can be shown, so
 * this screen shows the measurements rather than the assertion: live
 * connection counts from the monitor, an adversarial sandbox test anyone can
 * re-run, the model residency the runtime actually holds, and the policy set
 * being enforced.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useSovereignty } from "@/lib/hooks";
import { useStream } from "@/lib/stream";
import type { ModelsStatus, SandboxSelfTest } from "@/lib/types";
import { Shell } from "@/components/Shell";
import {
  Button,
  Chip,
  EmptyState,
  Lamp,
  Panel,
  Readout,
  formatDateTime,
} from "@/components/primitives";

export default function SecurityPage() {
  const { sovereignty: pushed } = useStream();
  const sovereignty = useSovereignty(pushed, 4000);
  const [models, setModels] = useState<ModelsStatus | null>(null);
  const [policies, setPolicies] = useState<Record<string, any> | null>(null);
  const [selfTest, setSelfTest] = useState<SandboxSelfTest | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.modelsStatus().then(setModels).catch(() => setModels(null));
    api.policies().then(setPolicies).catch(() => setPolicies(null));
  }, []);

  const runSelfTest = useCallback(async () => {
    setTesting(true);
    try {
      setSelfTest(await api.sandboxSelfTest());
    } finally {
      setTesting(false);
    }
  }, []);

  const sovereign = sovereignty?.sovereign ?? true;
  const interfaces = Object.entries(sovereignty?.interfaces ?? {});

  return (
    <Shell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1180px] space-y-4 p-5">
          <div>
            <h1 className="text-[1.375rem] font-semibold tracking-tight text-ink">
              Security Center
            </h1>
            <p className="mt-1 max-w-[70ch] text-[0.875rem] leading-relaxed text-ink-dim">
              Measurements, not assurances. Every figure here is read from this host
              while you watch.
            </p>
          </div>

          {/* ------------------------------------------- egress verdict */}
          <motion.section
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`panel overflow-hidden ${sovereign ? "" : "border-alarm/50"}`}
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-4 px-5 py-4 ${
                sovereign ? "bg-live/[0.06]" : "bg-alarm/10"
              }`}
            >
              <div className="flex items-center gap-3">
                <Lamp signal={sovereign ? "live" : "alarm"} pulse size={12} />
                <div>
                  <div
                    className={`text-[1.125rem] font-semibold tracking-tight ${
                      sovereign ? "text-live" : "text-alarm"
                    }`}
                  >
                    {sovereign
                      ? "No connection has left this host"
                      : "A connection left this host"}
                  </div>
                  <div className="text-[0.75rem] text-ink-faint">
                    Monitoring since {formatDateTime(sovereignty?.monitored_since)} · last
                    read {formatDateTime(sovereignty?.last_checked)}
                  </div>
                </div>
              </div>
              <Chip signal={sovereignty?.monitor_active ? "live" : "hold"}>
                <Lamp signal={sovereignty?.monitor_active ? "live" : "hold"} pulse size={6} />
                monitor {sovereignty?.monitor_active ? "running" : "stopped"}
              </Chip>
            </div>

            <div className="grid grid-cols-2 gap-px border-t border-seam bg-seam md:grid-cols-3 lg:grid-cols-6">
              {[
                ["External API calls", sovereignty?.external_api_calls],
                ["Cloud LLM calls", sovereignty?.cloud_llm_calls],
                ["Internet requests", sovereignty?.internet_requests],
                ["DNS requests", sovereignty?.dns_requests],
                ["Unapproved connections", sovereignty?.unapproved_connections],
                ["Bytes leaving host", sovereignty?.data_leaving_host_bytes],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-panel px-4 py-3">
                  <div className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
                    {label}
                  </div>
                  <div
                    className={`instrument mt-1 text-2xl font-semibold ${
                      Number(value ?? 0) === 0 ? "text-live" : "text-alarm"
                    }`}
                  >
                    {value ?? "—"}
                  </div>
                </div>
              ))}
            </div>

            {sovereignty && sovereignty.violations.length > 0 && (
              <div className="border-t border-seam p-4">
                <div className="text-[0.6875rem] uppercase tracking-[0.12em] text-alarm">
                  Observed egress
                </div>
                <ul className="mt-2 space-y-1.5">
                  {sovereignty.violations.map((violation, index) => (
                    <li
                      key={index}
                      className="instrument rounded-chip border border-alarm/40 bg-alarm/10 px-3 py-2 text-[0.75rem] text-ink-dim"
                    >
                      {violation.laddr} → {violation.raddr} · {violation.process ?? "unknown"} ·{" "}
                      {violation.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ------------------------------------ sandbox self-test */}
            <Panel
              title="Sandbox isolation"
              action={
                <Button variant="secondary" onClick={() => void runSelfTest()} disabled={testing}>
                  {testing ? "Testing" : "Run the test"}
                </Button>
              }
            >
              <p className="text-[0.8125rem] leading-relaxed text-ink-dim">
                Generated code is checked before it runs and contained while it runs. This
                test attacks both layers: it submits code that imports a socket, then
                bypasses the static check to confirm the runtime still blocks it.
              </p>

              {selfTest ? (
                <div className="mt-3 space-y-2">
                  {[
                    [
                      "Static validation blocks the import",
                      selfTest.static_layer_blocks_network_import,
                      selfTest.static_violations.join("; "),
                    ],
                    [
                      "Runtime blocks the socket even when static is bypassed",
                      selfTest.runtime_layer_blocks_socket,
                      `${selfTest.runtime_attempts_recorded} attempt(s) recorded and refused`,
                    ],
                  ].map(([label, passed, detail]) => (
                    <div
                      key={String(label)}
                      className="rounded-chip border border-seam bg-raised px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Lamp signal={passed ? "live" : "alarm"} size={7} />
                        <span className="text-[0.8125rem] text-ink">{label}</span>
                      </div>
                      <p className="mt-1 pl-4 text-[0.75rem] text-ink-faint">{detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[0.75rem] text-ink-faint">
                  Run it now — the result is recorded to the audit trail.
                </p>
              )}
            </Panel>

            {/* ------------------------------------- model residency */}
            <Panel title="Local models">
              {!models ? (
                <EmptyState heading="Model state unavailable" />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Readout
                      label="Installed"
                      value={`${models.available} of ${models.registered}`}
                      signal={models.available > 0 ? "live" : "alarm"}
                    />
                    <Readout
                      label="Free memory"
                      value={`${(models.residency.available_mb / 1024).toFixed(1)} GB`}
                      signal={models.residency.available_mb > 1500 ? "live" : "hold"}
                    />
                  </div>

                  <div className="rounded-chip border border-seam bg-raised px-3 py-2.5">
                    <div className="text-[0.6875rem] uppercase tracking-[0.12em] text-ink-faint">
                      Resident now
                    </div>
                    <div className="instrument mt-1 text-[0.875rem] text-ink">
                      {models.residency.resident_model ?? "none loaded"}
                    </div>
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-faint">
                      {models.residency.single_residency
                        ? "One generation model at a time; switching roles evicts the previous one so this host stays within memory."
                        : "Models may share memory on this host."}{" "}
                      {models.residency.loads} load(s), {models.residency.evictions} eviction(s)
                      this session.
                    </p>
                  </div>

                  {Object.entries(models.roles).map(([role, ids]) => (
                    <div key={role} className="flex items-baseline gap-2">
                      <span className="w-[74px] shrink-0 text-[0.75rem] text-ink-faint">
                        {role}
                      </span>
                      <span className="instrument text-[0.75rem] text-ink-dim">
                        {ids.length ? ids.join(", ") : "none installed"}
                      </span>
                    </div>
                  ))}

                  {models.unregistered_installed.length > 0 && (
                    <p className="rounded-chip border border-hold/40 bg-hold/[0.07] px-3 py-2 text-[0.75rem] text-hold">
                      Installed but not registered, so refused by policy:{" "}
                      {models.unregistered_installed.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* --------------------------------------- denied actions */}
            <Panel title="Denied unconditionally">
              <p className="text-[0.8125rem] text-ink-dim">
                No role can perform these, and there is no override path.
              </p>
              <ul className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {(policies?.hard_denied_actions ?? []).map((action: string) => (
                  <li
                    key={action}
                    className="flex items-center gap-2 rounded-chip border border-alarm/25 bg-alarm/[0.06] px-2.5 py-1.5"
                  >
                    <Lamp signal="alarm" size={5} />
                    <span className="text-[0.75rem] text-ink-dim">
                      {action.replace(/_/g, " ")}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            {/* ------------------------------------------- interfaces */}
            <Panel title="Host interfaces">
              {interfaces.length === 0 ? (
                <EmptyState heading="Interface inventory unavailable" />
              ) : (
                <ul className="space-y-1.5">
                  {interfaces.map(([name, detail]) => (
                    <li
                      key={name}
                      className="flex items-center justify-between gap-3 rounded-chip border border-seam bg-raised px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Lamp
                          signal={detail.loopback ? "live" : detail.up ? "hold" : "inert"}
                          size={6}
                        />
                        <span className="instrument text-[0.8125rem] text-ink">{name}</span>
                        {detail.loopback && <Chip signal="live">loopback</Chip>}
                      </div>
                      <span className="instrument truncate text-[0.6875rem] text-ink-faint">
                        {detail.addresses.join(", ") || "no address"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {/* ------------------------------------------ tool policy */}
          {policies?.tools && (
            <Panel title="Tool permissions">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left">
                  <thead>
                    <tr className="border-b border-seam">
                      {["Tool", "Roles", "Effect", "Up to"].map((heading) => (
                        <th
                          key={heading}
                          className="pb-2 text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-ink-faint"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-seam">
                    {Object.entries(policies.tools).map(([name, definition]: [string, any]) => (
                      <tr key={name}>
                        <td className="py-2 pr-3 text-[0.8125rem] text-ink">
                          {name.replace(/_/g, " ")}
                        </td>
                        <td className="py-2 pr-3 text-[0.75rem] text-ink-dim">
                          {(definition.allowed_roles ?? []).join(", ")}
                        </td>
                        <td className="py-2 pr-3 text-[0.75rem] text-ink-dim">
                          {definition.side_effects}
                        </td>
                        <td className="py-2 text-[0.75rem] text-ink-dim">
                          {definition.max_data_classification ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </Shell>
  );
}
