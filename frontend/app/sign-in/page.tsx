"use client";

/**
 * Sign-in and local account registration.
 *
 * The panel states plainly what the operator is signing into: a host that
 * keeps their work inside the building. The seeded roles are listed because
 * on a demonstration host, knowing which authority you hold is part of
 * understanding the policy model.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { api, getToken } from "@/lib/api";
import type { User } from "@/lib/types";
import { Button, Lamp } from "@/components/primitives";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign_in" | "register">("sign_in");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [directory, setDirectory] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace("/");
    api
      .directory()
      .then(setDirectory)
      .catch(() => setDirectory([]));
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "register" && password !== confirmation) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await api.register(username.trim(), displayName.trim(), password);
      } else {
        await api.login(username.trim(), password);
      }
      router.replace("/");
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.7, 0.3, 1] }}
        className="w-full max-w-[880px]"
      >
        <div className="grid gap-px overflow-hidden rounded-panel border border-seam bg-seam md:grid-cols-[1.15fr_1fr]">
          {/* Statement of what this host is */}
          <div className="bg-panel p-8">
            <div className="flex items-center gap-2.5">
              <Lamp signal="live" pulse size={7} />
              <span className="instrument text-[0.75rem] text-live">
                egress 0 &middot; monitor running
              </span>
            </div>

            <h1 className="mt-5 text-[2rem] font-bold leading-[1.1] tracking-tight text-ink">
              Sovereign
              <br />
              Workbench
            </h1>

            <p className="mt-4 max-w-[42ch] text-[0.875rem] leading-relaxed text-ink-dim">
              Analysis, drawings, calculations and approval notes, produced by local
              models on this machine. Your documents are not sent anywhere, because
              this host has nowhere to send them.
            </p>

            <dl className="mt-7 space-y-2.5 border-t border-seam pt-5">
              {[
                ["Inference", "local models on this host"],
                ["Knowledge", "your own SOPs and manuals"],
                ["Code", "sandboxed, no network route"],
                ["Record", "hash-chained audit trail"],
              ].map(([term, definition]) => (
                <div key={term} className="flex gap-3 text-[0.8125rem]">
                  <dt className="w-[76px] shrink-0 text-ink-faint">{term}</dt>
                  <dd className="text-ink-dim">{definition}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Credentials */}
          <div className="bg-raised p-8">
            <form onSubmit={submit} className="space-y-4">
              <div className="flex rounded-chip border border-seam p-1 text-[0.75rem]">
                <button
                  type="button"
                  onClick={() => {
                    setMode("sign_in");
                    setError(null);
                  }}
                  className={`flex-1 rounded-chip px-2 py-1.5 transition-colors ${
                    mode === "sign_in" ? "bg-panel text-ink" : "text-ink-faint hover:text-ink-dim"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError(null);
                  }}
                  className={`flex-1 rounded-chip px-2 py-1.5 transition-colors ${
                    mode === "register" ? "bg-panel text-ink" : "text-ink-faint hover:text-ink-dim"
                  }`}
                >
                  Create account
                </button>
              </div>

              {mode === "register" && (
                <div>
                  <label
                    htmlFor="display-name"
                    className="mb-1.5 block text-[0.75rem] text-ink-dim"
                  >
                    Display name
                  </label>
                  <input
                    id="display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoComplete="name"
                    className="readout instrument w-full px-3 py-2 text-ink outline-none focus:border-brass/60"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="username"
                  className="mb-1.5 block text-[0.75rem] text-ink-dim"
                >
                  Username
                </label>
                <input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  className="readout instrument w-full px-3 py-2 text-ink outline-none focus:border-brass/60"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-[0.75rem] text-ink-dim"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  className="readout instrument w-full px-3 py-2 text-ink outline-none focus:border-brass/60"
                />
              </div>

              {mode === "register" && (
                <div>
                  <label
                    htmlFor="password-confirmation"
                    className="mb-1.5 block text-[0.75rem] text-ink-dim"
                  >
                    Confirm password
                  </label>
                  <input
                    id="password-confirmation"
                    type="password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="new-password"
                    className="readout instrument w-full px-3 py-2 text-ink outline-none focus:border-brass/60"
                  />
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-chip border border-alarm/40 bg-alarm/10 px-3 py-2 text-[0.8125rem] text-alarm"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={busy || !username.trim() || !password || (mode === "register" && !displayName.trim())}
                className="w-full"
              >
                {busy ? (mode === "register" ? "Creating account" : "Signing in") : mode === "register" ? "Create account" : "Sign in"}
              </Button>
            </form>

            {mode === "register" && (
              <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-faint">
                New accounts are created as Plant Operators. Reviewer and administrator access is assigned through local policy.
              </p>
            )}

            {directory.length > 0 && (
              <div className="mt-7 border-t border-seam pt-5">
                <p className="text-[0.75rem] text-ink-faint">
                  Roles provisioned on this host. Each holds a different authority.
                </p>
                <ul className="mt-2.5 space-y-1">
                  {directory.map((entry) => (
                    <li key={entry.id}>
                      <button
                        onClick={() => setUsername(entry.username)}
                        className="flex w-full items-baseline justify-between gap-3 rounded-chip px-2 py-1 text-left transition-colors hover:bg-panel"
                      >
                        <span className="instrument text-[0.75rem] text-ink-dim">
                          {entry.username}
                        </span>
                        <span className="truncate text-[0.75rem] text-ink-faint">
                          {entry.display_name}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
