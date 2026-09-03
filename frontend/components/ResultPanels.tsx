"use client";

/**
 * What the agent produced, and what backs it.
 *
 * The answer and its evidence sit on drafting vellum inside the dark console —
 * the material distinction between the instrument and the paper it prints.
 * Evidence is never summarised away: each item keeps its source, its location
 * in that source, and its classification, because that chain is the point.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { downloadProtected } from "@/lib/api";
import type {
  Deliverable,
  EvidenceItem,
  Task,
  VerificationReport,
} from "@/lib/types";
import {
  Button,
  Chip,
  EmptyState,
  Lamp,
  Panel,
  classificationSignal,
  formatBytes,
  formatDateTime,
} from "./primitives";

const KIND_LABEL: Record<EvidenceItem["kind"], string> = {
  knowledge_base: "Local SOP",
  uploaded_file: "Attachment",
  vision_extraction: "Read from scan",
  computation: "Recomputed",
};

/** Turn [S1] markers into visible citation chips within the answer text. */
function renderCited(text: string) {
  const parts = text.split(/(\[(?:S|F|V|C|X)\d+\])/g);
  return parts.map((part, index) => {
    if (/^\[(?:S|F|V|C|X)\d+\]$/.test(part)) {
      return (
        <sup
          key={index}
          className="mx-0.5 rounded-[2px] bg-vellum-ink/10 px-1 py-px font-mono text-[0.6875rem] font-semibold text-vellum-ink/80"
        >
          {part.slice(1, -1)}
        </sup>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function AnswerPanel({ task }: { task: Task }) {
  if (!task.answer) {
    return (
      <Panel title="Answer" className="min-h-[180px]">
        <EmptyState heading="No answer yet">
          The agent writes its analysis here once it has read its inputs and retrieved
          the governing procedure.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel
      title="Answer"
      action={
        task.verification && (
          <Chip signal={task.verification.valid ? "live" : "alarm"}>
            {task.verification.valid ? "verified" : "verification failed"}
          </Chip>
        )
      }
      bodyClassName="p-3"
    >
      <motion.article
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="vellum max-h-[420px] overflow-y-auto px-5 py-4"
      >
        <div className="max-w-[70ch] whitespace-pre-wrap text-[0.9375rem] leading-[1.65] text-vellum-ink">
          {renderCited(task.answer)}
        </div>
      </motion.article>
    </Panel>
  );
}

export function EvidencePanel({ evidence }: { evidence: EvidenceItem[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Panel
      title={`Evidence · ${evidence.length}`}
      action={
        evidence.length > 0 && (
          <span className="text-[0.6875rem] text-ink-faint">
            every claim traceable to a source
          </span>
        )
      }
      bodyClassName="p-3"
    >
      {evidence.length === 0 ? (
        <EmptyState heading="No evidence gathered yet">
          Retrieved passages, readings taken from a scan, and independently recomputed
          figures all appear here with their source.
        </EmptyState>
      ) : (
        <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {evidence.map((item) => {
            const expanded = open === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => setOpen(expanded ? null : item.id)}
                  className="w-full rounded-panel border border-seam bg-raised px-3 py-2 text-left transition-colors hover:border-brass/40"
                  aria-expanded={expanded}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="instrument text-[0.75rem] font-semibold text-brass">
                      {item.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">
                      {item.source_document}
                    </span>
                    <Chip signal={classificationSignal(item.classification)}>
                      {item.classification}
                    </Chip>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.6875rem] text-ink-faint">
                    <span>{KIND_LABEL[item.kind]}</span>
                    {item.location && <span>{item.location}</span>}
                    {item.version && <span>rev {item.version}</span>}
                    {item.score != null && (
                      <span className="instrument">match {(item.score * 100).toFixed(0)}%</span>
                    )}
                  </div>
                </button>

                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <blockquote className="vellum mt-1.5 px-4 py-3 text-[0.8125rem] leading-relaxed text-vellum-ink">
                        {item.excerpt}
                      </blockquote>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function VerificationPanel({ report }: { report: VerificationReport | null }) {
  if (!report) {
    return (
      <Panel title="Verification">
        <EmptyState heading="Not verified yet">
          Claims are checked against retrieved evidence, figures are recomputed
          independently in the sandbox, and generated code must have run cleanly.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel
      title="Verification"
      action={
        <span className="flex items-center gap-1.5">
          <Lamp signal={report.valid ? "live" : "alarm"} size={7} />
          <span
            className={`text-[0.6875rem] uppercase tracking-[0.1em] ${
              report.valid ? "text-live" : "text-alarm"
            }`}
          >
            {report.valid ? "passed" : "failed"}
          </span>
        </span>
      }
    >
      <div className="space-y-2.5">
        <p className="text-[0.8125rem] text-ink-dim">
          {report.material_claims_supported} of {report.material_claims_total} material
          claims are traceable to local evidence or independent computation.
        </p>

        <ul className="space-y-1.5">
          {report.checks.map((check) => (
            <li
              key={check.name}
              className="rounded-chip border border-seam bg-raised px-3 py-2"
            >
              <div className="flex items-baseline gap-2">
                <Lamp signal={check.passed ? "live" : "alarm"} size={6} />
                <span className="text-[0.8125rem] font-medium text-ink">
                  {check.name.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-1 pl-3.5 text-[0.75rem] leading-relaxed text-ink-dim">
                {check.detail}
              </p>
              {check.warnings.length > 0 && (
                <ul className="mt-1 space-y-0.5 pl-3.5">
                  {check.warnings.map((warning, index) => (
                    <li key={index} className="text-[0.75rem] text-hold">
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        {report.limitations.length > 0 && (
          <div className="rounded-chip border border-hold/40 bg-hold/[0.07] px-3 py-2">
            <div className="text-[0.6875rem] uppercase tracking-[0.1em] text-hold">
              Stated limitations
            </div>
            <ul className="mt-1 space-y-0.5">
              {report.limitations.map((limitation, index) => (
                <li key={index} className="text-[0.75rem] leading-relaxed text-ink-dim">
                  {limitation}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

export function DeliverablePanel({
  task,
  onApprove,
  canApprove,
}: {
  task: Task;
  onApprove?: (decision: "approve" | "reject", comment: string) => Promise<void>;
  canApprove: boolean;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const held = task.status === "awaiting_approval";

  const download = async (deliverable: Deliverable) => {
    setError(null);
    try {
      await downloadProtected(deliverable.download_url, deliverable.filename);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Download refused");
    }
  };

  const decide = async (decision: "approve" | "reject") => {
    if (!onApprove) return;
    setBusy(true);
    setError(null);
    try {
      await onApprove(decision, comment);
      setComment("");
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  };

  if (!task.deliverables.length && !task.approval?.required) return null;

  return (
    <Panel
      title="Deliverable"
      action={
        held && (
          <Chip signal="hold">
            <Lamp signal="hold" pulse size={6} />
            held for approval
          </Chip>
        )
      }
    >
      <div className="space-y-3">
        {task.deliverables.map((deliverable) => (
          <div
            key={deliverable.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-chip border border-seam bg-raised px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[0.875rem] font-medium text-ink">
                  {deliverable.filename}
                </span>
                <Chip signal={deliverable.released ? "live" : "hold"}>
                  {deliverable.released ? "released" : "held"}
                </Chip>
              </div>
              <div className="instrument mt-1 text-[0.6875rem] text-ink-faint">
                {formatBytes(deliverable.size_bytes)} · sha256 {deliverable.sha256.slice(0, 24)}…
              </div>
            </div>
            <Button
              variant={deliverable.released ? "primary" : "secondary"}
              onClick={() => void download(deliverable)}
            >
              Download
            </Button>
          </div>
        ))}

        {task.approval?.required && (
          <div className="rounded-chip border border-seam bg-ground/50 px-3 py-2.5">
            <div className="text-[0.6875rem] uppercase tracking-[0.1em] text-ink-faint">
              Approval required
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {task.approval.reasons.map((reason, index) => (
                <li key={index} className="text-[0.8125rem] leading-relaxed text-ink-dim">
                  {reason}
                </li>
              ))}
            </ul>

            {task.approval.decision && task.approval.decision !== "pending" ? (
              <p className="mt-2 text-[0.8125rem] text-ink">
                <span
                  className={
                    task.approval.decision === "approved" ? "text-live" : "text-alarm"
                  }
                >
                  {task.approval.decision === "approved" ? "Approved" : "Rejected"}
                </span>{" "}
                by {task.approval.reviewer_name} on{" "}
                {formatDateTime(task.approval.decided_at)}
                {task.approval.comment ? ` — “${task.approval.comment}”` : ""}
              </p>
            ) : (
              <p className="mt-2 text-[0.75rem] text-ink-faint">
                Awaiting: {task.approval.approver_roles.join(", ") || "an approving authority"}
              </p>
            )}

            {held && canApprove && onApprove && (
              <div className="mt-3 space-y-2 border-t border-seam pt-3">
                <label htmlFor="approval-comment" className="sr-only">
                  Decision comment
                </label>
                <input
                  id="approval-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Record the basis for your decision"
                  className="readout w-full px-3 py-2 text-[0.8125rem] text-ink outline-none focus:border-brass/60"
                />
                <div className="flex gap-2">
                  <Button onClick={() => void decide("approve")} disabled={busy}>
                    Approve and release
                  </Button>
                  <Button variant="danger" onClick={() => void decide("reject")} disabled={busy}>
                    Reject
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-chip border border-alarm/40 bg-alarm/10 px-3 py-2 text-[0.8125rem] text-alarm">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
