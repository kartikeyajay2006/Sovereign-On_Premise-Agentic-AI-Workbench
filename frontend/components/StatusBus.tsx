"use client";

/**
 * The annunciator status bus.
 *
 * A strip of live instrument readings that never leaves the screen: what the
 * models are doing, how retrieval is running, whether the sandbox and audit
 * chain are sound, and — the reading that matters most — how many connections
 * have left this host.
 *
 * The segments illuminate once, left to right, on power-up. After that the
 * only motion is the monitor's own heartbeat, so movement always means
 * something.
 */

import { motion } from "framer-motion";
import { Lamp, Signal } from "./primitives";
import type { SovereigntyStatus, SystemHealth } from "@/lib/types";

interface Segment {
  label: string;
  value: string;
  signal: Signal;
  pulse?: boolean;
  hint: string;
}

function buildSegments(
  health: SystemHealth | null,
  sovereignty: SovereigntyStatus | null,
): Segment[] {
  const segments: Segment[] = [];

  segments.push({
    label: "Models",
    value: health ? `${health.models_available}/${health.models_registered}` : "—",
    signal: !health ? "inert" : health.models_available > 0 ? "live" : "alarm",
    hint: health?.inference_reachable
      ? `Local inference via ${health.inference_provider}; ${health.models_available} of ${health.models_registered} registered models installed`
      : "Local inference runtime is not reachable",
  });

  segments.push({
    label: "Retrieval",
    value: health?.retrieval_mode ?? "—",
    signal:
      health?.retrieval_mode === "embedding"
        ? "live"
        : health?.retrieval_mode === "lexical"
          ? "hold"
          : "inert",
    hint: health
      ? `${health.knowledge_documents} document(s), ${health.knowledge_chunks} indexed passage(s)`
      : "Knowledge base state unknown",
  });

  segments.push({
    label: "Sandbox",
    value: health ? (health.sandbox_ready ? health.sandbox_runtime : "not ready") : "—",
    signal: health?.sandbox_ready ? "live" : "alarm",
    hint: "Code execution is confined to a resource-limited, network-denied sandbox",
  });

  segments.push({
    label: "Audit chain",
    value: health ? (health.audit_chain_valid ? "intact" : "BROKEN") : "—",
    signal: health?.audit_chain_valid ? "live" : "alarm",
    hint: "Every event is hash-chained to its predecessor; tampering breaks the chain",
  });

  const egress = sovereignty?.unapproved_connections ?? 0;
  segments.push({
    label: "Egress",
    value: sovereignty ? String(egress) : "—",
    signal: !sovereignty ? "inert" : egress === 0 ? "live" : "alarm",
    pulse: Boolean(sovereignty?.monitor_active),
    hint:
      egress === 0
        ? "No connection has left this host since monitoring began"
        : `${egress} connection(s) observed leaving the host`,
  });

  return segments;
}

export function StatusBus({
  health,
  sovereignty,
}: {
  health: SystemHealth | null;
  sovereignty: SovereigntyStatus | null;
}) {
  const segments = buildSegments(health, sovereignty);
  const sovereign = sovereignty?.sovereign ?? true;

  return (
    <div className="flex items-stretch divide-x divide-seam border-l border-seam">
      {segments.map((segment, index) => (
        <motion.div
          key={segment.label}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 * index, duration: 0.35, ease: [0.2, 0.7, 0.3, 1] }}
          title={segment.hint}
          className="flex min-w-[104px] flex-col justify-center px-3.5 py-1"
        >
          <span className="text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
            {segment.label}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <Lamp signal={segment.signal} pulse={segment.pulse} size={7} />
            <span
              className={`instrument text-[0.8125rem] ${
                segment.signal === "alarm"
                  ? "text-alarm"
                  : segment.signal === "hold"
                    ? "text-hold"
                    : segment.signal === "live"
                      ? "text-ink"
                      : "text-ink-dim"
              }`}
            >
              {segment.value}
            </span>
          </span>
        </motion.div>
      ))}

      {/* The sovereignty verdict: the reason this platform exists. */}
      <motion.div
        initial={{ opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 * segments.length, duration: 0.4 }}
        title={
          sovereign
            ? "All processing is local. No external API calls, cloud inference, or data egress observed."
            : "The monitor has observed a connection leaving this host. See the Security Center."
        }
        className={`flex items-center gap-2 px-4 ${
          sovereign ? "bg-live/[0.07]" : "bg-alarm/15"
        }`}
      >
        <Lamp signal={sovereign ? "live" : "alarm"} pulse size={8} />
        <div className="leading-tight">
          <div
            className={`text-[0.6875rem] font-semibold uppercase tracking-[0.14em] ${
              sovereign ? "text-live" : "text-alarm"
            }`}
          >
            {sovereign ? "Sovereign" : "Egress detected"}
          </div>
          <div className="text-[0.625rem] text-ink-faint">
            {sovereign ? "nothing left this host" : "review required"}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
