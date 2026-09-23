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

import type { PassageMark } from './passage'
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

/**
 * A sentence with machine values in it. A plain string is prose; `{ v }` is a
 * value -- an id, a clause, a hash -- and is set in mono by whatever renders it.
 */
export type Rich = ReadonlyArray<string | { v: string }>

/**
 * The run shown in public/landing/thread-run.png. Identified from the image:
 * its prompt, "195.2s" against the record's 195249 ms, and "3/4 checks
 * passed". Facts printed under the screenshot are only read from the fixture
 * while the fixture is this run; re-capture another and they are omitted,
 * rather than printed under a picture of something else.
 */
export const SCREENSHOT_TASK_ID = '5aa3e4b6-45c1-4b4c-9e03-efc92b47d7c9'

// --------------------------------------------------------------------------- //
// Hero
// --------------------------------------------------------------------------- //

export const HERO = {
  // Two lines, because the argument is a turn. The claim in sans, the
  // qualification in serif italic — the typography performs the sentence.
  headline: 'Local is not enough.',
  headlineTurn: 'So prove the rest.',
  sub: 'An air-gapped AI workbench for regulated industrial work. Every answer is cited to a page, checked against your policy, and recorded.',
  primary: { label: 'Open the workbench', href: '/sign-in' },
  secondary: { label: 'Read the source', href: REPO_URL },
  repoPath: REPO_PATH,
  shotAlt:
    'The AEGIS console after a completed run: a question about cladding damage severity, the verdict HELD with three of four checks passed, a folded work log reading 4 of 7 stages, and a three-sentence answer citing S1 and S4.',
  // The two captions below name the run in the picture, so each has a
  // version for when run.json holds a different one.
  shotCaption:
    'The console after a real run on this host. The answer is withheld until verification finishes; this one did not pass, so it was held for a reviewer rather than released. One of its three sentences is wrong. The next section opens this same answer from its run record — press S4 there to see which.',
  shotCaptionOther:
    'The console after a real run on this host. The answer is withheld until verification finishes, and a run that does not pass is held for a reviewer rather than released.',
  shotHeld: 'held for review',
  receiptCaption:
    'Every value on this card was exported from the run in the screenshot by scripts/capture_landing_fixture.py and is served from public/landing/run.json. Nothing here is typed by hand, including the row that says verification did not pass and the row that says the result is still held. Without that file the page does not build.',
  receiptCaptionOther:
    'Every value on this card was exported from one real run by scripts/capture_landing_fixture.py and is served from public/landing/run.json. Nothing here is typed by hand. Without that file the page does not build.',
} as const

const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
/** 2 -> "two", 12 -> "12". Words below ten, figures above, as prose sets them. */
const count = (n: number) => COUNT[n] ?? String(n)

// --------------------------------------------------------------------------- //
// 01 — The answer
// --------------------------------------------------------------------------- //

export const ANSWER = {
  id: 'answer',
  index: '01',
  eyebrow: 'The answer',
  title: 'Every citation opens.',
  titleTurn: 'So open one.',
  lede: 'This is the answer in the screenshot, rendered from its run record instead of from pixels. Each marker opens the passage retrieval returned for it, exactly as the run stored it.',
  // Used only while the fixture is the run the annotation below was written
  // about, because it names a marker and a row that another run may not have.
  ledeAnnotated:
    'This is the answer in the screenshot, rendered from its run record instead of from pixels. Each marker opens the passage retrieval returned for it, exactly as the run stored it. Press S4, and read the Medium row.',
  caption: (run: string, date: string, model: string) =>
    `Run ${run}, ${date}, answered by ${model} on this host. The documents are a synthetic demonstration corpus seeded by scripts/seed_demo_data.py, and every passage is shown as this run retrieved it, whatever the files say now.`,
  labels: {
    question: 'Question',
    answer: 'Answer',
    hint: 'Press a marker to open its passage',
    cited: 'cited',
    uncited: 'retrieved, not cited',
    // Chosen by retrieval mode in the page: "similarity" is only true of an
    // embedding search, where the score is a cosine similarity.
    similarity: 'similarity',
    score: 'score',
    rank: 'rank',
    rendered: 'Rendered',
    stored: 'As stored',
    sources: 'Passages retrieved for this answer',
  },
  outcome: {
    held: 'Held',
    released: 'Released',
    refused: 'Refused',
  },
  // The page's own reading of one run, checked by hand against the passages it
  // cites: "The severity is Medium [S1]" is supported by SOP-MNT-022 §4.1, the
  // threshold sentence by the same clause, and the approving-authority
  // sentence is contradicted by the Medium row of SOP-INS-014 §5. Attached
  // only when run.json is this task.
  annotation: {
    taskId: SCREENSHOT_TASK_ID,
    marks: {
      S1: { kind: 'text', text: 'Medium' },
      S4: { kind: 'cell', row: 'Medium', column: 'Approval authority' },
    } satisfies Record<string, PassageMark>,
    sentence:
      'The approving authority for this severity classification is the Head of Inspection + Plant Manager',
    note: 'This sentence is wrong. The Medium row of the table it cites names the Head of Inspection alone; the pair it gives belongs to the High row. No automatic check caught it, and the run was held for a different reason. A reviewer with this passage open catches it in one read, and that is the job the hold is for.',
    more: { label: 'Why no check caught it.', href: '#chain' },
    attribution:
      'Added by hand for this page, after reading the answer against its passages. Not written by AEGIS.',
    legend:
      'Boxed by hand for this page: the words that settle the sentence citing this passage. AEGIS cites the section; it does not mark the words.',
  },
} as const

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
  index: '03',
  eyebrow: 'The chain',
  title: 'Cited. Checked.',
  titleTurn: 'Recorded.',
  lede: 'Three things happen to every answer before it is allowed to become an action. Each one leaves an artifact you can open, and each artifact below is from the run above.',
  cards: [
    {
      index: '01',
      verb: 'Cited',
      mechanism: 'Page-level provenance',
      body: 'Retrieval returns evidence units that keep their document, section and location. A cited claim points at the section it came from, not at a filename. A scanned report with no text layer is rasterised and read by a local vision model, and the location survives that too.',
      artifact: { kind: 'evidence', label: 'Evidence unit', source: 'GET /api/tasks/{id}' },
    },
    {
      index: '02',
      verb: 'Checked',
      mechanism: 'Default-deny policy, recomputed figures',
      body: 'Tool calls are refused unless a rule in policies/ permits that role, that data classification and that side effect. Every figure that reaches a document is meant to be executed as Python in a sandbox rather than predicted, then recomputed by the verifier — and when the sandbox will not run, the check fails rather than passing quietly.',
      artifact: { kind: 'verification', label: 'Verification report', source: 'GET /api/tasks/{id}' },
    },
    {
      index: '03',
      verb: 'Recorded',
      mechanism: 'Append-only hash chain',
      body: 'Each record hashes the one before it. Editing or deleting a line changes every hash after it, and the verifier names the sequence where the chain first fails. It detects tampering. It does not prevent it.',
      artifact: { kind: 'audit', label: 'Audit chain', source: 'storage/logs/audit.jsonl' },
    },
  ],
  evidenceCaption:
    'S1 from the answer above, as the run recorded it: the document, the section, the stored text.',
  checkedCaption:
    'The report as the verifier wrote it. When this ran, its claim patterns counted one sentence of the answer’s three and passed it; the approving-authority sentence was never examined. The rules now count every cited sentence (policies/approval-rules.yaml), and the current check, run against this answer, passes all three — the wrong one included. Its own docstring says why:',
  verifierQuote:
    'It establishes that a claim is ABOUT the passage it cites -- it cannot establish that the passage supports it. A claim reading the wrong row of a table quotes that table’s own words and passes here.',
  verifierQuoteSource: 'backend/agents/verifier.py',
  recordedCaption:
    'The run’s last two records. The later one’s prev is the earlier one’s hash, so editing or deleting the earlier record changes a value the later one has already committed to. Section 05 recomputes these hashes in your browser.',
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
  // The one place the page and its own screenshot disagree, stated rather
  // than left for a reader to find. features/thread/ui/thread-view.tsx maps
  // backend statuses to stage rows, and TaskStatus has no drafting state.
  consoleNote:
    'The work log in the screenshot reads 4 of 7. The console gets no event when drafting starts, so it cannot mark Draft as run; the audit log records the drafting call, and this table is read from the audit log.',
} as const

// --------------------------------------------------------------------------- //
// 05 — Check it yourself
// --------------------------------------------------------------------------- //

export const PROOF = {
  id: 'proof',
  index: '05',
  eyebrow: 'Proof',
  title: 'Check it',
  titleTurn: 'yourself.',
  lede: 'AEGIS has no customers, no certifications and no published benchmark. What it has is artifacts. Four of them are below, and all four can be disproved without asking us anything.',

  chain: {
    label: 'The audit chain, recomputed in your browser',
    // The edit the reader can make: the failed verification, made to pass.
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
    caption:
      'The run’s last three records, exactly as stored. When the card is on screen your browser hashes each one the way backend/core/audit.py does and compares the result with the hash stored beside it; nothing on this card is computed for you in advance. The button rewrites one value in your copy only. The record then no longer hashes to its stored value, which is where the server’s verifier reports the break; rewrite that hash to match and the break moves to the next record, so hiding an edit means rewriting every hash after it to the end of the log. It detects tampering. It does not prevent it.',
    // When the first record shown has no failed verification to flip, there
    // is no button, and the caption does not describe one.
    captionNoEdit:
      'The run’s last three records, exactly as stored. When the card is on screen your browser hashes each one the way backend/core/audit.py does and compares the result with the hash stored beside it; nothing on this card is computed for you in advance. Edit any record and it stops hashing to its stored value, which is where the server’s verifier reports the break. It detects tampering. It does not prevent it.',
    networkNote:
      'One field in the last record, network_activity, is a fixed string the backend wrote on every run when this one was recorded, not a measurement. Runs since carry what the egress monitor actually observed over the run window instead, or null with the reason when it was not watching.',
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
    label: 'Sandbox self-test',
    // Chosen by the page from the recorded result, which is the only thing
    // that knows whether this host could run the test.
    captionNotAssessable:
      'The policy above is a file in the repository. Under it is the last sandbox self-test this host recorded, read from its audit log: not assessable. This machine cannot apply resource limits to a child process, so the sandbox refuses to execute anything, no payload is submitted, and no containment claim is made in either direction. An earlier version of this test scored those refusals as passes. A refusal is not a pass.',
    captionAssessed:
      'The policy above is a file in the repository. Under it is the last sandbox self-test this host recorded, read from its audit log, each check as it ran: the payload submitted and what the sandbox did with it.',
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
  index: '06',
  eyebrow: 'Limits',
  title: 'What this',
  titleTurn: 'is not.',
  lede: 'Stated plainly, because these affect whether AEGIS is right for a deployment. Every item is also in the README, and none of it gets softer there.',
  items: [
    {
      title: 'Application-level sandboxing is not VM isolation.',
      body: 'Execution is a subprocess with static validation, resource limits and a socket shim. It is not a VM, a container, a namespace or a seccomp boundary, and should not be described as one. A deployment handling genuinely hostile input should put this process inside an OS-level boundary as well.',
    },
    {
      title: 'The sandbox needs a host that can bound a child process.',
      body: 'Where the platform cannot apply resource limits to a subprocess, the sandbox refuses to execute anything at all — including permitted code. That is the correct direction to fail in. It is also why calculation checks report FAIL rather than PASS on such a host, and why the self-test in the proof section reports it as not assessable rather than as a pass or a breach.',
    },
    {
      title: 'Claim checks match words, not meaning.',
      body: 'The verifier establishes that a sentence is about the passage it cites, not that the passage supports it. A sentence that reads the wrong row of a table uses the table’s own words and passes. Section 01 shows one. Catching it takes a person with the passage open, which is why a run that fails any check is held for one.',
    },
    {
      title: 'The audit chain detects tampering. It does not prevent it.',
      body: 'Hash-chained, append-only, locked across processes. An operator with write access can still rewrite the log from any record onward, hashes included, or cut its newest records off, and what remains will verify. GET /api/audit/chain reports the newest hash; nothing stores that hash where the operator cannot write, so keeping a copy elsewhere is part of deploying this.',
    },
    {
      id: 'latency',
      title: 'Latency is hardware-bound.',
      // Replaced by the page with LIMITS.latency(...) when the run carries its
      // durations. This is what prints when it does not.
      body: 'On a CPU-only host a full question takes minutes, not seconds. A GPU changes this substantially. Nothing in the design hides the cost.',
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
  // Host facts from Win32_Processor and Win32_VideoController on the capture
  // host, 2026-09-23: Intel Core i3-1115G4 (2 cores, 4 threads), Intel UHD
  // Graphics only. The durations are the run's, from run.json.
  latency: (total: string, models: string, calls: number) =>
    `On the host this page was built on — a two-core laptop CPU with integrated graphics and no discrete GPU — the run above took ${total} end to end, ${models} of it in ${calls === 1 ? 'its one model call' : `its ${count(calls)} model calls`}. A GPU changes this substantially. Nothing in the design hides the cost.`,
} as const

// --------------------------------------------------------------------------- //
// 07 — Run it
// --------------------------------------------------------------------------- //

export const RUN_IT = {
  id: 'run-it',
  index: '07',
  eyebrow: 'Run it',
  title: 'Run it.',
  lede: 'Python 3.11+, Node 20+, and Ollama on the same machine. No account and no key, and once the models are pulled, no network.',
  commands: [
    `git clone ${REPO_URL}`,
    'cd Sovereign-On_Premise-Agentic-AI-Workbench',
    '',
    'python3 -m venv .venv && source .venv/bin/activate',
    'pip install -r requirements.txt',
    'cd frontend && npm install && cd ..',
    '',
    '# the model the run on this page used, and the embedder',
    'ollama pull qwen2.5:3b && ollama pull nomic-embed-text',
    '# the README lists the other models the router can use',
    '',
    '# optional — seeds the demonstration corpus',
    'python scripts/seed_demo_data.py',
    '',
    './scripts/run.sh',
  ],
  question: {
    label: 'Then ask it this',
    note: 'The question behind every artifact on this page. When the answer arrives, press its markers.',
  },
  policies: {
    label: 'Then read these four files',
    note: 'They decide what the workbench may do, and what ships in them is a default, not your organisation’s. Each description is the file’s own first line.',
    files: [
      {
        path: 'policies/access-control.yaml',
        line: 'Identity, role and file access policy (RBAC + light ABAC). Default deny: anything not explicitly granted here is refused by the gateway.',
      },
      {
        path: 'policies/tool-permissions.yaml',
        line: 'Tool capability policy. Default deny: a tool not listed here cannot be invoked by the agent, and a role not listed on a tool cannot invoke it.',
      },
      {
        path: 'policies/approval-rules.yaml',
        line: 'Human-in-the-loop approval rules and verification thresholds.',
      },
      {
        path: 'policies/data-classification.yaml',
        line: 'Data classification levels and the controls each level demands.',
      },
    ],
  },
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
