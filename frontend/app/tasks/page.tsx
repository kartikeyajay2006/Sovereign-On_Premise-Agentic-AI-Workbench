"use client";

/**
 * Everything this host has run.
 *
 * Selecting a task opens its full record: the profile it was classified as,
 * the models chosen at each stage and the grounds for choosing them, every
 * tool call, the verification result and the approval decision.
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

export default function TasksPage() {
  const [summaries, setSummaries] = useState<TaskSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const { task, refresh } = useTask(selected);

  useEffect(() => {
    api
      .listTasks(100)
      .then((list) => {
        setSummaries(list);
        if (!selected && list.length) setSelected(list[0].id);
      })
      .catch(() => setSummaries([]));
  }, [selected]);

  return (
    <Shell>
      <div className="grid h-full grid-cols-1 gap-px overflow-hidden bg-seam lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ------------------------------------------------- task list */}
        <div className="min-h-0 overflow-y-auto bg-panel">
          <div className="border-b border-seam px-4 py-3">
            <h1 className="text-[0.9375rem] font-semibold text-ink">Task history</h1>
            <p className="mt-0.5 text-[0.75rem] text-ink-faint">
              {summaries.length} run{summaries.length === 1 ? "" : "s"} on this host
            </p>
          </div>

          {summaries.length === 0 ? (
            <EmptyState heading="No tasks yet">
              Work submitted on the console is recorded here permanently.
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
                        layoutId="task-marker"
                        className="absolute inset-y-0 left-0 w-[2px] bg-brass"
                      />
                    )}
                    <div className="flex items-center gap-1.5">
                      <Lamp signal={statusSignal(summary.status)} size={6} />
                      <span className="text-[0.6875rem] uppercase tracking-[0.1em] text-ink-faint">
                        {summary.status.replace(/_/g, " ")}
                      </span>
                      {summary.deliverable_count > 0 && (
                        <span className="text-[0.6875rem] text-ink-faint">
                          · {summary.deliverable_count} file
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink">
                      {summary.prompt}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {summary.task_type && (
                        <Chip signal="inert">{summary.task_type.replace(/_/g, " ")}</Chip>
                      )}
                      {summary.sensitivity && (
                        <Chip signal={classificationSignal(summary.sensitivity)}>
                          {summary.sensitivity}
                        </Chip>
                      )}
                    </div>
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

        {/* ------------------------------------------------ task record */}
        <div className="min-h-0 overflow-y-auto bg-ground">
          {!task ? (
            <EmptyState heading="Select a task">
              Its full execution record opens here.
            </EmptyState>
          ) : (
            <div className="space-y-4 p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip signal={statusSignal(task.status)}>
                    {task.status.replace(/_/g, " ")}
                  </Chip>
                  <span className="instrument text-[0.6875rem] text-ink-faint">
                    {task.id}
                  </span>
                  {task.duration_ms != null && (
                    <span className="instrument text-[0.6875rem] text-ink-faint">
                      {formatDuration(task.duration_ms)}
                    </span>
                  )}
                </div>
                <p className="mt-2 max-w-[75ch] text-[0.9375rem] leading-relaxed text-ink">
                  {task.prompt}
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
                <div className="space-y-4">
                  <AnswerPanel task={task} />
                  <DeliverablePanel task={task} canApprove={false} />
                  <EvidencePanel evidence={task.evidence} />
                </div>

                <div className="space-y-4">
                  <Panel title="Execution trace" bodyClassName="p-0">
                    <div className="max-h-[520px]">
                      <ProcessFlow task={task} events={[]} running={false} />
                    </div>
                  </Panel>
                  <VerificationPanel report={task.verification} />

                  {task.routing.length > 0 && (
                    <Panel title="Model selection">
                      <ul className="space-y-2">
                        {task.routing.map((decision, index) => (
                          <li
                            key={index}
                            className="rounded-chip border border-seam bg-raised px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[0.8125rem] text-ink">
                                {decision.selected_display_name ?? "no model selected"}
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
                    <Panel title={`Policy decisions · ${task.policy_events.length}`}>
                      <ul className="space-y-1.5">
                        {task.policy_events.slice(-12).map((event, index) => (
                          <li key={index} className="flex items-start gap-2">
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
