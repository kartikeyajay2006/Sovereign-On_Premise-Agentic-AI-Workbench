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

/** Past this with no progress, a task is treated as abandoned, not busy. */
const STALE_AFTER_MS = 15 * 60 * 1000;

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
  const [dismissed, setDismissed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const { task, refresh } = useTask(taskId);
  const { events } = useStream(taskId ?? undefined);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  // Reopen recent work after a refresh, but only if it is genuinely live.
  //
  // Reopening the newest task unconditionally meant a run interrupted hours
  // earlier came back looking active, and the composer stayed disabled behind
  // it — the application appeared stuck with no way forward.
  useEffect(() => {
    if (taskId || dismissed) return;
    api
      .listTasks(5)
      .then((summaries) => {
        const recent = summaries.find((summary) => {
          const age = Date.now() - new Date(summary.updated_at).getTime();
          const live = RUNNING.includes(summary.status);
          return (live && age < STALE_AFTER_MS) || summary.status === "awaiting_approval";
        });
        if (recent) setTaskId(recent.id);
      })
      .catch(() => undefined);
  }, [taskId, dismissed]);

  // A task that has not advanced in a long time is not treated as busy, so the
  // composer is never permanently disabled by something that already died.
  const stale = Boolean(
    task && Date.now() - new Date(task.updated_at).getTime() > STALE_AFTER_MS,
  );
  const running = Boolean(task && RUNNING.includes(task.status) && !stale);

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
      {/* Wide screens put the work and its trace side by side, each scrolling
          on its own. Narrow screens stack them into one scrolling column —
          two full-height panes in a fixed-height grid simply overlap. */}
      <div className="flex h-full flex-col gap-px overflow-y-auto bg-seam xl:grid xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.85fr)] xl:overflow-hidden">
        {/* ------------------------------------------- request and result */}
        <div className="bg-ground xl:min-h-0 xl:overflow-y-auto">
          <div className="mx-auto max-w-[900px] space-y-5 p-5">
            <div className="flex items-start justify-between gap-4">
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

              {task && (
                <button
                  onClick={() => {
                    setTaskId(null);
                    setDismissed(true);
                  }}
                  className="shrink-0 rounded-chip border border-seam px-3 py-1.5 text-[0.8125rem] text-ink-dim transition-colors hover:border-brass/50 hover:text-brass"
                >
                  Start something new
                </button>
              )}
            </div>

            <Composer
              onSubmitted={(id) => {
                setDismissed(false);
                setTaskId(id);
              }}
              busy={running}
            />

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
                  {stale && RUNNING.includes(task.status) && (
                    <div className="flex items-start gap-2 rounded-chip border border-hold/40 bg-hold/10 px-3 py-2">
                      <Lamp signal="hold" size={6} />
                      <span className="text-[0.8125rem] text-hold">
                        This run stopped making progress and was left unfinished — most
                        likely the workbench restarted while it was working. Submit it
                        again to run it from the start.
                      </span>
                    </div>
                  )}

                  {task.queue_ahead > 0 && (
                    <div className="flex items-center gap-2 rounded-chip border border-hold/40 bg-hold/10 px-3 py-2">
                      <Lamp signal="hold" pulse size={6} />
                      <span className="text-[0.8125rem] text-hold">
                        Waiting its turn — {task.queue_ahead} other{" "}
                        {task.queue_ahead === 1 ? "task is" : "tasks are"} ahead of it.
                        One task runs at a time so each gets the full machine.
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ProfileStrip task={task} />
                    {running && (
                      <span className="flex items-center gap-1.5">
                        <Lamp signal="brass" pulse size={6} />
                        <span className="text-[0.75rem] text-brass">
                          {task.queue_ahead > 0
                            ? `waiting behind ${task.queue_ahead}`
                            : (latestStage ?? "working")}
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
        <aside className="flex h-[520px] shrink-0 flex-col overflow-hidden border-seam bg-panel xl:h-auto xl:min-h-0 xl:border-l">
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
