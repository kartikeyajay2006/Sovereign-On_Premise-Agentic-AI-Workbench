"use client";

/**
 * The audit trail.
 *
 * Each event carries the hash of the one before it, so the record either
 * verifies as a whole or names the exact point where it stopped verifying.
 * The chain check is shown at the top because an audit trail nobody can
 * validate is just a log file.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, downloadProtected } from "@/lib/api";
import type { AuditChainStatus, AuditEvent, User } from "@/lib/types";
import { Shell } from "@/components/Shell";
import {
  Button,
  Chip,
  EmptyState,
  Lamp,
  Panel,
  Signal,
  formatDateTime,
} from "@/components/primitives";

const CATEGORY_SIGNAL: Record<string, Signal> = {
  security: "hold",
  policy: "brass",
  sovereignty: "alarm",
  model: "live",
  tool: "inert",
  task: "inert",
  approval: "hold",
  deliverable: "live",
  knowledge: "inert",
  verification: "live",
  identity: "inert",
  system: "inert",
  audit: "inert",
  file: "inert",
};

const CATEGORIES = [
  "",
  "task",
  "model",
  "tool",
  "policy",
  "approval",
  "verification",
  "deliverable",
  "security",
  "sovereignty",
  "knowledge",
  "system",
];

export default function RecordPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [chain, setChain] = useState<AuditChainStatus | null>(null);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, status] = await Promise.all([
        api.audit({ category: category || undefined, search: search || undefined, limit: 400 }),
        api.auditChain(),
      ]);
      setEvents(list);
      setChain(status);
      setError(null);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not read the audit trail");
    }
  }, [category, search]);

  useEffect(() => {
    void load();
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, [load]);

  const canExport = user?.permissions.includes("audit.read.all");

  return (
    <Shell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1180px] space-y-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[1.5rem] font-semibold tracking-tight text-ink">
                Record
              </h1>
              <p className="mt-1.5 max-w-[70ch] text-[0.9375rem] leading-relaxed text-ink-dim">
                Everything this machine did, in order. Each entry is cryptographically
                linked to the one before it, so if any line were edited or removed the
                check below would say exactly where.
              </p>
            </div>
            {canExport && (
              <Button
                variant="secondary"
                onClick={() =>
                  void downloadProtected("/api/audit/export", "audit-trail.jsonl")
                }
              >
                Export the record
              </Button>
            )}
          </div>

          {/* ------------------------------------------- chain status */}
          <motion.div
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            className={`panel flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 ${
              chain && !chain.valid ? "border-alarm/50 bg-alarm/[0.07]" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <Lamp signal={chain?.valid ? "live" : "alarm"} size={10} pulse={chain?.valid} />
              <div>
                <div
                  className={`text-[0.9375rem] font-semibold ${
                    chain?.valid ? "text-live" : "text-alarm"
                  }`}
                >
                  {chain?.valid
                    ? "Chain verifies end to end"
                    : `Chain breaks at event ${chain?.broken_at ?? "?"}`}
                </div>
                <div className="text-[0.75rem] text-ink-faint">
                  {chain?.events ?? 0} events recomputed and compared just now
                </div>
              </div>
            </div>
            {chain?.head_hash && (
              <div className="text-right">
                <div className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
                  Head hash
                </div>
                <div className="instrument text-[0.6875rem] text-ink-dim">
                  {chain.head_hash.slice(0, 40)}…
                </div>
              </div>
            )}
          </motion.div>

          {/* ------------------------------------------------- filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void load();
              }}
              placeholder="Search actors, actions, filenames, model ids"
              className="readout min-w-[240px] flex-1 px-3 py-2 text-[0.8125rem] text-ink outline-none focus:border-brass/60"
            />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Category"
              className="rounded-chip border border-seam bg-raised px-2.5 py-2 text-[0.8125rem] text-ink outline-none focus:border-brass/60"
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item || "all categories"}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => void load()}>
              Apply
            </Button>
          </div>

          {error && (
            <p className="rounded-chip border border-alarm/40 bg-alarm/10 px-3 py-2 text-[0.8125rem] text-alarm">
              {error}
            </p>
          )}

          {/* -------------------------------------------------- events */}
          <Panel title={`Events · ${events.length}`} bodyClassName="p-0">
            {events.length === 0 ? (
              <EmptyState heading="No events match">
                Adjust the filters, or run a task on the console to generate a trace.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-seam">
                {events.map((event) => {
                  const open = expanded === event.sequence;
                  return (
                    <li key={event.id}>
                      <button
                        onClick={() => setExpanded(open ? null : event.sequence)}
                        className="w-full px-4 py-2.5 text-left transition-colors hover:bg-raised/60"
                        aria-expanded={open}
                      >
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="instrument w-[52px] shrink-0 text-[0.6875rem] text-ink-faint">
                            #{event.sequence}
                          </span>
                          <Chip signal={CATEGORY_SIGNAL[event.category] ?? "inert"}>
                            {event.category}
                          </Chip>
                          <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">
                            {event.action.replace(/_/g, " ")}
                          </span>
                          <span className="text-[0.6875rem] text-ink-dim">{event.actor}</span>
                          <span className="instrument text-[0.6875rem] text-ink-faint">
                            {formatDateTime(event.at)}
                          </span>
                        </div>
                      </button>

                      {open && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="overflow-hidden border-t border-seam bg-ground/60 px-4 py-3"
                        >
                          <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
                            <pre className="instrument max-h-[280px] overflow-auto whitespace-pre-wrap break-words text-[0.6875rem] leading-relaxed text-ink-dim">
                              {JSON.stringify(event.detail, null, 2)}
                            </pre>
                            <dl className="space-y-1.5 text-[0.6875rem]">
                              {[
                                ["Actor role", event.actor_role ?? "—"],
                                ["Task", event.task_id ?? "—"],
                                ["This hash", event.hash],
                                ["Previous", event.prev_hash],
                              ].map(([term, value]) => (
                                <div key={term}>
                                  <dt className="uppercase tracking-[0.1em] text-ink-faint">
                                    {term}
                                  </dt>
                                  <dd className="instrument break-all text-ink-dim">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        </motion.div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
