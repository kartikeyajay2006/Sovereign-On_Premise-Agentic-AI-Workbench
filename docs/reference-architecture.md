# Sovereign On-Premise Agentic AI Workbench — Reference Architecture

> This is the **target / aspirational architecture** as specified in the original problem
> statement and design draft. It describes the full production vision. The
> [implementation architecture](implementation-architecture.md) and
> [phased build plan](phased-implementation-plan.md) describe the scoped-down subset we
> are actually building for the hackathon, and map back to this document layer by layer.

## Purpose

A confidential, air-gapped industrial AI platform that understands documents, drawings,
images, spreadsheets, code, and engineering workflows while keeping all data, models,
tools, logs, and outputs inside the organization's controlled environment.

**Chain of responsibility:**

```
Industrial request → multimodal understanding → specialist local model → local
knowledge retrieval → policy-controlled agent execution → verification → human
approval → industrial deliverable → evidence and audit → sovereignty proof.
```

## Problem statement

Refineries, PSUs, defence-linked manufacturing units and government offices generate a
lot of routine but sensitive knowledge work — approval notes, board presentations,
engineering calculations, code for internal tools, review of scanned drawings and
inspection reports. None of this can go through cloud AI assistants because the
underlying data is confidential (P&IDs, financials, vendor negotiations, unreleased
designs, internal correspondence, confidential business strategies). Company policy
keeps this data on premises, so people either lose the productivity gain or quietly
paste confidential material into public tools anyway.

The idea: a self-hosted, air-gapped AI workbench running entirely on the organization's
own GPU server. Nothing leaves the premises. The backend supports multiple open-weight
models at once and automatically picks the right one for a given task. It acts as a real
agent — planning multi-step work, calling local tools (file I/O, sandboxed code
execution, spreadsheet work, internal document search), iterating instead of
one-shotting. It understands more than text: scanned PDFs, handwritten notes,
engineering drawings, photographs, via on-device OCR/vision. Output is real
deliverables (approval notes, PPT/Word/Excel, working code, calculations with steps
shown), grounded in the organization's own manuals/SOPs/correspondence via a local
knowledge base — nothing external.

**Expected solution (judging criteria):**

1. A working local deployment on a single workstation/server with a mid-range GPU (or a
   smaller open-weight model if 120B-class hardware isn't available).
2. Model auto-selection demonstrated across at least two different task types.
3. An agentic task carried through end to end — e.g. reading a scanned inspection
   report, pulling out key findings, and drafting an approval note as a Word file.
4. A coding task run and verified in a sandbox.
5. A multimodal task involving image/scanned-document understanding.
6. Visible proof (logs or a network monitor) that **no external calls are made at any
   point** — this is the actual proof of the sovereign claim, not just a statement of it.

## 1. Master architecture

```
SOVEREIGN ON-PREMISE AGENTIC AI WORKBENCH — 100% LOCAL / AIR-GAPPED / AUDITABLE

INDUSTRIAL USER
  ├── Chat request (questions/tasks)
  ├── Document input (PDF/DOCX/XLSX)
  └── Visual input (scan/P&ID)
        │
        ▼
PRESENTATION LAYER — Next.js + React + TypeScript + Tailwind + shadcn/ui
  AI Workspace (chat/tasks/results) · File Manager (upload/preview/search)
  Agent Timeline (plan/tool calls/verification) · Security Center (network=0, cloud=0)
        │  REST / WebSocket / Server-Sent Events
        ▼
API AND APPLICATION LAYER — FastAPI + Python
  Authentication → RBAC → Session Management → File Access → Task Management → Audit
  PostgreSQL: users, roles, permissions, tasks, sessions, policies, audit
  Redis: job queue, temporary state, event stream, worker coordination
        │
        ▼
INDUSTRIAL TASK ANALYZER
  Input type × Task type × Complexity × Security profile
  Task → Capability → Complexity → Data Sensitivity → Required Controls
        │
        ▼
INTELLIGENT LOCAL MODEL ROUTER
  Reasoning model (Qwen reasoning: SOP analysis, planning, document/RAG reasoning,
    agent decisions)
  Coding model (Qwen3-Coder: debugging, data analysis, tool calling, automation)
  Vision model (Qwen3-VL: P&IDs, drawings, photos/handwriting, layout understanding)
  → Model Manager: Registry → Signature Check → Quantization → VRAM Check → Load/Unload
        │
        ▼
AGENT ORCHESTRATOR — LangGraph / custom state graph
  USER TASK → PLAN → SELECT ACTION → EXECUTE → OBSERVE → VERIFY
    → (FAIL: REPLAN/RETRY | PASS: CONTINUE)
        │
        ├── INDUSTRIAL KNOWLEDGE BASE (SOPs, manuals, inspection reports, engineering
        │     docs, correspondence → parser → chunking → local embeddings → vector
        │     search → metadata filters → reranker → evidence package)
        ├── MULTIMODAL PROCESSING (PDF→parser, scan→OCR, image/drawing/P&ID→vision,
        │     table→extraction, handwriting→OCR/vision, layout detection)
        └── LOCAL TOOL SUITE (file tools, Python/calculation, spreadsheet Excel/CSV,
              document DOCX/PDF)
        │
        ▼
SECURITY AND POLICY GATEWAY
  Identity check (RBAC/ABAC) · Classification check (access control)
  Permission check (capability policy) · Approval requirement (risk)
  DEFAULT DENY: external API, internet, unauthorized files, credentials
  → DENY/BLOCK (record event) | ALLOW (execute safely)
        │
        ▼
SECURE CODE EXECUTION — Docker + gVisor
  AI-generated code → static validation → sandbox admission → execution → result
  Sandbox: no internet, no host filesystem, no credentials, no external APIs,
    limited CPU/RAM, time limit, process limit, temporary filesystem,
    controlled input/output mounts
        │
        ▼
VERIFICATION ENGINE
  Source verification (RAG evidence) · Calculation check (Python recomputation)
  Code verification (sandbox result, tests/linting)
  → Hallucination check (evidence required for material claims)
  → Valid? NO: replan/retry.  YES: Human Approval Gate
        │
        ▼
HUMAN APPROVAL GATE
  Sensitive task? YES → human review (approve → continue / reject → stop)
                  NO  → continue
        │
        ▼
DELIVERABLE ENGINE — Python Document Engine
  DOCX (approval note/SOP response) · XLSX (analysis/workbook) · PPTX (board pack)
  PDF (report/export) · CODE (scripts/reproducible artifacts)
        │
        ▼
EVIDENCE AND EXPLAINABILITY
  Source document, page/section, SOP reference, extracted evidence, calculation
  details, model used/version, tools used, verification status, human approval
  status, input/output file identifiers, confidence and limitations
        │
        ▼
AUDIT AND TRACEABILITY
  TASK ID → USER → SESSION → INPUT FILES → CLASSIFICATION → MODEL SELECTED → RAG
    → TOOLS USED → CODE EXECUTION → POLICY DECISIONS → VERIFICATION → HUMAN APPROVAL
    → FINAL OUTPUT → NETWORK ACTIVITY → RETENTION/DISPOSITION
  Immutable, searchable, exportable, stored locally.
        │
        ▼
SOVEREIGNTY MONITOR
  External API calls = 0 · Cloud LLM calls = 0 · Internet requests = 0
  DNS requests = 0 · Data leaving host = 0 · Unapproved connections = 0
  100% LOCAL / SOVEREIGN
```

## 2. Layer responsibilities

| Layer | Primary responsibility | Main components | Control objective |
|---|---|---|---|
| Presentation | Provide the industrial user workspace | Next.js, React, TypeScript, Tailwind, shadcn/ui, WebSocket/SSE | Make agent activity, evidence, approval, and security status visible |
| API and application | Manage identity, sessions, files, tasks, audit events | FastAPI, Python, PostgreSQL, Redis, Pydantic | Expose controlled services without bypassing policy |
| Task analyzer | Convert an unstructured request into a structured execution profile | Input classifier, task classifier, complexity detector, sensitivity detector | Select the correct workflow and risk controls |
| Model router | Select the best available local model | Model registry, VRAM checker, quantization manager, fallback controller | Match capability and hardware without sending data outside the host |
| Agent orchestrator | Plan and execute multi-step work | LangGraph/custom state graph, planner, tool router, retry loop | Maintain explicit, observable, recoverable execution state |
| Knowledge base | Retrieve authoritative industrial context | Parser, OCR, chunking, embeddings, pgvector, metadata filters, reranker | Ground responses in approved local documents |
| Multimodal engine | Understand industrial visual and document inputs | PyMuPDF, Docling, PaddleOCR, image processing, vision model | Extract text, layout, tables, drawings, visual evidence |
| Local tools | Perform controlled file/document/spreadsheet/computation work | Python, calculator, filesystem, Excel/CSV, DOCX, PDF, PPTX | Produce useful outputs without uncontrolled execution |
| Policy gateway | Enforce identity, data, model, tool, action policy | RBAC, ABAC, policy engine, approval rules, default-deny controls | Prevent unauthorized access and unsafe actions |
| Secure sandbox | Execute generated/untrusted code safely | Docker, gVisor, resource limits, temporary filesystem | Prevent internet, credential, host, process escape |
| Verification | Test claims, calculations, code, evidence | RAG comparison, Python recomputation, sandbox tests, hallucination checks | Ensure outputs are correct enough to deliver |
| Human approval | Keep people in control of sensitive decisions | Approval queue, evidence view, approve/reject workflow | Require explicit authorization for high-impact actions |
| Deliverable engine | Create operational artifacts | Python document engine, DOCX, XLSX, PPTX, PDF, CODE | Convert verified work into usable industrial deliverables |
| Audit and sovereignty | Prove what happened and where data went | Immutable logs, network monitor, model/tool traces | Demonstrate traceability and zero uncontrolled data egress |

## 3. Local data plane

```
INPUT DOCUMENTS (user upload / controlled file watcher / approved network share /
  authorized removable media)
   ▼
QUARANTINE ZONE (file-type validation, size/compression checks, malware scanning,
  metadata extraction, access classification)
   ▼
DOCUMENT PROCESSING (parse, OCR, normalize, detect layout/tables, chunk, generate
  local embeddings, create metadata/provenance links)
   ▼
CONTROLLED KNOWLEDGE STORE (PostgreSQL metadata, pgvector embeddings, encrypted
  local object storage, version history, department/source tags, evidence references)
```

Provenance is preserved: every retrieved passage stays linked to the original file,
version, page, section, department, date, and classification — so the final answer
shows both **what** was retrieved and **where it came from**.

## 4. Agent execution lifecycle

| Stage | Agent activity | Recorded evidence |
|---|---|---|
| Receive | Accept request, files, identity, session context | Task ID, user ID, input hashes, timestamps |
| Classify | Determine input type, task type, complexity, sensitivity, approval requirement | Classification result and policy basis |
| Plan | Produce an explicit sequence of steps | Plan version and expected outputs |
| Retrieve | Search approved local knowledge sources | Query, filters, retrieved passages, source references |
| Select | Choose models and tools based on capability and policy | Model ID, model version, tool permissions |
| Execute | Perform controlled analysis/file operations | Tool arguments, outputs, errors, generated artifacts |
| Observe | Capture intermediate state and execution changes | State transitions, logs, resource usage |
| Verify | Validate evidence, calculations, code, consistency | Verification results and failed checks |
| Approve | Pause for human approval when required | Reviewer, decision, evidence presented, timestamp |
| Deliver | Generate and return the final artifact | Output hash, format, citations, verification status |
| Audit | Close the trace and preserve the complete record | Immutable audit event chain and network status |

## 5. Security and policy model

Default-deny, least-privilege, human-controlled.

| Control area | Decision that must be enforced |
|---|---|
| User identity | Is this user authenticated and active? |
| Role and department | Is the user entitled to perform this category of work? |
| File access | May this user and this agent access the selected document? |
| Data classification | Does the task require additional controls (restricted/sensitive)? |
| Model access | Is the selected model approved for this data classification? |
| Tool access | Is the requested tool allowed for this task and user? |
| Code execution | Can the code run within the permitted CPU/memory/time/filesystem limits? |
| Network access | Is every outbound connection blocked unless explicitly authorized? |
| Action approval | Does the result require review before release/execution? |
| Evidence sufficiency | Are the final claims supported by local evidence or independently verified? |

**Blocked by default:** external API calls, internet access, DNS resolution, cloud
model inference, unauthorized files, credential access, host filesystem access,
privilege escalation, unapproved code execution, unregistered models, unapproved tool
calls, sensitive output release.

## 6. Secure execution sandbox

```
AI-GENERATED CODE
   ▼
STATIC SECURITY VALIDATION (import/package review, dangerous-operation detection,
  file/process access review, network/credential reference review)
   ▼
SANDBOX ADMISSION (temporary filesystem, no internet, no host filesystem, no
  credentials, no external APIs, CPU/RAM/process limits, execution timeout)
   ▼
EXECUTION RESULT (stdout, stderr, generated files, resource consumption, exit
  status, security events)
```

The sandbox is not a substitute for policy enforcement: the **policy gateway decides
whether execution is allowed**, the sandbox limits the blast radius if it is.

## 7. Verification and human-in-the-loop control

```
MODEL OR TOOL OUTPUT
  ├── Source verification    → local RAG evidence and page references
  ├── Calculation verification → independent Python recomputation
  ├── Code verification      → sandbox result, tests, static checks
  ├── Document verification  → source comparison and template checks
  └── Hallucination check    → evidence required for material claims
   ▼
VALID? NO → replan/retry/escalate/stop
       YES → Sensitive task? YES → human review → approve → deliver / reject → stop
                              NO  → continue → deliver
```

Human approval is required for release of restricted documents, safety-related
recommendations, changes to controlled records, execution of production-impacting
code, or any action the org's policy classifies as high risk.

## 8. Evidence and explainability package

| Evidence item | Example content |
|---|---|
| Source document | Original filename and document identifier |
| Location | Page number, section, table, or drawing region |
| Knowledge-base record | Document version, ingestion date, department, classification |
| Extracted evidence | Relevant passage, OCR text, table, or visual observation |
| Calculation | Formula, inputs, units, intermediate values, recomputed result |
| Model | Model family, version, quantization, routing reason |
| Tools | Tools invoked, parameters, outputs |
| Verification | Checks performed, results, warnings, limitations |
| Approval | Reviewer, decision, timestamp, decision comments |
| Deliverable | Output filename, format, hash, release status |

## 9. Deployment topology (production target)

```
ON-PREMISE LINUX SERVER (Ubuntu, NVIDIA drivers, CUDA, Docker)
  ├── GPU compute (NVIDIA GPU, CUDA/VRAM, optional TensorRT)
  ├── Local storage (models, documents, vector database, audit logs)
  └── Local network (firewall, network ACL, no internet, network monitor)
        ▼
CONTAINER PLATFORM
  Frontend · API · Agent Worker · Model Serving · PostgreSQL · Redis · pgvector ·
  Object Storage (MinIO) · OCR/Parsing · Sandbox · Monitoring
```

| Container/service | Responsibility |
|---|---|
| Frontend | User workspace, file manager, agent timeline, security center |
| API server | Auth, task APIs, file APIs, policy checks, audit events |
| Agent worker | Planning, tool routing, execution state, retries, verification |
| Model serving | Local reasoning, coding, vision, embedding inference |
| PostgreSQL | Users, tasks, policies, sessions, metadata, audit records |
| pgvector | Local semantic search and evidence retrieval |
| Redis | Queue management, temporary state, event streaming, coordination |
| Object storage | Encrypted documents, intermediate files, generated deliverables |
| Sandbox runner | Isolated Python/code execution |
| Observability | Metrics, logs, alerts, GPU/VRAM monitoring, network events |

## 10. Backup, recovery, and model governance

```
PRIMARY SYSTEM → encrypted DB/document/model-registry/config/audit backups
   ▼
OFFLINE BACKUP TARGET (encrypted drive, offline NAS, WORM media, secondary server)
   ▼
RESTORE VALIDATION: backup → integrity check → isolated restore → verification → production
```

```
Model lifecycle:
Model package → Signature check → Malware scan → Capability evaluation
→ Accuracy and safety evaluation → Policy approval → Registry entry
→ Controlled deployment → Health check → Production availability
```

## 11. Observability and operations

| Monitoring domain | Signals |
|---|---|
| Compute | GPU utilization, VRAM, temperature, CPU, RAM, disk, process count |
| Model serving | Latency, throughput, queue depth, load state, fallback events |
| Agent execution | Task duration, retries, failed steps, tool calls, verification failures |
| Knowledge base | Ingestion status, parser failures, index health, retrieval latency |
| Security | Failed logins, denied permissions, blocked tools, sandbox violations |
| Network | DNS attempts, outbound packets, blocked connections, interface state |
| Storage | Capacity, encryption state, backup status, retention events |
| Audit | Missing events, integrity failures, unusual access patterns |

Recommended: Prometheus, Grafana, centralized structured logs, GPU/VRAM monitoring,
agent execution logs, real-time network monitor.

## 12. Recommended technology stack (production target)

| Capability | Recommended technologies |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS, shadcn/ui |
| Live execution | WebSocket or Server-Sent Events |
| Backend | Python, FastAPI, Pydantic |
| Data platform | PostgreSQL, Redis, pgvector |
| Local object storage | MinIO or encrypted filesystem storage |
| Reasoning model | Qwen reasoning model or approved equivalent |
| Coding model | Qwen3-Coder or approved equivalent |
| Vision model | Qwen3-VL or approved equivalent |
| Model serving | vLLM, llama.cpp, or Ollama (subject to hardware evaluation) |
| Agent framework | LangGraph or custom state-machine implementation |
| Document processing | PyMuPDF, Docling, PaddleOCR |
| Data analysis | Python, pandas, NumPy, openpyxl |
| Deliverables | python-docx, openpyxl, python-pptx, PDF generation tools |
| Security | RBAC, ABAC, firewall, network isolation, Docker, gVisor, resource limits |
| Monitoring | Prometheus, Grafana, structured logs, GPU/network monitors |

> Model size, quantization, serving runtime, GPU requirements, and container
> orchestration must be validated against the actual target/demo hardware — see
> [implementation-architecture.md](implementation-architecture.md) for what we run on
> our current (no-GPU) hardware.

## 13. Recommended repository structure (production target)

```
sovereign-agent-workbench/
├── frontend/{app,components,features/{chat,files,agents,audit}}
├── backend/{api,auth,tasks,policies,audit,websocket}
├── agents/{orchestrator,planner,router,verifier,state}
├── models/{registry,reasoning,coding,vision,embeddings}
├── rag/{ingestion,parsing,chunking,embeddings,retrieval,reranking}
├── tools/{filesystem,documents,spreadsheets,python,sandbox}
├── infrastructure/{docker,firewall,monitoring,backup}
├── policies/{access-control.yaml,tool-permissions.yaml,data-classification.yaml,approval-rules.yaml}
├── tests/{unit,integration,security,model-evaluation,disaster-recovery}
└── documentation/{architecture.md,deployment.md,security.md,operations.md,user-guide.md}
```

## 14. Demonstration flow (canonical example)

> "Analyze this scanned inspection report and prepare an approval note based on our
> approved SOP."

```
INDUSTRIAL USER
  ▼
TASK ANALYZER (scanned doc, inspection analysis, SOP grounding, doc generation,
  human approval requirement)
  ▼
MODEL ROUTER → VISION MODEL (OCR + layout + visual extraction) → EXTRACT FINDINGS
  ▼
REASONING MODEL (interprets findings, structured analysis plan)
  ▼
AGENT ORCHESTRATOR
  ├── Local SOP/RAG → applicable rules
  ├── Python        → required calculations
  └── File tools    → evidence + artifact prep
  ▼
VERIFICATION ENGINE (evidence, calculations, consistency, unsupported claims)
  ▼
HUMAN APPROVAL
  ▼
DOCX DELIVERABLE ENGINE → APPROVAL_NOTE.DOCX (findings, SOP refs, evidence
  citations, calculations, verification status, approval record)
  ▼
AUDIT TRAIL
  ▼
SOVEREIGNTY MONITOR — Outbound = 0 · Cloud = 0 · Data out = 0
```

This demonstrates the platform is not a generic chatbot: it connects multimodal
document understanding, specialist models, local SOP retrieval, controlled tools,
verification, human authority, and auditable deliverables.

## 15. Final design principles

1. **Data sovereignty** — prompts, files, embeddings, models, logs, outputs remain local.
2. **Least privilege** — every user/model/agent/tool/file/action gets only necessary access.
3. **Default deny** — unregistered tools, unknown files, external connections, unsafe actions blocked by default.
4. **Human control** — sensitive actions pause for explicit review and authorization.
5. **Evidence first** — material claims, calculations, code, recommendations must be traceable.
6. **Reproducibility** — prompts, model versions, tools, files, parameters, results are versioned.
7. **Fail safe** — when uncertain, unauthorized, or unable to verify, the system stops, explains why, and escalates.
8. **Operational value** — the system must produce practical industrial outputs, not only conversation.

```
USER REQUEST
  ▼
LOCAL MODELS + LOCAL INDUSTRIAL DATA + LOCAL TOOLS
  ▼
POLICY-CONTROLLED AGENT EXECUTION
  ▼
VERIFIED INDUSTRIAL DELIVERABLE
  ▼
EVIDENCE + HUMAN APPROVAL + COMPLETE AUDIT
  ▼
SOVEREIGN INDUSTRIAL AI SYSTEM — 100% LOCAL
  No cloud dependency · No uncontrolled external API · No internet requirement
  No uncontrolled code execution · No untraceable output
```
