// The entire text of the public page. One file, so the voice can be reviewed
// in one sitting and so no string is invented inside a component.
//
// Rules this file is held to (docs/plan/21-LANDING-PAGE-SPEC.md §1.5):
//   1. Name the mechanism, never its virtue.
//   2. Every strong word takes a hedge. Never "immutable" -- a hash chain makes
//      an edit detectable, it does not make the file unwritable. The words are
//      "append-only" and "tamper-evident".
//   3. Numbers carry a unit, a scope and a source -- or they are deleted.
//   4. No adjective of praise about our own software.
//   5. State, then next action, no apology.
//   6. Sentence case, except labels over machine values.
//
// Rule 3 is enforced structurally now. No figure about the run is typed in
// this file: where a sentence carries one, it is a template here and the value
// is read from public/landing/run.json by the page, so the words can be
// reviewed here and the numbers can only come from the record.
//
// Machine excerpts below are quoted verbatim from files in this repository,
// and each carries the path it came from. None of them is illustrative.

export const REPO_URL =
  'https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench'

export const META = {
  title: 'AEGIS — an air-gapped AI workbench for regulated industrial work',
  description:
    'AEGIS runs on one machine. Every answer is cited to a page, checked against your policy, and recorded in an append-only, hash-chained log.',
} as const

// --------------------------------------------------------------------------- //
// Hero
// --------------------------------------------------------------------------- //

export const HERO = {
  // The claim, light, with its last word set heavy: what every answer here
  // can be, said once.
  eyebrow: 'Air-gapped AI workbench · regulated plants',
  title: 'Answers your plant can',
  titleKey: 'prove.',
  lede: 'AEGIS runs the model, the search and the checks on your own hardware, and hands over every answer with its sources, its checks and its record.',
  // The vessel is a drawing; the page says so where it is drawn.
  vesselNote: 'Illustration · label from the recorded run',
  primary: { label: 'Open the workbench', href: '/sign-in' },
  how: { label: 'How a run is proved', href: '#proof' },
} as const

/** The meta rail beside the hero: labels only; every value is the run's. */
export const RAIL = {
  label: 'Recorded run',
  run: 'Run',
  time: 'Answered in',
  model: 'Model',
  checks: 'Checks',
  chain: 'Sealed as',
  recorded: 'Recorded',
} as const

/** The band of four under the hero. */
export const STATS = {
  egress: {
    label: 'Egress',
    unit: (n: number) => (n === 1 ? 'connection' : 'connections'),
    live: (_since: string | null) => 'measured live on this machine',
    recorded: (_seq: number) => 'as this run recorded it',
    reading: 'measuring…',
  },
  cited: { label: 'Every answer', value: 'cited' },
  sealed: { label: 'Record', value: 'sealed' },
} as const

// --------------------------------------------------------------------------- //
// The crew: the pipeline's stages, named (the roster itself is lib/crew.ts)
// --------------------------------------------------------------------------- //

export const CREW_COPY = {
  id: 'crew',
  eyebrow: 'The crew',
  title: 'Ten steps.',
  titleKey: 'One answer.',
  lede: 'Every question takes the same path through your machine, one step after another. Each step has a name, one job, and the model it runs on, or none at all.',
  runsOn: 'Runs on',
  across: 'across the run',
  /** Said under every drawing, once, for the grid. */
  note: 'The drawings are illustrations. Their labels come from a real run.',
  relay: {
    label: 'One real question, step by step',
    legend: 'Lit: worked on it · Struck through: not needed, and why',
    unrecorded: 'not recorded',
    ran: 'ran',
    skipped: 'skipped',
  },
} as const

// --------------------------------------------------------------------------- //
// The proof sequence
// --------------------------------------------------------------------------- //

export const PROOF_SEQ = {
  id: 'proof',
  eyebrow: 'Proof',
  title: 'From the page',
  titleKey: 'to the seal.',
  lede: 'Follow one answer back to the paragraph it came from, and forward to the record that seals it.',
  steps: {
    document: { label: 'Document', title: 'The procedure it searched.' },
    excerpt: { label: 'Excerpt', title: 'The clause it found.' },
    claim: { label: 'Claim', title: 'The sentence, traced to it.' },
    checks: { label: 'Checks', title: 'Every check, before release.' },
    seal: { label: 'Seal', title: 'The record, sealed.' },
  },
  stamp: 'Sealed',
  held: 'Held · not sealed',
} as const

// --------------------------------------------------------------------------- //
// Hash-chain verify
// --------------------------------------------------------------------------- //

export const CHAIN_VERIFY = {
  label: 'Check it yourself',
  title: 'Recomputed in your browser.',
  line: 'Your browser re-hashes the run’s last records and checks that each one links to the one before it.',
  before: 'before',
  beforeLine: 'known by its hash',
  head: 'run head',
  idle: 'Checks itself when it comes on screen.',
  verified: 'All {n} records check out, and the chain ends at the run’s seal.',
  broken: 'The chain breaks at {at}.',
} as const

// --------------------------------------------------------------------------- //
// The tamper test, closing the proof
// --------------------------------------------------------------------------- //

export const TAMPER = {
  label: 'Tamper test',
  title: 'Try to rewrite the record.',
  line: 'Change one word in the record and watch the chain catch it.',
  // The edit offered: who did it. Offered only when the stored record says so.
  edit: { path: ['actor'], from: '"engineer"', to: '"reviewer"', label: 'Change who did it' },
  restore: 'Put it back',
  verified: 'All {n} records check out.',
  broken: 'Record {seq} no longer matches its seal, and record {next} still points at the original. The edit shows.',
  brokenLast: 'Record {seq} no longer matches its seal. The edit shows.',
  idle: 'Checks itself when it comes on screen.',
} as const

// --------------------------------------------------------------------------- //
// Run it
// --------------------------------------------------------------------------- //

export const RUN_IT = {
  id: 'run-it',
  eyebrow: 'Get started',
  title: 'Run it on your',
  titleEm: 'own hardware.',
  lede: 'Python 3.11+, Node 20+ and Ollama on one machine. No account, no key, and once the models are pulled, no network.',
  commands: [
    `git clone ${REPO_URL}`,
    'cd Sovereign-On_Premise-Agentic-AI-Workbench',
    'python3 -m venv .venv && source .venv/bin/activate',
    'pip install -r requirements.txt',
    'cd frontend && npm install && cd ..',
    'ollama pull qwen2.5:3b && ollama pull nomic-embed-text',
    'python scripts/seed_demo_data.py',
    './scripts/run.sh',
  ],
  next: [
    'Open http://127.0.0.1:3000 and sign in with one of the demo accounts.',
    'Ask a question, or type / to pick a skill.',
    'Sign in as the reviewer to release anything held.',
  ],
} as const

// --------------------------------------------------------------------------- //
// Header and footer
// --------------------------------------------------------------------------- //

/** The header's anchors, in page order. */
export const NAV = [
  { href: '#crew', label: 'The crew' },
  { href: '#proof', label: 'Proof' },
  { href: '#product', label: 'Workbench' },
  { href: '#run-it', label: 'Run it' },
] as const

/**
 * A file in the repository, on GitHub. Every path below was checked against
 * the branch it names with `git ls-tree`: `main` where the file is there, and
 * `redesign/hi-vis` only for a file that has not reached main yet.
 */
const onGitHub = (path: string, branch: 'main' | 'redesign/hi-vis' = 'main') => `${REPO_URL}/blob/${branch}/${path}`

export const FOOTER = {
  close: { title: 'Answers your plant can', titleKey: 'prove.' },
  blurb: 'An air-gapped AI workbench for regulated industrial work. Every answer cited, checked and recorded on the machine it ran on.',
  columns: [
    {
      heading: 'Product',
      links: [
        { label: 'The crew', href: '#crew' },
        { label: 'Proof', href: '#proof' },
        { label: 'The workbench', href: '#product' },
        { label: 'Sign in', href: '/sign-in' },
      ],
    },
    {
      heading: 'Run it',
      links: [
        { label: 'Get started', href: '#run-it' },
        { label: 'Hardware', href: `${onGitHub('docs/handbook/01-getting-started/02-requirements.md')}#hardware` },
        { label: 'Install on Windows', href: onGitHub('docs/handbook/01-getting-started/04-install-windows.md') },
        { label: 'Offline install', href: onGitHub('docs/handbook/01-getting-started/09-offline-install.md') },
        { label: 'Demo-day runbook', href: onGitHub('docs/handbook/14-demo-guide/03-demo-day.md', 'redesign/hi-vis') },
      ],
    },
    {
      heading: 'Trust',
      links: [
        { label: 'The audit log', href: onGitHub('docs/handbook/09-security/05-audit-log.md') },
        { label: 'Threat model', href: onGitHub('docs/handbook/09-security/06-threat-model.md') },
        { label: 'The sandbox', href: onGitHub('docs/handbook/09-security/03-sandbox.md') },
        // GitHub's anchor for "⚠️ Limitations" keeps the emoji's variation selector.
        { label: 'Known limits', href: `${REPO_URL}#%EF%B8%8F-limitations` },
        { label: 'Verification limits', href: onGitHub('docs/handbook/08-verification/05-limits.md') },
      ],
    },
    {
      heading: 'Project',
      links: [
        { label: 'GitHub', href: REPO_URL },
        { label: 'Handbook', href: onGitHub('docs/handbook/README.md') },
        { label: 'What it implements today', href: onGitHub('docs/IMPLEMENTED.md') },
        { label: 'Architecture', href: onGitHub('docs/handbook/04-architecture/README.md') },
      ],
    },
  ],
  copyright: '© 2026 AEGIS',
  // The page's CSP allows this origin only (next.config.mjs), so this is enforced, not promised.
  bottomRight: 'No analytics on this page',
  giant: 'AEGIS',
} as const
