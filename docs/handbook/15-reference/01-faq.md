# 15.1 · Frequently asked questions

### Does anything leave the machine?

Not from the workbench. Inference is pinned to loopback and refused otherwise, sandboxed code cannot open a socket, the console loads nothing from another origin, and a monitor measures the workbench's own connections every two seconds. The measurement covers the API and everything it starts, not other programs such as Ollama; for a provable air gap, add a host firewall. [2.7](../02-concepts/07-sovereignty.md)

### Does it need the internet at all?

Only to install: pip, npm and `ollama pull`. After that it runs with no network route.

### Does it need a GPU?

No. Every number in this handbook was measured on CPU-only laptops. A GPU makes it much faster. [12.5](../12-operations/05-performance.md)

### Why is my answer taking so long?

On a CPU, a cited answer takes about 15–40 s, a document several minutes. If it is much slower, the host is probably swapping. [12.5](../12-operations/05-performance.md#memory-specifically)

### Which model answered my question?

Open the run's transcript: every stage names its model and the reason it was chosen. [5.2](../05-models-and-routing/02-router.md)

### Can I use a different model?

Yes: pull it, declare it in `config/models.yaml` with the classifications it is approved for, and restart. [5.5](../05-models-and-routing/05-adding-a-model.md)

### Why was my run held when every check passed?

Because policy, not only verification, decides release. The most common reason is that retrieval used a Restricted passage, which makes the answer Restricted. The held line names it. [2.5](../02-concepts/05-approval.md)

### Why can't I approve this run?

Either your role cannot approve (`approval.decide` is held by reviewers and administrators), or you submitted it yourself. Nobody approves their own work. [3.5](../03-user-guide/05-approvals.md#when-you-cannot-decide)

### Why does my colleague get a different answer to the same question?

Different department or clearance means different passages. Clearance is applied before ranking. [6.4](../06-knowledge-and-retrieval/04-retrieval-and-clearance.md)

### Can the model's arithmetic be trusted?

Not on its own, and AEGIS does not ask you to. When code runs, figures are recomputed. When no code runs (for example a calculation over a scanned report), a wrong figure can pass the checks today, which is why documents are held for a person. [8.5](../08-verification/05-limits.md)

### Is the sandbox a container?

No. It is a subprocess with static validation, OS resource limits and a runtime shim. It stops network access, process escapes, writes outside its workspace, and runaway CPU, memory and processes. It does **not** stop reads of files the API user can read. Moving it into a rootless container is on the roadmap. [9.3](../09-security/03-sandbox.md)

### Can someone tamper with the audit log?

An edit, deletion, insertion or reordering is detected, by the server and independently by your browser. A person with write access could rewrite the whole chain with fresh hashes, so record the head hash somewhere the host cannot write. Signed roots are on the roadmap. [2.6](../02-concepts/06-audit.md)

### Where is Firebase?

Gone. An earlier version offered Firebase sign-in; the workbench now authenticates only against local accounts stored on the host. Leftover `NEXT_PUBLIC_FIREBASE_*` lines in `frontend/.env.example` are ignored. [10.7](../10-configuration/07-environment.md)

### I signed in with my e-mail and it said the account does not exist.

Accounts are local to each host. Use a seeded account (`engineer` / `workbench`), or register one with `POST /api/auth/register`; e-mail addresses are accepted as usernames. [3.1](../03-user-guide/01-sign-in.md)

### How do I reset everything?

Stop the services, move `storage/` aside, recreate the empty folders (or `git checkout -- storage`), and seed again. The five accounts are recreated on the next start. Keep the old `storage/` if you need its audit log.

### Can I run it with Docker?

The API image builds. The compose file's frontend service needs a `frontend/Dockerfile` that is not in the repository yet. [12.1](../12-operations/01-run-script.md#docker)

### Is it certified or compliant with anything?

No, and it does not claim to be. The audit chain and approval records support an assurance process; they are not one.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 15 · Reference](README.md) | [↑ 15 · Reference](README.md) | [15.2 · Glossary →](02-glossary.md) |

<!-- nav:end -->
