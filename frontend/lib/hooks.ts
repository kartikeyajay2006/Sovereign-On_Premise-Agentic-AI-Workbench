"use client";

/**
 * Polling hooks.
 *
 * Live events arrive through the single shared stream in `lib/stream.tsx`.
 * These hooks poll the record itself, because a dropped stream must never
 * leave someone looking at a stale screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { SovereigntyStatus, SystemHealth, Task } from "./types";

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
