# 6.5 · Writing a corpus

A retrieval system can only be as precise as the documents it retrieves from. The demonstration corpus in `sample_data/` was rewritten several times to make answers **correct and checkable**. These are the lessons, written down.

## Rules that matter

### 1 · One requirement per numbered clause

Retrieval returns passages, and citations point at their locations. If clause 5 holds a table of three severity bands, a citation to "§5" cannot tell a reader which row the answer used. Give each band its own clause (5.1 High, 5.2 Medium, 5.3 Low) and a citation to §5.2 points at text that names only the Medium authority.

> This is not hypothetical. The small model repeatedly gave a Medium finding the High row's approvers, because it read the wrong row of one combined table. Splitting the table fixed it.

### 2 · Keep every clause under about 500 characters

The reasoning prompt shows each retrieved passage cut to **500 characters** (`AgentOrchestrator._reason`). A clause longer than that reaches the model with its end missing. The old findings table was cut at *"Head of Inspec"*, and the model never saw the Low row at all.

The seed script's `--check` warns about any clause over this limit.

### 3 · Use Markdown headings that carry the clause number

The Markdown parser makes one segment per heading, and the heading becomes the location label. `### 2.2 Corrosive Service` produces citations that say **§2.2**.

### 4 · Put metadata in a header

```markdown
# SOP-INS-014 — Pressure Vessel External and Internal Inspection

> **SYNTHETIC DOCUMENT** — fictional procedure written for the AEGIS demonstration corpus.

**Document:** SOP-INS-014
**Revision:** 4.3
**Status:** SYNTHETIC
**Department:** Inspection & Integrity
**Classification:** Confidential — Internal Use Only
**Effective date:** 01 September 2026
**Supersedes:** SOP-INS-014 Rev 4.2
**Related:** SOP-INS-017, SOP-INS-021, SOP-INS-025, SOP-INS-030, SOP-MNT-022, SOP-OPS-008

## 2. Inspection Intervals

### 2.2 Corrosive Service
…
```

The seed script reads these fields and maps them to the IDs in the policy files (*Inspection & Integrity* → `inspection`, *Confidential — Internal Use Only* → `confidential`). The document code (`SOP-INS-014`) identifies the document across versions. The **Related** list declares which other documents it may cite, and `check_references` confirms that every document code mentioned in the body is declared and exists.

### 5 · Make cross-references resolve

If SOP-INS-014 §5.2 refers to SOP-OPS-008 §2.2, that clause must exist and say the same thing. The seed script checks every cross-reference. An inconsistent corpus makes a correct answer impossible and a wrong one undetectable.

### 6 · Put numbers where they can be matched

Source verification accepts a claim that shares a **figure** with its passage. "Internal inspection at intervals not exceeding 48 months" lets the answer's *48 months* be traced. Prose like "every four years" does not match "48".

### 7 · Avoid classification words in routine documents

Words like *safety*, *hazard* and *incident* in a **request** raise its sensitivity. They do not affect retrieval. But skill and harness templates built from a document's wording should not carry them.

## Check it

```bash
python scripts/seed_demo_data.py --check
```

The check validates headers, SYNTHETIC markings, revisions and cross-references, reports clause lengths, and prints how many documents and passages each account would be able to retrieve, all without writing anything.

Then use **Knowledge → Retrieval test** with the questions your users will actually ask, as each role. If the right clause is not in the top six for its question, fix the document before blaming the model.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 6.4 · Retrieval and clearance](04-retrieval-and-clearance.md) | [↑ 06 · Knowledge and retrieval](README.md) | [6.6 · Revision control →](06-revisions.md) |

<!-- nav:end -->
