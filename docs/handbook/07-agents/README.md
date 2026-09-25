# 07 · Agents and orchestration

> A staged pipeline, not a free-running agent loop.

AEGIS's "agent" is a **fixed sequence of stages** whose shape adapts to the request: read, plan, retrieve, compute, reason, verify, draft, gate. The model decides *what to say* inside each stage. The pipeline decides *which stages run*, and policy decides *what may happen*. That is deliberate. A free-running loop that picks its own tools is harder to bound, harder to audit, and harder to explain to a person who must sign the result.

<div align="center">
<img src="../../assets/readme/flow-execute.svg" alt="Agent requests pass a policy check and AST validation before running in an isolated subprocess" width="100%">
</div>

| Page | Covers |
|---|---|
| [7.1 The task analyzer](01-analyzer.md) | How a request becomes a profile: input, task type, complexity, sensitivity, requirements |
| [7.2 The orchestrator](02-orchestrator.md) | The stages, the evidence ledger, persistence, cancellation, failure |
| [7.3 Planning and prompts](03-planning-prompts.md) | When a plan is made, what it contains, and every prompt the pipeline uses |
| [7.4 Tools](04-tools.md) | The five tools an agent can call, and how each is gated |
| [7.5 Deliverables](05-deliverables.md) | DOCX, XLSX, PPTX and Markdown: what goes into each, and how they are held |

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 6.6 · Revision control](../06-knowledge-and-retrieval/06-revisions.md) | [↑ The AEGIS Handbook](../README.md) | [7.1 · The task analyzer →](01-analyzer.md) |

<!-- nav:end -->
