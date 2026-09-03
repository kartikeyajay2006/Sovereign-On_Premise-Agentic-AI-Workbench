"use client";

/**
 * The approval queue.
 *
 * A reviewer signs off on evidence, not on a summary. Each held task opens
 * with everything the decision rests on: what the agent concluded, what backs
 * each claim, which checks passed, and what will be released if approved.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { Task, User } from "@/lib/types";
import { Shell } from "@/components/Shell";
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
  classificationSignal,
  formatDateTime,
} from "@/components/primitives";

export default function ApprovalsPage() {
  const [queue, setQueue] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Approving is a granted permission, not a given. Someone who reaches this
  // page without it should be told why, not shown a failed request.
  const [entitled, setEntitled] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const pending = await api.pendingApprovals();
      setQueue(pending);
      setSelected((current) =>
        current && pending.some((task) => task.id === current)
          ? current
          : (pending[0]?.id ?? null),
      );
    } catch {
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((me) => {
        if (!active) return;
        setUser(me);
        const allowed = me.permissions.includes("approval.read");
        setEntitled(allowed);
        // Only ask for the queue when the role is actually entitled to it.
        if (allowed) void load();
        else setLoading(false);
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setEntitled(false);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    if (!entitled) return;
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [entitled, load]);

  const task = queue.find((item) => item.id === selected) ?? null;
  const canDecide = Boolean(user?.permissions.includes("approval.decide"));

  const decide = useCallback(
    async (decision: "approve" | "reject", comment: string) => {
      if (!task) return;
      await api.decide(task.id, decision, comment);
      await load();
    },
    [task, load],
  );

  if (entitled === false) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-[46ch] text-center">
            <h1 className="text-[1.25rem] font-semibold text-ink">
              Approving is not part of your role
            </h1>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-dim">
              Documents you produce are held here until someone with approving
              authority signs them off. Your role
              {user ? ` (${user.role})` : ""} can submit work and collect results.
              Approval rights are granted in local policy, in
              <span className="instrument"> policies/access-control.yaml</span>.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex h-full flex-col gap-px overflow-y-auto bg-seam lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden">
        <div className="max-h-[340px] shrink-0 overflow-y-auto bg-panel lg:max-h-none lg:min-h-0">
          <div className="border-b border-seam px-4 py-3">
            <h1 className="text-[0.9375rem] font-semibold text-ink">Awaiting your decision</h1>
            <p className="mt-0.5 text-[0.75rem] text-ink-faint">
              {queue.length} deliverable{queue.length === 1 ? "" : "s"} held from release
            </p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-ink-dim">
              <Lamp signal="brass" pulse />
              <span className="text-[0.8125rem]">Loading the queue</span>
            </div>
          ) : queue.length === 0 ? (
            <EmptyState heading="Nothing is waiting">
              Sensitive work and released deliverables pause here for sign-off. The queue
              is clear.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-seam">
              {queue.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setSelected(item.id)}
                    className={`relative w-full px-4 py-3 text-left transition-colors ${
                      selected === item.id ? "bg-raised" : "hover:bg-raised/50"
                    }`}
                  >
                    {selected === item.id && (
                      <motion.span
                        layoutId="approval-marker"
                        className="absolute inset-y-0 left-0 w-[2px] bg-hold"
                      />
                    )}
                    <div className="flex items-center gap-1.5">
                      <Lamp signal="hold" pulse size={6} />
                      <span className="text-[0.6875rem] uppercase tracking-[0.1em] text-hold">
                        held
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink">
                      {item.prompt}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {item.profile && (
                        <Chip signal={classificationSignal(item.profile.sensitivity)}>
                          {item.profile.sensitivity}
                        </Chip>
                      )}
                      {item.verification && (
                        <Chip signal={item.verification.valid ? "live" : "alarm"}>
                          {item.verification.valid ? "verified" : "checks failed"}
                        </Chip>
                      )}
                    </div>
                    <div className="mt-1 text-[0.625rem] text-ink-faint">
                      {item.user_display_name} · {formatDateTime(item.created_at)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-ground lg:min-h-0 lg:overflow-y-auto">
          {!task ? (
            <EmptyState heading="Select a held deliverable">
              You will see the full evidence chain before deciding.
            </EmptyState>
          ) : (
            <div className="space-y-4 p-5">
              <div>
                <h2 className="max-w-[75ch] text-[1.0625rem] leading-relaxed text-ink">
                  {task.prompt}
                </h2>
                <p className="mt-1 text-[0.75rem] text-ink-faint">
                  Submitted by {task.user_display_name} · {formatDateTime(task.created_at)}
                </p>
              </div>

              {!canDecide && (
                <p className="rounded-chip border border-hold/40 bg-hold/[0.07] px-3 py-2 text-[0.8125rem] text-hold">
                  Your role can read this queue but cannot decide. An approving authority
                  must sign this off.
                </p>
              )}

              <DeliverablePanel task={task} canApprove={canDecide} onApprove={decide} />
              <AnswerPanel task={task} />

              <div className="grid gap-4 lg:grid-cols-2">
                <EvidencePanel evidence={task.evidence} />
                <VerificationPanel report={task.verification} />
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
