"use client";

/**
 * Live state hooks.
 *
 * `useEventStream` subscribes to the authenticated API Server-Sent Event
 * stream so the console reflects agent progress as it happens rather than by polling. Polling
 * remains as a fallback for the task record itself, because a dropped stream
 * must never leave the operator looking at a stale screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { SovereigntyStatus, StreamEvent, SystemHealth, Task } from "./types";

const RECONNECT_MS = 3000;

export function useEventStream(taskId?: string) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [sovereignty, setSovereignty] = useState<SovereigntyStatus | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      const url = taskId ? `/api/events?task_id=${encodeURIComponent(taskId)}` : "/api/events";
      source = new EventSource(url);

      source.onopen = () => setConnected(true);

      source.onerror = () => {
        setConnected(false);
        source?.close();
        if (!closed) retry = setTimeout(connect, RECONNECT_MS);
      };

      const handle = (raw: MessageEvent) => {
        try {
          const parsed = JSON.parse(raw.data) as StreamEvent;
          if (parsed.event === "sovereignty.status") {
            setSovereignty(parsed.data as unknown as SovereigntyStatus);
            return;
          }
          setEvents((previous) => [...previous.slice(-400), parsed]);
        } catch {
          /* malformed frame; skip it rather than break the stream */
        }
      };

      // The API names each event, so listeners are registered per type.
      for (const name of [
        "task.created",
        "task.stage",
        "task.planned",
        "task.model_selected",
        "task.model_completed",
        "task.model_swapped",
        "task.tool_started",
        "task.tool_completed",
        "task.extraction",
        "task.evidence",
        "task.code_generated",
        "task.sandbox_result",
        "task.answer",
        "task.draft",
        "task.verified",
        "task.deliverable",
        "task.approval_decided",
        "task.finished",
        "task.failed",
        "task.blocked",
        "sovereignty.status",
        "sovereignty.error",
      ]) {
        source.addEventListener(name, handle as EventListener);
      }
      source.onmessage = handle;
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [taskId]);

  const clear = useCallback(() => setEvents([]), []);
  return { events, connected, sovereignty, clear };
}

/** Poll a task record until it reaches a terminal state. */
export function useTask(taskId: string | null, intervalMs = 2500) {
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!taskId) return;
    try {
      setTask(await api.getTask(taskId));
      setError(null);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not load the task");
    }
  }, [taskId]);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }
    void refresh();
    timer.current = setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [taskId, intervalMs, refresh]);

  useEffect(() => {
    const terminal = ["delivered", "rejected", "failed", "blocked"];
    if (task && terminal.includes(task.status) && timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, [task]);

  return { task, error, refresh };
}

/** System health, refreshed on an interval for the status bus. */
export function useHealth(intervalMs = 15000) {
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await api.health();
        if (active) setHealth(result);
      } catch {
        if (active) setHealth(null);
      }
    };
    void load();
    const timer = setInterval(load, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return health;
}

/** Sovereignty status: pushed over SSE, with a polled fallback. */
export function useSovereignty(pushed: SovereigntyStatus | null, intervalMs = 6000) {
  const [polled, setPolled] = useState<SovereigntyStatus | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await api.sovereignty();
        if (active) setPolled(result);
      } catch {
        /* leave the last good reading in place */
      }
    };
    void load();
    const timer = setInterval(load, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return pushed ?? polled;
}
