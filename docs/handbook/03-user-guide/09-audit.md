# 3.9 · Audit

<div align="center">
<img src="../../assets/readme/screenshot-audit.webp#gh-light-mode-only" alt="The Audit screen: the chain recomputed by the server and in the browser to the same head" width="860">
<img src="../../assets/readme/screenshot-audit-dark.webp#gh-dark-mode-only" alt="The Audit screen: the chain recomputed by the server and in the browser to the same head" width="860">
</div>

*Every task, model call, decision and sign-in on this host, hash-linked so that changing or removing a record breaks the chain.* Open it with <kbd>G</kbd> then <kbd>L</kbd>. The concept is explained in [2.6 The audit chain](../02-concepts/06-audit.md).

## Chain verification

The panel at the top shows two independent computations side by side.

| Row | Computed by | Shows |
|---|---|---|
| **Server** | The API, over the whole log | *234 records recompute, head 3838d5d3…6c68 · checked 12:14:49 AM* |
| **This browser** | Your browser, with Web Crypto SHA-256, over the whole log it downloaded | *234 of 234 records recompute, head 3838d5d3…6c68 · 15 ms recomputing* |

Under them, a ribbon draws one mark per record: green where the record recomputes, red from the first record that does not. When the two agree, the panel says *Both agree: 234 records, ending at the same head 3838d5d3…6c68.* **How the browser check works** expands to explain it.

The server row appears for everyone. The browser row needs the whole log, so it needs `audit.read.all` (reviewer, auditor, administrator). For other roles it says *Not available to this role. Recomputing the chain needs the full log, and reading the full log needs audit.read.all.*

Click **Verify chain** to run both again.

### If the chain is broken

Both rows turn red and name the **first sequence number** that fails to recompute. Everything from there on is suspect. Do not edit the file to "fix" it: archive it and start a fresh chain with the audit tool, which never rewrites or deletes the broken one. See [12.3 The audit tool](../12-operations/03-audit-tool.md).

## Records

The newest records, 50 at a time.

| Column | Example |
|---|---|
| ✓ | This record recomputed in the last verification |
| **#** | `#233`, the sequence number |
| **Time** | `12:14:49 AM` |
| **Category** | `policy` |
| **Action** | `permission.audit.read.all:allow` |
| **Actor** | `reviewer` |
| **Hash** | `efc1c20a…` |

Click a record to expand it: its full `detail` object, its task ID (linking to the run), and its `prev_hash` and `hash`.

### Finding records

- **Search** actions, actors and task IDs; press <kbd>Enter</kbd> to search the whole log.
- **All categories ▾** narrows to one category: `agent`, `approval`, `audit`, `deliverable`, `file`, `harness`, `identity`, `knowledge`, `model`, `policy`, `security`, `skill`, `sovereignty`, `system`, `task`, `tool`, `verification`.
- **Refresh** loads anything new.

Operators and engineers (`audit.read.own`) see only records in which they are the actor.

## Export

**Export** (`audit.read.all`) downloads the full log as JSON lines, exactly as stored, for archiving or for checking on another machine with `scripts/audit_tool.py`. The export is itself audited as `audit / exported`.

> [!TIP]
> After a demonstration or an important run, note the **head hash** somewhere the host cannot write: a ticket, a printed report or a message. If the whole log were ever rewritten with fresh hashes, the heads would no longer match.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.8 · Sandbox](08-sandbox.md) | [↑ 03 · Using the workbench](README.md) | [3.10 · Keyboard and themes →](10-keyboard.md) |

<!-- nav:end -->
