"use client";

/**
 * The live status bar.
 *
 * Five readings that answer, at a glance: can this machine do the work, and
 * has anything left it. Each carries a plain-language explanation on hover,
 * because a number nobody can interpret proves nothing to a new user.
 *
 * The segments light up once, left to right, on first load. After that the
 * only movement is the monitor's own heartbeat — so motion always means
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

function segments(
  health: SystemHealth | null,
  sovereignty: SovereigntyStatus | null,
): Segment[] {
  const egress = sovereignty?.unapproved_connections ?? 0;

  return [
    {
      label: "AI models",
      value: health ? `${health.models_available} ready` : "checking",
      signal: !health ? "inert" : health.models_available > 0 ? "live" : "alarm",
      hint: health?.inference_reachable
        ? `${health.models_available} of ${health.models_registered} approved models are installed and running on this machine.`
        : "The local AI service is not responding. Start it and this will clear.",
    },
    {
      label: "Document search",
      value:
        health?.retrieval_mode === "embedding"
          ? "meaning-based"
          : health?.retrieval_mode === "lexical"
            ? "keyword"
            : "checking",
      signal:
        health?.retrieval_mode === "embedding"
          ? "live"
          : health?.retrieval_mode === "lexical"
            ? "hold"
            : "inert",
      hint: health
        ? `${health.knowledge_documents} reference document(s) indexed as ${health.knowledge_chunks} searchable passages.`
        : "Checking how your reference documents are searched.",
    },
    {
      label: "Code sandbox",
      value: health ? (health.sandbox_ready ? "ready" : "unavailable") : "checking",
      signal: health?.sandbox_ready ? "live" : "alarm",
      hint: "Any code the AI writes runs in a locked box: no internet, limited memory and time, and it cannot touch the rest of your machine.",
    },
    {
      label: "Activity log",
      value: health ? (health.audit_chain_valid ? "verified" : "ALTERED") : "checking",
      signal: health?.audit_chain_valid ? "live" : "alarm",
      hint: "Every action is recorded and cryptographically linked to the one before it. If anyone edited the history, this would say ALTERED.",
    },
    {
      label: "Data sent out",
      value: sovereignty ? (egress === 0 ? "none" : `${egress}`) : "checking",
      signal: !sovereignty ? "inert" : egress === 0 ? "live" : "alarm",
      pulse: Boolean(sovereignty?.monitor_active),
      hint:
        egress === 0
          ? "No connection has left this machine since monitoring began. This is measured continuously, not assumed."
          : `${egress} connection(s) were seen leaving this machine. Open Security to review them.`,
    },
  ];
}

export function StatusBar({
  health,
  sovereignty,
}: {
  health: SystemHealth | null;
  sovereignty: SovereigntyStatus | null;
}) {
  const items = segments(health, sovereignty);
  const sovereign = sovereignty?.sovereign ?? true;

  return (
    <div className="flex items-stretch overflow-x-auto border-t border-seam bg-ground/50">
      {items.map((segment, index) => (
        <motion.div
          key={segment.label}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * index, duration: 0.3, ease: [0.2, 0.7, 0.3, 1] }}
          title={segment.hint}
          className="flex min-w-[132px] shrink-0 items-center gap-2 border-r border-seam px-3.5 py-1.5"
        >
          <Lamp signal={segment.signal} pulse={segment.pulse} size={7} />
          <span className="leading-tight">
            <span className="block text-[0.625rem] text-ink-faint">{segment.label}</span>
            <span
              className={`block text-[0.75rem] ${
                segment.signal === "alarm"
                  ? "text-alarm"
                  : segment.signal === "hold"
                    ? "text-hold"
                    : "text-ink"
              }`}
            >
              {segment.value}
            </span>
          </span>
        </motion.div>
      ))}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05 * items.length, duration: 0.35 }}
        title={
          sovereign
            ? "Everything ran on this machine. No cloud service was contacted at any point."
            : "Something left this machine. Open Security to see exactly what."
        }
        className={`ml-auto flex shrink-0 items-center gap-2 px-4 ${
          sovereign ? "bg-live/[0.07]" : "bg-alarm/15"
        }`}
      >
        <Lamp signal={sovereign ? "live" : "alarm"} pulse size={7} />
        <span
          className={`whitespace-nowrap text-[0.75rem] font-medium ${
            sovereign ? "text-live" : "text-alarm"
          }`}
        >
          {sovereign ? "Everything stayed on this machine" : "Data left this machine"}
        </span>
      </motion.div>
    </div>
  );
}
