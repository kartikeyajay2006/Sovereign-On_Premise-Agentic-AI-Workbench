# 6.6 · Revision control

> A question is answered from the procedure in force, not from whichever copy is semantically closest.

A document's identity is its **code** (`SOP-INS-014`), not the file it arrived in. Several revisions of one code can be in the index at once; exactly one is **active**.

## Identity

`backend/knowledge/revisions.py` reads a document's own header when it is ingested:

```markdown
**Document:** SOP-INS-014
**Revision:** 4.3
**Effective date:** 01 September 2026
**Supersedes:** SOP-INS-014 Rev 4.2
**Revision status:** Superseded      ← optional; "Withdrawn" withdraws it
```

The highest revision that is not withdrawn is **active**; the others are **superseded** and record what replaced them (`superseded_by: SOP-INS-014 Rev 4.3`). A second upload of the same revision supersedes the first, as *re-issued*. Every ingestion re-resolves the whole family, so the order files arrive in does not decide which is in force. An index built before revision control gets its codes from document titles at startup, so an old index is reconciled rather than split.

## Retrieval

| Request | Searched |
|---|---|
| Ordinary questions | Active revisions only, filtered **before ranking**, so a superseded clause cannot take a slot from the one that replaced it |
| Questions asking for history ("superseded", "previous revision", "Rev 4.1", "what changed") | Every revision; a superseded passage reaches the model labelled `[SUPERSEDED by SOP-INS-014 Rev 4.3; historical, not in force]` |

The API takes `include_history` on `POST /api/knowledge/search`. The Knowledge screen marks superseded and withdrawn documents in the documents table.

## The demonstration corpus

`sample_data/sop/archive/SOP-INS-014-rev-4.1-pressure-vessel-inspection.md` is Rev 4.1 of the vessel inspection procedure: a 36-month thickness survey for corrosive service, since shortened to 24. The seed script indexes the archive after the corpus, as superseded, and checks that each archived revision is below the one in force. Ask *"What is the thickness survey interval for corrosive service?"* and only Rev 4.3 is retrieved; ask *"What did SOP-INS-014 Rev 4.1 require?"* and Rev 4.1 is retrieved, labelled.

A record written against a superseded revision raises a **revision conflict**, settled in favour of the revision in force ([2.9](../02-concepts/09-conflicts.md)).

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 6.5 · Writing a corpus](05-corpus-authoring.md) | [↑ 06 · Knowledge and retrieval](README.md) | [07 · Agents and orchestration →](../07-agents/README.md) |

<!-- nav:end -->
