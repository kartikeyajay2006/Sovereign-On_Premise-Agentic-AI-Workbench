"use client";

/**
 * The console frame: wordmark, top navigation, live status bar, work surface.
 *
 * Navigation sits across the top so the work surface keeps its full width —
 * these screens show documents and traces side by side, and a rail stole room
 * from both. The status bar stays visible on every screen: an operator should
 * never be looking at a page that does not tell them whether the host is still
 * contained.
 */

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, getToken } from "@/lib/api";
import { useHealth, useSovereignty } from "@/lib/hooks";
import { StreamProvider, useStream } from "@/lib/stream";
import type { User } from "@/lib/types";
import { StatusBar } from "./StatusBar";
import { Lamp, Wordmark } from "./primitives";

interface NavItem {
  href: string;
  label: string;
  hint: string;
  permission?: string;
}

const NAV: NavItem[] = [
  { href: "/console", label: "Workspace", hint: "Ask for work and watch it happen" },
  { href: "/library", label: "Library", hint: "Your files and reference documents" },
  { href: "/history", label: "History", hint: "Everything this machine has done" },
  {
    href: "/approvals",
    label: "Approvals",
    hint: "Sign off documents before release",
    permission: "approval.read",
  },
  { href: "/security", label: "Security", hint: "Proof that nothing left this machine" },
  { href: "/record", label: "Record", hint: "The tamper-evident log" },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <StreamProvider>
      <ShellFrame>{children}</ShellFrame>
    </StreamProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const health = useHealth();
  const { sovereignty: pushed, connected } = useStream();
  const sovereignty = useSovereignty(pushed);

  useEffect(() => {
    let active = true;
    const resolve = async () => {
      if (!getToken()) {
        router.replace("/sign-in");
        return;
      }
      try {
        const me = await api.me();
        if (active) {
          setUser(me);
          setChecked(true);
        }
      } catch {
        router.replace("/sign-in");
      }
    };
    void resolve();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => setMenuOpen(false), [pathname]);

  const visible = NAV.filter(
    (item) => !item.permission || user?.permissions.includes(item.permission),
  );

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-2.5 text-ink-dim">
          <Lamp signal="brass" pulse />
          <span className="text-sm">Signing you in</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="shrink-0 border-b border-seam bg-panel">
        {/* ------------------------------------------ identity + navigation */}
        <div className="flex items-center gap-4 px-4 py-2.5">
          <Link href="/console" className="flex shrink-0 items-center gap-2.5">
            <Wordmark />
            <span className="hidden text-[0.9375rem] font-bold tracking-tight text-ink sm:block">
              Sovereign Workbench
            </span>
          </Link>

          <nav className="hidden flex-1 items-center gap-0.5 lg:flex">
            {visible.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.hint}
                  className={`relative rounded-chip px-3 py-1.5 text-[0.875rem] transition-colors ${
                    active ? "text-ink" : "text-ink-dim hover:text-ink"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-marker"
                      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
                      className="absolute inset-x-2 -bottom-[11px] h-[2px] bg-brass"
                    />
                  )}
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 md:flex" title="Live connection to this machine">
              <Lamp signal={connected ? "live" : "hold"} pulse={connected} size={6} />
              <span className="text-[0.6875rem] text-ink-faint">
                {connected ? "live" : "reconnecting"}
              </span>
            </span>

            <div className="hidden text-right leading-tight sm:block">
              <div className="text-[0.8125rem] text-ink">{user?.display_name}</div>
              <div className="text-[0.625rem] text-ink-faint">
                {user?.role} · {user?.department}
              </div>
            </div>

            <button
              onClick={async () => {
                await api.logout();
                router.replace("/");
              }}
              className="rounded-chip border border-seam px-2.5 py-1 text-[0.75rem] text-ink-dim transition-colors hover:border-alarm/50 hover:text-alarm"
            >
              Sign out
            </button>

            <button
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-chip border border-seam px-2.5 py-1 text-[0.75rem] text-ink-dim lg:hidden"
              aria-expanded={menuOpen}
              aria-label="Toggle navigation"
            >
              Menu
            </button>
          </div>
        </div>

        {/* Small screens: the same destinations, stacked. */}
        {menuOpen && (
          <nav className="grid gap-px border-t border-seam bg-seam lg:hidden">
            {visible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`bg-panel px-4 py-2.5 ${
                  pathname.startsWith(item.href) ? "text-brass" : "text-ink-dim"
                }`}
              >
                <span className="block text-[0.875rem]">{item.label}</span>
                <span className="block text-[0.6875rem] text-ink-faint">{item.hint}</span>
              </Link>
            ))}
          </nav>
        )}

        <StatusBar health={health} sovereignty={sovereignty} />
      </header>

      <main className="min-h-0 flex-1 overflow-hidden bg-ground">{children}</main>
    </div>
  );
}
