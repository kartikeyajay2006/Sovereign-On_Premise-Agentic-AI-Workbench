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

import type { Stage } from './stage-table'

export const REPO_URL =
  'https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench'
export const REPO_PATH = 'github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench'

export const META = {
  title: 'AEGIS — an air-gapped AI workbench for regulated industrial work',
  description:
    'AEGIS runs on one machine. Every answer is cited to a page, checked against your policy, and recorded in an append-only, hash-chained log.',
} as const

/**
 * A sentence with machine values in it. A plain string is prose; `{ v }` is a
 * value -- an id, a clause, a hash -- and is set in mono by whatever renders it.
 */
export type Rich = ReadonlyArray<string | { v: string }>


// --------------------------------------------------------------------------- //
// Hero
// --------------------------------------------------------------------------- //

export const HERO = {
  // Two lines, because the argument is a turn. The claim in sans, the
  // qualification in serif italic — the typography performs the sentence.
  headline: 'Local is not enough.',
  headlineTurn: 'So prove the rest.',
  // The hero's overline and the quiet line under its buttons: statements of
  // mechanism, each one something the page below demonstrates.
  // The pill above the headline, and the note under the replay.
  // Points at the gallery's Skills screen: what is new, said as what it does.
  announce: { tag: 'New', text: 'Skills: save an instruction, call it with /', href: '#product' },
  replayNote:
    'A recorded run, replayed. Every value comes from its record; only the pacing is compressed, and each step shows the time it really took on a two-core laptop CPU.',
  sub: 'An air-gapped AI workbench for regulated industrial work. Every answer is cited to a page, checked against your policy, and recorded.',
  // Properties of the design, each enforced in code rather than promised:
  // the inference client refuses a non-local endpoint, the verifier runs on
  // every answer, and the audit log is a hash chain.
  proof: ['No cloud model calls', 'Every answer cited and checked', 'Every step hash-chained'],
  primary: { label: 'Open the workbench', href: '/sign-in' },
  secondary: { label: 'Read the source', href: REPO_URL },
  repoPath: REPO_PATH,
} as const

const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
/** 2 -> "two", 12 -> "12". Words below ten, figures above, as prose sets them. */
const count = (n: number) => COUNT[n] ?? String(n)

// --------------------------------------------------------------------------- //
// 02 — The premise
// --------------------------------------------------------------------------- //

export const PREMISE = {
  id: 'premise',
  index: '02',
  eyebrow: 'The problem',
  title: 'Running the model locally',
  titleTurn: 'answers one question.',
  // `open` is how many of the five the run's record cannot yet settle,
  // counted by the page from the record.
  lede: (open: number) =>
    `Self-hosting solves privacy. It is silent on everything a regulated organisation is actually asked afterwards. Below, each of those questions is answered from the record of the run above${
      open === 0 ? '.' : ` — including the ${count(open)} it cannot answer yet.`
    }`,
  solved: {
    label: 'Solved by running it yourself',
    body: 'The prompt never leaves the building.',
    note: 'Measured rather than asserted: section 05 reads, live, how many unapproved connections the monitor has observed from this workbench’s processes.',
  },
  ledger: {
    label: 'Still open',
    run: (run: string) => `answered from ${run}`,
    model: {
      question: 'Which model answered, and was it permitted to?',
      answer: (model: string, calls: number, reason: string): Rich => [
        { v: model },
        calls === 1
          ? `, on its one model call. It was allowed before it ran: “${reason}”.`
          : `, on all ${count(calls)} of its model calls. Each was allowed before it ran: “${reason}”.`,
      ],
      // When not every call was allowed, the ledger says so and quotes nothing.
      mixed: (refused: number, calls: number): Rich => [
        `${count(refused)} of ${count(calls)} model calls were refused by policy.`,
      ],
      none: 'No model call was recorded for this run.',
      source: (rule: string) => `policy_events · ${rule}`,
    },
    read: {
      question: 'What did it read, and on which page?',
      answer: (passages: number, mode: string, clauses: string[]): Rich =>
        clauses.length === 0
          ? [`${passages} passages, by ${mode} search. The answer cites none of them.`]
          : [
              `${passages} passages, by ${mode} search. The answer cites ${count(clauses.length)}: `,
              ...clauses.flatMap((clause, i) => [
                ...(i === 0 ? [] : [i === clauses.length - 1 ? ' and ' : ', ']),
                { v: clause },
              ]),
              '.',
            ],
      none: 'Nothing was retrieved for this run.',
      source: 'evidence',
    },
    arithmetic: {
      question: 'Is the arithmetic right, or was it predicted?',
      // The detail is the verifier's own sentence, verbatim.
      failed: (detail: string): Rich => ['Not established. ', detail],
      passed: (detail: string): Rich => ['Recomputed. ', detail],
      none: 'No calculation check was recorded for this run.',
      source: 'verification · calculation_verification',
    },
    authorised: {
      question: 'Who authorised the result before it was acted on?',
      held: 'Held',
      // Printed after a HELD label, so it does not say "held" again.
      pending: (rule: string, reason: string, roles: string): Rich => [
        'No one yet, under ',
        { v: rule },
        `: “${reason}” It waits on the ${roles} role.`,
      ],
      decided: (who: string, when: string): Rich => [`Released by ${who}, `, { v: when }, '.'],
      refused: (when: string): Rich => ['A reviewer refused release, ', { v: when }, '.'],
      none: 'No approval was required for this run.',
      source: 'approval',
    },
    regulator: {
      question: 'What can you hand a regulator in six months?',
      answer: (count: number, first: number, last: number, hash: string): Rich => [
        `${count} records in the hash-chained audit log, `,
        { v: `seq ${first}` },
        ' to ',
        { v: `seq ${last}` },
        '. The last is stored with the hash ',
        { v: hash },
        '.',
      ],
      none: 'No audit record was found for this run.',
      source: 'storage/logs/audit.jsonl',
    },
  },
  closing:
    'Nothing the model reads ever leaves the machine it runs on — and the workbench counts the attempts.',
} as const

// --------------------------------------------------------------------------- //
// 03 — The chain
// --------------------------------------------------------------------------- //

export const CHAIN = {
  id: 'chain',
  eyebrow: 'How it works',
  title: 'Cited. Checked. Recorded.',
  titleTurn: 'Before anything leaves.',
  lede: 'Every answer goes through three steps, and each leaves something you can open. These are from the run above.',
} as const

// --------------------------------------------------------------------------- //
// 04 — One run, end to end
// --------------------------------------------------------------------------- //

export const RUN = {
  id: 'run',
  index: '04',
  eyebrow: 'The run',
  title: 'One run,',
  titleTurn: 'end to end.',
  lede: (ran: number, idle: number) =>
    `Seven stages. Each declares the capability it needs, is routed to a model policy permits and the host can actually hold in memory, and leaves something behind. The last column is the run above, read from its audit records: ${count(ran)} ${ran === 1 ? 'stage' : 'stages'} ran${
      idle > 0 ? `, and ${count(idle)} had nothing to do` : ''
    }.`,
  timelineLabel: 'Where its time went',
  runColumn: 'This run',
  notRun: 'not run',
  notMeasured: 'not measured',
  between: 'Between stages',
  stages: [
    {
      index: '01',
      id: 'classify',
      name: 'Classify',
      action: 'Type, complexity and sensitivity are determined from config/classification.yaml',
      leaves: 'task.classified',
    },
    {
      index: '02',
      id: 'plan',
      name: 'Plan',
      action: 'Steps are decomposed before any of them execute',
      leaves: 'task.planned',
    },
    {
      index: '03',
      id: 'read',
      name: 'Read',
      action: 'A PDF with no text layer is rasterised and read by the vision model',
      leaves: 'extraction + page refs',
    },
    {
      index: '04',
      id: 'retrieve',
      name: 'Retrieve',
      action: 'The local corpus is searched; passages keep their provenance',
      leaves: '[S1] [S2] …',
    },
    {
      index: '05',
      id: 'sandbox',
      name: 'Sandbox',
      action: 'Generated Python runs under AST validation and resource limits',
      leaves: 'script, stdout, rusage',
    },
    {
      index: '06',
      id: 'draft',
      name: 'Draft',
      action: 'The answer is composed against the retrieved evidence only',
      leaves: 'draft + citations',
    },
    {
      index: '07',
      id: 'verify',
      name: 'Verify',
      action: 'Claims are traced, figures recomputed, checks scored',
      leaves: 'verification report',
    },
  ] satisfies Stage[],
  closing:
    'The task then stops. A deliverable is held until a role holding approval.decide signs it, and the role that ran the task is not that role.',
} as const

// --------------------------------------------------------------------------- //
// 05 — Check it yourself
// --------------------------------------------------------------------------- //

export const PROOF = {
  id: 'proof',
  eyebrow: 'Security',
  title: 'Don’t take our word for it.',
  titleTurn: 'Check it yourself.',
  lede: 'No certifications and no benchmark yet. What AEGIS has is evidence, and every piece of it can be checked without asking us.',

  cards: {
    chain: {
      title: 'An audit chain your browser re-hashes',
      line: 'Every record hashes the one before it. Open the evidence and your browser recomputes the run’s last records itself.',
    },
    sandbox: {
      fallbackTitle: 'Code runs in a sandbox',
      line: 'Fixed attacks — network, filesystem, process escape, runaway memory and CPU — submitted to this host’s sandbox.',
      caption: 'The last self-test this host recorded, read from its audit log: each payload and what the sandbox did with it.',
    },
    egress: {
      title: 'Egress, read live',
      line: 'What the monitor sees on this workbench’s own processes, read by your browser right now.',
    },
    page: {
      title: 'This page fetches nothing external',
      line: 'Served under a policy that allows this origin only: no CDN, no analytics, no third-party script. Check the network tab.',
    },
  },

  chain: {
    // The edit the reader can make: a failed verification, made to pass.
    edit: { path: ['detail', 'valid'], value: 'true' },
    labels: {
      heading: 'Audit chain',
      source: 'storage/logs/audit.jsonl',
      idle: 'Not recomputed yet. It runs when this card is on screen.',
      verified:
        'Recomputed in this browser: all {records} records hash to the value stored with them, and each prev matches the hash above it.',
      broken: 'The chain breaks at seq {seq}: that record no longer hashes to the value stored with it.',
      brokenNext: ' Seq {next} still points at the old value.',
      recomputed: 'here',
      stored: 'stored',
      matches: 'matches',
      differs: 'does not match',
      link: 'prev = hash of seq {seq}',
      linkBroken: 'prev ≠ hash of seq {seq}',
      storedLine: 'Line as stored',
      tamper: 'Make the failed verification pass',
      restore: 'Put the record back',
    },
  },

  policy: {
    label: 'The policy that refuses',
    source: 'policies/tool-permissions.yaml',
    lines: [
      'python_exec:',
      '  description: Execute generated Python inside the secure sandbox.',
      '  allowed_roles: [operator, engineer, reviewer, administrator]',
      '  max_data_classification: restricted',
      '  side_effects: execute',
      '  requires_approval: false',
      '  constraints:',
      '    sandbox_required: true',
      '    network_allowed: false',
    ],
  },

  sandbox: {
    label: 'Sandbox self-test',
  },

  page: {
    label: 'This page',
    source: 'response header',
    // The production header, verbatim from next.config.mjs.
    lines: [
      "Content-Security-Policy: default-src 'self';",
      "  img-src 'self' data:; font-src 'self';",
      "  script-src 'self' 'unsafe-inline';",
      "  style-src 'self' 'unsafe-inline'; connect-src 'self';",
      "  frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    ],
  },
} as const

// --------------------------------------------------------------------------- //
// 06 — What this is not
// --------------------------------------------------------------------------- //

export const LIMITS = {
  id: 'limits',
  eyebrow: 'Limits',
  title: 'What this is not.',
  titleTurn: 'Stated plainly.',
  lede: 'These decide whether AEGIS is right for a deployment. The README has every item in full.',
  brief: [
    {
      id: 'sandbox',
      title: 'Not VM isolation',
      line: 'Code runs in a limited subprocess, not a VM or container. Hostile input needs an OS boundary around it too.',
    },
    {
      id: 'words',
      title: 'Checks match words, not meaning',
      line: 'A sentence can cite the right table and read the wrong row. That is why a person reviews what is held.',
    },
    {
      id: 'chain',
      title: 'Tamper-evident, not tamper-proof',
      line: 'The audit chain shows an edit. An operator with write access can still rewrite the whole log.',
    },
    {
      id: 'latency',
      title: 'Latency is hardware-bound',
      line: 'On a CPU-only host a question takes tens of seconds. A GPU changes this.',
    },
    {
      id: 'policy',
      title: 'Policies are a default',
      line: 'The shipped roles, classifications and approval rules are sensible defaults, not your organisation’s.',
    },
    {
      id: 'benchmark',
      title: 'No certifications or benchmark yet',
      line: 'Accuracy claims wait for an evaluation set. The audit chain supports an assurance process; it is not one.',
    },
  ],
  // The run's own time, when the page has it.
  latencyLine: (total: string) =>
    `The run above took ${total} on a two-core laptop CPU with no GPU. A GPU changes this.`,
  readme: {
    label: 'Every limit, in full, in the README',
    href: `${REPO_URL}#limits`,
  },
} as const

// --------------------------------------------------------------------------- //
// 07 — Run it
// --------------------------------------------------------------------------- //

export const RUN_IT = {
  id: 'run-it',
  eyebrow: 'Get started',
  title: 'Run it on your own hardware.',
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
    'Ask a question, or type / for a skill. Watch each step as it runs.',
    'Sign in as the reviewer to release what was held.',
  ],
} as const

// --------------------------------------------------------------------------- //
// Footer
// --------------------------------------------------------------------------- //

export const FOOTER = {
  cta: {
    eyebrow: 'On your own hardware',
    title: 'Local is not enough.',
    turn: 'So prove the rest.',
    lede: 'Put a workbench on your own hardware whose every answer shows its sources, its checks and its record.',
  },
  blurb: 'An air-gapped AI workbench for regulated industrial work.',
  // A property of the design, not a reading: the inference client refuses an
  // endpoint that is not on this host.
  status: 'Models, retrieval and audit on your own hardware',
  columns: [
    {
      heading: 'Product',
      links: [
        { label: 'Sign in', href: '/sign-in' },
        { label: 'Open a citation', href: '#answer' },
        { label: 'How a run is proved', href: '#chain' },
        { label: 'What this is not', href: '#limits' },
      ],
    },
    {
      heading: 'Source',
      links: [
        { label: 'Repository', href: REPO_URL },
        { label: 'Architecture notes', href: `${REPO_URL}/tree/main/docs` },
      ],
    },
  ],
  build: {
    heading: 'Build',
    lines: ['api 127.0.0.1:8000', 'inference 127.0.0.1:11434'],
  },
  bottomLeft: 'Smart India Hackathon 2026',
  bottomRight: 'No analytics on this page.',
} as const
