"use client";

/**
 * Sign-in / Account Creation Page powered by Firebase Authentication.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { api, getToken } from "@/lib/api";
import { Button, Lamp } from "@/components/primitives";
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "@/lib/firebase";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (getToken()) router.replace("/");
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        await signOut(auth).catch(() => {});
        setSuccessMsg("Account created successfully! Please sign in with your credentials.");
        setMode("signin");
        setPassword("");
        setBusy(false);
        return;
      }

      await signInWithEmailAndPassword(auth, email.trim(), password);
      // Map to local engineer session for sovereign backend operations
      await api.login("engineer", "workbench").catch(() => {});
      router.replace("/");
    } catch (exc: unknown) {
      let msg = "Authentication failed";
      if (exc instanceof Error) {
        msg = exc.message;
        if (msg.includes("auth/email-already-in-use")) {
          msg = "An account with this email already exists. Please sign in.";
        } else if (msg.includes("auth/invalid-credential") || msg.includes("auth/wrong-password")) {
          msg = "Invalid email or password.";
        } else if (msg.includes("auth/weak-password")) {
          msg = "Password should be at least 6 characters.";
        }
      }
      setError(msg);
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      // Map to local engineer session for sovereign backend operations
      await api.login("engineer", "workbench").catch(() => {});
      router.replace("/");
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Google authentication failed");
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

          {/* Credentials Form */}
          <div className="bg-raised p-8 flex flex-col justify-center">
            {/* Mode Switcher: Sign In vs Create Account */}
            <div className="mb-6 flex rounded-chip border border-seam bg-panel p-0.5 text-[0.75rem]">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                className={`flex-1 rounded-chip py-1.5 font-medium transition-colors ${
                  mode === "signin"
                    ? "bg-raised text-ink shadow-sm"
                    : "text-ink-faint hover:text-ink-dim"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className={`flex-1 rounded-chip py-1.5 font-medium transition-colors ${
                  mode === "signup"
                    ? "bg-raised text-ink shadow-sm"
                    : "text-ink-faint hover:text-ink-dim"
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-[0.75rem] text-ink-dim"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="user@example.com"
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
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  className="readout instrument w-full px-3 py-2 text-ink outline-none focus:border-brass/60"
                />
              </div>

              {successMsg && (
                <p
                  role="status"
                  className="rounded-chip border border-live/40 bg-live/10 px-3 py-2 text-[0.8125rem] text-live"
                >
                  {successMsg}
                </p>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-chip border border-alarm/40 bg-alarm/10 px-3 py-2 text-[0.8125rem] text-alarm"
                >
                  {error}
                </p>
              )}

              <Button type="submit" disabled={busy || !email || !password} className="w-full">
                {busy
                  ? mode === "signup"
                    ? "Creating Account..."
                    : "Signing In..."
                  : mode === "signup"
                  ? "Create Account"
                  : "Sign In"}
              </Button>
            </form>

            <div className="mt-5">
              <div className="relative mb-4 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-seam" />
                </div>
                <span className="relative bg-raised px-2 text-[0.75rem] text-ink-faint">
                  or continue with
                </span>
              </div>
              <Button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={busy}
                variant="secondary"
                className="w-full flex items-center justify-center gap-2"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                {mode === "signup" ? "Sign Up with Google" : "Sign In with Google"}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
