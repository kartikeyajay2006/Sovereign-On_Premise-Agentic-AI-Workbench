"use client";

/**
 * One live connection for the whole application.
 *
 * Every screen wants live updates, but a browser allows only about six
 * connections per origin and a Server-Sent Events stream holds one open
 * indefinitely. Opening a stream per screen — the console opened two — starved
 * ordinary requests within a few navigations: the app appeared to hang, and
 * the connection indicator sat on "reconnecting".
 *
 * So the stream is opened once, here, and fanned out through context.
 * Components subscribe to what they need and the socket count stays at one.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SovereigntyStatus, StreamEvent } from "./types";

const EVENT_NAMES = [
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
] as const;

const RECONNECT_MS = 3000;
const MAX_BUFFERED = 400;

interface StreamState {
  events: StreamEvent[];
  connected: boolean;
  sovereignty: SovereigntyStatus | null;
}

const StreamContext = createContext<StreamState>({
  events: [],
  connected: false,
  sovereignty: null,
});

export function StreamProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [sovereignty, setSovereignty] = useState<SovereigntyStatus | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const handle = (raw: MessageEvent) => {
      try {
        const parsed = JSON.parse(raw.data) as StreamEvent;
        if (parsed.event === "sovereignty.status") {
          setSovereignty(parsed.data as unknown as SovereigntyStatus);
          return;
        }
        setEvents((previous) => {
          const next = [...previous, parsed];
          return next.length > MAX_BUFFERED ? next.slice(-MAX_BUFFERED) : next;
        });
      } catch {
        /* a malformed frame is skipped rather than breaking the stream */
      }
    };

    const connect = () => {
      if (disposed) return;
      const source = new EventSource("/api/events");
      sourceRef.current = source;

      source.onopen = () => setConnected(true);
      source.onerror = () => {
        setConnected(false);
        source.close();
        if (!disposed) retry = setTimeout(connect, RECONNECT_MS);
      };
      for (const name of EVENT_NAMES) {
        source.addEventListener(name, handle as EventListener);
      }
      source.onmessage = handle;
    };

    connect();

    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, []);

  const value = useMemo(
    () => ({ events, connected, sovereignty }),
    [events, connected, sovereignty],
  );

  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>;
}

/** Live events, optionally narrowed to one task. */
export function useStream(taskId?: string) {
  const state = useContext(StreamContext);

  const events = useMemo(() => {
    if (!taskId) return state.events;
    return state.events.filter((event) => !event.task_id || event.task_id === taskId);
  }, [state.events, taskId]);

  return { events, connected: state.connected, sovereignty: state.sovereignty };
}

