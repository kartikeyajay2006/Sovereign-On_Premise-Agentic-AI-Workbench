"use client";

/**
 * Sign in, or create an account.
 *
 * Accounts live on this machine: passwords are salted and hashed locally and
 * roles come from policies/access-control.yaml. That is what lets the
 * workbench keep working with the network unplugged.
 *
 * Firebase sign-in is deliberately not offered. The workbench API issues its
 * own session tokens and does not accept a Google identity, so that route
 * would authenticate someone and still leave them without access — and it
 * would send identity traffic off a machine whose entire purpose is keeping
 * traffic on it. `lib/firebase.ts` remains in the repository, configured from
 * the environment and disabled by default, for a public demonstration build
 * that handles no confidential material.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { api, ApiError, getToken } from "@/lib/api";
import type { User } from "@/lib/types";
import { Button, Lamp, Wordmark } from "@/components/primitives";

type Mode = "sign-in" | "create";

const ROLE_SUMMARY: Record<string, string> = {
  operator: "Submits work and collects the results",
  engineer: "Adds reference documents, handles restricted engineering data",
  reviewer: "Approves documents before they are released",
  auditor: "Read-only oversight of the whole record",
  administrator: "Manages models, policy and the document library",
};

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [username, setUsername] = useState("engineer");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [directory, setDirectory] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace("/console");
    api
      .directory()
      .then(setDirectory)
      .catch(() => setDirectory([]));
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        await api.register(username.trim(), displayName.trim() || username.trim(), password);
      } else {
        await api.login(username.trim(), password);
      }
      router.replace("/console");
    } catch (exc) {
      setError(
        exc instanceof ApiError
          ? exc.message
          : "Something went wrong. Check that the workbench service is running.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-seam">
        <div className="mx-auto flex max-w-[1180px] items-center px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Wordmark />
            <span className="text-[0.9375rem] font-bold tracking-tight text-ink">
              Sovereign Workbench
            </span>
          </Link>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.7, 0.3, 1] }}
          className="w-full max-w-[900px]"
        >
          <div className="grid gap-px overflow-hidden rounded-panel border border-seam bg-seam md:grid-cols-[1.1fr_1fr]">
            {/* ------------------------------------ what you are signing into */}
            <div className="bg-panel p-8">
              <div className="flex items-center gap-2.5">
                <Lamp signal="live" pulse size={7} />
                <span className="instrument text-[0.75rem] text-live">
                  running on this machine
                </span>
              </div>

              <h1 className="mt-5 text-[1.75rem] font-bold leading-tight tracking-tight text-ink">
                Your account lives here,
                <br />
                not in the cloud.
              </h1>

              <p className="mt-4 max-w-[44ch] text-[0.9375rem] leading-relaxed text-ink-dim">
                Sign-in is handled by this machine. There is no external identity service
                to contact, which is why the workbench keeps working with the network
                unplugged.
              </p>

              {directory.length > 0 && (
                <div className="mt-7 border-t border-seam pt-5">
                  <p className="text-[0.8125rem] text-ink-dim">
                    Accounts already set up here. Each can do different things — pick one
                    to try it.
                  </p>
                  <ul className="mt-3 space-y-1">
                    {directory.map((entry) => (
                      <li key={entry.id}>
                        <button
                          onClick={() => {
                            setMode("sign-in");
                            setUsername(entry.username);
                          }}
                          className={`w-full rounded-chip px-2.5 py-1.5 text-left transition-colors ${
                            username === entry.username && mode === "sign-in"
                              ? "bg-raised"
                              : "hover:bg-raised/60"
                          }`}
                        >
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="instrument text-[0.8125rem] text-ink">
                              {entry.username}
                            </span>
                            <span className="text-[0.6875rem] text-ink-faint">
                              {entry.role}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[0.75rem] text-ink-faint">
                            {ROLE_SUMMARY[entry.role] ?? entry.display_name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[0.75rem] text-ink-faint">
                    The password for these demonstration accounts is{" "}
                    <span className="instrument text-ink-dim">workbench</span>.
                  </p>
                </div>
              )}
            </div>

            {/* ------------------------------------------------- credentials */}
            <div className="bg-raised p-8">
              <div className="flex gap-1 rounded-chip border border-seam p-1">
                {(["sign-in", "create"] as Mode[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setMode(option);
                      setError(null);
                    }}
                    className={`flex-1 rounded-[2px] px-3 py-1.5 text-[0.8125rem] transition-colors ${
                      mode === option
                        ? "bg-brass font-semibold text-ground"
                        : "text-ink-dim hover:text-ink"
                    }`}
                  >
                    {option === "sign-in" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              <form onSubmit={submit} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="username" className="mb-1.5 block text-[0.8125rem] text-ink-dim">
                    Username
                  </label>
                  <input
                    id="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    required
                    className="readout instrument w-full px-3 py-2 text-ink outline-none focus:border-brass/60"
                  />
                </div>

                {mode === "create" && (
                  <div>
                    <label
                      htmlFor="display-name"
                      className="mb-1.5 block text-[0.8125rem] text-ink-dim"
                    >
                      Your name
                    </label>
                    <input
                      id="display-name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="How your name appears on documents"
                      className="readout w-full px-3 py-2 text-[0.875rem] text-ink outline-none focus:border-brass/60"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-[0.8125rem] text-ink-dim">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === "create" ? "new-password" : "current-password"}
                    required
                    className="readout instrument w-full px-3 py-2 text-ink outline-none focus:border-brass/60"
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-chip border border-alarm/40 bg-alarm/10 px-3 py-2 text-[0.8125rem] leading-relaxed text-alarm"
                  >
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={busy || !password || !username} className="w-full">
                  {busy
                    ? mode === "create"
                      ? "Creating your account"
                      : "Signing in"
                    : mode === "create"
                      ? "Create account and continue"
                      : "Sign in"}
                </Button>
              </form>

              {mode === "create" && (
                <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-faint">
                  New accounts start with the lowest level of access: submit work, collect
                  your own results. Approving documents and managing the library are
                  granted separately, in local policy.
                </p>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-[0.8125rem] text-ink-faint">
            <Link href="/" className="transition-colors hover:text-ink-dim">
              What is this?
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
