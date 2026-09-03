"use client";

/**
 * The console frame: wordmark, status bus, navigation rail and work surface.
 *
 * Everything inside a workbench screen is bolted into this frame. The status
 * bus is deliberately part of the chrome rather than a page: an operator must
 * never be looking at a screen that does not tell them whether the host is
 * still contained.
 */

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, getToken } from "@/lib/api";
import { useEventStream, useHealth, useSovereignty } from "@/lib/hooks";
import type { User } from "@/lib/types";
import { StatusBus } from "./StatusBus";
import { Lamp } from "./primitives";

interface NavItem {
  href: string;
  label: string;
  description: string;
  permission?: string;
}

const NAV: NavItem[] = [
  { href: "/", label: "Console", description: "Submit and watch work" },
  { href: "/registry", label: "Registry", description: "Files and knowledge base" },
  { href: "/tasks", label: "Tasks", description: "Everything this host has run" },
  {
    href: "/approvals",
    label: "Approvals",
    description: "Sign off held deliverables",
    permission: "approval.read",
  },
  { href: "/security", label: "Security", description: "Containment and policy" },
  { href: "/audit", label: "Audit", description: "The immutable record" },
];

/** A plant mimic glyph: three vessels on a header, the platform's mark. */
function Wordmark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className="shrink-0">
      <rect x="1.5" y="1.5" width="19" height="19" rx="2" stroke="#C9A227" strokeWidth="1.2" fill="none" />
      <path d="M4.5 15.5h13" stroke="#2FBF9E" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="5" y="6" width="3.5" height="6" rx="1.4" stroke="#D6E3E7" strokeWidth="1.1" fill="none" />
      <rect x="9.5" y="4.5" width="3.5" height="7.5" rx="1.4" stroke="#D6E3E7" strokeWidth="1.1" fill="none" />
      <rect x="14" y="7.5" width="3.5" height="4.5" rx="1.4" stroke="#D6E3E7" strokeWidth="1.1" fill="none" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  const health = useHealth();
  const { sovereignty: pushed, connected } = useEventStream();
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

  const visible = NAV.filter(
    (item) => !item.permission || user?.permissions.includes(item.permission),
  );

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-2.5 text-ink-dim">
          <Lamp signal="brass" pulse />
          <span className="text-sm">Establishing session</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* -------------------------------------------------- status bus */}
      <header className="flex shrink-0 items-stretch justify-between border-b border-seam bg-panel">
        <div className="flex items-center gap-2.5 px-4 py-2">
          <Wordmark />
          <div className="leading-tight">
            <div className="text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-ink">
              Sovereign Workbench
            </div>
            <div className="text-[0.625rem] tracking-[0.08em] text-ink-faint">
              on-premise · air-gapped
            </div>
          </div>
        </div>

        <div className="hidden flex-1 items-stretch justify-end lg:flex">
          <StatusBus health={health} sovereignty={sovereignty} />
        </div>

        <div className="flex items-center gap-3 border-l border-seam px-4">
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-[0.8125rem] text-ink">{user?.display_name}</div>
            <div className="text-[0.625rem] uppercase tracking-[0.1em] text-ink-faint">
              {user?.role} · {user?.department}
            </div>
          </div>
          <button
            onClick={async () => {
              await api.logout();
              router.replace("/sign-in");
            }}
            className="text-[0.75rem] text-ink-faint transition-colors hover:text-alarm"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ------------------------------------------------- nav rail */}
        <nav className="flex w-[168px] shrink-0 flex-col border-r border-seam bg-panel/60">
          <ul className="flex-1 py-2">
            {visible.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`relative block px-4 py-2.5 transition-colors ${
                      active ? "text-ink" : "text-ink-dim hover:text-ink"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="rail-marker"
                        transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
                        className="absolute inset-y-0 left-0 w-[2px] bg-brass"
                      />
                    )}
                    <span
                      className={`block text-[0.875rem] ${active ? "font-semibold" : "font-medium"}`}
                    >
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-[0.6875rem] leading-tight text-ink-faint">
                      {item.description}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-seam px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <Lamp signal={connected ? "live" : "hold"} pulse={connected} size={6} />
              <span className="text-[0.6875rem] text-ink-faint">
                {connected ? "live feed" : "reconnecting"}
              </span>
            </div>
          </div>
        </nav>

        {/* --------------------------------------------- work surface */}
        <main className="min-w-0 flex-1 overflow-hidden bg-ground">{children}</main>
      </div>

      {/* The bus matters more than the layout on a narrow screen, so it moves
          below the fold rather than disappearing. */}
      <div className="border-t border-seam bg-panel lg:hidden">
        <div className="overflow-x-auto">
          <StatusBus health={health} sovereignty={sovereignty} />
        </div>
      </div>
    </div>
  );
}
