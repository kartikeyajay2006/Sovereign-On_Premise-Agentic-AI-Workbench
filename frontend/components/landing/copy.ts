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
// Machine excerpts below are quoted verbatim from files and endpoints in this
// repository, and each carries the path or endpoint it came from. None of them
// is illustrative.

import type { Limit } from './limit-list'
import type { Stage } from './stage-table'

export const REPO_URL =
  'https://github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench'
export const REPO_PATH = 'github.com/kartikeyajay2006/Sovereign-On_Premise-Agentic-AI-Workbench'

export const META = {
  title: 'AEGIS — an air-gapped AI workbench for regulated industrial work',
  description:
    'AEGIS runs on one machine. Every answer is cited to a page, checked against your policy, and recorded in an append-only, hash-chained log.',
} as const

// --------------------------------------------------------------------------- //
// 01 — Hero
// --------------------------------------------------------------------------- //

export const HERO = {
  headline: 'Local is not enough.',
  sub: 'An air-gapped AI workbench for regulated industrial work. Every answer is cited to a page, checked against your policy, and recorded.',
  primary: { label: 'Open the workbench', href: '/sign-in' },
  secondary: { label: 'Read the source', href: REPO_URL },
  repoPath: REPO_PATH,
  receiptCaption:
    'Every value on this card was exported from one real run by scripts/capture_landing_fixture.py and is served from public/landing/run.json. Nothing here is typed by hand, including the row that says the sandbox was never entered and the row that says the result is still held. If that file is missing, the card does not render.',
} as const

// --------------------------------------------------------------------------- //
// 02 — The premise
// --------------------------------------------------------------------------- //

export const PREMISE = {
  id: 'premise',
  index: '01',
  eyebrow: 'The problem',
  title: 'Running the model locally answers one question.',
  lede: 'Self-hosting solves privacy. It is silent on everything a regulated organisation is actually asked afterwards.',
  solved: {
    label: 'Solved by running it yourself',
    body: 'The prompt never leaves the building.',
  },
  open: {
    label: 'Still open',
    items: [
      'Which model answered, and was it permitted to?',
      'What did it read, and on which page?',
      'Is the arithmetic right, or was it predicted?',
      'Who authorised the result before it was acted on?',
      'What can you hand a regulator in six months?',
    ],
  },
  closing:
    'Nothing the model reads ever leaves the machine it runs on — and the workbench counts the attempts.',
} as const

// --------------------------------------------------------------------------- //
// 03 — The chain
// --------------------------------------------------------------------------- //

export const CHAIN = {
  id: 'chain',
  index: '02',
  eyebrow: 'The chain',
  title: 'Cited. Checked. Recorded.',
  lede: 'Three things happen to every answer before it is allowed to become an action. Each one leaves an artifact you can open.',
  cards: [
    {
      index: '01',
      verb: 'Cited',
      mechanism: 'Page-level provenance',
      body: 'Retrieval returns evidence units that keep their document, section and location. A cited claim points at the span it came from, not at a filename. A scanned report with no text layer is rasterised and read by a local vision model, and the location survives that too.',
      artifact: {
        label: 'Evidence unit',
        // Verbatim from GET /api/tasks/e8f1e597… — the run captured in the hero
        // receipt. Excerpt truncated to the width of the block.
        source: 'GET /api/tasks/{id}',
        lines: [
          'id            S1',
          'document      SOP-MNT-022 — Management of Corrosion',
          '              Under Insulation (CUI)',
          'document_id   28da3745c2247e054e03ac03',
          'location      section: 4. Assessment',
          'excerpt       "4.1 Where cladding damage exceeds 20% of',
          '               the surface area of an insulated section,',
          '               that section shall be classified as a',
          '               Medium severity finding under SOP-INS-014',
          '               Clause 5."',
        ],
      },
    },
    {
      index: '02',
      verb: 'Checked',
      mechanism: 'Default-deny policy, recomputed figures',
      body: 'Tool calls are refused unless a rule in policies/ permits that role, that data classification and that side effect. Every figure that reaches a document is meant to be executed as Python in a sandbox rather than predicted, then recomputed by the verifier — and when the sandbox will not run, the check fails rather than passing quietly.',
      artifact: {
        label: 'Verification report',
        source: 'GET /api/tasks/{id}',
        lines: [
          'source_verification      PASS   3 of 3 material claims',
          '                                supported by local evidence',
          'calculation_verification FAIL   0 of 2 calculations',
          '                                recomputed in the sandbox',
          'code_verification        PASS   no code was generated',
          'hallucination_check      PASS   3 of 3 claims traceable',
          'valid                    false  one check did not hold',
        ],
      },
    },
    {
      index: '03',
      verb: 'Recorded',
      mechanism: 'Append-only hash chain',
      body: 'Each record hashes the one before it. Editing or deleting a line changes every hash after it, and the verifier names the sequence where the chain first fails. It detects tampering. It does not prevent it.',
      artifact: {
        label: 'Audit chain',
        source: 'storage/logs/audit.jsonl',
        lines: [
          'seq 374  approval  requested',
          '         prev d3718a38…   hash be80821b…',
          '                              │',
          'seq 375  task      finished:awaiting_approval',
          '         prev be80821b…   hash 3cffeb7b…',
        ],
      },
    },
  ],
} as const

// --------------------------------------------------------------------------- //
// 04 — One run, end to end
// --------------------------------------------------------------------------- //

export const RUN = {
  id: 'run',
  index: '03',
  eyebrow: 'The run',
  title: 'One run, end to end.',
  lede: 'Seven stages. Each one declares what capability it needs, is routed to a model policy permits and the host can actually hold in memory, and leaves something behind.',
  stages: [
    {
      index: '01',
      name: 'Classify',
      action: 'Type, complexity and sensitivity are determined from config/classification.yaml',
      leaves: 'task.classified',
    },
    {
      index: '02',
      name: 'Plan',
      action: 'Steps are decomposed before any of them execute',
      leaves: 'task.planned',
    },
    {
      index: '03',
      name: 'Read',
      action: 'A PDF with no text layer is rasterised and read by the vision model',
      leaves: 'extraction + page refs',
    },
    {
      index: '04',
      name: 'Retrieve',
      action: 'The local corpus is searched; passages keep their provenance',
      leaves: '[S1] [S2] …',
    },
    {
      index: '05',
      name: 'Sandbox',
      action: 'Generated Python runs under AST validation and resource limits',
      leaves: 'script, stdout, rusage',
    },
    {
      index: '06',
      name: 'Draft',
      action: 'The answer is composed against the retrieved evidence only',
      leaves: 'draft + citations',
    },
    {
      index: '07',
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
  index: '04',
  eyebrow: 'Proof',
  title: 'Check it yourself.',
  lede: 'AEGIS has no customers, no certifications and no published benchmark. What it has is artifacts. Four of them are below, and all four can be disproved without asking us anything.',

  chain: {
    label: 'The audit chain',
    source: 'storage/logs/audit.jsonl',
    // Three consecutive records, verbatim from this repository's own log, with
    // hashes truncated for width. The full values are in the file.
    lines: [
      '{"sequence": 373, "actor": "engineer", "category": "verification",',
      ' "action": "completed",',
      ' "detail": {"valid": false, "checks": {...}},',
      ' "prev_hash": "8cc348fe…", "hash": "d3718a38…"}',
      '',
      '{"sequence": 374, "actor": "engineer", "category": "approval",',
      ' "action": "requested",',
      ' "detail": {"approver_roles": ["administrator", "reviewer"]},',
      ' "prev_hash": "d3718a38…", "hash": "be80821b…"}',
      '',
      '{"sequence": 375, "actor": "engineer", "category": "task",',
      ' "action": "finished:awaiting_approval",',
      ' "detail": {"verification_valid": false, "duration_ms": 246792},',
      ' "prev_hash": "be80821b…", "hash": "3cffeb7b…"}',
    ],
    caption:
      'Three consecutive records from this repository’s own log. Each record hashes the one before it, so editing or deleting a line changes every hash after it and the verifier names the sequence where the chain first fails. It detects tampering. It does not prevent it.',
  },

  policy: {
    label: 'A policy that refuses',
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
    label: 'What that produced here',
    source: 'GET /api/sovereignty/sandbox-test',
    // Verbatim response from the capture host, 2026-09-21 18:33 UTC. The
    // failing line is kept. A self-test that only ever shows passes is not a
    // self-test.
    lines: [
      'Static import review        PASS  import socket; socket.socket()',
      '                                  → execution refused',
      'Runtime socket denial       PASS  socket.socket(), static check',
      '                                  bypassed → no output',
      'Process escape review       PASS  os.system(\'id\') → refused',
      'Permitted work still runs   FAIL  print(sum(range(1000)))',
      '                                  → also refused',
      '',
      'overall  CONTAINMENT FAILURE — 1 check(s) did not hold',
      'ran_at   2026-09-21T18:33:58Z   duration 5ms',
    ],
    caption:
      'The policy above is a file in the repository. The result beside it is what happened when that code was submitted to the sandbox on the host this page was built on — the endpoint runs the checks on demand and writes the outcome to the audit log. Read the last line: this host cannot apply resource limits to a child process, so the sandbox refuses everything, including work it is supposed to permit. It fails closed, and it says so rather than reporting four passes. The second check exists because the first one can be bypassed.',
  },

  containment: {
    label: 'Containment, read live',
    caption:
      'Read live from this machine by your browser, from an endpoint that requires no sign-in. It reports what the monitor observed on the process tree owned by this workbench. It is a measurement of one host over one uptime, not a property of the software.',
    quote:
      'The sign-in screen states this platform keeps everything on the host. That claim has to be a reading even before anyone authenticates, or it is just a slogan printed on a login page.',
    quoteSource: 'backend/api/routes/system.py',
  },

  page: {
    label: 'This page',
    source: 'response header',
    // The production header, verbatim from next.config.mjs. A development
    // server adds 'unsafe-eval' to script-src for Turbopack's hot reload; every
    // other directive is identical.
    lines: [
      "Content-Security-Policy: default-src 'self';",
      "  img-src 'self' data:; font-src 'self';",
      "  script-src 'self' 'unsafe-inline';",
      "  style-src 'self' 'unsafe-inline'; connect-src 'self';",
      "  frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    ],
    caption:
      'This page is served under that header — check it in the network tab. There is no font CDN, no analytics, no embedded video and no third-party script, and the directives that guarantee it are default-src, connect-src, font-src and img-src: every origin this document may fetch from or connect to is this one. The two ’unsafe-inline’ tokens are not a hole in that. They permit inline code from this document only, because the framework streams its own styles and its server-rendered payload as inline elements with no nonce; a nonce would need middleware and would cost this page its static render. A product that claims to work air-gapped should have a marketing page that does.',
  },
} as const

// --------------------------------------------------------------------------- //
// 06 — What this is not
// --------------------------------------------------------------------------- //

export const LIMITS = {
  id: 'limits',
  index: '05',
  eyebrow: 'Limits',
  title: 'What this is not.',
  lede: 'Stated plainly, because these affect whether AEGIS is right for a deployment. Every item is also in the README, and none of it gets softer there.',
  items: [
    {
      title: 'Application-level sandboxing is not VM isolation.',
      body: 'Execution is a subprocess with static validation, resource limits and a socket shim. It is not a VM, a container, a namespace or a seccomp boundary, and should not be described as one. A deployment handling genuinely hostile input should put this process inside an OS-level boundary as well.',
    },
    {
      title: 'The sandbox needs a host that can bound a child process.',
      body: 'Where the platform cannot apply resource limits to a subprocess, the sandbox refuses to execute anything at all — including permitted code. That is the correct direction to fail in, and it is also why calculation checks report FAIL rather than PASS on such a host. The self-test in the proof section above is the current reading, not a description.',
    },
    {
      title: 'The audit chain detects tampering. It does not prevent it.',
      body: 'Hash-chained, append-only, locked across processes. An operator with write access to the file can still truncate it — and the verifier will say which sequence broke.',
    },
    {
      title: 'Latency is hardware-bound.',
      body: 'On a CPU-only host a full question takes minutes, not seconds; the run shown in the hero took 247 seconds end to end. A GPU changes this substantially. Nothing in the design hides the cost.',
    },
    {
      title: 'Vision is the expensive path.',
      body: 'Rasterising and reading a large scanned PDF is far slower than a text query and scales with page count.',
    },
    {
      title: 'Cold starts matter.',
      body: 'Single-model residency trades throughput for fitting on a small host. The first call after an eviction pays the load time.',
    },
    {
      title: 'Policy files are deployment-specific.',
      body: 'The shipped roles, classifications and approval rules are a sensible default, not your organisation’s.',
    },
    {
      title: 'Compliance is not a software property.',
      body: 'The audit chain supports an assurance process. It does not constitute one, and AEGIS holds no certifications.',
    },
    {
      title: 'There is no published benchmark yet.',
      body: 'Accuracy claims are absent from this page because the evaluation set that would justify them has not been built. When it is, the numbers and the method will be here together.',
    },
  ] satisfies Limit[],
} as const

// --------------------------------------------------------------------------- //
// 07 — Run it
// --------------------------------------------------------------------------- //

export const RUN_IT = {
  id: 'run-it',
  index: '06',
  eyebrow: 'Run it',
  title: 'Run it.',
  lede: 'Python 3.11+, Node 20+, and Ollama on the same machine. No account, no key, no network.',
  commands: [
    `git clone ${REPO_URL}`,
    'cd Sovereign-On_Premise-Agentic-AI-Workbench',
    '',
    'python3 -m venv .venv && source .venv/bin/activate',
    'pip install -r requirements.txt',
    'cd frontend && npm install && cd ..',
    '',
    'ollama pull qwen3:8b && ollama pull nomic-embed-text',
    '',
    '# optional — seeds the demonstration corpus',
    'python scripts/seed_demo_data.py',
    '',
    './scripts/run.sh',
  ],
  facts: [
    { label: 'Interface', line: 'http://127.0.0.1:3000' },
    { label: 'API', line: 'http://127.0.0.1:8000' },
    {
      label: 'Inference',
      line: 'Ollama on 127.0.0.1:11434, pinned to loopback and refused otherwise',
    },
  ],
} as const

// --------------------------------------------------------------------------- //
// Footer
// --------------------------------------------------------------------------- //

export const FOOTER = {
  blurb: 'An air-gapped AI workbench for regulated industrial work.',
  columns: [
    {
      heading: 'Product',
      links: [
        { label: 'Sign in', href: '/sign-in' },
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
