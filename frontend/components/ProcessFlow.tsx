"use client";

/**
 * The agent's execution drawn as a process line.
 *
 * Industrial users read P&IDs, not vertical steppers, so the pipeline is
 * drawn the way plant flow is drawn: stages threaded along a line, with fluid
 * visibly travelling between them while work is in progress. The line is the
 * only ambient motion in the console — when it moves, the agent is working.
 *
 * Each stage carries what actually happened: which model was selected and on
 * what grounds, which tools ran, what came back.
 */

import { AnimatePresence, motion } from "framer-motion";
import { Chip, Lamp, Signal, formatDuration } from "./primitives";
import type { StreamEvent, Task } from "@/lib/types";

type StageState = "pending" | "running" | "waiting" | "done" | "failed" | "skipped";

interface Stage {
  key: string;
  label: string;
  detail: string;
  state: StageState;
  model?: string | null;
  reason?: string;
  meta?: string[];
}

const STATE_SIGNAL: Record<StageState, Signal> = {
  pending: "inert",
  running: "brass",
  waiting: "hold",
  done: "live",
  failed: "alarm",
  skipped: "inert",
};

/** What each state is called on screen, in words rather than jargon. */
const STATE_LABEL: Partial<Record<StageState, string>> = {
  running: "working",
  waiting: "waiting for you",
  failed: "failed",
  skipped: "not needed",
};

/** Derive the stage list from the task record, enriched by live events. */
function buildStages(task: Task | null, events: StreamEvent[]): Stage[] {
  if (!task) return [];
  const profile = task.profile;
  const stages: Stage[] = [];

  const reached = (statuses: string[]) => {
    const order = [
      "received",
      "classified",
      "planned",
      "retrieving",
      "executing",
      "verifying",
      "awaiting_approval",
      "approved",
      "delivered",
      "rejected",
    ];
    const current = order.indexOf(task.status);
    return statuses.some((status) => order.indexOf(status) <= current && current >= 0);
  };

  const failed = task.status === "failed" || task.status === "blocked";

  // Once the run has moved past execution, nothing is still "working". A stage
  // that produced no result by then was skipped, not left running — showing it
  // as in-progress on a finished task is simply wrong.
  const stillRunning = [
    "received",
    "classified",
    "planned",
    "retrieving",
    "executing",
    "verifying",
  ].includes(task.status);

  /** Resolve a stage that has no output yet, honouring the run's real state. */
  const pendingState = (started: boolean): StageState => {
    if (failed) return "skipped";
    if (!stillRunning) return "skipped";
    return started ? "running" : "pending";
  };

  // Classify
  stages.push({
    key: "classify",
    label: "Classify",
    detail: profile
      ? `${profile.task_type.replace(/_/g, " ")} · ${profile.complexity.replace(/_/g, " ")}`
      : "analysing the request",
    state: profile ? "done" : "running",
    meta: profile
      ? [
          `input: ${profile.input_type.replace(/_/g, " ")}`,
          `classification: ${profile.sensitivity}`,
          `confidence: ${(profile.confidence * 100).toFixed(0)}%`,
        ]
      : undefined,
  });

  // Plan
  stages.push({
    key: "plan",
    label: "Plan",
    detail: task.plan
      ? `${task.plan.steps.length} step${task.plan.steps.length === 1 ? "" : "s"}`
      : "producing an execution plan",
    state: task.plan ? "done" : pendingState(reached(["planned"])),
    model: task.routing.find((decision) => decision.requested_role === "reasoning")
      ?.selected_display_name,
    meta: task.plan?.steps.map((step) => `${step.id}. ${step.objective}`).slice(0, 6),
  });

  // Vision extraction — only when the profile called for it.
  if (profile?.requires_vision) {
    const vision = task.routing.find((decision) => decision.requested_role === "vision");
    const extraction = events.find((event) => event.event === "task.extraction");
    stages.push({
      key: "vision",
      label: "Read",
      detail: extraction?.data?.document_type
        ? String(extraction.data.document_type)
        : "vision extraction from the scan",
      state: task.evidence.some((item) => item.kind === "vision_extraction")
        ? "done"
        : pendingState(reached(["executing"])),
      model: vision?.selected_display_name,
      reason: vision?.reason,
      meta: Array.isArray(extraction?.data?.findings)
        ? (extraction!.data.findings as Array<Record<string, unknown>>)
            .slice(0, 4)
            .map((finding) => String(finding.description ?? ""))
        : undefined,
    });
  }

  // Retrieval
  if (profile?.requires_retrieval) {
    const retrieved = task.evidence.filter((item) => item.kind === "knowledge_base");
    stages.push({
      key: "retrieve",
      label: "Retrieve",
      detail: retrieved.length
        ? `${retrieved.length} passage${retrieved.length === 1 ? "" : "s"} from local SOPs`
        : "searching the local knowledge base",
      state: retrieved.length ? "done" : pendingState(reached(["retrieving"])),
      meta: retrieved
        .slice(0, 4)
        .map((item) => `[${item.id}] ${item.source_document}${item.location ? ` — ${item.location}` : ""}`),
    });
  }

  // Sandbox execution. Several attempts may exist if the first code did not
  // run; the last one is what counts, and the count is worth showing.
  const sandboxCalls = task.tool_calls.filter((call) => call.tool === "python_exec");
  const sandboxCall = sandboxCalls[sandboxCalls.length - 1];
  if (profile?.requires_code_execution || sandboxCall) {
    stages.push({
      key: "execute",
      label: "Execute",
      detail: sandboxCall
        ? sandboxCall.output_summary
        : "generating and running code in the sandbox",
      state: sandboxCall
        ? sandboxCall.ok
          ? "done"
          : "failed"
        : pendingState(reached(["executing"])),
      model: task.routing.find((decision) => decision.requested_role === "coding")
        ?.selected_display_name,
      meta: sandboxCall
        ? [
            sandboxCalls.length > 1
              ? `corrected itself after ${sandboxCalls.length - 1} failed attempt${
                  sandboxCalls.length > 2 ? "s" : ""
                }`
              : "",
            `exit code: ${String(sandboxCall.output.exit_code ?? "—")}`,
            `duration: ${formatDuration(sandboxCall.duration_ms)}`,
          ].filter(Boolean)
        : undefined,
    });
  }

  // Verification
  stages.push({
    key: "verify",
    label: "Verify",
    detail: task.verification
      ? task.verification.valid
        ? "all checks passed"
        : `${task.verification.checks.filter((check) => !check.passed).length} check(s) failed`
      : "checking evidence and recomputing figures",
    state: task.verification
      ? task.verification.valid
        ? "done"
        : "failed"
      : pendingState(reached(["verifying"])),
    meta: task.verification?.checks.map(
      (check) => `${check.passed ? "pass" : "FAIL"} — ${check.name.replace(/_/g, " ")}`,
    ),
  });

  // Approval
  if (task.approval?.required) {
    stages.push({
      key: "approve",
      label: "Approve",
      detail:
        task.approval.decision === "approved"
          ? `signed by ${task.approval.reviewer_name ?? "reviewer"}`
          : task.approval.decision === "rejected"
            ? `rejected by ${task.approval.reviewer_name ?? "reviewer"}`
            : "held for an approving authority",
      state:
        task.approval.decision === "approved"
          ? "done"
          : task.approval.decision === "rejected"
            ? "failed"
            : task.status === "awaiting_approval"
              ? "waiting"
              : "pending",
      meta: task.approval.reasons.slice(0, 3),
    });
  }

  // Deliver
  if (profile?.produces_deliverable) {
    stages.push({
      key: "deliver",
      label: "Deliver",
      detail: task.deliverables.length
        ? task.deliverables.map((item) => item.filename).join(", ")
        : `${(profile.deliverable_format ?? "docx").toUpperCase()} deliverable`,
      state: task.deliverables.some((item) => item.released)
        ? "done"
        : task.deliverables.length
          ? "waiting"
          : pendingState(false),
      meta: task.deliverables.map(
        (item) => `${item.released ? "released" : "held"} · sha256 ${item.sha256.slice(0, 16)}…`,
      ),
    });
  }

  return stages;
}

function StageNode({ stage, index }: { stage: Stage; index: number }) {
  const signal = STATE_SIGNAL[stage.state];
  const active = stage.state === "running";
  const label = STATE_LABEL[stage.state];

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.3 }}
      className="relative pl-9"
    >
      {/* The process line and its equipment symbol. */}
      <span
        aria-hidden
        className={`absolute left-[11px] top-6 h-[calc(100%-8px)] w-px ${
          stage.state === "done" ? "bg-live/35" : "bg-seam"
        }`}
      />
      <span
        aria-hidden
        className={`absolute left-[3px] top-1.5 flex h-[17px] w-[17px] items-center justify-center rounded-full border ${
          active
            ? "border-brass bg-brass/15 shadow-lamp"
            : stage.state === "done"
              ? "border-live/60 bg-live/10"
              : stage.state === "failed"
                ? "border-alarm/60 bg-alarm/10"
                : stage.state === "waiting"
                  ? "border-hold/60 bg-hold/10"
                  : "border-seam bg-panel"
        }`}
      >
        <Lamp signal={signal} pulse={active} size={6} />
      </span>

      <div className="pb-5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h4
            className={`text-[0.9375rem] font-semibold ${
              stage.state === "pending" ? "text-ink-faint" : "text-ink"
            }`}
          >
            {stage.label}
          </h4>
          {stage.model && (
            <span className="instrument text-[0.75rem] text-brass" title={stage.reason}>
              {stage.model}
            </span>
          )}
          {label && (
            <span
              className={`text-[0.6875rem] ${
                stage.state === "running"
                  ? "text-brass"
                  : stage.state === "waiting"
                    ? "text-hold"
                    : stage.state === "failed"
                      ? "text-alarm"
                      : "text-ink-faint"
              }`}
            >
              {label}
            </span>
          )}
        </div>

        <p
          className={`mt-0.5 text-[0.8125rem] ${
            stage.state === "pending" ? "text-ink-faint" : "text-ink-dim"
          }`}
        >
          {stage.detail}
        </p>

        {stage.meta && stage.meta.length > 0 && (
          <ul className="mt-2 space-y-1">
            {stage.meta.filter(Boolean).map((line, position) => (
              <li key={position} className="instrument text-[0.75rem] text-ink-faint">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.li>
  );
}

export function ProcessFlow({
  task,
  events,
  running,
}: {
  task: Task | null;
  events: StreamEvent[];
  running: boolean;
}) {
  const stages = buildStages(task, events);

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-10 text-center">
        <p className="max-w-xs text-[0.8125rem] text-ink-faint">
          The execution trace appears here: which model was chosen for each stage and why,
          every tool call, and the verification result.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Live flow indicator: fluid moves only while the agent is working. */}
      <div
        aria-hidden
        className={`h-[3px] w-full ${
          running ? "flowline animate-flow" : "flowline-idle opacity-50"
        }`}
      />

      <ol className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
        <AnimatePresence initial={false}>
          {stages.map((stage, index) => (
            <StageNode key={stage.key} stage={stage} index={index} />
          ))}
        </AnimatePresence>

        {task.error && (
          <li className="mb-3 ml-9 rounded-chip border border-alarm/40 bg-alarm/10 px-3 py-2">
            <div className="text-[0.6875rem] uppercase tracking-[0.12em] text-alarm">
              Run stopped
            </div>
            <p className="mt-1 text-[0.8125rem] text-ink-dim">{task.error}</p>
          </li>
        )}
      </ol>

      {task.duration_ms != null && (
        <footer className="flex items-center justify-between border-t border-seam px-4 py-2">
          <Chip signal={task.status === "failed" ? "alarm" : "inert"}>
            {task.status.replace(/_/g, " ")}
          </Chip>
          <span className="instrument text-[0.75rem] text-ink-faint">
            {formatDuration(task.duration_ms)}
          </span>
        </footer>
      )}
    </div>
  );
}
