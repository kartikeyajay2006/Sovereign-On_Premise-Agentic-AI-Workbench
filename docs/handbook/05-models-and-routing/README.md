# 05 · Models and routing

> Installed is not the same as authorised.

<div align="center">
<img src="../../assets/readme/flow-decide.svg" alt="A task is analysed, then routed through the registry, policy and resource fit to an approved model per stage" width="100%">
</div>

A run is not answered by "the model". Each **stage** (reading a scan, planning, writing code, drafting, verifying) is routed separately, to a model that is installed, approved for the run's classification, has the capabilities the stage needs, and fits in the memory the host has free.

| Page | Covers |
|---|---|
| [5.1 The model registry](01-registry.md) | Declaring models, and reconciling the declaration with what is installed |
| [5.2 How a model is chosen](02-router.md) | Rules, stage overrides, hard gates, scoring, fallbacks, a preferred model, and the reason |
| [5.3 Memory and residency](03-residency.md) | Admission, single residency, eviction, keep-alive and prewarming |
| [5.4 The Ollama client](04-ollama-client.md) | Loopback enforcement, generation options, streaming, images, usage |
| [5.5 Adding a model](05-adding-a-model.md) | A worked example, and what to check afterwards |

## The flow

```mermaid
flowchart LR
    P[Task profile] --> RU{Routing rule<br/>first match}
    ST[Stage] --> OV[Stage role +<br/>capabilities override]
    RU --> OV --> G{Hard gates}
    REG[(Registry snapshot<br/>declared × installed)] --> G
    G -- "installed · approved for class · has capabilities" --> SC[Score]
    G -- none pass --> FB{Fallback?}
    FB -- yes --> G2{Gates again} --> SC
    FB -- no --> BL([Blocked, with reason])
    SC --> PR{Preferred model<br/>among eligible?}
    PR --> W([Winner + reason])
    W --> MM[Model manager<br/>admit / evict] --> OL[Ollama]
    style BL fill:#dc2626,color:#fff,stroke:#dc2626
    style W fill:#16a34a,color:#fff,stroke:#16a34a
```

Every decision (the winner, the top six candidates with their scores and notes, whether a fallback was used, whether a preferred model was honoured and why not) is stored on the run, shown in its transcript, and audited.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 4.6 · The live event stream](../04-architecture/06-events.md) | [↑ The AEGIS Handbook](../README.md) | [5.1 · The model registry →](01-registry.md) |

<!-- nav:end -->
