# 04 · Architecture

> How the pieces fit together, and what happens between pressing Enter and reading a cited answer.

<div align="center">
<img src="../../assets/readme/architecture-overview.svg" alt="AEGIS architecture overview" width="100%">
</div>

| Page | Covers |
|---|---|
| [4.1 System overview](01-system-overview.md) | The processes, the ports, and what talks to what |
| [4.2 The life of a request](02-request-lifecycle.md) | Every stage of a run, in order, with the code that runs it |
| [4.3 Backend modules](03-backend-modules.md) | Each Python package: what it owns and what depends on it |
| [4.4 The frontend](04-frontend.md) | Routes, features, the API client, the design system |
| [4.5 The data model](05-data-model.md) | SQLite tables, files on disk, and the audit log |
| [4.6 The live event stream](06-events.md) | Server-Sent Events: all 32 event types, replay and visibility |

## Design principles

These run through every page of this section.

1. **One host, no services for their own sake.** SQLite instead of PostgreSQL, in-process vectors instead of a vector database, an in-process event bus instead of Redis. Each would add a process to secure and operate without adding a capability a single host needs.
2. **Configuration, not code.** Models, routing, classification signals, prompts, skills, harnesses, roles, tools and approval rules are YAML. Adding a model or tightening a rule is an edit, not a deployment.
3. **Untrusted until checked.** Model output is parsed, never evaluated; figures are recomputed; citations are resolved; code is validated before it runs.
4. **Say what happened.** A stage that did not run says it did not run. A check that could not complete is a failed check. A monitor that cannot see reports that it cannot see.
5. **Everything is recorded.** Every stage boundary is persisted, every decision audited, every event streamed.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.11 · Drawings](../03-user-guide/11-drawings.md) | [↑ The AEGIS Handbook](../README.md) | [4.1 · System overview →](01-system-overview.md) |

<!-- nav:end -->
