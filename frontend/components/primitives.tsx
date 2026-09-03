"use client";

/**
 * Console primitives.
 *
 * Panels, readouts, lamps and chips — the vocabulary every screen is built
 * from. Keeping them here prevents each page from inventing its own idea of
 * what a panel looks like.
 */

import { ReactNode } from "react";

export type Signal = "live" | "hold" | "alarm" | "inert" | "brass";

const SIGNAL_TEXT: Record<Signal, string> = {
  live: "text-live",
  hold: "text-hold",
  alarm: "text-alarm",
  inert: "text-inert",
  brass: "text-brass",
};

const SIGNAL_BG: Record<Signal, string> = {
  live: "bg-live",
  hold: "bg-hold",
  alarm: "bg-alarm",
  inert: "bg-inert",
  brass: "bg-brass",
};

const SIGNAL_BORDER: Record<Signal, string> = {
  live: "border-live/40",
  hold: "border-hold/40",
  alarm: "border-alarm/40",
  inert: "border-inert/40",
  brass: "border-brass/40",
};

/** The platform mark: three vessels on a header — a plant mimic in miniature. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden className="shrink-0">
      <rect x="1.5" y="1.5" width="19" height="19" rx="2" stroke="#C9A227" strokeWidth="1.2" fill="none" />
      <path d="M4.5 15.5h13" stroke="#2FBF9E" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="5" y="6" width="3.5" height="6" rx="1.4" stroke="#D6E3E7" strokeWidth="1.1" fill="none" />
      <rect x="9.5" y="4.5" width="3.5" height="7.5" rx="1.4" stroke="#D6E3E7" strokeWidth="1.1" fill="none" />
      <rect x="14" y="7.5" width="3.5" height="4.5" rx="1.4" stroke="#D6E3E7" strokeWidth="1.1" fill="none" />
    </svg>
  );
}


export function Panel({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel flex min-h-0 flex-col ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-seam px-4 py-2.5">
          <div className="stamp">{title}</div>
          {action}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClassName || "p-4"}`}>{children}</div>
    </section>
  );
}

/** An indicator lamp. `pulse` marks a live, actively-changing reading. */
export function Lamp({
  signal,
  pulse = false,
  size = 8,
  title,
}: {
  signal: Signal;
  pulse?: boolean;
  size?: number;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{ width: size, height: size }}
      className={`inline-block shrink-0 rounded-full ${SIGNAL_BG[signal]} ${
        pulse ? "animate-breathe" : ""
      }`}
    />
  );
}

export function Chip({
  children,
  signal = "inert",
  className = "",
}: {
  children: ReactNode;
  signal?: Signal;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chip border px-2 py-0.5 text-micro ${SIGNAL_BORDER[signal]} ${SIGNAL_TEXT[signal]} bg-ground/40 ${className}`}
    >
      {children}
    </span>
  );
}

/** A labelled instrument reading in a recessed window. */
export function Readout({
  label,
  value,
  signal = "inert",
  hint,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  signal?: Signal;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="readout px-3 py-2" title={hint}>
      <div className="text-micro uppercase tracking-[0.12em] text-ink-faint">{label}</div>
      <div
        className={`instrument mt-1 ${SIGNAL_TEXT[signal]} ${
          emphasis ? "text-lg font-semibold" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "quiet";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-brass text-ground hover:bg-[#dbb42f] disabled:bg-brass-dim/40 disabled:text-ink-faint font-semibold",
    secondary:
      "border border-seam bg-raised text-ink hover:border-brass/50 hover:text-brass disabled:text-ink-faint",
    danger:
      "border border-alarm/50 bg-alarm/10 text-alarm hover:bg-alarm/20 disabled:opacity-40",
    quiet: "text-ink-dim hover:text-ink disabled:text-ink-faint",
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-chip px-3 py-1.5 text-[0.8125rem] transition-colors duration-150 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  heading,
  children,
}: {
  heading: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm text-ink-dim">{heading}</p>
      {children && <div className="max-w-sm text-[0.8125rem] text-ink-faint">{children}</div>}
    </div>
  );
}

export function SignalText({
  signal,
  children,
}: {
  signal: Signal;
  children: ReactNode;
}) {
  return <span className={SIGNAL_TEXT[signal]}>{children}</span>;
}

/** Classification levels carry their own colour throughout the console. */
export function classificationSignal(level: string | null | undefined): Signal {
  switch (level) {
    case "restricted":
      return "alarm";
    case "sensitive":
      return "hold";
    case "confidential":
      return "brass";
    default:
      return "live";
  }
}

export function statusSignal(status: string | null | undefined): Signal {
  switch (status) {
    case "delivered":
    case "approved":
      return "live";
    case "awaiting_approval":
      return "hold";
    case "failed":
    case "blocked":
    case "rejected":
      return "alarm";
    case "received":
    case "classified":
      return "inert";
    default:
      return "brass";
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
