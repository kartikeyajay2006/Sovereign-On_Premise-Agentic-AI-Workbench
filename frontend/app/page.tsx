"use client";

/**
 * The front door.
 *
 * Written for someone who has never seen this before: what problem it solves,
 * how it works, what it hands back, and how the central promise is proved
 * rather than asserted. The 3D scene carries the argument visually — work
 * circulating inside a closed boundary, outbound attempts turned back.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ContainmentScene } from "@/components/three/ContainmentScene";
import { Wordmark } from "@/components/primitives";
import { getToken } from "@/lib/api";

const STEPS = [
  {
    title: "You ask, and attach whatever it needs",
    body: "A scanned inspection report, a drawing, a spreadsheet, or nothing at all. Plain language: “read this report and draft an approval note against our SOP.”",
  },
  {
    title: "It picks the right model for each part",
    body: "Reading a scan needs a vision model. Reasoning about it needs a different one. The workbench chooses per step and tells you why it chose each.",
  },
  {
    title: "It grounds the answer in your own documents",
    body: "Your SOPs and manuals are searched locally. Every factual claim is linked back to the document and section it came from.",
  },
  {
    title: "It checks its own work, then asks a human",
    body: "Figures are recalculated independently. Code is run in a locked sandbox. Anything sensitive waits for an approver before release.",
  },
];

const OUTPUTS = [
  { format: "Word", detail: "Approval notes and reports, with citations and a provenance block" },
  { format: "Excel", detail: "Analysis workbooks with the evidence sheet attached" },
  { format: "PowerPoint", detail: "Board packs built from verified findings" },
  { format: "Code", detail: "Scripts that have actually been run and checked" },
];

const PROOFS = [
  {
    heading: "Nothing leaves the machine",
    body: "A monitor samples every network connection this platform's processes make and counts anything heading outside. The count is on screen at all times. It is a measurement, not a promise.",
  },
  {
    heading: "Code runs in a locked box",
    body: "Generated code is inspected before it runs and confined while it runs — no network route, limited memory and time. You can trigger the break-in test yourself from the Security page.",
  },
  {
    heading: "The log cannot be edited quietly",
    body: "Every classification, model choice, tool call and approval is recorded and cryptographically chained to the previous entry. Alter one line and the chain reports exactly where.",
  },
];

export default function LandingPage() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => setSignedIn(Boolean(getToken())), []);

  return (
    <div className="min-h-screen">
      {/* ------------------------------------------------------------ nav */}
      <header className="sticky top-0 z-20 border-b border-seam bg-panel/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Wordmark />
            <span className="text-[0.9375rem] font-bold tracking-tight text-ink">
              Sovereign Workbench
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-1">
            <a
              href="#how"
              className="hidden rounded-chip px-3 py-1.5 text-[0.875rem] text-ink-dim transition-colors hover:text-ink sm:block"
            >
              How it works
            </a>
            <a
              href="#proof"
              className="hidden rounded-chip px-3 py-1.5 text-[0.875rem] text-ink-dim transition-colors hover:text-ink sm:block"
            >
              The proof
            </a>
            <Link
              href={signedIn ? "/console" : "/sign-in"}
              className="rounded-chip bg-brass px-3.5 py-1.5 text-[0.875rem] font-semibold text-ground transition-colors hover:bg-[#dbb42f]"
            >
              {signedIn ? "Open workspace" : "Sign in"}
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b border-seam">
        <div className="mx-auto grid max-w-[1180px] items-center gap-8 px-5 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.2, 0.7, 0.3, 1] }}
          >
            <p className="instrument text-[0.8125rem] text-live">
              runs entirely on your own machine
            </p>

            <h1 className="mt-4 text-[2.5rem] font-bold leading-[1.06] tracking-tight text-ink sm:text-[3.25rem]">
              An AI assistant for work
              <br />
              that cannot leave the building.
            </h1>

            <p className="mt-5 max-w-[54ch] text-[1.0625rem] leading-relaxed text-ink-dim">
              Refineries, defence manufacturers and government offices produce approval
              notes, engineering calculations and drawing reviews every day. That material
              cannot be pasted into a cloud AI tool. This workbench does the same work on
              a machine you control, and proves nothing left it.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={signedIn ? "/console" : "/sign-in"}
                className="rounded-chip bg-brass px-5 py-2.5 text-[0.9375rem] font-semibold text-ground transition-colors hover:bg-[#dbb42f]"
              >
                {signedIn ? "Open the workspace" : "Try the workbench"}
              </Link>
              <a
                href="#how"
                className="rounded-chip border border-seam px-5 py-2.5 text-[0.9375rem] text-ink transition-colors hover:border-brass/50 hover:text-brass"
              >
                See how it works
              </a>
            </div>

            <dl className="mt-9 grid max-w-[520px] grid-cols-3 gap-px overflow-hidden rounded-panel border border-seam bg-seam">
              {[
                ["Cloud services used", "none"],
                ["Data sent outside", "none"],
                ["Every claim", "cited"],
              ].map(([term, value]) => (
                <div key={term} className="bg-panel px-3.5 py-3">
                  <dt className="text-[0.625rem] text-ink-faint">{term}</dt>
                  <dd className="instrument mt-0.5 text-[0.9375rem] text-live">{value}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.2, 0.7, 0.3, 1] }}
            className="relative"
          >
            <ContainmentScene className="h-[340px] w-full sm:h-[420px] lg:h-[480px]" />
            <p className="mt-1 text-center text-[0.75rem] text-ink-faint">
              Your documents, the models and the tools all sit inside one boundary.
              Anything heading outward is turned back at it.
            </p>
          </motion.div>
        </div>
      </section>

      {/* --------------------------------------------------- the problem */}
      <section className="border-b border-seam bg-panel/40">
        <div className="mx-auto max-w-[1180px] px-5 py-14">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <h2 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
              Today the choice is a bad one:
              <br />
              do it by hand, or paste it somewhere it should not go.
            </h2>
            <div className="space-y-4 text-[1rem] leading-relaxed text-ink-dim">
              <p>
                Piping diagrams, vendor negotiations, unreleased designs, inspection
                findings — company policy keeps all of it on site. So the productivity
                that everyone else gets from AI assistants simply is not available, and
                the work goes on being done manually.
              </p>
              <p>
                Or worse: someone quietly pastes a confidential drawing into a public tool
                because the deadline is real and the policy feels abstract.
              </p>
              <p className="text-ink">
                Open-weight models are now good enough that neither compromise is
                necessary. This is that assistant, built to run where the data already
                lives.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section id="how" className="border-b border-seam">
        <div className="mx-auto max-w-[1180px] px-5 py-14">
          <h2 className="text-[1.75rem] font-semibold tracking-tight text-ink">
            How a request is handled
          </h2>
          <p className="mt-2 max-w-[62ch] text-[1rem] leading-relaxed text-ink-dim">
            The workbench does not answer in one shot. It plans, gathers what it needs,
            does the work, then tries to prove itself wrong before showing you anything.
          </p>

          <ol className="mt-8 grid gap-px overflow-hidden rounded-panel border border-seam bg-seam md:grid-cols-2">
            {STEPS.map((step, index) => (
              <li key={step.title} className="bg-panel p-6">
                <div className="flex items-baseline gap-3">
                  <span className="instrument text-[0.875rem] text-brass">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-[1.0625rem] font-semibold text-ink">{step.title}</h3>
                </div>
                <p className="mt-2 pl-9 text-[0.9375rem] leading-relaxed text-ink-dim">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* -------------------------------------------------------- outputs */}
      <section className="border-b border-seam bg-panel/40">
        <div className="mx-auto max-w-[1180px] px-5 py-14">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <h2 className="text-[1.75rem] font-semibold tracking-tight text-ink">
                You get a filed document, not a chat reply
              </h2>
              <p className="mt-3 max-w-[46ch] text-[1rem] leading-relaxed text-ink-dim">
                Each one carries its sources, the calculations behind it, which models
                produced it, what was checked, and who approved it.
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-panel border border-seam bg-seam sm:grid-cols-2">
              {OUTPUTS.map((output) => (
                <div key={output.format} className="bg-panel p-5">
                  <div className="text-[1rem] font-semibold text-brass">{output.format}</div>
                  <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-dim">
                    {output.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- proof */}
      <section id="proof" className="border-b border-seam">
        <div className="mx-auto max-w-[1180px] px-5 py-14">
          <h2 className="text-[1.75rem] font-semibold tracking-tight text-ink">
            Why you can believe the claim
          </h2>
          <p className="mt-2 max-w-[62ch] text-[1rem] leading-relaxed text-ink-dim">
            “It all stays local” is easy to say. Each of these is something you can watch
            happening, or test yourself, from inside the application.
          </p>

          <div className="mt-8 grid gap-px overflow-hidden rounded-panel border border-seam bg-seam md:grid-cols-3">
            {PROOFS.map((proof) => (
              <div key={proof.heading} className="bg-panel p-6">
                <h3 className="text-[1.0625rem] font-semibold text-ink">{proof.heading}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-dim">
                  {proof.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ cta */}
      <section className="border-b border-seam">
        <div className="mx-auto max-w-[1180px] px-5 py-16 text-center">
          <h2 className="text-[2rem] font-semibold tracking-tight text-ink">
            Try it on a real inspection report
          </h2>
          <p className="mx-auto mt-3 max-w-[52ch] text-[1rem] leading-relaxed text-ink-dim">
            A sample scanned report and two procedures are already loaded, so you can run
            the full workflow — read, retrieve, calculate, verify, approve — without
            preparing anything.
          </p>
          <Link
            href={signedIn ? "/console" : "/sign-in"}
            className="mt-7 inline-block rounded-chip bg-brass px-6 py-3 text-[0.9375rem] font-semibold text-ground transition-colors hover:bg-[#dbb42f]"
          >
            {signedIn ? "Open the workspace" : "Sign in and start"}
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-5 py-8">
        <div className="flex items-center gap-2.5">
          <Wordmark size={18} />
          <span className="text-[0.8125rem] text-ink-dim">
            Sovereign On-Premise Agentic AI Workbench
          </span>
        </div>
        <span className="text-[0.75rem] text-ink-faint">
          Local models · local documents · local tools · no external calls
        </span>
      </footer>
    </div>
  );
}
