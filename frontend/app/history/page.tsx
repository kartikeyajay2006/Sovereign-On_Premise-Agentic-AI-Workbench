"use client";

/**
 * History: everything this machine has been asked to do.
 *
 * Selecting a run opens its complete record — how the request was understood,
 * which model handled each step and on what grounds, every tool call, what was
 * checked, and who signed it off.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useTask } from "@/lib/hooks";
import type { TaskSummary } from "@/lib/types";
import { Shell } from "@/components/Shell";
import { ProcessFlow } from "@/components/ProcessFlow";
import {
  AnswerPanel,
  DeliverablePanel,
  EvidencePanel,
  VerificationPanel,
} from "@/components/ResultPanels";
import {
  Chip,
  EmptyState,
  Lamp,
  Panel,
  classificationSignal,
  formatDateTime,
  formatDuration,
  statusSignal,
} from "@/components/primitives";

/** Status words a non-specialist can act on. */
const STATUS_LABEL: Record<string, string> = {
  received: "just submitted",
  classified: "getting started",
  planned: "planning",
  retrieving: "reading your documents",
  executing: "working",
  verifying: "checking itself",
  awaiting_approval: "waiting for sign-off",
  approved: "approved",
  delivered: "finished",
  rejected: "rejected",
  failed: "did not finish",
  blocked: "stopped by policy",
};

export default function HistoryPage() {
  const [summaries, setSummaries] = useState<TaskSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { task } = useTask(selected);

  useEffect(() => {
    api
      .listTasks(100)
      .then((list) => {
        setSummaries(list);
        setSelected((current) => current ?? list[0]?.id ?? null);
      })
      .catch(() => setSummaries([]))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <Shell>
      <div className="grid h-full grid-cols-1 gap-px overflow-hidden bg-seam lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* --------------------------------------------------- run list */}
        <div className="flex min-h-0 flex-col overflow-hidden bg-panel">
          <div className="shrink-0 border-b border-seam px-4 py-3">
            <h1 className="text-[0.9375rem] font-semibold text-ink">History</h1>
            <p className="mt-0.5 text-[0.75rem] text-ink-faint">
              {summaries.length} run{summaries.length === 1 ? "" : "s"} on this machine
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!loaded ? (
              <div className="flex items-center gap-2 px-4 py-6 text-ink-dim">
                <Lamp signal="brass" pulse />
                <span className="text-[0.8125rem]">Loading</span>
              </div>
            ) : summaries.length === 0 ? (
              <EmptyState heading="Nothing has run yet">
                Work you submit in the workspace is kept here permanently, with its full
                record.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-seam">
                {summaries.map((summary) => (
                  <li key={summary.id}>
                    <button
                      onClick={() => setSelected(summary.id)}
                      className={`relative w-full px-4 py-3 text-left transition-colors ${
                        selected === summary.id ? "bg-raised" : "hover:bg-raised/50"
                      }`}
                    >
                      {selected === summary.id && (
                        <motion.span
                          layoutId="history-marker"
                          className="absolute inset-y-0 left-0 w-[2px] bg-brass"
                        />
                      )}
                      <div className="flex items-center gap-1.5">
                        <Lamp signal={statusSignal(summary.status)} size={6} />
                        <span className="text-[0.6875rem] text-ink-faint">
                          {STATUS_LABEL[summary.status] ?? summary.status}
                        </span>
                        {summary.deliverable_count > 0 && (
                          <span className="text-[0.6875rem] text-ink-faint">
                            · {summary.deliverable_count} file
                            {summary.deliverable_count === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink">
                        {summary.prompt}
                      </p>
                      <div className="mt-1 text-[0.625rem] text-ink-faint">
                        {formatDateTime(summary.created_at)}
                        {summary.user_display_name ? ` · ${summary.user_display_name}` : ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ------------------------------------------------- run record */}
        <div className="min-h-0 overflow-y-auto bg-ground">
          {!task ? (
            <EmptyState heading="Choose a run on the left">
              Its full record opens here — the answer, the evidence behind it, and every
              step taken.
            </EmptyState>
          ) : (
            <div className="space-y-4 p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip signal={statusSignal(task.status)}>
                    {STATUS_LABEL[task.status] ?? task.status}
                  </Chip>
                  {task.profile && (
                    <Chip signal={classificationSignal(task.profile.sensitivity)}>
                      {task.profile.sensitivity}
                    </Chip>
                  )}
                  {task.duration_ms != null && (
                    <span className="instrument text-[0.6875rem] text-ink-faint">
                      took {formatDuration(task.duration_ms)}
                    </span>
                  )}
                </div>
                <p className="mt-2 max-w-[78ch] text-[0.9375rem] leading-relaxed text-ink">
                  {task.prompt}
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)]">
                <div className="space-y-4">
                  <AnswerPanel task={task} />
                  <DeliverablePanel task={task} canApprove={false} />
                  <EvidencePanel evidence={task.evidence} />
                </div>

                <div className="space-y-4">
                  {/* A definite height: the trace scrolls inside its own panel
                      rather than overflowing onto what follows. */}
                  <Panel title="Every step taken" bodyClassName="p-0">
                    <div className="h-[480px]">
                      <ProcessFlow task={task} events={[]} running={false} />
                    </div>
                  </Panel>

                  <VerificationPanel report={task.verification} />

                  {task.routing.length > 0 && (
                    <Panel title="Which model, and why">
                      <ul className="space-y-2">
                        {task.routing.map((decision, index) => (
                          <li
                            key={`${decision.selected_model ?? "none"}-${index}`}
                            className="rounded-chip border border-seam bg-raised px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[0.8125rem] text-ink">
                                {decision.selected_display_name ?? "no model available"}
                              </span>
                              <Chip signal={decision.used_fallback ? "hold" : "inert"}>
                                {decision.requested_role}
                              </Chip>
                            </div>
                            <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-faint">
                              {decision.reason}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </Panel>
                  )}

                  {task.policy_events.length > 0 && (
                    <Panel title={`Policy checks · ${task.policy_events.length}`}>
                      <ul className="space-y-1.5">
                        {task.policy_events.slice(-12).map((event, index) => (
                          <li key={`${event.subject}-${index}`} className="flex items-start gap-2">
                            <Lamp
                              signal={event.decision === "allow" ? "live" : "alarm"}
                              size={6}
                            />
                            <div className="min-w-0">
                              <div className="instrument text-[0.75rem] text-ink-dim">
                                {event.subject}
                              </div>
                              <div className="text-[0.6875rem] leading-relaxed text-ink-faint">
                                {event.reason}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Panel>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
