# 02 · Core concepts

> Eight ideas that explain everything AEGIS does.

Every screen, setting and API endpoint in AEGIS is an expression of a small number of ideas. Learn these and the rest of the handbook reads as detail.

| Page | The idea in one line |
|---|---|
| [2.1 Runs](01-runs.md) | Every question becomes a *run*: queued, classified, executed in stages, and closed with a status |
| [2.2 Evidence and citations](02-evidence.md) | Everything the model may rely on is registered as a numbered piece of evidence that knows where it came from |
| [2.3 Classification and clearance](03-classification.md) | Data has a class, people have a clearance, and a run is at least as sensitive as what it read |
| [2.4 Verification](04-verification.md) | The system tries to falsify its own answer before anyone treats it as final |
| [2.5 Approval](05-approval.md) | Some work waits for a named person, who cannot be the one who ran it |
| [2.6 The audit chain](06-audit.md) | Every step is appended to a log in which each record seals the one before it |
| [2.7 Sovereignty](07-sovereignty.md) | Nothing leaves the host, and the host measures that rather than asserting it |
| [2.8 Skills and harnesses](08-skills-harnesses.md) | Saved instructions, and jobs made of many governed runs |
| [2.9 Conflicts and human resolution](09-conflicts.md) | Disagreeing sources become conflict objects; a reviewer chooses; the formulas recompute |

## The principle underneath

> **Model output is untrusted until the required checks pass.**

AEGIS does not depend on the model never making a mistake. It is built to detect, contain, verify, govern and record what happened *before* an AI-generated result becomes an action. Each concept below is one part of that.

```mermaid
flowchart LR
    M[Model output] --> P[Policy] --> S[Sandbox] --> V[Verification] --> H[Human authority] --> R([Release])
    style M fill:#0b0b0c,color:#fff
    style P fill:#ff6a1a,color:#fff,stroke:#ff6a1a
    style S fill:#ff4150,color:#fff,stroke:#ff4150
    style V fill:#ff2d6f,color:#fff,stroke:#ff2d6f
    style H fill:#b23bd9,color:#fff,stroke:#b23bd9
    style R fill:#7c4dff,color:#fff,stroke:#7c4dff
```

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 1.8 · Installation troubleshooting](../01-getting-started/08-install-troubleshooting.md) | [↑ The AEGIS Handbook](../README.md) | [2.1 · Runs →](01-runs.md) |

<!-- nav:end -->
