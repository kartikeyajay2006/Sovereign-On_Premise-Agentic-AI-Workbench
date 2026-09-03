"use client";

/**
 * The console: submit work, watch the agent work, read what it produced.
 *
 * Left is the request and its result; right is the execution trace. The two
 * are side by side deliberately — an operator should never have to choose
 * between seeing the answer and seeing how it was reached.
 */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import { useEventStream, useTask } from "@/lib/hooks";
import type { User } from "@/lib/types";
import { Shell } from "@/components/Shell";
import { Composer } from "@/components/Composer";
import { ProcessFlow } from "@/components/ProcessFlow";
import {
  AnswerPanel,
  DeliverablePanel,
  EvidencePanel,
  VerificationPanel,
} from "@/components/ResultPanels";
import { Chip, Panel, classificationSignal, formatDuration } from "@/components/primitives";

const RUNNING = ["received", "classified", "planned", "retrieving", "executing", "verifying"];

function ProfileStrip({ task }: { task: NonNullable<ReturnType<typeof useTask>["task"]> }) {
  const profile = task.profile;
  if (!profile) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-1.5"
    >
      <Chip signal="inert">{profile.input_type.replace(/_/g, " ")}</Chip>
      <Chip signal="brass">{profile.task_type.replace(/_/g, " ")}</Chip>
      <Chip signal="inert">{profile.complexity.replace(/_/g, " ")}</Chip>
      <Chip signal={classificationSignal(profile.sensitivity)}>{profile.sensitivity}</Chip>
      {profile.deliverable_format && (
        <Chip signal="inert">{profile.deliverable_format.toUpperCase()}</Chip>
      )}
      {task.duration_ms != null && (
        <span className="instrument text-[0.6875rem] text-ink-faint">
          {formatDuration(task.duration_ms)}
        </span>
      )}
    </motion.div>
  );
}

export default function ConsolePage() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const { task, refresh } = useTask(taskId);
  const { events } = useEventStream(taskId ?? undefined);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  // Resume whatever was last running, so a refresh does not lose the operator.
  useEffect(() => {
    if (taskId) return;
    api
      .listTasks(1)
      .then((summaries) => {
        if (summaries.length) setTaskId(summaries[0].id);
      })
      .catch(() => undefined);
  }, [taskId]);

  const running = Boolean(task && RUNNING.includes(task.status));

  const decide = useCallback(
    async (decision: "approve" | "reject", comment: string) => {
      if (!taskId) return;
      await api.decide(taskId, decision, comment);
      await refresh();
    },
    [taskId, refresh],
  );

  const latestStage = [...events]
    .reverse()
    .find((event) => event.event === "task.stage")?.data?.message as string | undefined;

  return (
    <Shell>
      <div className="grid h-full grid-cols-1 gap-px overflow-hidden bg-seam xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]">
        {/* ------------------------------------------- request + result */}
        <div className="min-h-0 overflow-y-auto bg-ground">
          <div className="mx-auto max-w-[880px] space-y-4 p-5">
            <div>
              <h1 className="text-[1.375rem] font-semibold tracking-tight text-ink">
                What needs doing?
              </h1>
              <p className="mt-1 max-w-[60ch] text-[0.875rem] leading-relaxed text-ink-dim">
                Local models read your documents, ground the answer in your own
                procedures, and produce a filed deliverable. Nothing is sent off this
                machine.
              </p>
            </div>

            <Composer onSubmitted={setTaskId} busy={running} />

            <AnimatePresence mode="wait">
              {task && (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-seam pt-4">
                    <ProfileStrip task={task} />
                    {running && latestStage && (
                      <span className="text-[0.75rem] text-brass">{latestStage}</span>
                    )}
                  </div>

                  <AnswerPanel task={task} />

                  <DeliverablePanel
                    task={task}
                    canApprove={Boolean(user?.permissions.includes("approval.decide"))}
                    onApprove={decide}
                  />

                  <div className="grid gap-4 lg:grid-cols-2">
                    <EvidencePanel evidence={task.evidence} />
                    <VerificationPanel report={task.verification} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ------------------------------------------------ agent trace */}
        <aside className="flex min-h-0 flex-col overflow-hidden bg-panel">
          <Panel
            title="Execution trace"
            action={
              running ? (
                <span className="text-[0.6875rem] uppercase tracking-[0.12em] text-brass">
                  running
                </span>
              ) : (
                <span className="text-[0.6875rem] text-ink-faint">idle</span>
              )
            }
            className="h-full border-0"
            bodyClassName="min-h-0 flex-1 p-0"
          >
            <ProcessFlow task={task} events={events} running={running} />
          </Panel>
        </aside>
      </div>
    </Shell>
  );
}
