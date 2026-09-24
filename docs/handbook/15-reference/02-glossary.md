# 15.2 · Glossary

| Term | Meaning |
|---|---|
| **Admission** | The model manager's decision to load a model, evicting another if needed. [5.3](../05-models-and-routing/03-residency.md) |
| **Agentic** | The highest complexity class: branching work with files, a deliverable or several steps. Step budget 14 |
| **Analyzer** | The component that turns a request into a task profile. [7.1](../07-agents/01-analyzer.md) |
| **Approval gate** | The point after verification where policy decides whether a person must sign. [2.5](../02-concepts/05-approval.md) |
| **Approver roles** | The roles an approval rule names as able to decide; reviewer and administrator by default |
| **Audit chain** | The append-only log in which each record carries the hash of the previous one. [2.6](../02-concepts/06-audit.md) |
| **Available / unavailable / unregistered** | A model declared and installed / declared, not installed / installed, not declared. [5.1](../05-models-and-routing/01-registry.md) |
| **Blocked (Refused)** | A run that policy allowed no model or tool to serve |
| **BM25** | The lexical retriever used when there is no embedding model |
| **Capability** | A tag on a model (`vision`, `reasoning`, `coding`, …); a stage's required capabilities are a hard gate |
| **Citation** | A bracketed evidence ID in an answer, e.g. `[S1]` |
| **Classification** | A data sensitivity level: normal, confidential, sensitive, restricted. [2.3](../02-concepts/03-classification.md) |
| **Clearance** | The highest classification a role may see (`max_data_classification`) |
| **Conversation** | A short social message answered in one call, without retrieval or checks |
| **Deliverable** | A generated document: DOCX, XLSX, PPTX or Markdown. [7.5](../07-agents/05-deliverables.md) |
| **Department isolation** | Passages and files from another department are refused unless the reader holds an override role |
| **Egress** | A connection from the workbench to anything outside loopback. Measured, and expected to be zero |
| **Evidence item** | One numbered piece of material a run may rely on: `S` retrieved, `F` file, `V` visual, `C` computed. [2.2](../02-concepts/02-evidence.md) |
| **Evidence ledger** | The per-run allocator of evidence IDs |
| **Fallback** | A routing rule's relaxed requirement, used when nothing meets the primary one |
| **Hard-denied action** | One of ten actions no role may take. [9.2](../09-security/02-policy-gateway.md) |
| **Harness** | A job of many governed runs ending in one hashed report. [2.8](../02-concepts/08-skills-harnesses.md) |
| **Held** | Awaiting approval (`awaiting_approval`) |
| **Keep-alive** | How long the runtime keeps a model loaded after its last use |
| **Material claim** | A sentence carrying a quantity, a directive, a clause reference or a citation. [8.2](../08-verification/02-claims.md) |
| **Override roles** | Roles exempt from department isolation: reviewer, auditor, administrator |
| **Policy gateway** | The single component that makes and audits authorisation decisions. [9.2](../09-security/02-policy-gateway.md) |
| **Prewarm** | Loading the everyday model at startup |
| **Profile** | The analyzer's output: input type, task type, complexity, sensitivity, requirements |
| **Quoted figure** | A bare number from a source, reported as quoted, never as recomputed |
| **Raise (classification)** | Increasing a run's class to the highest class among its evidence. Never lowered |
| **Residency** | Which model is loaded; with single residency, only one generation model at a time |
| **Routing** | Choosing a model per stage. [5.2](../05-models-and-routing/02-router.md) |
| **Run** | One request carried through the pipeline; a *task* in the code |
| **Sandbox** | The constrained subprocess in which generated code runs. [9.3](../09-security/03-sandbox.md) |
| **Separation of duties** | Nobody may approve a run they submitted |
| **Shim** | The `sitecustomize` module that makes sockets and out-of-workspace writes raise inside the sandbox |
| **Skill** | A saved request template called with `/`. [2.8](../02-concepts/08-skills-harnesses.md) |
| **Sovereignty monitor** | The component that measures egress. [9.4](../09-security/04-sovereignty-monitor.md) |
| **SSE** | Server-Sent Events, the live stream the console listens to. [4.6](../04-architecture/06-events.md) |
| **Stage** | One step of a run: vision extraction, planning, retrieval, code, reasoning, verification, drafting |
| **Step budget** | A ceiling on steps from the complexity class (4 / 8 / 14) |
| **SYNTHETIC** | The marking every demonstration document carries: invented data |
| **Top k** | How many passages retrieval returns; 6 by default |
| **Valid** | A verification report in which every check passed |
| **Verification** | The checks run on every answer before release. [08](../08-verification/README.md) |

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 15.1 · Frequently asked questions](01-faq.md) | [↑ 15 · Reference](README.md) |  |

<!-- nav:end -->
