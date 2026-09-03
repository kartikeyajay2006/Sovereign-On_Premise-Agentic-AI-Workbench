"use client";

/**
 * The workspace: ask for work, watch it happen, read what came back.
 *
 * A first-time user needs three questions answered without asking anyone:
 * what can I type here, what is it doing right now, and can I trust the
 * result. The composer answers the first with real examples, the trace panel
 * answers the second continuously, and evidence plus verification answer the
 * third under the answer itself.
 */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import { useTask } from "@/lib/hooks";
import { useStream } from "@/lib/stream";
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
import {
  Chip,
  Lamp,
  classificationSignal,
  formatDuration,
} from "@/components/primitives";

const RUNNING = ["received", "classified", "planned", "retrieving", "executing", "verifying"];

/** Plain-language reading of the profile the analyzer produced. */
function ProfileStrip({
  task,
}: {
  task: NonNullable<ReturnType<typeof useTask>["task"]>;
}) {
  const profile = task.profile;
  if (!profile) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[0.75rem] text-ink-faint">Understood as:</span>
      <Chip signal="brass">{profile.task_type.replace(/_/g, " ")}</Chip>
      <Chip signal={classificationSignal(profile.sensitivity)}>
        {profile.sensitivity} material
      </Chip>
      {profile.requires_vision && <Chip signal="inert">reads the image</Chip>}
      {profile.requires_retrieval && <Chip signal="inert">checks your documents</Chip>}
      {profile.deliverable_format && (
        <Chip signal="inert">produces {profile.deliverable_format.toUpperCase()}</Chip>
      )}
      {task.duration_ms != null && (
        <span className="instrument text-[0.6875rem] text-ink-faint">
          took {formatDuration(task.duration_ms)}
        </span>
      )}
    </div>
  );
}

export default function ConsolePage() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const { task, refresh } = useTask(taskId);
  const { events } = useStream(taskId ?? undefined);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  // Reopen whatever was last running, so a page refresh does not lose the user.
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
      <div className="grid h-full grid-cols-1 gap-px overflow-hidden bg-seam xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.85fr)]">
        {/* ------------------------------------------- request and result */}
        <div className="min-h-0 overflow-y-auto bg-ground">
          <div className="mx-auto max-w-[900px] space-y-5 p-5">
            <div>
              <h1 className="text-[1.5rem] font-semibold tracking-tight text-ink">
                What do you need done?
              </h1>
              <p className="mt-1.5 max-w-[64ch] text-[0.9375rem] leading-relaxed text-ink-dim">
                Describe it in your own words and attach anything it needs to read. The
                workbench figures out which models to use, checks your procedures, and
                shows its working. Everything happens on this machine.
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
                  className="space-y-4 border-t border-seam pt-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ProfileStrip task={task} />
                    {running && (
                      <span className="flex items-center gap-1.5">
                        <Lamp signal="brass" pulse size={6} />
                        <span className="text-[0.75rem] text-brass">
                          {latestStage ?? "working"}
                        </span>
                      </span>
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

        {/* ------------------------------------------------- live trace */}
        <aside className="flex min-h-0 flex-col overflow-hidden border-l border-seam bg-panel">
          <header className="flex shrink-0 items-center justify-between border-b border-seam px-4 py-2.5">
            <div>
              <h2 className="text-[0.875rem] font-semibold text-ink">What it is doing</h2>
              <p className="text-[0.6875rem] text-ink-faint">
                every step, and why each model was chosen
              </p>
            </div>
            {running ? (
              <span className="flex items-center gap-1.5">
                <Lamp signal="brass" pulse size={6} />
                <span className="text-[0.6875rem] text-brass">working</span>
              </span>
            ) : (
              <span className="text-[0.6875rem] text-ink-faint">idle</span>
            )}
          </header>

          <div className="min-h-0 flex-1 overflow-hidden">
            <ProcessFlow task={task} events={events} running={running} />
          </div>
        </aside>
      </div>
    </Shell>
  );
}
