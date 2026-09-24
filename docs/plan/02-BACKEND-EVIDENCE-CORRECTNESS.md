# 02 — Backend A: Evidence, Provenance & Correctness

Owner: Backend Agent A.
Roadmap items: **1–4** (Foundation), **7–10** (Correctness), **11–12** (Knowledge), **30** (orchestrator refactor).
Status: design. No source outside this file is modified by this round.

Everything below was written after reading `backend/core/schemas.py` (465 lines),
`backend/agents/orchestrator.py` (1313 lines), `backend/agents/verifier.py`,
`backend/rag/{parsing,knowledge_base}.py`, `backend/core/{analyzer,audit,database,events}.py`,
`backend/api/{task_service.py,routes/tasks.py}`, `backend/tools/registry.py`,
`backend/policy/gateway.py`, `config/prompts/prompts.yaml`, `frontend/lib/types.ts`,
`frontend/hooks/use-event-stream.ts`, `tests/{test_evidence,test_verifier_robustness,test_visual_inputs}.py`
and `requirements.txt`. Every defect below is quoted with `path:line`.

---

## 1. HONEST AUDIT — how evidence actually flows today

### 1.1 The real path, end to end

```
upload  -> TaskService.store_upload            api/task_service.py:81
        -> StoredFile row in `files`            core/database.py:43
create  -> TaskAnalyzer.analyze -> TaskProfile  api/task_service.py:236
run     -> AgentOrchestrator.run                agents/orchestrator.py:670
           1. _visual_inputs()                  :371   rasterize scans -> list[Path]
           2. _vision_extraction()              :627   ONE vision call over ALL images
           3. _record_extraction()              :419   findings -> EvidenceItem (kind=vision_extraction)
           4. _plan()                           :474
           5. file_read tool per text file      :762   -> EvidenceItem (kind=uploaded_file)
           6. knowledge_search tool             :782   -> EvidenceItem (kind=knowledge_base)
           7. _run_code_stage()                 :1020  -> EvidenceItem (kind=computation)
           8. _reason()                         :1145  evidence[:6] into the prompt
           9. verifier.check_sources()          :830   regex + token overlap
          10. _extract_calculations()           :643   LLM writes python, sandbox evals it
          11. _draft()                          :1190  evidence[:10] into the prompt
          12. _render_deliverable()             :1248
persist -> task.model_dump() -> tasks.payload TEXT     core/database.py:60-70
```

The single most important structural fact: **there is no evidence store.** Evidence exists
only as a list inside the task's JSON payload column (`core/database.py:66`, written by
`api/task_service.py:160-179`). There is no `evidence` table, no lookup by source, no lookup
by page, no content hash, and no way for anything other than the one running task to resolve
`[S3]`. `EvidenceLedger` (`agents/orchestrator.py:77-125`) is a **counter**, not a ledger — its
entire job is allocating `F1`, `F2`, `S1` so two attachments do not collide. It stores nothing
and answers no queries.

That is the gap items 2–4 exist to close, and everything else in this document depends on it.

### 1.2 Defect 1 — the scanned-PDF page cap (roadmap item 1). CONFIRMED.

`backend/rag/parsing.py:109-124`:

```python
def rasterize_pdf(
    path: Path,
    destination: Path,
    *,
    max_pages: int = 4,          # <-- parsing.py:112
    target_edge: int = 1100,
) -> list[Path]:
    ...
    Page count is capped because each page costs a full vision pass, which is
    the most expensive stage on a CPU host.
    """
```

`backend/rag/parsing.py:137`:

```python
        for index, page in enumerate(document[:max_pages]):
```

The caller never overrides it — `backend/agents/orchestrator.py:397`:

```python
                    pages = rasterize_pdf(path, workspace / "pages")
```

**How bad it is.** A 20-page scanned inspection report is read from page 1 to page 4.
Pages 5–20 are never rendered, never sent to the model, never registered, and **never
mentioned**. `_visual_inputs` appends to `limitations` only when rasterization *raises*
(`orchestrator.py:399-403`); a successful truncation appends nothing. The audit record it
writes (`orchestrator.py:406-416`) reports `"pages_rendered": len(pages)` — i.e. `4` — with no
`pages_total`, so even the audit trail cannot tell you 16 pages were dropped. The answer will
be fluent, confident, and built on 20% of the document.

It is worse than a silent cap: the behaviour is **pinned as correct by a test**.
`tests/test_visual_inputs.py:83-94`:

```python
    def test_page_count_is_capped(self, tmp_path: Path) -> None:
        """Each page costs a full vision pass, so long documents are bounded."""
        ...
        pages = rasterize_pdf(path, tmp_path / "out", max_pages=3)
        assert len(pages) == 3
```

A judge who reads the test suite sees the team asserting that dropping pages is the intended
design. This is the single most quotable defect in the repo, and it sits on the exact demo
path (scanned inspection report → corrosion calculation).

Second-order consequence: because `_visual_inputs` (`orchestrator.py:386-417`) flattens *every*
file's pages into one flat `list[Path]`, and `_vision_extraction` (`orchestrator.py:627-641`)
sends that whole list in **one** `_generate(..., images=images)` call, a task with three scans
sends up to 12 images to a local vision model in a single request. On a CPU host that is
either a timeout or a degraded read of every page. There is no batching anywhere.

### 1.3 Defect 2 — `task.files[0]` provenance (roadmap item 2). CONFIRMED, and worse than described.

`backend/agents/orchestrator.py:429`:

```python
        source = task.files[0].filename if task.files else "visual input"
```

Used for every evidence item produced in that function — `orchestrator.py:436-445` (the
unparseable-extraction case), `:448-458` (every finding), `:462-471` (the transcription):

```python
        for finding in extraction.get("findings") or []:
            ledger.add(
                EvidenceItem(
                    id="pending",
                    source_document=source,          # <-- files[0], always
                    location=str(finding.get("location") or "visual observation"),
                    excerpt=str(finding.get("description", "")),
                    classification=task.profile.sensitivity,
                    kind="vision_extraction",
                )
            )
```

The roadmap calls this "a fallback that attributes visual evidence to `task.files[0]`". It is
not a fallback. **It is the only code path.** There is no branch that ever assigns the correct
filename, because by the time `_record_extraction` runs, the connection between an image and
its source file has already been destroyed: `_visual_inputs` returns a bare `list[Path]`
(`orchestrator.py:373`) with the `StoredFile` discarded, and `_vision_extraction` returns a
single merged JSON blob with no per-image attribution (`orchestrator.py:640-641`).

**How bad it is.** Upload `vessel-V2104-scan.pdf` and `pump-P101-scan.pdf` together. Every
finding from the pump scan is filed, cited, printed in the DOCX provenance block
(`tools/deliverables.py` via `orchestrator.py:1264`) and shown in the evidence drawer as coming
from the vessel report. There is no `page`, no `bbox`, no `source_id`, no per-page confidence,
and no extraction model recorded. The roadmap's "Done when" for item 2 — *"Uploading multiple
files never causes a finding from one file to be attributed to another"* — currently fails
100% of the time with two or more visual inputs.

There is a second `files[0]` fallback, in `backend/tools/registry.py:257-259`:

```python
        stored = next((f for f in context.files if f.id == file_id), None)
        if stored is None and context.files:
            stored = context.files[0]
```

A `file_read` with a wrong or stale `file_id` silently reads a *different* document and labels
the resulting evidence with that document's name. Same class of bug, different function.

And `backend/tools/registry.py:298-309` caps a parsed document at six segments:

```python
            "evidence": [
                EvidenceItem(...).model_dump(mode="json")
                for index, segment in enumerate(parsed.segments[:6], start=1)
            ],
```

A 60-page DOCX contributes six evidence items. Which six? The first six.

### 1.4 Defect 3 — regex citations (roadmap item 3). CONFIRMED; the prefix half was just fixed in-tree.

`backend/agents/verifier.py:45` (current state — this line was widened after this audit began):

```python
CITATION_PATTERN = re.compile(r"\[(?:[SFVCE])\d+\]")
```

It previously read `r"\[(?:S|F)\d+\]"`, which meant the `V` and `C` prefixes the ledger mints
(`orchestrator.py:90-95`) were invisible to it: a claim written `"Shell course 2 measures
9.4 mm [V3]"` counted as uncited, and `check_document`'s citation requirement
(`verifier.py:328`) therefore failed on any vision-only task — exactly roadmap Demo 1. That
specific bug is now closed, and the commentary at `verifier.py:39-44` records why. Good fix;
keep it.

What it does **not** close is item 3 itself:

1. **Verification is still string matching over model prose.** The citation system is one
   regex and a set-membership test (`verifier.py:99-104`). There is no structured
   claim→evidence object anywhere in the codebase, so nothing downstream — approval, the
   deliverable provenance block, the future sovereignty certificate — can answer "which
   fragment supports this sentence" except by re-running a regex.
2. **The prefix list is a literal that must be hand-maintained.** `E` is in the pattern as a
   fallback for `EvidenceLedger.PREFIXES.get(item.kind, "E")` (`orchestrator.py:112`). Adding
   `X` (sandbox) or `H` (human) evidence means remembering to edit a regex in another module.
   §2.7 derives the prefix class from `EvidenceType` so the two cannot drift.
3. **A citation still cannot be wrong.** `_claim_supported` (`verifier.py:99-104`) accepts any
   cited id that exists in the evidence list, with no check that the cited evidence has
   anything to do with the claim. Citing `[S1]` after an invented sentence marks it supported.

### 1.5 Defect 4 — "support" is token overlap. Not in the roadmap by name; the worst of them.

`backend/agents/verifier.py:96-124`:

```python
        numbers = set(NUMBER_PATTERN.findall(claim))
        if numbers:
            for item in evidence:
                if numbers & set(NUMBER_PATTERN.findall(item.excerpt)):
                    return True, [item.id]

        tokens = {
            word.lower()
            for word in re.findall(r"[A-Za-z][A-Za-z\-]{4,}", claim)
        }
        if tokens:
            for item in evidence:
                excerpt_tokens = {...}
                overlap = tokens & excerpt_tokens
                if len(overlap) >= max(3, int(len(tokens) * 0.35)):
                    return True, [item.id]
```

A claim is "supported by local evidence" if it shares **any single number** with any excerpt,
or **three words of five-plus letters** with any excerpt. A hallucinated sentence about
"corrosion", "thickness" and "inspection" is supported by any inspection document in the
ledger. `material_claims_supported` on the task record — the number the UI prints — is
measuring lexical similarity and calling it provenance.

This is the metric a judge will ask about. It must not survive to stage 2.

### 1.6 Defect 5 — calculation checking executes model-authored source

`backend/agents/verifier.py:190-203`:

```python
        for index, calculation in enumerate(calculations):
            expression = str(calculation.get("expression", "")).strip()
            ...
            program_lines.append(f"    value = ({expression})")
```

`expression` comes from an LLM (`orchestrator.py:643-667` via the `extract_calculations`
prompt at `config/prompts/prompts.yaml:147`). It is interpolated into a Python program and
executed. The AST guard in `backend/tools/sandbox.py:101` is the only thing between a model's
output and `exec`. Even setting security aside, this is not verification — it is asking the
model to mark its own homework in a language it also wrote. Item 7 exists to replace it.

### 1.7 Defect 6 — evidence is truncated on the way into every prompt

`backend/agents/orchestrator.py:1167-1172`:

```python
        evidence_block = "\n\n".join(
            f"[{item.id}] {item.source_document}"
            ...
            for item in evidence[:6]
        ) or "No local evidence was retrieved."
```

`backend/agents/orchestrator.py:1210-1215` does the same with `evidence[:10]`, and
`orchestrator.py:1041-1042` with `ledger.items[:4]`. The model is asked to cite `[S9]` while
never being shown `S9`. Any claim resting on the 7th item is unciteable by construction, and
then scored as unsupported. The truncation is nowhere surfaced as a limitation.

### 1.8 Defect 7 — clearance filtering happens after retrieval

`backend/tools/registry.py:231-240`:

```python
        results, mode, took_ms = await self.knowledge_base.search(
            query, top_k=arguments.get("top_k"), departments=departments
        )
        # Never hand back evidence above the user's clearance.
        permitted = [
            item
            for item in results
            if self.config.classification_rank(item.classification.value)
            <= self.config.classification_rank(context.user.max_data_classification.value)
        ]
```

Restricted chunks are loaded into the API process, ranked, and *then* dropped. The comment is
accurate about the outcome and wrong about the mechanism. Item 11 requires the filter to run
**before** evidence reaches the model; it should run before it reaches the process. Worse,
the `top_k` cut happens inside `search()` (`rag/knowledge_base.py:326-331`) *before* this
filter, so a user whose clearance excludes the top 6 hits gets zero results while lower-ranked
permitted passages existed.

### 1.9 Defect 8 — a document revision is an unrelated document

`backend/rag/knowledge_base.py:154-155`:

```python
        sha = hashlib.sha256(raw).hexdigest()
        document_id = hashlib.sha256(f"{path.name}:{sha}".encode()).hexdigest()[:24]
```

Document identity is derived from content hash. Ingesting `SOP-INS-014 Rev 4` after
`SOP-INS-014 Rev 3` creates a second, unrelated document. Both are retrievable, neither
supersedes the other, `version` is a free-text column set by the caller (`:143`), and
retrieval has no notion of ACTIVE. The system will happily answer from a superseded procedure
and cite it as authority. This is roadmap item 12's entire premise, confirmed in one line.

### 1.10 Smaller things that will not survive questioning

| Where | What |
|---|---|
| `orchestrator.py:398` | `except (ParsingError, Exception) as exc:` — the tuple is decorative; it catches everything, including `KeyboardInterrupt`-adjacent failures, as "could not be rendered". |
| `orchestrator.py:100-104` | Ledger recovery parses IDs by splitting alphabetic and numeric characters. `S12` works; any future `PID-3` or `V2b` silently resets a counter and reissues a live ID. |
| `orchestrator.py:1132-1142` | Sandbox stdout is registered as `kind="computation"` evidence with `source_document="sandbox execution"` — no code hash, no exit code in the content, no link to the `ToolCall.id` that produced it. |
| `verifier.py:229` | When the model asserts no expected value, the entry is marked `matched: True` and counted as verified. Computing a number nobody claimed is scored as agreement. |
| `core/database.py` | No `evidence` table. No `claims`. No `conflicts`. No `calculations`. Everything material is a blob in `tasks.payload`. |
| `orchestrator.py:1264` | Evidence is passed to the deliverable renderer as a dumped list, so the printed provenance block inherits every defect above verbatim into the signed artifact. |

### 1.11 What is genuinely good and must be preserved

- `EvidenceLedger` owning ID allocation centrally (`orchestrator.py:77`) — the *idea* is right;
  it just needs to become a real store. `tests/test_evidence.py` pins the collision behaviour
  and those tests should keep passing unchanged.
- `_visual_inputs`' text-vs-scan routing (`orchestrator.py:395`, `parsing.py:93`) — correct and
  cheap. Keep it, make it per page.
- `_coerce_number` (`verifier.py:43`) and its test suite — defensive parsing of model output is
  exactly right. It moves, it does not die.
- Failing a *check* rather than the *task* (`orchestrator.py:824-839`) — the fail-safe comment
  there is the product's conscience. The new verifier inherits the rule.
- Stage events already exist and the frontend already consumes a fixed list
  (`frontend/hooks/use-event-stream.ts:56-72`). The refactor adds events; it removes none.

---

## 2. THE UNIFIED EVIDENCE LEDGER (items 2, 3, 4) — the keystone

New package `backend/evidence/`:

```
backend/evidence/__init__.py
backend/evidence/models.py       Evidence, EvidenceType, Modality, EvidenceLocation, BoundingBox, EvidenceDraft
backend/evidence/ledger.py       EvidenceLedger — register / lookup / prompt projection / persistence
backend/evidence/provenance.py   hashing, source binding, the "no evidence without a source" rule
backend/evidence/citations.py    render + parse citation labels; UI-only, never authoritative
backend/evidence/store.py        SQLite DAO (kept separate so core/database.py stays a thin schema owner)
```

### 2.1 `backend/evidence/models.py`

```python
"""The canonical evidence record.

One Evidence row is one thing the system read, computed, executed or was told,
bound to exactly one source location and hashed so a report can prove which
fragment it used. Nothing may enter reasoning without becoming one of these.
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.core.schemas import Sensitivity


class EvidenceType(str, Enum):
    DOCUMENT = "document"        # a chunk retrieved from the knowledge base      -> S
    FILE = "file"                # a parsed segment of an attachment             -> F
    VISION = "vision"            # what a vision model read from one page/region  -> V
    CALCULATION = "calculation"  # a deterministic formula execution              -> C
    EXECUTION = "execution"      # a sandbox run                                  -> X
    HUMAN = "human"              # an assertion a named person made               -> H


ID_PREFIX: dict[EvidenceType, str] = {
    EvidenceType.DOCUMENT: "S",
    EvidenceType.FILE: "F",
    EvidenceType.VISION: "V",
    EvidenceType.CALCULATION: "C",
    EvidenceType.EXECUTION: "X",
    EvidenceType.HUMAN: "H",
}
PREFIX_TYPE: dict[str, EvidenceType] = {v: k for k, v in ID_PREFIX.items()}


class Modality(str, Enum):
    TEXT = "text"
    TABLE = "table"
    IMAGE = "image"
    NUMERIC = "numeric"
    GRAPH = "graph"          # reserved for item 16 (P&ID); Backend B owns the producer


class DocumentStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    SUPERSEDED = "superseded"
    EXPIRED = "expired"


class BoundingBox(BaseModel):
    """A region on a rendered page, in PDF points, origin top-left.

    ``page_width``/``page_height`` travel with the box so the viewer can scale
    it onto whatever raster it is showing without re-deriving the transform.
    """

    model_config = ConfigDict(frozen=True)

    x0: float
    y0: float
    x1: float
    y1: float
    page_width: float
    page_height: float

    def normalized(self) -> tuple[float, float, float, float]:
        w = self.page_width or 1.0
        h = self.page_height or 1.0
        return (self.x0 / w, self.y0 / h, self.x1 / w, self.y1 / h)


class EvidenceLocation(BaseModel):
    """Where in the source this evidence is. Every field optional; ``label``
    renders whatever is present, so the UI never has to branch."""

    model_config = ConfigDict(frozen=True)

    filename: str | None = None
    page: int | None = None
    page_count: int | None = None
    bbox: BoundingBox | None = None
    section: str | None = None
    sheet: str | None = None
    cell_range: str | None = None
    ordinal: int | None = None          # chunk ordinal within the document
    line_range: tuple[int, int] | None = None

    def label(self) -> str:
        parts: list[str] = []
        if self.page is not None:
            parts.append(f"page {self.page}")
        if self.section:
            parts.append(f"section: {self.section}")
        if self.sheet:
            parts.append(f"sheet '{self.sheet}'")
        if self.cell_range:
            parts.append(self.cell_range)
        if self.bbox is not None:
            parts.append("region")
        if not parts and self.ordinal is not None:
            parts.append(f"part {self.ordinal}")
        return ", ".join(parts) or "whole document"


class Evidence(BaseModel):
    """Immutable once registered. Corrections register a new item that
    ``supersedes`` the old one; nothing is edited in place, because a report
    that cited S4 must still be able to resolve S4."""

    model_config = ConfigDict(frozen=True)

    # -- identity
    id: str                                   # S12, F4, V9, C3, X2, H1 — unique per task
    task_id: str
    type: EvidenceType
    modality: Modality

    # -- provenance
    source_id: str                            # StoredFile.id | revision id | formula id | ToolCall.id | User.id
    source_kind: Literal[
        "upload", "knowledge_revision", "formula", "sandbox", "human"
    ]
    filename: str | None = None
    location: EvidenceLocation = Field(default_factory=EvidenceLocation)
    source_sha256: str | None = None          # hash of the WHOLE source artifact
    content_sha256: str                       # hash of THIS fragment's content

    # -- payload
    content: str
    structured: dict[str, Any] | None = None  # findings, table rows, calculation record

    # -- quality
    confidence: float = Field(ge=0.0, le=1.0, default=1.0)
    extraction_method: str                    # "pypdf", "pymupdf-raster+vision", "openpyxl",
                                              # "fts5-bm25", "dense-cosine", "formula:corrosion.remaining_life@1.0.0"
    extraction_model: str | None = None       # ModelDescriptor.id when a model produced it
    extraction_model_digest: str | None = None

    # -- governance
    classification: Sensitivity = Sensitivity.NORMAL
    department: str | None = None
    document_id: str | None = None            # stable identity, NOT the file hash
    revision: str | None = None
    effective_date: date | None = None
    document_status: DocumentStatus | None = None
    superseded_by_document: str | None = None
    equipment_tags: list[str] = Field(default_factory=list)

    # -- retrieval
    retrieval_score: float | None = None
    retrieval_rank: int | None = None
    retrieval_channel: Literal["lexical", "dense", "fused", "n/a"] | None = None

    # -- graph
    derived_from: list[str] = Field(default_factory=list)   # evidence ids this was computed from
    supersedes: str | None = None

    # -- security hook (Backend B owns the producer; the field lives here)
    injection_risk: Literal["none", "low", "medium", "high"] = "none"
    quarantined: bool = False

    registered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # -- legacy bridge, removed one release after the frontend migrates
    @property
    def kind(self) -> str:
        return {
            EvidenceType.DOCUMENT: "knowledge_base",
            EvidenceType.FILE: "uploaded_file",
            EvidenceType.VISION: "vision_extraction",
            EvidenceType.CALCULATION: "computation",
            EvidenceType.EXECUTION: "computation",
            EvidenceType.HUMAN: "human",
        }[self.type]

    @property
    def citation(self) -> str:
        return f"[{self.id}]"

    def excerpt(self, limit: int = 500) -> str:
        return self.content[:limit]

    @model_validator(mode="after")
    def _prefix_matches_type(self) -> "Evidence":
        expected = ID_PREFIX[self.type]
        if not self.id.startswith(expected):
            raise ValueError(
                f"evidence id '{self.id}' does not carry the '{expected}' prefix "
                f"required by type {self.type.value}"
            )
        return self


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class EvidenceDraft(BaseModel):
    """What a producer hands the ledger. The ledger assigns ``id``,
    ``content_sha256`` and ``registered_at``; a producer cannot forge them."""

    type: EvidenceType
    modality: Modality
    source_id: str
    source_kind: Literal["upload", "knowledge_revision", "formula", "sandbox", "human"]
    content: str
    filename: str | None = None
    location: EvidenceLocation = Field(default_factory=EvidenceLocation)
    source_sha256: str | None = None
    structured: dict[str, Any] | None = None
    confidence: float = Field(ge=0.0, le=1.0, default=1.0)
    extraction_method: str
    extraction_model: str | None = None
    extraction_model_digest: str | None = None
    classification: Sensitivity = Sensitivity.NORMAL
    department: str | None = None
    document_id: str | None = None
    revision: str | None = None
    effective_date: date | None = None
    document_status: DocumentStatus | None = None
    superseded_by_document: str | None = None
    equipment_tags: list[str] = Field(default_factory=list)
    retrieval_score: float | None = None
    retrieval_rank: int | None = None
    retrieval_channel: Literal["lexical", "dense", "fused", "n/a"] | None = None
    derived_from: list[str] = Field(default_factory=list)
    supersedes: str | None = None
    injection_risk: Literal["none", "low", "medium", "high"] = "none"
    quarantined: bool = False
```

**Why `frozen=True`.** Today `EvidenceLedger.add` mutates `item.id` after construction
(`orchestrator.py:113`). That is how `tools/registry.py:300` can issue `F1` and have it
silently overwritten. With a draft/record split the producer never names anything, so the
collision class disappears structurally rather than by convention.

### 2.2 Stable ID schemes

| Type | Prefix | Example | Allocated when |
|---|---|---|---|
| DOCUMENT | `S` | `S12` | a knowledge-base chunk survives policy + metadata filtering |
| FILE | `F` | `F4` | a parser emits one addressable segment of an attachment |
| VISION | `V` | `V9` | a vision model returns one finding, table or page transcription |
| CALCULATION | `C` | `C3` | the formula registry executes one formula |
| EXECUTION | `X` | `X2` | the sandbox completes one run (ok or not) |
| HUMAN | `H` | `H1` | a reviewer records an assertion, override or resolution |

IDs are `{prefix}{n}` with `n` monotonic per prefix **per task**, never reused, never
renumbered. They are stable for the life of the task and are what citations, claims, conflicts,
calculations, the deliverable provenance block and the sovereignty certificate all reference.
Globally, an evidence row is keyed `(task_id, id)`; the API exposes the opaque
`uid = f"{task_id}:{id}"` for cross-task links.

`X` replaces today's practice of filing sandbox output as `kind="computation"` alongside real
calculations (`orchestrator.py:1140`). Execution output and a verified formula result are not
the same class of thing and must not share a prefix.

### 2.3 `backend/evidence/provenance.py`

```python
"""Source binding and hashing.

The rule this module exists to enforce: an Evidence record may not be created
without a resolvable source. 'visual input' is not a source. task.files[0] is
not a source. A source is a StoredFile id, a knowledge revision id, a formula
id, a ToolCall id, or a User id.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from backend.core.schemas import StoredFile
from backend.evidence.models import (
    EvidenceDraft,
    EvidenceLocation,
    EvidenceType,
    Modality,
)


class ProvenanceError(ValueError):
    """Raised when a producer cannot name where something came from."""


def file_sha256(path: Path, *, chunk: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(chunk):
            digest.update(block)
    return digest.hexdigest()


def from_file_segment(
    stored: StoredFile,
    *,
    text: str,
    location: EvidenceLocation,
    parser: str,
) -> EvidenceDraft:
    """One parsed segment of one attachment. The StoredFile is required, so the
    filename can never drift from the bytes that produced the text."""
    if not stored.id:
        raise ProvenanceError("a FILE evidence draft requires a StoredFile with an id")
    return EvidenceDraft(
        type=EvidenceType.FILE,
        modality=Modality.TABLE if location.sheet else Modality.TEXT,
        source_id=stored.id,
        source_kind="upload",
        filename=stored.filename,
        location=location.model_copy(update={"filename": stored.filename}),
        source_sha256=stored.sha256,
        content=text,
        confidence=1.0,                       # text extraction is exact or it failed
        extraction_method=parser,
        classification=stored.classification,
        department=stored.department,
    )


def from_vision_page(
    stored: StoredFile,
    *,
    page: int,
    page_count: int,
    text: str,
    model_id: str,
    confidence: float,
    structured: dict | None = None,
    bbox: "BoundingBox | None" = None,
    page_size: tuple[float, float] | None = None,
) -> EvidenceDraft:
    """What a vision model read from ONE page of ONE file.

    ``stored`` and ``page`` are both mandatory. This signature is the fix for
    orchestrator.py:429 — there is no way to construct vision evidence without
    naming the file and the page it came from.
    """
    if page < 1:
        raise ProvenanceError("vision evidence must carry a 1-based page number")
    return EvidenceDraft(
        type=EvidenceType.VISION,
        modality=Modality.IMAGE if bbox is not None else Modality.TEXT,
        source_id=stored.id,
        source_kind="upload",
        filename=stored.filename,
        location=EvidenceLocation(
            filename=stored.filename,
            page=page,
            page_count=page_count,
            bbox=bbox,
        ),
        source_sha256=stored.sha256,
        content=text,
        structured=structured,
        confidence=confidence,
        extraction_method="pymupdf-raster+vision",
        extraction_model=model_id,
    )
```

`from_retrieved_chunk`, `from_calculation`, `from_sandbox_run` and `from_human` follow the same
shape and are given in §4.4, §5.5 and §7.3 where their producers are defined.

### 2.4 `backend/evidence/ledger.py` — the API surface

```python
"""The unified evidence ledger.

Central dependency for reasoning, verification, approval and audit. Every
producer registers here; every consumer resolves here. Nothing else allocates
an evidence identifier.
"""

from __future__ import annotations

import threading
from collections import defaultdict
from typing import Iterable, Sequence

from backend.evidence.models import (
    Evidence,
    EvidenceDraft,
    EvidenceType,
    ID_PREFIX,
    content_hash,
)
from backend.evidence.store import EvidenceStore, get_evidence_store


class EvidenceLedger:
    """One instance per task run. Writes through to the store on every
    registration, so evidence gathered before a failure survives that failure
    and is queryable without replaying the task."""

    def __init__(
        self,
        task_id: str,
        *,
        store: EvidenceStore | None = None,
        existing: Sequence[Evidence] | None = None,
    ) -> None:
        self.task_id = task_id
        self._store = store or get_evidence_store()
        self._items: list[Evidence] = list(existing or self._store.by_task(task_id))
        self._by_id: dict[str, Evidence] = {item.id: item for item in self._items}
        self._counters: dict[str, int] = defaultdict(int)
        self._lock = threading.Lock()
        for item in self._items:
            prefix = ID_PREFIX[item.type]
            suffix = item.id[len(prefix):]
            if suffix.isdigit():
                self._counters[prefix] = max(self._counters[prefix], int(suffix))

    # -- writing -----------------------------------------------------------
    def register(self, draft: EvidenceDraft) -> Evidence:
        """Assign an identifier, hash the content, persist, return the record."""
        with self._lock:
            prefix = ID_PREFIX[draft.type]
            self._counters[prefix] += 1
            evidence = Evidence(
                id=f"{prefix}{self._counters[prefix]}",
                task_id=self.task_id,
                content_sha256=content_hash(draft.content),
                **draft.model_dump(exclude={"content"}),
                content=draft.content,
            )
            self._items.append(evidence)
            self._by_id[evidence.id] = evidence
        self._store.insert(evidence)
        return evidence

    def register_many(self, drafts: Iterable[EvidenceDraft]) -> list[Evidence]:
        return [self.register(draft) for draft in drafts]

    # -- lookup ------------------------------------------------------------
    def get(self, evidence_id: str) -> Evidence | None:
        return self._by_id.get(evidence_id)

    def resolve(self, ids: Iterable[str]) -> list[Evidence]:
        """Ids that do not exist are dropped, and the caller is told which.
        Used by the claim mapper so a model-invented '[S47]' cannot become
        support for anything."""
        return [self._by_id[i] for i in ids if i in self._by_id]

    def unknown(self, ids: Iterable[str]) -> list[str]:
        return [i for i in ids if i not in self._by_id]

    def by_type(self, *types: EvidenceType) -> list[Evidence]:
        wanted = set(types)
        return [item for item in self._items if item.type in wanted]

    def by_source(self, source_id: str) -> list[Evidence]:
        return [item for item in self._items if item.source_id == source_id]

    def by_page(self, filename: str, page: int) -> list[Evidence]:
        return [
            item
            for item in self._items
            if item.filename == filename and item.location.page == page
        ]

    def by_document(self, document_id: str) -> list[Evidence]:
        return [item for item in self._items if item.document_id == document_id]

    def pages_covered(self, filename: str) -> set[int]:
        return {
            item.location.page
            for item in self._items
            if item.filename == filename and item.location.page is not None
        }

    @property
    def items(self) -> list[Evidence]:
        return list(self._items)

    def __len__(self) -> int:
        return len(self._items)

    # -- projection into prompts -------------------------------------------
    def prompt_block(
        self,
        *,
        types: Sequence[EvidenceType] | None = None,
        budget_chars: int = 12000,
        per_item_chars: int = 700,
    ) -> tuple[str, list[str], list[str]]:
        """Render the evidence the model is allowed to cite.

        Returns ``(block, included_ids, omitted_ids)``. The omitted list is not
        cosmetic: it becomes a task limitation, which is the thing
        orchestrator.py:1171 does not do when it slices ``evidence[:6]``.
        """
        pool = self.by_type(*types) if types else self.items
        pool = [item for item in pool if not item.quarantined]
        pool.sort(key=_evidence_priority, reverse=True)

        lines: list[str] = []
        included: list[str] = []
        omitted: list[str] = []
        used = 0
        for item in pool:
            head = f"[{item.id}] {item.filename or item.document_id or item.source_id}"
            loc = item.location.label()
            if loc:
                head += f" — {loc}"
            if item.document_status is not None and item.document_status.value != "active":
                head += f" — {item.document_status.value.upper()} revision {item.revision}"
            body = item.excerpt(per_item_chars)
            entry = f"{head}\n{body}"
            if used + len(entry) > budget_chars and included:
                omitted.append(item.id)
                continue
            lines.append(entry)
            included.append(item.id)
            used += len(entry)
        block = "\n\n".join(lines) or "No local evidence was gathered for this task."
        return block, included, omitted


def _evidence_priority(item: Evidence) -> tuple:
    """Calculations and human assertions first, then high-confidence direct
    reads, then retrieval by score. Deterministic: no ties broken by dict order."""
    type_rank = {
        EvidenceType.CALCULATION: 5,
        EvidenceType.HUMAN: 4,
        EvidenceType.VISION: 3,
        EvidenceType.FILE: 3,
        EvidenceType.DOCUMENT: 2,
        EvidenceType.EXECUTION: 1,
    }[item.type]
    return (type_rank, item.retrieval_score or 0.0, item.confidence, -len(item.id), item.id)
```

### 2.5 `backend/evidence/store.py` and the schema addition

Append to `SCHEMA` in `backend/core/database.py` (after the `knowledge_chunks` block at
`core/database.py:89-100`):

```sql
CREATE TABLE IF NOT EXISTS evidence (
    task_id            TEXT NOT NULL,
    id                 TEXT NOT NULL,
    type               TEXT NOT NULL,
    modality           TEXT NOT NULL,
    source_id          TEXT NOT NULL,
    source_kind        TEXT NOT NULL,
    filename           TEXT,
    page               INTEGER,
    bbox               TEXT,
    location           TEXT NOT NULL,
    source_sha256      TEXT,
    content_sha256     TEXT NOT NULL,
    content            TEXT NOT NULL,
    structured         TEXT,
    confidence         REAL NOT NULL,
    extraction_method  TEXT NOT NULL,
    extraction_model   TEXT,
    classification     TEXT NOT NULL,
    department         TEXT,
    document_id        TEXT,
    revision           TEXT,
    effective_date     TEXT,
    document_status    TEXT,
    equipment_tags     TEXT NOT NULL DEFAULT '[]',
    retrieval_score    REAL,
    retrieval_rank     INTEGER,
    retrieval_channel  TEXT,
    derived_from       TEXT NOT NULL DEFAULT '[]',
    supersedes         TEXT,
    injection_risk     TEXT NOT NULL DEFAULT 'none',
    quarantined        INTEGER NOT NULL DEFAULT 0,
    registered_at      TEXT NOT NULL,
    PRIMARY KEY (task_id, id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_task     ON evidence(task_id);
CREATE INDEX IF NOT EXISTS idx_evidence_source   ON evidence(task_id, source_id);
CREATE INDEX IF NOT EXISTS idx_evidence_page     ON evidence(task_id, filename, page);
CREATE INDEX IF NOT EXISTS idx_evidence_type     ON evidence(task_id, type);
CREATE INDEX IF NOT EXISTS idx_evidence_document ON evidence(document_id);
CREATE INDEX IF NOT EXISTS idx_evidence_chash    ON evidence(content_sha256);
```

`CREATE TABLE IF NOT EXISTS` makes this a no-op migration on an existing database — the
schema is already applied idempotently at `core/database.py:136-138`. Tasks created before the
migration keep working: `Task.evidence` still round-trips through `tasks.payload`, and the
ledger falls back to the payload when `by_task()` returns empty.

`EvidenceStore` is a narrow DAO: `insert(evidence)`, `by_task(task_id)`, `get(task_id, id)`,
`by_source`, `by_page`, `by_content_hash`, `count()`. It lives in `backend/evidence/store.py`
rather than growing `core/database.py`, which is already 424 lines and deliberately narrow
(`core/database.py:5-8`).

### 2.6 How evidence IDs reach prompts and the verifier

Three rules, enforced in code rather than in prose:

**(a) The prompt block is the citable universe.** `ledger.prompt_block()` returns the block
*and* `included_ids`. The reasoning stage passes `included_ids` forward in `WorkflowContext`.
Any citation the model emits outside that set is, by definition, invented — the claim mapper
knows this without guessing, because it has the allow-list.

`config/prompts/prompts.yaml` → `reason_with_evidence` changes only at line 119-120:

```yaml
    Answer using only the material above. After every factual, numerical or
    procedural statement, cite the exact identifiers in square brackets, e.g.
    [S1] or [V3] or [C1]. Cite every identifier you relied on, and cite only
    identifiers that appear above. If nothing above supports a statement you
    would like to make, do not make it.
```

That is the *only* prompt-side change. The system does not depend on the model complying —
citations are a hint, not the verification mechanism (rule c).

**(b) Structured links, not strings.** The drafting stage additionally requests a claim
manifest (`config/prompts/prompts.yaml` → new `task.claim_manifest`) returning
`{"claims":[{"text": "...", "type": "numerical", "evidence_ids": ["V3","C1"]}]}`. Those are
`ClaimEvidenceLink` objects (§5.2) from the moment they arrive.

**(c) Verification recomputes the mapping independently.** `backend/verification/evidence_mapper.py`
maps every claim to evidence *without* using the model's citations, then compares. A cited ID
that the mapper also finds is `CITED_AND_CONFIRMED`; one the mapper rejects is
`CITED_BUT_UNSUPPORTED`; one the mapper finds that the model did not cite is `UNCITED_SUPPORT`.
This is the structural replacement for `CITATION_PATTERN` at `verifier.py:39`.

### 2.7 `backend/evidence/citations.py` — labels are UI

```python
"""Citation rendering and parsing.

Deliberately thin, and deliberately NOT authoritative. Verification operates on
ClaimEvidenceLink objects; this module exists so the UI and the DOCX renderer
can turn an id into a label and a label back into an id. The regex here never
decides whether a claim is supported.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from backend.evidence.models import PREFIX_TYPE, Evidence

CITATION_RE = re.compile(r"\[([SFVCXH])(\d{1,4})\]")


@dataclass(frozen=True)
class ParsedCitation:
    evidence_id: str
    start: int
    end: int


def render(evidence: Evidence) -> str:
    return f"[{evidence.id}]"


def parse(text: str) -> list[ParsedCitation]:
    """Every citation marker in the text, with its span, so the UI can make
    them clickable. Order preserved; duplicates preserved."""
    return [
        ParsedCitation(evidence_id=f"{m.group(1)}{m.group(2)}", start=m.start(), end=m.end())
        for m in CITATION_RE.finditer(text or "")
    ]


def strip(text: str) -> str:
    """Prose without markers, for lexical matching where the markers are noise."""
    return CITATION_RE.sub("", text or "")
```

Note the prefix class now covers all six types — the `S|F`-only bug at `verifier.py:39` cannot
recur because the prefix set is derived from `PREFIX_TYPE`, which is derived from
`EvidenceType`.

### 2.8 Producers that must be converted

| Producer | Today | After |
|---|---|---|
| `tools/registry.py:298-309` `file_read` | `EvidenceItem(id=f"F{index}")`, `segments[:6]` | `provenance.from_file_segment` per segment, **no cap**, ledger assigns ids |
| `tools/registry.py:241-251` `knowledge_search` | dumped `EvidenceItem` list | `from_retrieved_chunk` with revision/status/tags (§7) |
| `orchestrator.py:419-471` `_record_extraction` | `files[0]`, merged blob | deleted; replaced by `VisionStage` (§3.5) registering per page |
| `orchestrator.py:1132-1142` sandbox stdout | `kind="computation"` | `from_sandbox_run` → `EvidenceType.EXECUTION`, carries code hash + exit code |
| `orchestrator.py:857-871` recomputed figures | `kind="computation"` | `from_calculation` → `EvidenceType.CALCULATION` (§4.4) |
| approval decision | not evidence at all | `from_human` → `EvidenceType.HUMAN` (`H1`), so the certificate can prove who said yes |

`tests/test_evidence.py` keeps passing after a one-line import change plus constructing
`EvidenceDraft` instead of `EvidenceItem`: the properties it pins (distinct ids, meaningful
prefixes, no reissue on resume) are exactly the ledger's contract.

---

## 3. PDF COMPLETENESS (item 1)

Goal restated precisely: **every page of every PDF is accounted for, by exactly one method,
and is registered as its own evidence record before any reasoning happens.** No total cap.

### 3.1 Per-page text-vs-raster detection

Replace the whole-document `has_extractable_text` (`parsing.py:93-106`) with a per-page
profile. Keep the old function as a thin wrapper so `orchestrator.py:395` and
`tests/test_visual_inputs.py:66,69,100` keep working during migration.

```python
# backend/rag/parsing.py  (additions)

from dataclasses import dataclass, field


@dataclass(frozen=True)
class PageProfile:
    """What one PDF page is, decided from the page itself rather than from a
    whole-document average. A 20-page scan with a born-digital cover sheet is
    the case that breaks document-level detection."""

    page: int
    char_count: int
    word_count: int
    image_count: int
    image_area_ratio: float      # 0..1, fraction of the page covered by raster images
    width: float
    height: float
    method: Literal["text", "vision"]
    reason: str


@dataclass
class PdfProfile:
    path: Path
    page_count: int
    pages: list[PageProfile]
    warnings: list[str] = field(default_factory=list)

    @property
    def text_pages(self) -> list[PageProfile]:
        return [p for p in self.pages if p.method == "text"]

    @property
    def vision_pages(self) -> list[PageProfile]:
        return [p for p in self.pages if p.method == "vision"]


# Thresholds live in config/app.yaml -> parsing:, not here.
MIN_TEXT_CHARS_PER_PAGE = 80
AMBIGUOUS_TEXT_CHARS = 260
DOMINANT_IMAGE_RATIO = 0.55


def profile_pdf_pages(path: Path) -> PdfProfile:
    """Decide, page by page, whether text extraction suffices.

    Uses PyMuPDF for both signals so one open covers text and image geometry;
    pypdf cannot report image coverage.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError as exc:  # pragma: no cover
        raise ParsingError(
            "PyMuPDF is not installed, so PDF pages cannot be profiled. "
            "Install it with: pip install PyMuPDF"
        ) from exc

    profiles: list[PageProfile] = []
    warnings: list[str] = []
    with fitz.open(str(path)) as document:
        for index, page in enumerate(document, start=1):
            try:
                text = page.get_text("text") or ""
            except Exception as exc:
                text = ""
                warnings.append(f"page {index}: text extraction failed ({exc})")

            rect = page.rect
            page_area = float(rect.width * rect.height) or 1.0
            image_area = 0.0
            image_count = 0
            try:
                for info in page.get_image_info():
                    bbox = info.get("bbox")
                    if not bbox:
                        continue
                    image_count += 1
                    x0, y0, x1, y1 = bbox
                    image_area += abs((x1 - x0) * (y1 - y0))
            except Exception as exc:
                warnings.append(f"page {index}: image geometry unavailable ({exc})")

            ratio = min(1.0, image_area / page_area)
            chars = len(text.strip())
            words = len(text.split())

            if chars < MIN_TEXT_CHARS_PER_PAGE:
                method, reason = "vision", f"only {chars} extractable characters"
            elif chars < AMBIGUOUS_TEXT_CHARS and ratio >= DOMINANT_IMAGE_RATIO:
                method, reason = (
                    "vision",
                    f"{chars} characters but {ratio:.0%} of the page is raster imagery",
                )
            else:
                method, reason = "text", f"{chars} extractable characters"

            profiles.append(
                PageProfile(
                    page=index,
                    char_count=chars,
                    word_count=words,
                    image_count=image_count,
                    image_area_ratio=round(ratio, 4),
                    width=float(rect.width),
                    height=float(rect.height),
                    method=method,  # type: ignore[arg-type]
                    reason=reason,
                )
            )

    return PdfProfile(
        path=path, page_count=len(profiles), pages=profiles, warnings=warnings
    )


def has_extractable_text(path: Path, *, minimum_chars: int = 120) -> bool:
    """Retained for callers that still ask the document-level question.

    Now answered from the page profile: a document has extractable text when a
    majority of its pages do. The old implementation parsed the whole PDF with
    pypdf and summed characters, so one text-bearing cover page made a 19-page
    scan look born-digital.
    """
    if path.suffix.lower() != ".pdf":
        return True
    try:
        profile = profile_pdf_pages(path)
    except ParsingError:
        return False
    if not profile.pages:
        return False
    return len(profile.text_pages) * 2 >= profile.page_count
```

### 3.2 Rasterization with no total cap

```python
@dataclass(frozen=True)
class RenderedPage:
    page: int
    path: Path
    width: float          # source page width in points
    height: float
    raster_width: int
    raster_height: int
    scale: float


def rasterize_pages(
    path: Path,
    destination: Path,
    pages: Sequence[int],
    *,
    target_edge: int = 1100,
) -> list[RenderedPage]:
    """Render exactly the pages asked for. No cap, no silent truncation.

    The previous signature took ``max_pages: int = 4`` and sliced the document
    (parsing.py:112,137). Callers now pass the page list they intend to read,
    which is produced by profile_pdf_pages(), so the decision to skip a page is
    always explicit and always recorded.
    """
    try:
        import fitz
    except ImportError as exc:  # pragma: no cover
        raise ParsingError(
            "PyMuPDF is not installed, so scanned PDFs cannot be rendered for "
            "the vision model. Install it with: pip install PyMuPDF"
        ) from exc

    destination.mkdir(parents=True, exist_ok=True)
    rendered: list[RenderedPage] = []
    wanted = sorted(set(int(p) for p in pages))

    with fitz.open(str(path)) as document:
        for number in wanted:
            if number < 1 or number > document.page_count:
                raise ParsingError(
                    f"page {number} is outside '{path.name}' (1..{document.page_count})"
                )
            page = document[number - 1]
            rect = page.rect
            longest = max(rect.width, rect.height) or 1
            scale = target_edge / longest
            pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            target = destination / f"{path.stem}-p{number:04d}.png"
            pixmap.save(str(target))
            rendered.append(
                RenderedPage(
                    page=number,
                    path=target,
                    width=float(rect.width),
                    height=float(rect.height),
                    raster_width=pixmap.width,
                    raster_height=pixmap.height,
                    scale=scale,
                )
            )
    return rendered


def rasterize_pdf(
    path: Path,
    destination: Path,
    *,
    max_pages: int | None = None,     # was 4; None means every page
    target_edge: int = 1100,
) -> list[Path]:
    """Back-compatible shim. ``max_pages=None`` renders the whole document.

    tests/test_visual_inputs.py:93 passes max_pages=3 explicitly and still
    gets 3 pages; what changes is the default, which is where the silent loss
    came from.
    """
    profile = profile_pdf_pages(path)
    numbers = [p.page for p in profile.pages]
    if max_pages is not None:
        numbers = numbers[:max_pages]
    return [rendered.path for rendered in rasterize_pages(path, destination, numbers, target_edge=target_edge)]
```

`tests/test_visual_inputs.py:83-94` (`test_page_count_is_capped`) still passes because it
passes `max_pages=3` explicitly. Its docstring is rewritten to say what it now pins: *an
explicit page budget is honoured*. A new test asserts the default renders every page.

### 3.3 Batched vision calls

```python
# backend/rag/vision_batches.py

from dataclasses import dataclass
from typing import Iterator, Sequence

from backend.core.schemas import StoredFile
from backend.rag.parsing import RenderedPage


@dataclass(frozen=True)
class VisionBatch:
    """3–4 pages of ONE file. Never mixes files: a batch that spans two
    documents is how findings lose their filename."""

    stored: StoredFile
    pages: tuple[RenderedPage, ...]
    index: int
    total: int

    @property
    def page_numbers(self) -> list[int]:
        return [p.page for p in self.pages]

    @property
    def image_paths(self) -> list["Path"]:
        return [p.path for p in self.pages]


def build_batches(
    per_file: Sequence[tuple[StoredFile, Sequence[RenderedPage]]],
    *,
    batch_size: int = 3,
) -> list[VisionBatch]:
    batches: list[VisionBatch] = []
    staged: list[tuple[StoredFile, tuple[RenderedPage, ...]]] = []
    for stored, pages in per_file:
        ordered = sorted(pages, key=lambda p: p.page)
        for start in range(0, len(ordered), batch_size):
            staged.append((stored, tuple(ordered[start : start + batch_size])))
    total = len(staged)
    for index, (stored, chunk) in enumerate(staged, start=1):
        batches.append(VisionBatch(stored=stored, pages=chunk, index=index, total=total))
    return batches
```

`batch_size` comes from `config/app.yaml`:

```yaml
vision:
  batch_pages: 3              # 3–4; 4 only on hosts with a vision model that holds context well
  target_edge: 1100
  max_pages_per_file: 0       # 0 = unlimited. A positive value is a HARD budget and any
                              # page it excludes is recorded as an explicit task limitation.
  min_page_confidence: 0.35   # below this the page is marked NEEDS_REVIEW, not dropped
```

Default `0` satisfies the roadmap's "NO total cap". A site that must bound cost sets a
positive number, and the skipped pages then appear in `VerificationReport.limitations` and in
the `pdf.pages_skipped` audit detail — visible, not silent.

### 3.4 The batch prompt

New entry in `config/prompts/prompts.yaml`, replacing the single-shot `vision_extract`
(`prompts.yaml:97-108`) for PDF pages. The critical change is that **the model is told the
real page numbers** and must echo them:

```yaml
  vision_extract_pages: |
    You are reading {page_count} page(s) of the document '{filename}'.

    The images are supplied in order and correspond to these pages exactly:
    {page_map}

    Read each page independently. Do not merge pages. Do not infer content for
    a page you cannot see.

    Return a JSON object only, no prose, matching exactly:
    {{"pages": [
      {{"page": <the page number from the list above>,
        "document_type": "<inspection report | drawing | p&id | form | photograph | table | other>",
        "transcription": "<all legible text on THIS page, preserving structure>",
        "fields": [{{"label": "<field name>", "value": "<field value>"}}],
        "findings": [{{"description": "<observation>", "severity": "<low|medium|high|unknown>", "location": "<where on this page>"}}],
        "tables": [{{"caption": "<caption or ''>", "rows": [["<cell>", "..."]]}}],
        "illegible_regions": ["<description of anything unreadable on this page>"],
        "confidence": <0.0-1.0, your confidence that you read THIS page correctly>}}
    ]}}

    User's specific request about this document: {prompt}
```

`page_map` is rendered deterministically as `"image 1 = page 7\nimage 2 = page 8\nimage 3 = page 9"`.

### 3.5 Merge, with filename / page / method / confidence preserved

```python
# backend/rag/vision_merge.py

from __future__ import annotations

from typing import Any

from backend.core.schemas import StoredFile
from backend.evidence.models import EvidenceDraft
from backend.evidence.provenance import from_vision_page
from backend.rag.vision_batches import VisionBatch


class PageReadError(RuntimeError):
    pass


def drafts_for_batch(
    batch: VisionBatch,
    parsed: dict[str, Any] | None,
    raw: str,
    *,
    model_id: str,
    floor: float,
) -> tuple[list[EvidenceDraft], list[str]]:
    """Turn one batch response into per-page evidence drafts.

    Returns ``(drafts, limitations)``. A page the model omitted is a
    limitation naming that exact page — never a silent gap.
    """
    drafts: list[EvidenceDraft] = []
    limitations: list[str] = []
    page_count = batch.pages[0].page if batch.pages else None
    by_page = {p.page: p for p in batch.pages}

    if not parsed or not isinstance(parsed.get("pages"), list):
        # The model answered, but not in the shape asked for. The reading is
        # kept — losing it is worse — but it is attributed to the whole batch
        # range and flagged low confidence, and each page is still its own
        # record so nothing is merged across pages by accident.
        limitations.append(
            f"'{batch.stored.filename}' pages "
            f"{batch.page_numbers[0]}–{batch.page_numbers[-1]}: the vision model's "
            f"response could not be parsed as structured data; its raw reading was "
            f"used and marked unverified."
        )
        for rendered in batch.pages:
            drafts.append(
                from_vision_page(
                    batch.stored,
                    page=rendered.page,
                    page_count=len(by_page),
                    text=raw[:4000],
                    model_id=model_id,
                    confidence=0.2,
                    structured={"unparsed": True, "batch": batch.page_numbers},
                )
            )
        return drafts, limitations

    seen: set[int] = set()
    for entry in parsed["pages"]:
        if not isinstance(entry, dict):
            continue
        try:
            number = int(entry.get("page"))
        except (TypeError, ValueError):
            limitations.append(
                f"'{batch.stored.filename}': the vision model returned a page "
                f"result with no usable page number; it was discarded rather "
                f"than attributed to a guess."
            )
            continue
        rendered = by_page.get(number)
        if rendered is None:
            # The model invented a page it was not shown. Refuse it.
            limitations.append(
                f"'{batch.stored.filename}': the vision model returned content for "
                f"page {number}, which was not in this batch "
                f"({batch.page_numbers}); it was discarded."
            )
            continue
        seen.add(number)

        confidence = _confidence(entry, floor=floor)
        transcription = str(entry.get("transcription") or "").strip()
        if transcription:
            drafts.append(
                from_vision_page(
                    batch.stored,
                    page=number,
                    page_count=len(by_page),
                    text=transcription,
                    model_id=model_id,
                    confidence=confidence,
                    structured={
                        "document_type": entry.get("document_type"),
                        "fields": entry.get("fields") or [],
                        "tables": entry.get("tables") or [],
                        "illegible_regions": entry.get("illegible_regions") or [],
                        "kind": "transcription",
                    },
                )
            )
        for finding in entry.get("findings") or []:
            if not isinstance(finding, dict):
                continue
            description = str(finding.get("description") or "").strip()
            if not description:
                continue
            drafts.append(
                from_vision_page(
                    batch.stored,
                    page=number,
                    page_count=len(by_page),
                    text=description,
                    model_id=model_id,
                    confidence=confidence,
                    structured={
                        "kind": "finding",
                        "severity": finding.get("severity", "unknown"),
                        "location_hint": finding.get("location"),
                    },
                )
            )

    for number in batch.page_numbers:
        if number not in seen:
            limitations.append(
                f"'{batch.stored.filename}' page {number} was rendered and sent to "
                f"the vision model but no result was returned for it; nothing on "
                f"that page has been used."
            )
    return drafts, limitations


def _confidence(entry: dict[str, Any], *, floor: float) -> float:
    """Self-reported confidence, penalised by what the model admits it could not
    read. Self-reporting is weak evidence, so it is clamped and combined with an
    objective signal (illegible region count) rather than trusted outright."""
    try:
        reported = float(entry.get("confidence", 0.6))
    except (TypeError, ValueError):
        reported = 0.6
    reported = max(0.0, min(1.0, reported))
    illegible = len(entry.get("illegible_regions") or [])
    penalty = min(0.4, 0.1 * illegible)
    return max(floor, round(reported - penalty, 3))
```

### 3.6 The algorithm as a whole

```
for each attached PDF:
    profile = profile_pdf_pages(path)                       # per page, not per document
    emit task.pdf.profiled {filename, page_count, text_pages, vision_pages}

    for each TEXT page:
        segment = pypdf/PyMuPDF text for that page
        ledger.register(from_file_segment(stored, text=segment,
                        location=EvidenceLocation(page=n, page_count=N),
                        parser="pymupdf-text"))            # F-evidence, one per page

    rendered = rasterize_pages(path, workspace/"pages", [p.page for p in vision_pages])
    batches  = build_batches([(stored, rendered)], batch_size=cfg.vision.batch_pages)

    for batch in batches:                                   # 3–4 pages, one file, no total cap
        emit task.vision.batch {filename, pages, index, total}
        parsed, raw = vision_model(batch)                   # routed per call, same as today
        drafts, limits = drafts_for_batch(batch, parsed, raw, model_id=..., floor=cfg.vision.min_page_confidence)
        ledger.register_many(drafts)                        # V-evidence, PERSISTED NOW
        emit task.vision.page for each page with its ids and confidence
        limitations.extend(limits)

    assert ledger.pages_covered(stored.filename) ⊇ {every page number}
        else append a limitation naming each missing page
```

Two properties this buys, both directly testable:

1. **Coverage is provable.** `ledger.pages_covered(filename)` versus `profile.page_count` is a
   single assertion. `tests/test_pdf_completeness.py` builds a 20-page scan and asserts the set
   equality — the roadmap's "Done when" for item 1, mechanised.
2. **Evidence exists before reasoning.** `ledger.register_many` writes through to the
   `evidence` table inside the batch loop. Kill the process after batch 3 of 7 and pages 1–9
   are still queryable, still hashed, still attributable. Today a crash before
   `_record_extraction` returns loses everything.

### 3.7 Changes to `backend/rag/parsing.py`, listed

| Line today | Change |
|---|---|
| `:93-106` `has_extractable_text` | reimplemented over `profile_pdf_pages`; majority-of-pages rule; signature unchanged |
| `:109-147` `rasterize_pdf` | `max_pages` default `4` → `None`; body delegates to `rasterize_pages` |
| new | `PageProfile`, `PdfProfile`, `profile_pdf_pages`, `RenderedPage`, `rasterize_pages` |
| `:167-196` `_parse_pdf` | emit one `ParsedSegment` **per page even when empty**, carrying `page`, so a page with no text is a recorded gap rather than an absent index. `ParsedSegment` gains `page: int | None` and `method: str`. |
| `:19-24` `ParsedSegment` | `+ page: int | None = None`, `+ method: str = "text"`, `+ confidence: float = 1.0` |
| `:27-37` `ParsedDocument` | `+ profile: PdfProfile | None = None` |

`backend/agents/orchestrator.py:371-417` (`_visual_inputs`) is deleted outright. Its
replacement is `VisionStage` (§8.4), which keeps the `(StoredFile, pages)` pairing that the
current flat `list[Path]` throws away. The `except (ParsingError, Exception)` at `:398` goes
with it.

---

## 4. DETERMINISTIC ENGINEERING ENGINE (items 7, 8)

The thing being replaced: `verifier.py:184-197` interpolates a model-authored string into a
Python program and executes it. The replacement inverts control — **the model may only ask for
a formula by ID and supply evidence-backed inputs; it may not supply arithmetic.**

```
backend/engineering/__init__.py
backend/engineering/units.py        Pint registry, parsing, normalisation, dimensional rejection
backend/engineering/registry.py     Formula, FormulaRegistry, CalculationRequest/Result, execute()
backend/engineering/corrosion.py    corrosion rate, remaining life, inspection interval
backend/engineering/pressure.py     ASME VIII Div.1 UG-27 required thickness / MAWP
backend/engineering/piping.py       ASME B31.3 304.1.2, Reynolds, Darcy-Weisbach
backend/engineering/errors.py       UnitError, DimensionError, UnsupportedInputError, FormulaError
```

### 4.1 `backend/engineering/units.py` — Pint, offline

```python
"""Unit-aware quantities.

Pint is a pure-Python library with a bundled unit definition file; it makes no
network calls and needs no data download, which is why it is acceptable in an
air-gapped deployment. The registry is constructed once and shared, because
Pint quantities from different registries cannot be combined.
"""

from __future__ import annotations

import functools
from typing import Any

import pint

from backend.engineering.errors import DimensionError, UnitError

# Dimensionality expectations, declared by name so formulas read in engineering
# terms rather than in Pint's bracket syntax.
DIMENSIONS: dict[str, str] = {
    "length": "[length]",
    "area": "[length] ** 2",
    "volume": "[length] ** 3",
    "mass": "[mass]",
    "time": "[time]",
    "pressure": "[mass] / ([length] * [time] ** 2)",
    "stress": "[mass] / ([length] * [time] ** 2)",
    "temperature": "[temperature]",
    "velocity": "[length] / [time]",
    "density": "[mass] / [length] ** 3",
    "viscosity": "[mass] / ([length] * [time])",
    "corrosion_rate": "[length] / [time]",
    "dimensionless": "",
}


@functools.lru_cache(maxsize=1)
def registry() -> pint.UnitRegistry:
    ureg = pint.UnitRegistry(on_redefinition="raise")
    # Industrial units Pint does not ship with, or ships under another name.
    ureg.define("mpy = 0.001 * inch / year = mils_per_year")
    ureg.define("barg = bar")          # gauge/absolute is tracked as metadata, not dimension
    ureg.define("psig = psi")
    ureg.define("MMSCFD = 1e6 * foot ** 3 / day")
    return ureg


Quantity = pint.Quantity


class ParsedQuantity:
    """A value with its original unit and its normalised unit, both kept.

    Item 8 requires the evidence record to preserve the original AND the
    normalised units; storing only the normalised value loses the ability to
    show an inspector the number as it appeared on the document.
    """

    __slots__ = ("name", "quantity", "original_value", "original_unit", "evidence_id")

    def __init__(
        self,
        name: str,
        quantity: Quantity,
        original_value: float,
        original_unit: str,
        evidence_id: str | None,
    ) -> None:
        self.name = name
        self.quantity = quantity
        self.original_value = original_value
        self.original_unit = original_unit
        self.evidence_id = evidence_id

    def to(self, unit: str) -> Quantity:
        return self.quantity.to(unit)

    def magnitude_in(self, unit: str) -> float:
        return float(self.quantity.to(unit).magnitude)


def parse_quantity(
    name: str,
    value: Any,
    unit: str | None,
    *,
    expect: str,
    evidence_id: str | None = None,
) -> ParsedQuantity:
    """Build a dimensioned quantity and refuse it if the dimension is wrong.

    ``expect`` is a key of DIMENSIONS. A pressure supplied in millimetres is
    rejected here, before any formula runs — which is item 8's 'reject
    dimensionally invalid operations'.
    """
    ureg = registry()

    if isinstance(value, str):
        # "9.4 mm" arrives as one string often enough to handle it.
        try:
            quantity = ureg.Quantity(value)
        except Exception as exc:
            raise UnitError(f"input '{name}': could not read '{value}' as a quantity") from exc
        magnitude = float(quantity.magnitude)
        supplied_unit = f"{quantity.units:~P}" or (unit or "")
        if unit and str(quantity.units) == "dimensionless":
            quantity = ureg.Quantity(magnitude, unit)
            supplied_unit = unit
    else:
        try:
            magnitude = float(value)
        except (TypeError, ValueError) as exc:
            raise UnitError(f"input '{name}': '{value}' is not numeric") from exc
        if unit is None and expect != "dimensionless":
            raise UnitError(
                f"input '{name}' requires a unit ({expect}); none was supplied"
            )
        quantity = ureg.Quantity(magnitude, unit or "dimensionless")
        supplied_unit = unit or ""

    expected_dim = DIMENSIONS[expect]
    if expected_dim == "":
        if not quantity.dimensionless:
            raise DimensionError(
                f"input '{name}' must be dimensionless but was given as "
                f"'{supplied_unit}'"
            )
    elif quantity.dimensionality != registry().get_dimensionality(expected_dim):
        raise DimensionError(
            f"input '{name}' must be a {expect} quantity, but "
            f"'{magnitude} {supplied_unit}' has dimensionality "
            f"{quantity.dimensionality}. Refused before execution."
        )

    return ParsedQuantity(
        name=name,
        quantity=quantity,
        original_value=magnitude,
        original_unit=supplied_unit or str(quantity.units),
        evidence_id=evidence_id,
    )


def normalize(quantity: Quantity, to_unit: str) -> Quantity:
    try:
        return quantity.to(to_unit)
    except pint.DimensionalityError as exc:
        raise DimensionError(str(exc)) from exc
```

`backend/engineering/errors.py`:

```python
class EngineeringError(RuntimeError):
    """Base for everything the engine refuses."""

class UnitError(EngineeringError):
    """A value could not be read as a quantity, or carried no unit."""

class DimensionError(EngineeringError):
    """A dimensionally invalid operation — pressure plus thickness."""

class UnsupportedInputError(EngineeringError):
    """An input was supplied with no evidence backing it."""

class FormulaError(EngineeringError):
    """Unknown formula, unknown version, or a domain violation inside one."""
```

Add to `requirements.txt`:

```
# Unit-aware engineering calculations (pure Python, bundled unit definitions,
# no network access at import or runtime).
Pint==0.24.4
```

Pint 0.24 pulls `flexcache`, `flexparser`, `platformdirs` and `typing_extensions` — all pure
Python. **DEPENDS-ON: whoever owns item 36** — these five wheels must be pre-staged in
`aegis-offline/python-wheels/`.

### 4.2 `backend/engineering/registry.py` — versioned formulas

```python
"""Versioned formula registry.

A formula is identified by (id, version). Both travel into the calculation
evidence record, so a report produced today remains explainable after the
formula is revised: the run says which version it used.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Mapping, Sequence

from pydantic import BaseModel, Field

from backend.engineering.errors import FormulaError, UnsupportedInputError
from backend.engineering.units import ParsedQuantity, Quantity, parse_quantity


@dataclass(frozen=True)
class FormulaInput:
    name: str
    dimension: str                    # key of units.DIMENSIONS
    description: str
    required: bool = True
    default: float | None = None
    default_unit: str | None = None
    # A constant an operator may set without documentary evidence (e.g. a
    # safety factor from the standard itself). Everything else must be
    # evidence-backed.
    constant_allowed: bool = False


@dataclass(frozen=True)
class Formula:
    id: str
    version: str
    title: str
    description: str
    inputs: tuple[FormulaInput, ...]
    output_dimension: str
    output_unit: str                  # canonical unit the result is reported in
    fn: Callable[[Mapping[str, ParsedQuantity]], Quantity]
    standard: str | None = None       # "API 570 §7.1.1"
    expression: str = ""              # human-readable form, for the report
    notes: str = ""
    domain_checks: tuple[Callable[[Mapping[str, ParsedQuantity]], str | None], ...] = ()

    @property
    def key(self) -> str:
        return f"{self.id}@{self.version}"


class QuantityInput(BaseModel):
    """What the model is allowed to supply: a number, a unit, and the evidence
    id it came from. Never an expression."""

    value: float | str
    unit: str | None = None
    evidence_id: str | None = None


class CalculationRequest(BaseModel):
    formula_id: str
    version: str | None = None        # None -> latest registered version
    inputs: dict[str, QuantityInput]
    label: str | None = None


class ResolvedInput(BaseModel):
    name: str
    original_value: float
    original_unit: str
    normalized_value: float
    normalized_unit: str
    evidence_id: str | None = None


class CalculationResult(BaseModel):
    formula_id: str
    formula_version: str
    formula_title: str
    standard: str | None = None
    label: str
    inputs: list[ResolvedInput]
    output_value: float
    output_unit: str
    expression: str                   # with the actual numbers substituted
    supporting_evidence_ids: list[str] = Field(default_factory=list)
    calculation_key: str              # sha256 over (formula key, normalised inputs)
    deterministic: bool = True
    warnings: list[str] = Field(default_factory=list)
    computed_at: datetime


class FormulaRegistry:
    def __init__(self) -> None:
        self._formulas: dict[str, dict[str, Formula]] = {}

    def register(self, formula: Formula) -> None:
        versions = self._formulas.setdefault(formula.id, {})
        if formula.version in versions:
            raise FormulaError(f"{formula.key} is already registered")
        versions[formula.version] = formula

    def get(self, formula_id: str, version: str | None = None) -> Formula:
        versions = self._formulas.get(formula_id)
        if not versions:
            raise FormulaError(
                f"unknown formula '{formula_id}'. Registered: "
                f"{', '.join(sorted(self._formulas))}"
            )
        if version is None:
            version = max(versions, key=_version_key)
        formula = versions.get(version)
        if formula is None:
            raise FormulaError(
                f"formula '{formula_id}' has no version '{version}' "
                f"(available: {', '.join(sorted(versions))})"
            )
        return formula

    def describe(self) -> list[dict]:
        """The catalogue the planner prompt and the API expose."""
        return [
            {
                "id": f.id,
                "version": f.version,
                "title": f.title,
                "description": f.description,
                "standard": f.standard,
                "expression": f.expression,
                "output_unit": f.output_unit,
                "inputs": [
                    {
                        "name": i.name,
                        "dimension": i.dimension,
                        "description": i.description,
                        "required": i.required,
                        "constant_allowed": i.constant_allowed,
                    }
                    for i in f.inputs
                ],
            }
            for versions in self._formulas.values()
            for f in [versions[max(versions, key=_version_key)]]
        ]

    # -- execution ---------------------------------------------------------
    def execute(
        self,
        request: CalculationRequest,
        *,
        require_evidence: bool = True,
    ) -> CalculationResult:
        """Deterministic. No model, no eval, no randomness, no clock in the maths."""
        formula = self.get(request.formula_id, request.version)
        resolved: dict[str, ParsedQuantity] = {}
        warnings: list[str] = []

        for spec in formula.inputs:
            supplied = request.inputs.get(spec.name)
            if supplied is None:
                if spec.required and spec.default is None:
                    raise FormulaError(
                        f"{formula.key} requires input '{spec.name}' "
                        f"({spec.description}); it was not supplied"
                    )
                if spec.default is None:
                    continue
                resolved[spec.name] = parse_quantity(
                    spec.name, spec.default, spec.default_unit,
                    expect=spec.dimension, evidence_id=None,
                )
                warnings.append(
                    f"'{spec.name}' was not supplied; the registered default "
                    f"{spec.default} {spec.default_unit or ''} was used."
                )
                continue

            if require_evidence and not supplied.evidence_id and not spec.constant_allowed:
                raise UnsupportedInputError(
                    f"{formula.key}: input '{spec.name}' = {supplied.value} carries no "
                    f"evidence id. Every measured input must name the evidence it "
                    f"came from."
                )
            resolved[spec.name] = parse_quantity(
                spec.name,
                supplied.value,
                supplied.unit,
                expect=spec.dimension,
                evidence_id=supplied.evidence_id,
            )

        for check in formula.domain_checks:
            problem = check(resolved)
            if problem:
                raise FormulaError(f"{formula.key}: {problem}")

        output = formula.fn(resolved).to(formula.output_unit)

        inputs = [
            ResolvedInput(
                name=p.name,
                original_value=p.original_value,
                original_unit=p.original_unit,
                normalized_value=float(p.quantity.to_base_units().magnitude),
                normalized_unit=f"{p.quantity.to_base_units().units:~P}",
                evidence_id=p.evidence_id,
            )
            for p in resolved.values()
        ]
        substituted = formula.expression
        for p in resolved.values():
            substituted = substituted.replace(
                p.name, f"{p.original_value:g} {p.original_unit}".strip()
            )

        return CalculationResult(
            formula_id=formula.id,
            formula_version=formula.version,
            formula_title=formula.title,
            standard=formula.standard,
            label=request.label or formula.title,
            inputs=inputs,
            output_value=float(output.magnitude),
            output_unit=formula.output_unit,
            expression=f"{substituted} = {float(output.magnitude):.4g} {formula.output_unit}",
            supporting_evidence_ids=sorted(
                {p.evidence_id for p in resolved.values() if p.evidence_id}
            ),
            calculation_key=_calculation_key(formula, inputs),
            warnings=warnings,
            computed_at=datetime.now(timezone.utc),
        )


def _version_key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split(".") if part.isdigit())


def _calculation_key(formula: Formula, inputs: list[ResolvedInput]) -> str:
    """Identical inputs to an identical formula version always yield this same
    key — the mechanism behind item 7's 'the same inputs always produce the
    same result, with reproducible provenance'."""
    payload = {
        "formula": formula.key,
        "inputs": sorted(
            (i.name, round(i.normalized_value, 12), i.normalized_unit) for i in inputs
        ),
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


_registry: FormulaRegistry | None = None


def get_formula_registry() -> FormulaRegistry:
    global _registry
    if _registry is None:
        _registry = FormulaRegistry()
        from backend.engineering import corrosion, piping, pressure
        corrosion.register_all(_registry)
        pressure.register_all(_registry)
        piping.register_all(_registry)
    return _registry
```

### 4.3 `backend/engineering/corrosion.py` — the demo-critical formulas

```python
"""Corrosion rate and remaining life.

Formulae and their acceptance criteria are from API 570 (Piping Inspection
Code) and API 510 (Pressure Vessel Inspection Code), which state the same
relations. Section references are recorded on each formula and printed in the
deliverable, so an inspector can check the basis rather than the arithmetic.
"""

from __future__ import annotations

from typing import Mapping

from backend.engineering.registry import (
    Formula,
    FormulaInput,
    FormulaRegistry,
)
from backend.engineering.units import ParsedQuantity, Quantity, registry as ureg


def _long_term_rate(v: Mapping[str, ParsedQuantity]) -> Quantity:
    # API 570 §7.1.1:  CR_long-term = (t_initial - t_actual) / (years between them)
    return (v["t_initial"].quantity - v["t_actual"].quantity) / v["interval"].quantity


def _short_term_rate(v: Mapping[str, ParsedQuantity]) -> Quantity:
    # API 570 §7.1.1:  CR_short-term = (t_previous - t_actual) / (years between them)
    return (v["t_previous"].quantity - v["t_actual"].quantity) / v["interval"].quantity


def _remaining_life(v: Mapping[str, ParsedQuantity]) -> Quantity:
    # API 570 §7.1.1 / API 510 §7.1:
    #   Remaining life (years) = (t_actual - t_required) / corrosion rate
    return (v["t_actual"].quantity - v["t_required"].quantity) / v["corrosion_rate"].quantity


def _interval(v: Mapping[str, ParsedQuantity]) -> Quantity:
    # API 570 §6.3.3: the thickness-measurement interval is the LESSER of one
    # half the remaining life and the maximum interval for the piping class.
    half_life = v["remaining_life"].quantity / 2.0
    ceiling = v["maximum_interval"].quantity
    return half_life if half_life < ceiling else ceiling


def _positive_rate(v: Mapping[str, ParsedQuantity]) -> str | None:
    rate = v["corrosion_rate"].magnitude_in("mm/year")
    if rate <= 0:
        return (
            "corrosion rate is zero or negative, so remaining life is not "
            "defined by this relation. Report the measured rate and escalate "
            "for engineering judgement rather than publishing an infinite life."
        )
    return None


def _wall_above_minimum(v: Mapping[str, ParsedQuantity]) -> str | None:
    actual = v["t_actual"].magnitude_in("mm")
    required = v["t_required"].magnitude_in("mm")
    if actual <= required:
        return (
            f"measured thickness {actual:g} mm is at or below the required "
            f"minimum {required:g} mm. Remaining life is not positive; this is "
            f"a fitness-for-service condition, not a scheduling calculation."
        )
    return None


def _interval_positive(v: Mapping[str, ParsedQuantity]) -> str | None:
    if v["interval"].magnitude_in("year") <= 0:
        return "the interval between measurements must be greater than zero"
    return None


def register_all(registry: FormulaRegistry) -> None:
    registry.register(
        Formula(
            id="corrosion.rate.long_term",
            version="1.0.0",
            title="Long-term corrosion rate",
            standard="API 570 §7.1.1",
            description=(
                "Average wall loss per year between the initial (or baseline) "
                "thickness measurement and the most recent one."
            ),
            expression="(t_initial - t_actual) / interval",
            inputs=(
                FormulaInput("t_initial", "length",
                             "baseline or initial measured wall thickness"),
                FormulaInput("t_actual", "length",
                             "most recent measured wall thickness"),
                FormulaInput("interval", "time",
                             "elapsed time between the two measurements"),
            ),
            output_dimension="corrosion_rate",
            output_unit="mm/year",
            fn=_long_term_rate,
            domain_checks=(_interval_positive,),
            notes=(
                "A negative result means the later reading is thicker than the "
                "earlier one, which indicates a measurement or datum problem, "
                "not metal gain. The value is reported as measured."
            ),
        )
    )

    registry.register(
        Formula(
            id="corrosion.rate.short_term",
            version="1.0.0",
            title="Short-term corrosion rate",
            standard="API 570 §7.1.1",
            description=(
                "Wall loss per year between the previous inspection and the "
                "most recent one. API requires both rates to be calculated and "
                "the more conservative applied."
            ),
            expression="(t_previous - t_actual) / interval",
            inputs=(
                FormulaInput("t_previous", "length", "thickness at the previous inspection"),
                FormulaInput("t_actual", "length", "most recent measured wall thickness"),
                FormulaInput("interval", "time", "elapsed time between those two inspections"),
            ),
            output_dimension="corrosion_rate",
            output_unit="mm/year",
            fn=_short_term_rate,
            domain_checks=(_interval_positive,),
        )
    )

    registry.register(
        Formula(
            id="corrosion.remaining_life",
            version="1.0.0",
            title="Remaining life",
            standard="API 570 §7.1.1 (equivalently API 510 §7.1)",
            description=(
                "Years until the measured wall reaches the required minimum "
                "thickness at the applicable corrosion rate."
            ),
            expression="(t_actual - t_required) / corrosion_rate",
            inputs=(
                FormulaInput("t_actual", "length", "most recent measured wall thickness"),
                FormulaInput("t_required", "length",
                             "minimum required thickness (structural or pressure design)"),
                FormulaInput("corrosion_rate", "corrosion_rate",
                             "applicable corrosion rate — the greater of the "
                             "long-term and short-term rates"),
            ),
            output_dimension="time",
            output_unit="year",
            fn=_remaining_life,
            domain_checks=(_positive_rate, _wall_above_minimum),
            notes=(
                "API requires the more conservative of the long-term and "
                "short-term rates to be used. The engine does not choose for "
                "you: whichever rate is supplied is the one applied, and the "
                "evidence record names it."
            ),
        )
    )

    registry.register(
        Formula(
            id="corrosion.inspection_interval",
            version="1.0.0",
            title="Next thickness-measurement interval",
            standard="API 570 §6.3.3 and Table 2",
            description=(
                "The lesser of one half the remaining life and the maximum "
                "interval permitted for the piping class."
            ),
            expression="min(remaining_life / 2, maximum_interval)",
            inputs=(
                FormulaInput("remaining_life", "time", "remaining life in years"),
                FormulaInput(
                    "maximum_interval", "time",
                    "maximum interval for the piping class from API 570 Table 2 "
                    "(Class 1: 5 years; Class 2: 10 years; Class 3: 10 years)",
                    constant_allowed=True, default=5.0, default_unit="year",
                ),
            ),
            output_dimension="time",
            output_unit="year",
            fn=_interval,
            notes=(
                "Table 2 values are supplied as an input rather than hardcoded, "
                "because the class assignment is an engineering judgement that "
                "must be attributable to a person or a document, not to this "
                "file."
            ),
        )
    )
```

`backend/engineering/pressure.py` registers, in the same shape:

- `pressure.required_thickness.cylindrical_shell` @ 1.0.0 — **ASME VIII Div. 1 UG-27(c)(1)**,
  `t = P*R / (S*E - 0.6*P)`, inputs `P` (pressure), `R` (length, inside radius), `S` (stress),
  `E` (dimensionless joint efficiency). Domain check: refuse when `t > R/2` or `P > 0.385*S*E`
  — the thin-wall limits the paragraph itself states — with a message naming the limit.
- `pressure.mawp.cylindrical_shell` @ 1.0.0 — UG-27 rearranged, `P = S*E*t / (R + 0.6*t)`.

`backend/engineering/piping.py`:

- `piping.required_thickness.straight_pipe` @ 1.0.0 — **ASME B31.3 §304.1.2 eq. (3a)**,
  `t = P*D / (2*(S*E*W + P*Y))`, with `Y` from Table 304.1.1 supplied as an input.
- `piping.reynolds_number` @ 1.0.0 — `Re = rho*v*D/mu`, dimensionless output; the dimensionless
  assertion is itself a unit test.
- `piping.pressure_drop.darcy_weisbach` @ 1.0.0 — `dP = f*(L/D)*(rho*v**2/2)`.

### 4.4 Registering the result as CALCULATION evidence

```python
# backend/evidence/provenance.py  (continued)

def from_calculation(result: "CalculationResult") -> EvidenceDraft:
    """A deterministic formula execution becomes C-evidence.

    ``derived_from`` carries the evidence ids of every input, so the ledger
    holds a real derivation graph: C3 <- V7, V9, S2. That graph is what lets
    the UI open a number and walk back to the page it was measured on.
    """
    body = "\n".join(
        [
            f"{result.formula_title} ({result.standard or 'no governing standard cited'})",
            f"{result.expression}",
            "Inputs:",
            *[
                f"  {i.name} = {i.original_value:g} {i.original_unit}"
                + (f"  [{i.evidence_id}]" if i.evidence_id else "  (constant)")
                for i in result.inputs
            ],
        ]
    )
    return EvidenceDraft(
        type=EvidenceType.CALCULATION,
        modality=Modality.NUMERIC,
        source_id=f"{result.formula_id}@{result.formula_version}",
        source_kind="formula",
        content=body,
        structured=result.model_dump(mode="json"),
        confidence=1.0,                       # deterministic execution, not an estimate
        extraction_method=f"formula:{result.formula_id}@{result.formula_version}",
        location=EvidenceLocation(section=result.label),
        derived_from=list(result.supporting_evidence_ids),
    )
```

The stored `structured` payload carries formula id, version, every input with original and
normalised units, the output, the units, the supporting evidence ids and the
`calculation_key` — item 7's list, in one place.

### 4.5 How the model requests a calculation

New prompt `task.request_calculations`, called during the execute stage when
`profile.task_type` is `CALCULATION` or when the vision/retrieval stages produced numeric
evidence:

```yaml
  request_calculations: |
    The following calculations are available. You may not perform arithmetic
    yourself; you may only request a formula by id and supply its inputs.

    {formula_catalogue}

    Evidence you may draw inputs from:
    {evidence}

    Return a JSON object only:
    {{"calculations": [
      {{"formula_id": "<id from the catalogue>",
        "label": "<what this computes, in the report's words>",
        "inputs": {{"<input name>": {{"value": <number>, "unit": "<unit>", "evidence_id": "<the id this number came from>"}}}}
      }}
    ]}}

    Every value must carry the evidence id it was read from. If a value you
    need is not present in the evidence above, omit the calculation entirely
    and say so in your answer — do not estimate it.
```

`ExecuteStage` parses that into `CalculationRequest` objects and calls
`registry.execute(request, require_evidence=True)`. Failures are *data*, not exceptions that
kill the task:

- `UnsupportedInputError` → a `NEEDS_REVIEW` note plus a limitation naming the input.
- `DimensionError` → a limitation quoting the refusal, and an audit record
  `category="calculation", action="refused_dimensional"` — this is the demo moment for item 8.
- `FormulaError` (domain check) → limitation carrying the engineering reason, e.g. the
  wall-below-minimum message, which is *more* useful than a number.

### 4.6 What this deletes

`orchestrator.py:643-667` (`_extract_calculations`) and `verifier.py:167-263`
(`check_calculations`) both go. `NUMERIC_ASSERTION` (`orchestrator.py:58-67`) survives, moved
to `backend/verification/claim_extractor.py`, where it does what it is actually good at:
cheaply deciding whether a draft contains any numeric assertion worth extracting claims from.

The sandbox keeps its role for data analysis (`python_exec`, `spreadsheet_analyze`) and its
output keeps becoming `X` evidence. What it stops being is the arithmetic verifier.

---

## 5. CLAIM-LEVEL VERIFICATION (item 9)

```
backend/verification/__init__.py
backend/verification/models.py           Claim, ClaimEvidenceLink, ClaimReport, enums
backend/verification/claim_extractor.py  draft -> atomic claims (model pass + deterministic fallback)
backend/verification/evidence_mapper.py  claim -> evidence links, computed independently of citations
backend/verification/numeric_verifier.py recompute numeric claims via the formula registry
backend/verification/contradictions.py   §6
backend/verification/verifier.py         orchestrates the above, compiles VerificationReport
backend/verification/gate.py             the policy decision over the claim set
```

### 5.1 The status vocabulary, defined so it can be defended

| Status | Means | Produced when |
|---|---|---|
| `VERIFIED` | independently reproduced | a numeric claim matched a deterministic recomputation within tolerance, **or** the claim's quantity is an exact match to a quantity in the cited evidence |
| `SUPPORTED` | entailed by evidence, not reproduced | the mapper found evidence whose content supports the claim above threshold, and no deterministic check was available |
| `UNSUPPORTED` | no evidence links it | no candidate scored above threshold |
| `CONFLICTED` | evidence disagrees | two mapped evidence items disagree, or recomputation disagreed with the asserted number |
| `NEEDS_REVIEW` | the machine cannot decide | mapping or recomputation errored, evidence came from a superseded revision, confidence was below floor, **or** the claim is a `RECOMMENDATION` with impact ≥ HIGH |

That last rule matters: a machine never marks a high-impact recommendation `VERIFIED`.
Recommendations are judgements, and the honest status for a judgement is "a human looked".

```python
# backend/verification/models.py

class ClaimType(str, Enum):
    FACTUAL = "factual"                            # "the vessel is carbon steel"
    NUMERICAL = "numerical"                        # "wall thickness is 9.4 mm"
    ENGINEERING_CONCLUSION = "engineering_conclusion"  # "remaining life is 6.2 years"
    RECOMMENDATION = "recommendation"              # "re-inspect within 3 years"
    PROCEDURAL = "procedural"                      # "SOP-INS-014 requires UT at 6 TMLs"


class ClaimStatus(str, Enum):
    VERIFIED = "verified"
    SUPPORTED = "supported"
    UNSUPPORTED = "unsupported"
    CONFLICTED = "conflicted"
    NEEDS_REVIEW = "needs_review"


class ClaimImpact(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class LinkRelation(str, Enum):
    CITED_AND_CONFIRMED = "cited_and_confirmed"   # model cited it; mapper agrees
    CITED_BUT_UNSUPPORTED = "cited_but_unsupported"  # model cited it; mapper disagrees
    UNCITED_SUPPORT = "uncited_support"           # mapper found it; model did not cite it
    CONTRADICTS = "contradicts"
    RECOMPUTED = "recomputed"                     # a CALCULATION evidence reproducing the claim


class ClaimEvidenceLink(BaseModel):
    evidence_id: str
    relation: LinkRelation
    score: float = Field(ge=0.0, le=1.0)
    rationale: str
    matched_quantity: str | None = None     # "9.4 mm" — what actually lined up


class ClaimQuantity(BaseModel):
    raw: str
    value: float
    unit: str | None
    normalized_value: float | None
    normalized_unit: str | None


class Claim(BaseModel):
    id: str                                  # "K1", "K2" — stable within the task
    task_id: str
    text: str
    type: ClaimType
    impact: ClaimImpact
    status: ClaimStatus = ClaimStatus.NEEDS_REVIEW
    cited_ids: list[str] = Field(default_factory=list)      # what the model wrote
    invented_ids: list[str] = Field(default_factory=list)   # cited but not in the ledger
    links: list[ClaimEvidenceLink] = Field(default_factory=list)
    quantities: list[ClaimQuantity] = Field(default_factory=list)
    recomputation: dict[str, Any] | None = None
    conflict_ids: list[str] = Field(default_factory=list)
    reason: str = ""                          # human-readable "why this status"
    span: tuple[int, int] | None = None       # offsets into the draft, for UI highlighting
    source_section: str | None = None

    @property
    def evidence_ids(self) -> list[str]:
        return [l.evidence_id for l in self.links
                if l.relation != LinkRelation.CITED_BUT_UNSUPPORTED]


class ClaimReport(BaseModel):
    task_id: str
    claims: list[Claim]
    by_status: dict[str, int]
    blocked: list[str]                        # claim ids that failed the gate
    extractor: str                            # "model:qwen2.5:7b" | "deterministic"
    verifier_version: str
    completed_at: datetime
```

### 5.2 `claim_extractor.py` — atomic claims

Hybrid, because neither half alone is trustworthy: the model segments well but hallucinates
structure; the deterministic pass never hallucinates but over-segments.

```python
"""Atomic claim extraction.

A claim is one assertion that could be independently true or false. 'The wall
measures 9.4 mm and the minimum is 6.0 mm' is two claims, because one can be
right while the other is wrong.
"""

from __future__ import annotations

import re
from typing import Any

from backend.core.config import get_config
from backend.engineering.units import parse_quantity
from backend.evidence.citations import parse as parse_citations
from backend.verification.models import (
    Claim, ClaimImpact, ClaimQuantity, ClaimType,
)

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
QUANTITY_RE = re.compile(
    r"(-?\d+(?:[.,]\d+)?)\s*"
    r"(%|mm/yr|mm/year|mpy|in/yr|mm|cm|m|in|ft|kg|t|lb|bar|barg|psi|psig|kPa|MPa|"
    r"°C|°F|K|years?|yrs?|months?|days?|hours?|hrs?)\b",
    re.IGNORECASE,
)
DIRECTIVE_RE = re.compile(
    r"\b(must|shall|should|required to|is required|recommend(?:ed|s)?|"
    r"re-?inspect|replace|repair|shut ?down|derate|schedule)\b",
    re.IGNORECASE,
)
PROCEDURAL_RE = re.compile(
    r"\b(SOP|procedure|clause|section|API\s?\d+|ASME|B31\.\d|IS\s?\d+|per\s+[A-Z])\b"
)
CONCLUSION_RE = re.compile(
    r"\b(remaining life|corrosion rate|fitness[- ]for[- ]service|MAWP|"
    r"retirement thickness|interval|life expectancy)\b",
    re.IGNORECASE,
)


class ClaimExtractor:
    def __init__(self) -> None:
        self.config = get_config()

    def deterministic(self, task_id: str, text: str) -> list[Claim]:
        """Sentence-level extraction that cannot fail. Always run; used as the
        sole source when the model pass is unavailable, and as a cross-check on
        coverage when it is."""
        claims: list[Claim] = []
        offset = 0
        index = 0
        for sentence in SENTENCE_SPLIT.split(text or ""):
            start = text.find(sentence, offset) if sentence else -1
            offset = max(offset, start + len(sentence)) if start >= 0 else offset
            candidate = sentence.strip()
            if len(candidate) < 15:
                continue
            if not self._is_material(candidate):
                continue
            index += 1
            claims.append(
                Claim(
                    id=f"K{index}",
                    task_id=task_id,
                    text=candidate,
                    type=self.classify(candidate),
                    impact=self.impact(candidate),
                    cited_ids=[c.evidence_id for c in parse_citations(candidate)],
                    quantities=self.quantities(candidate),
                    span=(start, start + len(sentence)) if start >= 0 else None,
                )
            )
        return claims

    @staticmethod
    def _is_material(sentence: str) -> bool:
        return bool(
            QUANTITY_RE.search(sentence)
            or DIRECTIVE_RE.search(sentence)
            or PROCEDURAL_RE.search(sentence)
            or CONCLUSION_RE.search(sentence)
        )

    @staticmethod
    def classify(sentence: str) -> ClaimType:
        # Order matters: a recommendation carrying a number is still a
        # recommendation, because that is what determines how it is verified.
        if DIRECTIVE_RE.search(sentence) and not PROCEDURAL_RE.search(sentence):
            return ClaimType.RECOMMENDATION
        if PROCEDURAL_RE.search(sentence):
            return ClaimType.PROCEDURAL
        if CONCLUSION_RE.search(sentence) and QUANTITY_RE.search(sentence):
            return ClaimType.ENGINEERING_CONCLUSION
        if QUANTITY_RE.search(sentence):
            return ClaimType.NUMERICAL
        return ClaimType.FACTUAL

    @staticmethod
    def impact(sentence: str) -> ClaimImpact:
        """Impact drives the gate, so it is rule-based and declared in
        policies/approval-rules.yaml, never inferred by a model."""
        lowered = sentence.lower()
        if any(term in lowered for term in
               ("fit for service", "safe to operate", "continue in service",
                "shut down", "no action", "derate")):
            return ClaimImpact.CRITICAL
        if CONCLUSION_RE.search(sentence) or DIRECTIVE_RE.search(sentence):
            return ClaimImpact.HIGH
        if QUANTITY_RE.search(sentence):
            return ClaimImpact.MEDIUM
        return ClaimImpact.LOW

    @staticmethod
    def quantities(sentence: str) -> list[ClaimQuantity]:
        found: list[ClaimQuantity] = []
        for match in QUANTITY_RE.finditer(sentence):
            raw_value, raw_unit = match.group(1), match.group(2)
            value = float(raw_value.replace(",", ""))
            normalized_value = normalized_unit = None
            try:
                parsed = parse_quantity("claim", value, raw_unit, expect=_dimension_of(raw_unit))
                base = parsed.quantity.to_base_units()
                normalized_value = float(base.magnitude)
                normalized_unit = f"{base.units:~P}"
            except Exception:
                pass          # an unparseable unit is recorded as-is, never raises
            found.append(
                ClaimQuantity(
                    raw=match.group(0), value=value, unit=raw_unit,
                    normalized_value=normalized_value, normalized_unit=normalized_unit,
                )
            )
        return found

    async def extract(
        self, task_id: str, text: str, *, generate
    ) -> tuple[list[Claim], str]:
        """Model pass with a deterministic fallback and a coverage guard.

        ``generate`` is the stage's routed model call, injected so the extractor
        has no dependency on the orchestrator.
        """
        baseline = self.deterministic(task_id, text)
        if not baseline:
            return [], "deterministic"
        try:
            raw = await generate(
                stage="verification",
                prompt=self.config.prompt("task.extract_claims", text=text[:8000]),
                format_json=True,
            )
            parsed = _parse_json(raw) or {}
            modelled = self._from_model(task_id, text, parsed)
        except Exception:
            return baseline, "deterministic"

        # Coverage guard: the model must not drop material sentences. If it
        # returns fewer claims than the deterministic pass found, the
        # deterministic set wins. Under-reporting claims is how a verifier
        # flatters itself.
        if len(modelled) < len(baseline):
            return baseline, "deterministic (model under-reported)"
        return modelled, "model"
```

`config/prompts/prompts.yaml` gains `extract_claims`, returning
`{"claims":[{"text":..., "type":..., "evidence_ids":[...]}]}`. The model's `type` is accepted
only when it is a valid enum member; otherwise `classify()` decides. The model's
`evidence_ids` populate `cited_ids` and nothing else.

### 5.3 `evidence_mapper.py` — mapping computed independently

```python
"""Claim -> evidence mapping.

Deliberately does NOT consult the claim's citations when scoring. The model's
citations are compared with this result afterwards; if the mapper used them as
input, agreement would be circular and worthless.
"""

from __future__ import annotations

import math
import re
from collections import Counter

from backend.evidence.ledger import EvidenceLedger
from backend.evidence.models import Evidence, EvidenceType
from backend.verification.models import (
    Claim, ClaimEvidenceLink, LinkRelation,
)

TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9\-_/.]*")
TAG_RE = re.compile(r"\b[A-Z]{1,4}-\d{2,5}[A-Z]?\b")     # V-2104, P-101A, TML-07
DOC_RE = re.compile(r"\b(?:SOP|API|ASME|IS|EN|ISO)[- ]?[A-Z0-9.\-]{2,}\b", re.IGNORECASE)

NUMERIC_TOLERANCE = 0.005        # 0.5% — a transcription match, not an engineering tolerance
SUPPORT_THRESHOLD = 0.45


class EvidenceMapper:
    def __init__(self, ledger: EvidenceLedger) -> None:
        self.ledger = ledger
        self._corpus = [e for e in ledger.items if not e.quarantined]
        self._idf = self._build_idf()

    def _build_idf(self) -> dict[str, float]:
        n = len(self._corpus) or 1
        df: Counter[str] = Counter()
        for item in self._corpus:
            for token in set(TOKEN_RE.findall(item.content.lower())):
                df[token] += 1
        return {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}

    def map(self, claim: Claim) -> list[ClaimEvidenceLink]:
        links: list[ClaimEvidenceLink] = []
        for item in self._corpus:
            numeric = self._numeric_agreement(claim, item)
            if numeric is not None:
                value, agrees = numeric
                links.append(
                    ClaimEvidenceLink(
                        evidence_id=item.id,
                        relation=(
                            LinkRelation.UNCITED_SUPPORT if agrees
                            else LinkRelation.CONTRADICTS
                        ),
                        score=0.95 if agrees else 0.9,
                        rationale=(
                            f"{value} appears in this evidence with the same "
                            f"subject and dimension"
                            if agrees else
                            f"this evidence states a different value for the same "
                            f"quantity ({value})"
                        ),
                        matched_quantity=value,
                    )
                )
                continue

            score, why = self._lexical(claim, item)
            if score >= SUPPORT_THRESHOLD:
                links.append(
                    ClaimEvidenceLink(
                        evidence_id=item.id,
                        relation=LinkRelation.UNCITED_SUPPORT,
                        score=round(score, 3),
                        rationale=why,
                    )
                )

        links.sort(key=lambda l: l.score, reverse=True)
        return links[:8]

    def _lexical(self, claim: Claim, item: Evidence) -> tuple[float, str]:
        """IDF-weighted overlap, with equipment tags and document references
        weighted heavily. Replaces verifier.py:112-123, where three shared
        five-letter words counted as documentary support."""
        claim_tokens = set(TOKEN_RE.findall(claim.text.lower()))
        item_tokens = set(TOKEN_RE.findall(item.content.lower()))
        if not claim_tokens:
            return 0.0, "no comparable terms"

        overlap = claim_tokens & item_tokens
        weight = sum(self._idf.get(t, 0.0) for t in overlap)
        total = sum(self._idf.get(t, 0.0) for t in claim_tokens) or 1.0
        score = weight / total

        claim_tags = set(TAG_RE.findall(claim.text))
        item_tags = set(TAG_RE.findall(item.content)) | set(item.equipment_tags)
        shared_tags = claim_tags & item_tags
        claim_docs = {d.upper() for d in DOC_RE.findall(claim.text)}
        item_docs = {d.upper() for d in DOC_RE.findall(item.content)}
        if item.document_id:
            item_docs.add(item.document_id.upper())
        shared_docs = claim_docs & item_docs

        # A claim naming an asset tag or a procedure that this evidence does
        # not mention is very unlikely to be about this evidence.
        if claim_tags and not shared_tags:
            score *= 0.35
        if claim_docs and not shared_docs:
            score *= 0.5
        if shared_tags:
            score = min(1.0, score + 0.2)
        if shared_docs:
            score = min(1.0, score + 0.15)

        reason = f"{len(overlap)} shared term(s), IDF-weighted coverage {score:.0%}"
        if shared_tags:
            reason += f"; shares asset tag {', '.join(sorted(shared_tags))}"
        if shared_docs:
            reason += f"; shares reference {', '.join(sorted(shared_docs))}"
        return score, reason

    def _numeric_agreement(self, claim: Claim, item: Evidence) -> tuple[str, bool] | None:
        """Compare normalised quantities, not digit strings.

        '0.55 mm/yr' and '0.00055 m/yr' agree. '18 bar' and '16 bar' do not,
        and produce a CONTRADICTS link rather than nothing.
        """
        if not claim.quantities:
            return None
        item_quantities = _quantities_of(item)
        if not item_quantities:
            return None
        if not _same_subject(claim, item):
            return None

        for cq in claim.quantities:
            if cq.normalized_value is None:
                continue
            comparable = [
                iq for iq in item_quantities
                if iq.normalized_unit == cq.normalized_unit
            ]
            if not comparable:
                continue
            best = min(comparable, key=lambda iq: abs(iq.normalized_value - cq.normalized_value))
            denominator = abs(cq.normalized_value) or 1.0
            difference = abs(best.normalized_value - cq.normalized_value) / denominator
            return cq.raw, difference <= NUMERIC_TOLERANCE
        return None
```

`_same_subject` requires a shared asset tag, a shared document reference, or (when the claim
names neither) lexical coverage above 0.3 — so "9.4 mm" in a claim about V-2104 is not matched
against "9.4 mm" in a document about P-101.

### 5.4 `numeric_verifier.py` — independent recomputation

```python
"""Recompute numeric claims where a deterministic formula exists.

Two routes, in this order:

1. The claim's number matches the output of a CALCULATION evidence already in
   the ledger (the normal case — the execute stage ran the formula, and the
   draft is quoting it). Comparison is unit-aware, so '6.2 years' matches a
   stored 6.2 year output and '74 months' matches it too.
2. The claim is numeric, no calculation covers it, and a formula in the
   registry can be bound from evidence-backed inputs. The binding is proposed
   by the model in a constrained second pass and executed deterministically.

There is no third route. A number that neither matches a calculation nor binds
to a formula is not 'verified' — at best it is SUPPORTED by a document that
states it.
"""

from __future__ import annotations

from typing import Any

from backend.engineering.registry import (
    CalculationRequest, CalculationResult, get_formula_registry,
)
from backend.engineering.units import registry as ureg
from backend.evidence.ledger import EvidenceLedger
from backend.evidence.models import EvidenceType
from backend.verification.models import Claim, ClaimEvidenceLink, LinkRelation

RELATIVE_TOLERANCE = 0.01        # from policies/approval-rules.yaml verification.calculation_tolerance


def coerce_number(value: Any) -> float | None:
    """Moved verbatim from backend/agents/verifier.py:43.

    Kept because tests/test_verifier_robustness.py pins its behaviour and that
    behaviour is correct: model output is untrusted input and '19.9 mm' must
    yield 19.9, not an exception that kills a finished run.
    """
    ...


class NumericVerifier:
    def __init__(self, ledger: EvidenceLedger) -> None:
        self.ledger = ledger
        self.registry = get_formula_registry()
        self._calculations = [
            e for e in ledger.by_type(EvidenceType.CALCULATION) if e.structured
        ]

    def check(self, claim: Claim) -> tuple[ClaimEvidenceLink | None, dict[str, Any] | None]:
        for evidence in self._calculations:
            result = CalculationResult(**evidence.structured)
            for cq in claim.quantities:
                agreement = self._compare(cq, result)
                if agreement is None:
                    continue
                difference, matched = agreement
                return (
                    ClaimEvidenceLink(
                        evidence_id=evidence.id,
                        relation=(
                            LinkRelation.RECOMPUTED if matched
                            else LinkRelation.CONTRADICTS
                        ),
                        score=1.0,
                        rationale=(
                            f"{result.formula_title} "
                            f"({result.formula_id}@{result.formula_version}) computed "
                            f"{result.output_value:.4g} {result.output_unit}; the claim "
                            f"states {cq.raw}; relative difference {difference:.3%} "
                            f"(tolerance {RELATIVE_TOLERANCE:.1%})"
                        ),
                        matched_quantity=cq.raw,
                    ),
                    {
                        "formula_id": result.formula_id,
                        "formula_version": result.formula_version,
                        "calculation_key": result.calculation_key,
                        "computed_value": result.output_value,
                        "computed_unit": result.output_unit,
                        "claimed": cq.raw,
                        "relative_difference": difference,
                        "matched": matched,
                        "supporting_evidence_ids": result.supporting_evidence_ids,
                    },
                )
        return None, None

    @staticmethod
    def _compare(cq, result: CalculationResult) -> tuple[float, bool] | None:
        """Unit-aware comparison. Returns None when the dimensions differ,
        because a length claim is not evidence about a time result."""
        if cq.unit is None:
            return None
        u = ureg()
        try:
            claimed = u.Quantity(cq.value, cq.unit)
            computed = u.Quantity(result.output_value, result.output_unit)
            claimed_in_result_units = claimed.to(computed.units)
        except Exception:
            return None
        denominator = abs(float(computed.magnitude)) or 1.0
        difference = abs(float(claimed_in_result_units.magnitude) - float(computed.magnitude)) / denominator
        return difference, difference <= RELATIVE_TOLERANCE
```

The old failure mode at `verifier.py:226-230` — *"model asserted no value, so mark it matched
and count it verified"* — is gone: a calculation with nothing claimed against it produces no
link and changes no claim's status.

### 5.5 `verifier.py` — status assignment

```python
class ClaimVerifier:
    def __init__(self, ledger: EvidenceLedger) -> None:
        self.ledger = ledger
        self.mapper = EvidenceMapper(ledger)
        self.numeric = NumericVerifier(ledger)
        self.conflicts = ContradictionDetector(ledger)

    def verify(self, claims: list[Claim], conflicts: list[EvidenceConflict]) -> list[Claim]:
        by_evidence: dict[str, list[EvidenceConflict]] = defaultdict(list)
        for conflict in conflicts:
            by_evidence[conflict.left.evidence_id].append(conflict)
            by_evidence[conflict.right.evidence_id].append(conflict)

        for claim in claims:
            claim.invented_ids = self.ledger.unknown(claim.cited_ids)
            links = self.mapper.map(claim)

            numeric_link, recomputation = self.numeric.check(claim)
            if numeric_link is not None:
                links = [numeric_link] + [l for l in links if l.evidence_id != numeric_link.evidence_id]
                claim.recomputation = recomputation

            # Reconcile the model's citations with the independent mapping.
            found = {l.evidence_id for l in links}
            for cited in claim.cited_ids:
                if cited in self.ledger.unknown([cited]):
                    continue
                if cited in found:
                    for link in links:
                        if link.evidence_id == cited and link.relation is LinkRelation.UNCITED_SUPPORT:
                            link.relation = LinkRelation.CITED_AND_CONFIRMED
                else:
                    links.append(
                        ClaimEvidenceLink(
                            evidence_id=cited,
                            relation=LinkRelation.CITED_BUT_UNSUPPORTED,
                            score=0.0,
                            rationale=(
                                "the draft cites this evidence, but independent "
                                "mapping found no support for the claim in it"
                            ),
                        )
                    )
            claim.links = links
            claim.conflict_ids = sorted(
                {c.id for l in links for c in by_evidence.get(l.evidence_id, [])}
            )
            claim.status, claim.reason = self._status(claim)
        return claims

    def _status(self, claim: Claim) -> tuple[ClaimStatus, str]:
        if claim.invented_ids:
            return (
                ClaimStatus.UNSUPPORTED,
                f"cites {', '.join(claim.invented_ids)}, which no evidence in this "
                f"task's ledger matches",
            )

        recomputed = [l for l in claim.links if l.relation is LinkRelation.RECOMPUTED]
        contradicting = [l for l in claim.links if l.relation is LinkRelation.CONTRADICTS]
        supporting = [
            l for l in claim.links
            if l.relation in {LinkRelation.CITED_AND_CONFIRMED, LinkRelation.UNCITED_SUPPORT}
        ]

        if contradicting:
            return (
                ClaimStatus.CONFLICTED,
                contradicting[0].rationale,
            )
        if claim.conflict_ids:
            return (
                ClaimStatus.CONFLICTED,
                f"rests on evidence involved in unresolved conflict(s) "
                f"{', '.join(claim.conflict_ids)}",
            )
        if claim.type is ClaimType.RECOMMENDATION and claim.impact in {
            ClaimImpact.HIGH, ClaimImpact.CRITICAL
        }:
            return (
                ClaimStatus.NEEDS_REVIEW,
                "a high-impact recommendation is a judgement; the system does not "
                "mark it verified, it routes it to a competent person",
            )
        if recomputed:
            return (
                ClaimStatus.VERIFIED,
                recomputed[0].rationale,
            )
        if supporting:
            superseded = [
                l for l in supporting
                if (e := self.ledger.get(l.evidence_id))
                and e.document_status is not None
                and e.document_status is not DocumentStatus.ACTIVE
            ]
            if superseded:
                evidence = self.ledger.get(superseded[0].evidence_id)
                return (
                    ClaimStatus.NEEDS_REVIEW,
                    f"the supporting evidence {evidence.id} comes from "
                    f"{evidence.document_status.value} revision {evidence.revision}"
                    + (f", replaced by {evidence.superseded_by_document}"
                       if evidence.superseded_by_document else ""),
                )
            low = [
                l for l in supporting
                if (e := self.ledger.get(l.evidence_id)) and e.confidence < 0.35
            ]
            if low and claim.impact in {ClaimImpact.HIGH, ClaimImpact.CRITICAL}:
                return (
                    ClaimStatus.NEEDS_REVIEW,
                    "the only supporting evidence was read with low confidence",
                )
            return (
                ClaimStatus.SUPPORTED,
                f"supported by {', '.join(l.evidence_id for l in supporting[:3])}: "
                f"{supporting[0].rationale}",
            )
        return (
            ClaimStatus.UNSUPPORTED,
            "no evidence in the ledger supports this statement",
        )
```

### 5.6 `gate.py` — blocking unsupported high-impact claims

```python
class ClaimGate:
    """Decides whether the claim set may pass. Thresholds come from
    policies/approval-rules.yaml so an operator, not this file, sets them."""

    BLOCKING = {ClaimStatus.UNSUPPORTED, ClaimStatus.CONFLICTED}

    def evaluate(self, report: ClaimReport, profile: TaskProfile) -> ClaimGateDecision:
        rules = get_config().approval_rules.get("claims", {})
        block_at = {ClaimImpact(i) for i in rules.get("block_impact_at_or_above", ["high"])}
        max_unsupported = float(rules.get("max_unsupported_fraction", 0.15))

        blocked = [
            c.id for c in report.claims
            if c.status in self.BLOCKING and c.impact in block_at
        ]
        needs_human = [
            c.id for c in report.claims if c.status is ClaimStatus.NEEDS_REVIEW
        ]
        material = [c for c in report.claims if c.impact is not ClaimImpact.LOW]
        unsupported_fraction = (
            sum(1 for c in material if c.status is ClaimStatus.UNSUPPORTED) / len(material)
            if material else 0.0
        )

        if blocked:
            return ClaimGateDecision(
                decision=PolicyDecision.DENY,
                blocked_claim_ids=blocked,
                reason=(
                    f"{len(blocked)} high-impact claim(s) are unsupported or "
                    f"conflicted and cannot be released: "
                    f"{', '.join(blocked[:5])}"
                ),
                rule="claims.block_impact_at_or_above",
            )
        if needs_human or unsupported_fraction > max_unsupported:
            return ClaimGateDecision(
                decision=PolicyDecision.REQUIRE_APPROVAL,
                reason=(
                    f"{len(needs_human)} claim(s) need human review; "
                    f"{unsupported_fraction:.0%} of material claims are unsupported "
                    f"(threshold {max_unsupported:.0%})"
                ),
                rule="claims.max_unsupported_fraction",
                review_claim_ids=needs_human,
            )
        return ClaimGateDecision(decision=PolicyDecision.ALLOW, reason="all material claims are supported or verified")
```

Wired into the approve stage: the existing `gateway.approval_requirement(...)`
(`policy/gateway.py:347`) gains a keyword `claim_gate: ClaimGateDecision | None = None`, and a
`DENY` there sets `TaskStatus.BLOCKED` with the deliverable never released. `policies/approval-rules.yaml`
gains:

```yaml
claims:
  block_impact_at_or_above: [high, critical]
  max_unsupported_fraction: 0.15
  recommendation_always_reviewed: true
```

### 5.7 What happens to `backend/agents/verifier.py` and `VerificationReport`

**`backend/agents/verifier.py` becomes a shim, then dies.** For one release it keeps its public
surface — `get_verification_engine()`, `check_sources`, `check_calculations`, `check_code`,
`check_document`, `compile_report`, `material_claims`, `_coerce_number` — with every method
delegating to `backend/verification/`. That keeps `orchestrator.py:830-889` compiling while the
pipeline migration (§8.7) proceeds, and keeps `tests/test_verifier_robustness.py` green
unchanged. It is deleted at the end of step 6 of the migration sequence.

**`VerificationReport` is extended, not replaced.** The frontend consumes
`frontend/lib/types.ts:142-149` and renders `checks`, `material_claims_total`,
`material_claims_supported`, `limitations`, `valid`. All five survive with their meanings
intact:

```python
class VerificationReport(BaseModel):
    # -- unchanged, still populated
    valid: bool
    checks: list[VerificationCheck] = Field(default_factory=list)
    material_claims_total: int = 0
    material_claims_supported: int = 0
    limitations: list[str] = Field(default_factory=list)
    completed_at: datetime

    # -- added (all defaulted, so every existing consumer keeps working)
    claims: list[Claim] = Field(default_factory=list)
    conflicts: list[EvidenceConflict] = Field(default_factory=list)
    blocked_claim_ids: list[str] = Field(default_factory=list)
    review_claim_ids: list[str] = Field(default_factory=list)
    claims_by_status: dict[str, int] = Field(default_factory=dict)
    evidence_count: int = 0
    calculations: list[CalculationResult] = Field(default_factory=list)
    coverage: list[SourceCoverage] = Field(default_factory=list)   # per file: pages read / total
    verifier_version: str = "2.0.0"
    extractor: str = "deterministic"
```

`checks` is now **synthesised from the claim set** so the existing UI keeps showing something
true:

| Check name | kind | passed when |
|---|---|---|
| `source_verification` | `source` | no material claim is `UNSUPPORTED` |
| `calculation_verification` | `calculation` | every recomputed claim matched |
| `code_verification` | `code` | unchanged — `check_code` moves across verbatim |
| `document_verification` | `document` | structure present **and** every cited id resolves (no more `S|F` regex) |
| `hallucination_check` | `hallucination` | no claim cites an id absent from the ledger |
| `contradiction_check` | `conflict` ← **new kind** | no unresolved high-severity conflict |
| `completeness_check` | `coverage` ← **new kind** | every page of every source was read or explicitly skipped |

`material_claims_total` becomes `len([c for c in claims if c.impact is not LOW])` and
`material_claims_supported` counts `VERIFIED + SUPPORTED`. Both numbers get *smaller and
truer*; that is the point.

**Migration path, concretely:**

1. New fields land defaulted. Backend deploys. Frontend untouched — it ignores unknown keys.
   Old task rows deserialise because every new field has a default.
2. `VerificationCheck.kind` widens from
   `Literal["source","calculation","code","document","hallucination"]` to include `"conflict"`
   and `"coverage"`. **This is a breaking change for any strict Python consumer** (see §9.4);
   `frontend/lib/types.ts:131` declares `kind?: string`, so TS is unaffected.
3. Frontend adds claim/conflict surfaces against `task.verification.claims`.
   **DEPENDS-ON: Frontend agent** — evidence drawer and Proof Mode.
4. One release later, `backend/agents/verifier.py` is deleted and `material_claims_*` are
   marked deprecated in favour of `claims_by_status`.

---

## 6. CONTRADICTION DETECTION (item 10)

`backend/verification/contradictions.py`. Runs over the **ledger**, not over the draft — the
point is to catch two documents disagreeing before the model silently picks one.

### 6.1 Normalising evidence into comparable assertions

```python
"""Contradiction detection across evidence.

The failure this prevents: two procedures in the knowledge base state different
design pressures for the same vessel, the retriever returns both, and the model
picks whichever it saw last. Nobody is told a choice was made.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Iterable, Literal

from pydantic import BaseModel, Field

from backend.engineering.units import registry as ureg
from backend.evidence.ledger import EvidenceLedger
from backend.evidence.models import DocumentStatus, Evidence

TAG_RE = re.compile(r"\b[A-Z]{1,4}-\d{2,5}[A-Z]?\b")

# Attribute vocabulary. Declared, not inferred: a detector that guesses what an
# attribute is will generate conflicts nobody can act on.
ATTRIBUTES: dict[str, tuple[str, str, float]] = {
    # phrase pattern                     -> (attribute key, dimension, tolerance)
    r"design pressure":                     ("design_pressure", "pressure", 0.01),
    r"(?:maximum allowable working pressure|MAWP)": ("mawp", "pressure", 0.01),
    r"(?:operating|working) pressure":      ("operating_pressure", "pressure", 0.02),
    r"(?:minimum (?:allowable|required)|retirement) thickness": ("t_required", "length", 0.01),
    r"(?:measured|actual|remaining) (?:wall )?thickness": ("t_actual", "length", 0.01),
    r"corrosion rate":                      ("corrosion_rate", "corrosion_rate", 0.05),
    r"remaining life":                      ("remaining_life", "time", 0.05),
    r"(?:inspection|re-?inspection) interval": ("inspection_interval", "time", 0.05),
    r"design temperature":                  ("design_temperature", "temperature", 0.01),
}
ATTRIBUTE_PATTERNS = [
    (re.compile(pattern, re.IGNORECASE), key, dimension, tolerance)
    for pattern, (key, dimension, tolerance) in ATTRIBUTES.items()
]

QUANTITY_RE = re.compile(
    r"(-?\d+(?:[.,]\d+)?)\s*"
    r"(mm/yr|mm/year|mpy|mm|cm|m|in|ft|bar|barg|psi|psig|kPa|MPa|°C|°F|K|years?|months?)\b",
    re.IGNORECASE,
)
STATUS_RE = re.compile(
    r"\b(active|current|in force|superseded|obsolete|withdrawn|expired|"
    r"draft|for review|cancelled)\b",
    re.IGNORECASE,
)
STATUS_CLASSES = {
    "active": "current", "current": "current", "in force": "current",
    "superseded": "retired", "obsolete": "retired", "withdrawn": "retired",
    "expired": "retired", "cancelled": "retired",
    "draft": "draft", "for review": "draft",
}

CRITICALITY = {
    "design_pressure": "critical", "mawp": "critical",
    "t_required": "critical", "t_actual": "high",
    "corrosion_rate": "high", "remaining_life": "high",
    "inspection_interval": "medium", "operating_pressure": "medium",
    "design_temperature": "high",
}


@dataclass(frozen=True)
class Assertion:
    evidence_id: str
    subject: str            # "V-2104", or the document id when no tag is present
    attribute: str          # "design_pressure"
    dimension: str
    value: float            # normalised to base units
    unit: str               # normalised unit
    raw: str                # "18 bar", as written
    sentence: str
    tolerance: float
```

Extraction walks each evidence item sentence by sentence; a sentence contributes an
`Assertion` only when it contains **both** a recognised attribute phrase and a quantity of the
matching dimension. That conjunction is what keeps the false-positive rate low enough for the
conflicts to be worth showing a judge.

### 6.2 The conflict object the UI renders side-by-side

```python
class ConflictSide(BaseModel):
    evidence_id: str
    evidence_type: str
    filename: str | None = None
    document_id: str | None = None
    revision: str | None = None
    document_status: str | None = None
    effective_date: date | None = None
    page: int | None = None
    location: str | None = None
    value: str                      # "18 bar" — as written in the source
    normalized_value: float | None = None
    normalized_unit: str | None = None
    excerpt: str                    # the sentence, for side-by-side display
    classification: str


class EvidenceConflict(BaseModel):
    id: str                         # "CF1"
    task_id: str
    kind: Literal["numeric", "status", "revision", "date", "textual"]
    subject: str                    # "V-2104"
    attribute: str                  # "design_pressure"
    attribute_label: str            # "Design pressure"
    severity: Literal["low", "medium", "high", "critical"]
    summary: str                    # "18 bar vs 16 bar — 12.5% apart"
    difference: str
    left: ConflictSide
    right: ConflictSide
    preferred_evidence_id: str | None = None   # set only when revision status decides it
    preference_reason: str | None = None
    resolution: Literal[
        "unresolved", "human_resolved", "superseded_preferred"
    ] = "unresolved"
    resolved_by: str | None = None
    resolution_note: str | None = None
    resolved_at: datetime | None = None
    affected_claim_ids: list[str] = Field(default_factory=list)
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def blocks(self) -> bool:
        return self.resolution == "unresolved" and self.severity in {"high", "critical"}
```

`left`/`right` are deliberately symmetrical and each carry everything the UI needs to render a
two-column panel without a second fetch: source, revision, page, the sentence, and the value as
written. **DEPENDS-ON: Frontend agent** — a `ConflictPanel` in the evidence drawer and a
conflict row in Proof Mode.

### 6.3 Detection

```python
class ContradictionDetector:
    def __init__(self, ledger: EvidenceLedger) -> None:
        self.ledger = ledger

    def detect(self) -> list[EvidenceConflict]:
        assertions = list(self._assertions())
        grouped: dict[tuple[str, str], list[Assertion]] = defaultdict(list)
        for assertion in assertions:
            grouped[(assertion.subject, assertion.attribute)].append(assertion)

        conflicts: list[EvidenceConflict] = []
        index = 0
        for (subject, attribute), group in sorted(grouped.items()):
            for left, right in self._disagreeing_pairs(group):
                index += 1
                conflicts.append(self._numeric_conflict(f"CF{index}", subject, attribute, left, right))

        for conflict in self._status_conflicts(start=index):
            conflicts.append(conflict)
        for conflict in self._revision_conflicts(start=index + len(conflicts)):
            conflicts.append(conflict)
        return conflicts

    @staticmethod
    def _disagreeing_pairs(group: list[Assertion]) -> Iterable[tuple[Assertion, Assertion]]:
        """Every pair that differs beyond the attribute's tolerance, deduplicated
        by (evidence pair). Values from the SAME evidence item are not compared —
        a document restating its own number is not a contradiction."""
        seen: set[tuple[str, str]] = set()
        for i, left in enumerate(group):
            for right in group[i + 1:]:
                if left.evidence_id == right.evidence_id:
                    continue
                key = tuple(sorted((left.evidence_id, right.evidence_id)))
                if key in seen:
                    continue
                denominator = max(abs(left.value), abs(right.value)) or 1.0
                if abs(left.value - right.value) / denominator > left.tolerance:
                    seen.add(key)
                    yield left, right

    def _numeric_conflict(self, cid, subject, attribute, left, right) -> EvidenceConflict:
        left_e = self.ledger.get(left.evidence_id)
        right_e = self.ledger.get(right.evidence_id)
        denominator = max(abs(left.value), abs(right.value)) or 1.0
        spread = abs(left.value - right.value) / denominator

        severity = CRITICALITY.get(attribute, "medium")
        if spread > 0.25 and severity in {"medium", "high"}:
            severity = "critical" if severity == "high" else "high"

        preferred, reason = self._prefer_by_revision(left_e, right_e)

        return EvidenceConflict(
            id=cid,
            task_id=self.ledger.task_id,
            kind="numeric",
            subject=subject,
            attribute=attribute,
            attribute_label=attribute.replace("_", " ").capitalize(),
            severity=severity,
            summary=f"{left.raw} vs {right.raw}",
            difference=f"{left.raw} vs {right.raw} — {spread:.1%} apart",
            left=_side(left_e, left),
            right=_side(right_e, right),
            preferred_evidence_id=preferred,
            preference_reason=reason,
            resolution="superseded_preferred" if preferred else "unresolved",
        )

    @staticmethod
    def _prefer_by_revision(left: Evidence, right: Evidence) -> tuple[str | None, str | None]:
        """A conflict between an ACTIVE revision and a SUPERSEDED one is not a
        judgement call — the active revision governs. It is still surfaced, but
        it does not block, and the reason is recorded."""
        pairs = ((left, right), (right, left))
        for candidate, other in pairs:
            if (
                candidate.document_status is DocumentStatus.ACTIVE
                and other.document_status in {DocumentStatus.SUPERSEDED, DocumentStatus.EXPIRED}
            ):
                return (
                    candidate.id,
                    f"{candidate.id} is the ACTIVE revision "
                    f"({candidate.revision}); {other.id} is "
                    f"{other.document_status.value} revision {other.revision}",
                )
        return None, None
```

`_status_conflicts` compares `STATUS_CLASSES` assertions about the same document — the
roadmap's "active vs superseded procedures". `_revision_conflicts` catches the case where two
evidence items carry the same `document_id` but different `revision` values, which is a
retrieval bug as much as a content one, and is emitted at severity `high`.

### 6.4 Raising task risk, and requiring a human

Three effects, all mechanical:

1. **Claim status.** Any claim whose supporting evidence participates in an unresolved conflict
   becomes `CONFLICTED` (§5.5, the `claim.conflict_ids` branch). That is how a conflict stops
   "unsupported automatic conclusions" rather than merely annotating them.
2. **Approval.** `ClaimGate` (§5.6) treats `CONFLICTED` as blocking at impact ≥ HIGH. Separately,
   any conflict with `.blocks == True` forces `ApprovalRecord.required = True` with the reason
   `"unresolved {severity} conflict: {summary}"`, and adds the reviewer roles configured for
   `conflicts.approver_roles`. `policies/approval-rules.yaml`:
   ```yaml
   conflicts:
     block_severity_at_or_above: high
     approver_roles: [inspection_engineer, integrity_manager]
     auto_prefer_active_revision: true
   ```
3. **Risk on the task.** `VerificationReport.valid` goes false while any conflict blocks, and
   the `contradiction_check` synthesised check (§5.7) carries the summaries as `warnings`, so
   the existing UI shows it without frontend work.

### 6.5 Resolution as evidence

A reviewer resolving a conflict is a material act and must be in the ledger:

```python
# backend/evidence/provenance.py (continued)

def from_human(
    user: "User",
    *,
    statement: str,
    kind: Literal["approval", "rejection", "conflict_resolution", "override", "assertion"],
    subject_ref: str | None = None,
    derived_from: list[str] | None = None,
) -> EvidenceDraft:
    """A named person's assertion, recorded with the same rigour as a document.

    The sovereignty certificate needs to prove who said a conflicted number was
    acceptable; that proof has to be an evidence record, not a log line.
    """
    return EvidenceDraft(
        type=EvidenceType.HUMAN,
        modality=Modality.TEXT,
        source_id=user.id,
        source_kind="human",
        content=statement,
        structured={
            "kind": kind,
            "reviewer": user.display_name,
            "role": user.role,
            "subject_ref": subject_ref,
        },
        confidence=1.0,
        extraction_method=f"human:{kind}",
        classification=Sensitivity.NORMAL,
        department=user.department,
        derived_from=derived_from or [],
    )
```

`POST /api/tasks/{task_id}/conflicts/{conflict_id}/resolve` registers `H{n}`, sets
`resolution="human_resolved"`, `resolved_by`, `resolution_note`, re-runs `ClaimVerifier` over
the affected claims only, and re-evaluates the gate. Because approval invalidation is roadmap
item 25 (**DEPENDS-ON: Backend B**), this endpoint records `output_hash` at resolution time so
that work can detect a post-resolution edit.

---

## 7. HYBRID RAG (item 11) AND REVISION INTELLIGENCE (item 12)

### 7.1 Libraries — what is already here, what to add

`requirements.txt` today has no retrieval library at all. BM25 is hand-written at
`rag/knowledge_base.py:257-290` and embeddings come from the local Ollama model via
`models_layer/client.py`. Recommendation, in order of preference:

| Need | Choice | Why | New dependency |
|---|---|---|---|
| Lexical retrieval | **SQLite FTS5** (`sqlite3`, already imported at `core/database.py:13`) | Ships with CPython's bundled SQLite. Gives a real inverted index and a native `bm25()` ranking function. Works offline by construction. | **none** |
| Dense retrieval | the existing local embedding model via `KnowledgeBase._embed` (`rag/knowledge_base.py:117-125`) | already offline, already routed through the model registry | none |
| Fusion + rerank | **Reciprocal Rank Fusion + a deterministic feature reranker**, written in `backend/rag/reranker.py` | reproducible, explainable in Proof Mode, zero weights to pre-stage, no GPU | none |
| Optional stronger rerank | `sentence-transformers` cross-encoder `ms-marco-MiniLM-L-6-v2` | measurably better, but drags in `torch` (~800 MB) and a model that must be hash-pinned in the offline bundle | `sentence-transformers`, `torch` — **only if** item 36's bundle can carry them |

**Do not add `rank-bm25`.** It holds the whole corpus in memory and rebuilds statistics per
query — the same defect the current code has, just someone else's. FTS5 is strictly better and
free.

Why the current BM25 must be replaced regardless: `rag/knowledge_base.py:303` loads **every
chunk in the database** into Python on every search (`self.db.iter_chunks(departments)`), then
`:262` tokenises all of them. Retrieval is O(corpus) per query in wall-clock and memory. With
a few hundred SOPs on a CPU demo host that is seconds per query, before any inference.

FTS5 addition to `core/database.py` `SCHEMA`:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
    content,
    content='knowledge_chunks',
    content_rowid='rowid',
    tokenize='porter unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ai AFTER INSERT ON knowledge_chunks BEGIN
    INSERT INTO knowledge_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ad AFTER DELETE ON knowledge_chunks BEGIN
    INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
END;
CREATE TRIGGER IF NOT EXISTS knowledge_chunks_au AFTER UPDATE ON knowledge_chunks BEGIN
    INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content)
    VALUES ('delete', old.rowid, old.content);
    INSERT INTO knowledge_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;
```

A one-time backfill (`INSERT INTO knowledge_chunks_fts(rowid, content) SELECT rowid, content
FROM knowledge_chunks`) runs on first boot after the migration, guarded by a `schema_version`
row. FTS5 availability is checked at startup (`sqlite3.connect(':memory:').execute("CREATE
VIRTUAL TABLE t USING fts5(x)")`); if a host's SQLite lacks it, the system falls back to the
existing in-memory BM25 and `SystemHealth` reports `retrieval_mode: "lexical-degraded"` rather
than pretending.

### 7.2 Metadata, and filtering *before* scoring

Columns added to `knowledge_documents`:

```sql
ALTER TABLE knowledge_documents ADD COLUMN document_key   TEXT;    -- "SOP-INS-014" — stable identity
ALTER TABLE knowledge_documents ADD COLUMN revision       TEXT;
ALTER TABLE knowledge_documents ADD COLUMN effective_date TEXT;
ALTER TABLE knowledge_documents ADD COLUMN supersedes     TEXT;
ALTER TABLE knowledge_documents ADD COLUMN superseded_by  TEXT;
ALTER TABLE knowledge_documents ADD COLUMN status         TEXT NOT NULL DEFAULT 'active';
ALTER TABLE knowledge_documents ADD COLUMN owner_role     TEXT;
ALTER TABLE knowledge_documents ADD COLUMN equipment_tags TEXT NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_documents_key    ON knowledge_documents(document_key, status);
CREATE INDEX IF NOT EXISTS idx_documents_status ON knowledge_documents(status);
```

and to `knowledge_chunks`:

```sql
ALTER TABLE knowledge_chunks ADD COLUMN page           INTEGER;
ALTER TABLE knowledge_chunks ADD COLUMN section        TEXT;
ALTER TABLE knowledge_chunks ADD COLUMN equipment_tags TEXT NOT NULL DEFAULT '[]';
```

(`ALTER TABLE … ADD COLUMN` is idempotent-safe behind a `PRAGMA table_info` check in the
migration helper; SQLite has no `IF NOT EXISTS` for columns.)

`backend/rag/metadata.py` owns the filter object and its translation to SQL:

```python
class RetrievalMode(str, Enum):
    NORMAL = "normal"        # ACTIVE revisions only
    AUDIT = "audit"          # all revisions; requires knowledge.read.historical
    EXPLICIT = "explicit"    # named revisions only


class RetrievalFilter(BaseModel):
    """Everything that narrows the candidate set BEFORE scoring.

    Today the clearance filter runs after retrieval (tools/registry.py:235-240)
    and after the top_k cut (knowledge_base.py:326-331), so a user without
    clearance for the top 6 hits gets nothing while permitted passages existed
    at rank 7. Applying it in SQL fixes both problems at once.
    """

    max_classification: Sensitivity
    departments: list[str] | None = None
    mode: RetrievalMode = RetrievalMode.NORMAL
    statuses: list[DocumentStatus] | None = None       # derived from mode when None
    document_keys: list[str] | None = None
    revision_ids: list[str] | None = None
    equipment_tags: list[str] | None = None
    effective_on: date | None = None
    exclude_quarantined: bool = True

    def where(self) -> tuple[str, list[Any]]:
        clauses = ["d.classification IN (%s)" % ",".join("?" * len(self._allowed_levels()))]
        params: list[Any] = list(self._allowed_levels())
        statuses = self.statuses or (
            [DocumentStatus.ACTIVE] if self.mode is RetrievalMode.NORMAL
            else list(DocumentStatus)
        )
        clauses.append("d.status IN (%s)" % ",".join("?" * len(statuses)))
        params.extend(s.value for s in statuses)
        if self.departments:
            clauses.append("d.department IN (%s)" % ",".join("?" * len(self.departments)))
            params.extend(self.departments)
        if self.document_keys:
            clauses.append("d.document_key IN (%s)" % ",".join("?" * len(self.document_keys)))
            params.extend(self.document_keys)
        if self.effective_on:
            clauses.append("(d.effective_date IS NULL OR d.effective_date <= ?)")
            params.append(self.effective_on.isoformat())
        if self.equipment_tags:
            clauses.append(
                "(" + " OR ".join(["d.equipment_tags LIKE ?"] * len(self.equipment_tags)) + ")"
            )
            params.extend(f'%"{tag}"%' for tag in self.equipment_tags)
        return " AND ".join(clauses), params
```

### 7.3 `backend/rag/hybrid.py` — parallel channels, fused locally

```python
"""Hybrid retrieval: lexical and dense in parallel, fused, reranked, filtered.

Ordering matters and is not negotiable:
    filter (SQL)  ->  retrieve (both channels)  ->  fuse  ->  rerank  ->  register
Policy never runs after retrieval, and nothing reaches the model that was not
registered as evidence first.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

RRF_K = 60          # standard RRF damping; fixed so scores are reproducible


@dataclass
class Candidate:
    chunk_id: str
    document_id: str
    document_key: str | None
    title: str
    content: str
    location: str | None
    page: int | None
    section: str | None
    revision: str | None
    status: str
    effective_date: date | None
    superseded_by: str | None
    department: str | None
    classification: Sensitivity
    equipment_tags: list[str]
    lexical_rank: int | None = None
    lexical_score: float | None = None
    dense_rank: int | None = None
    dense_score: float | None = None
    fused_score: float = 0.0
    rerank_score: float = 0.0
    rerank_reasons: list[str] = field(default_factory=list)

    @property
    def channel(self) -> str:
        if self.lexical_rank is not None and self.dense_rank is not None:
            return "fused"
        return "lexical" if self.lexical_rank is not None else "dense"


class HybridRetriever:
    def __init__(self, database=None) -> None:
        self.db = database or get_database()
        self.kb = get_knowledge_base()
        self.reranker = LocalReranker()

    async def search(
        self,
        query: str,
        *,
        filters: RetrievalFilter,
        top_k: int = 8,
        pool: int = 40,
    ) -> RetrievalOutcome:
        lexical_task = asyncio.to_thread(self._lexical, query, filters, pool)
        dense_task = self._dense(query, filters, pool)
        lexical, dense = await asyncio.gather(lexical_task, dense_task)

        merged = self._fuse(lexical, dense)
        ranked = self.reranker.rank(query, merged, filters)[:top_k]
        return RetrievalOutcome(
            query=query,
            candidates=ranked,
            lexical_count=len(lexical),
            dense_count=len(dense),
            mode=("hybrid" if dense else "lexical"),
            filters=filters,
        )

    def _lexical(self, query: str, filters: RetrievalFilter, pool: int) -> list[Candidate]:
        where, params = filters.where()
        sql = f"""
            SELECT c.id, c.document_id, c.location, c.page, c.section, c.content,
                   c.equipment_tags AS chunk_tags,
                   d.title, d.document_key, d.revision, d.status, d.effective_date,
                   d.superseded_by, d.department, d.classification, d.equipment_tags,
                   bm25(knowledge_chunks_fts) AS score
              FROM knowledge_chunks_fts
              JOIN knowledge_chunks c ON c.rowid = knowledge_chunks_fts.rowid
              JOIN knowledge_documents d ON d.id = c.document_id
             WHERE knowledge_chunks_fts MATCH ?
               AND {where}
             ORDER BY score            -- bm25() returns lower-is-better
             LIMIT ?
        """
        rows = self.db.query(sql, [_to_fts_query(query), *params, pool])
        return [_candidate(row, lexical_rank=i, lexical_score=-float(row["score"]))
                for i, row in enumerate(rows, start=1)]
```

`_to_fts_query` escapes the query into an FTS5 `MATCH` expression — quoting each token and
OR-joining — so a user query containing `"` or `NEAR` cannot become an FTS injection. That
sanitiser gets its own test.

`_dense` applies the same `filters.where()` to select the embedded candidate rows, then scores
by cosine, reusing `_cosine` and `_unpack` from `rag/knowledge_base.py:41-62`.

Fusion is RRF:

```python
    @staticmethod
    def _fuse(lexical, dense) -> list[Candidate]:
        by_id: dict[str, Candidate] = {}
        for item in lexical:
            by_id[item.chunk_id] = item
        for item in dense:
            existing = by_id.get(item.chunk_id)
            if existing is None:
                by_id[item.chunk_id] = item
            else:
                existing.dense_rank = item.dense_rank
                existing.dense_score = item.dense_score
        for candidate in by_id.values():
            score = 0.0
            if candidate.lexical_rank is not None:
                score += 1.0 / (RRF_K + candidate.lexical_rank)
            if candidate.dense_rank is not None:
                score += 1.0 / (RRF_K + candidate.dense_rank)
            candidate.fused_score = score
        return sorted(by_id.values(), key=lambda c: c.fused_score, reverse=True)
```

### 7.4 `backend/rag/reranker.py` — explainable, local, deterministic

```python
"""Local rerank. Every adjustment is a named, bounded feature with a reason
string, because Proof Mode has to explain why passage 3 outranked passage 1.
A black-box reranker would be better at NDCG and worse at the actual job."""

FEATURES = {
    "term_coverage":     0.35,   # fraction of query terms present in the chunk
    "tag_match":         0.20,   # query names an asset tag this chunk carries
    "authority":         0.15,   # ACTIVE > DRAFT; owner department match
    "recency":           0.10,   # newer effective_date wins, saturating at 5 years
    "section_specificity": 0.10, # a clause-level chunk beats a whole-document chunk
    "channel_agreement": 0.10,   # found by BOTH lexical and dense
}


class LocalReranker:
    def rank(self, query, candidates, filters) -> list[Candidate]:
        terms = set(TOKEN_RE.findall(query.lower()))
        tags = set(TAG_RE.findall(query))
        for candidate in candidates:
            reasons: list[str] = []
            score = candidate.fused_score * 10.0      # RRF keeps relative order as the base
            for name, weight in FEATURES.items():
                value, reason = getattr(self, f"_{name}")(candidate, terms, tags)
                if value:
                    score += weight * value
                    reasons.append(reason)
            # A superseded revision that survived the filter (AUDIT mode, or no
            # active revision exists) is demoted, never silently promoted.
            if candidate.status != DocumentStatus.ACTIVE.value:
                score *= 0.6
                reasons.append(f"demoted: {candidate.status} revision {candidate.revision}")
            candidate.rerank_score = round(score, 6)
            candidate.rerank_reasons = reasons
        return sorted(
            candidates,
            key=lambda c: (c.rerank_score, c.fused_score, c.chunk_id),  # total order, no dict-order ties
            reverse=True,
        )
```

### 7.5 Every chunk becomes evidence

```python
# backend/evidence/provenance.py (continued)

def from_retrieved_chunk(candidate: "Candidate", rank: int) -> EvidenceDraft:
    return EvidenceDraft(
        type=EvidenceType.DOCUMENT,
        modality=Modality.TEXT,
        source_id=candidate.chunk_id,
        source_kind="knowledge_revision",
        filename=candidate.title,
        location=EvidenceLocation(
            filename=candidate.title,
            page=candidate.page,
            section=candidate.section,
            ordinal=rank,
        ),
        content=candidate.content,
        confidence=1.0,                      # the text is exact; relevance is a separate axis
        extraction_method=f"hybrid:{candidate.channel}",
        classification=candidate.classification,
        department=candidate.department,
        document_id=candidate.document_key or candidate.document_id,
        revision=candidate.revision,
        effective_date=candidate.effective_date,
        document_status=DocumentStatus(candidate.status),
        superseded_by_document=candidate.superseded_by,
        equipment_tags=candidate.equipment_tags,
        retrieval_score=candidate.rerank_score,
        retrieval_rank=rank,
        retrieval_channel=candidate.channel,  # type: ignore[arg-type]
        structured={"rerank_reasons": candidate.rerank_reasons},
    )
```

`rerank_reasons` riding in `structured` is what makes the retrieval explorer honest: the UI can
show *"ranked 1 because the query names V-2104 and this is clause 3 of the ACTIVE revision"*
rather than a bare similarity number.

### 7.6 Document identity, separate from file upload (item 12)

`backend/knowledge/document_registry.py`:

```python
"""Document identity.

A document is a thing the organisation maintains. A file is one delivery of one
revision of it. Today they are the same object and the identity is a content
hash (rag/knowledge_base.py:154-155), so ingesting Rev 4 creates a second
unrelated document and the system will cite whichever it likes.
"""

class DocumentIdentity(BaseModel):
    key: str                      # "SOP-INS-014" — the stable identity, chosen by a human
    title: str
    department: str
    classification: Sensitivity
    owner_role: str | None = None
    equipment_tags: list[str] = Field(default_factory=list)
    created_at: datetime


class DocumentRevision(BaseModel):
    id: str                       # "SOP-INS-014@Rev4"
    document_key: str
    revision: str                 # "Rev 4"
    effective_date: date | None
    supersedes: str | None        # revision id
    superseded_by: str | None
    status: DocumentStatus
    sha256: str
    source_path: str
    media_type: str
    size_bytes: int
    chunk_count: int
    ingested_at: datetime
    ingested_by: str | None


class DocumentRegistry:
    def identity(self, key: str) -> DocumentIdentity | None: ...
    def revisions(self, key: str) -> list[DocumentRevision]: ...
    def active(self, key: str) -> DocumentRevision | None: ...
    def revision(self, revision_id: str) -> DocumentRevision | None: ...
    def register_identity(self, identity: DocumentIdentity) -> DocumentIdentity: ...
```

`document_key` is supplied at ingest — from an explicit field, or inferred by a declared regex
over the filename/first page (`^(SOP|WI|PR|DWG)[- ]?[A-Z0-9\-]+`) and **confirmed by the
operator**, never silently guessed. Where no key can be determined the document keeps its
hash-derived id and status `ACTIVE`, i.e. exactly today's behaviour — so existing corpora keep
working and revision intelligence is opt-in per document.

### 7.7 `backend/knowledge/revision_manager.py`

```python
class RevisionManager:
    def activate(self, revision_id: str, *, actor: str) -> list[DocumentRevision]:
        """Make one revision authoritative.

        Atomic: the previous ACTIVE revision becomes SUPERSEDED and the two are
        linked in both directions in the same transaction, so there is never a
        moment with two active revisions or a dangling supersedes pointer.
        """
        revision = self.registry.revision(revision_id)
        if revision is None:
            raise KnowledgeError(f"unknown revision '{revision_id}'")
        changed: list[DocumentRevision] = []
        with self.db.connect() as connection:
            previous = connection.execute(
                "SELECT id FROM knowledge_documents "
                " WHERE document_key = ? AND status = ? AND id != ?",
                (revision.document_key, DocumentStatus.ACTIVE.value, revision_id),
            ).fetchall()
            for row in previous:
                connection.execute(
                    "UPDATE knowledge_documents "
                    "   SET status = ?, superseded_by = ? WHERE id = ?",
                    (DocumentStatus.SUPERSEDED.value, revision_id, row["id"]),
                )
            connection.execute(
                "UPDATE knowledge_documents "
                "   SET status = ?, supersedes = ?, superseded_by = NULL WHERE id = ?",
                (
                    DocumentStatus.ACTIVE.value,
                    previous[0]["id"] if previous else None,
                    revision_id,
                ),
            )
        self.audit.record(
            category="knowledge", action="revision_activated", actor=actor,
            detail={
                "document_key": revision.document_key,
                "activated": revision_id,
                "superseded": [row["id"] for row in previous],
            },
        )
        return changed

    def expire(self, revision_id: str, *, actor: str, reason: str) -> None: ...

    def scope(self, mode: RetrievalMode, user: User) -> list[DocumentStatus]:
        """Historical material requires an explicit permission, so 'audit mode'
        is an authorisation decision rather than a query parameter anyone can set."""
        if mode is RetrievalMode.NORMAL:
            return [DocumentStatus.ACTIVE]
        if "knowledge.read.historical" not in get_config().role_permissions(user.role):
            raise PermissionError(
                "historical revisions require the 'knowledge.read.historical' "
                "permission; this query was restricted to active documents"
            )
        return list(DocumentStatus)
```

`config/access-control.yaml` gains `knowledge.read.historical` on the auditor and integrity
manager roles.

### 7.8 Warning when evidence is superseded

Four layers, so the warning cannot be missed:

1. `Evidence.document_status` and `superseded_by_document` are populated (§7.5).
2. `prompt_block` annotates the header: `"[S3] SOP-INS-014 — page 4 — SUPERSEDED revision Rev 3"`
   (`ledger.py`, the `document_status` branch). The model is told, in band.
3. `ClaimVerifier._status` downgrades any claim resting on it to `NEEDS_REVIEW` with a reason
   naming the replacement (§5.5).
4. `RetrievalStage` appends a limitation: *"SOP-INS-014 Rev 3 is superseded by Rev 4, effective
   2025-06-01. The active revision was not retrieved for this query."* — and, when an active
   revision exists but did not rank, retries the lexical channel restricted to it, so the
   report can show both.

### 7.9 Ordering guarantee for item 11's "Done when"

> *Relevant answers retrieve the correct passage while respecting classification and metadata constraints.*

Mechanised as an invariant test: for a corpus containing a RESTRICTED chunk that is the best
lexical match, a NORMAL-clearance user's `RetrievalOutcome` must (a) not contain it, (b) still
contain the best permitted passage, and (c) the SQL must never have selected it —
asserted by counting rows returned from `_lexical` with a spy on `db.query`.

---

## 8. ORCHESTRATOR REFACTOR INTO TYPED STAGES (item 30)

### 8.1 What the 1313 lines actually are

```
  1- 156  module setup, EvidenceLedger, regex constants, helpers
 157- 212  AgentOrchestrator.__init__, _checkpoint, _emit, _stage
 213- 333  _generate          — routing + model policy + memory admission + inference + audit (120 lines)
 336- 369  _call_tool
 371- 417  _visual_inputs
 419- 471  _record_extraction
 474- 625  _plan + _fallback_plan
 627- 667  _vision_extraction, _extract_calculations
 670-1007  run()              — THE MONOLITH: 337 lines, one try block, 9 stages inline
1010-1143  _mark_step, _run_code_stage
1145-1246  _reason, _draft
1248-1290  _render_deliverable
```

`run()` is untestable in isolation: it needs a router, a registry, an inference client, a model
manager, a tool registry, a policy gateway, a verifier, an audit log and an event bus, all
acquired as module singletons in `__init__` (`orchestrator.py:160-174`). There is no test file
for it. Every stage boundary is a comment.

### 8.2 `backend/workflow/context.py`

```python
"""The state one task run carries between stages.

Stages receive this, mutate their own slot, and return a StageResult. Nothing
reaches across into another stage's slot — that constraint is what makes a
stage independently testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

from backend.core.schemas import (
    AgentPlan, ApprovalRecord, RoutingDecision, SandboxResult, Task,
    TaskProfile, TaskStatus, ToolCall, User, VerificationReport,
)
from backend.engineering.registry import CalculationResult
from backend.evidence.ledger import EvidenceLedger
from backend.rag.hybrid import RetrievalOutcome
from backend.verification.contradictions import EvidenceConflict
from backend.verification.models import ClaimReport


class StageName(str, Enum):
    CLASSIFY = "classify"
    POLICY = "policy"
    VISION = "vision"
    RETRIEVE = "retrieve"
    PLAN = "plan"
    EXECUTE = "execute"
    VERIFY = "verify"
    APPROVE = "approve"
    DELIVER = "deliver"


class StageOutcome(str, Enum):
    OK = "ok"
    SKIPPED = "skipped"        # did not apply to this task
    DEGRADED = "degraded"      # partial result; the run continues, a limitation is recorded
    BLOCKED = "blocked"        # policy refused; the run stops, this is not an error
    FAILED = "failed"          # something broke; the run stops per the stage's failure policy


class StageResult(BaseModel):
    stage: StageName
    outcome: StageOutcome
    detail: str
    started_at: datetime
    finished_at: datetime
    duration_ms: int
    evidence_ids: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    error: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)   # small, SSE- and Proof-Mode-safe


@dataclass
class VisionStageOutput:
    pages_profiled: dict[str, int]          # filename -> page count
    pages_read: dict[str, list[int]]        # filename -> page numbers actually read
    pages_skipped: dict[str, list[int]]
    batches: int
    extraction_summary: dict[str, Any]      # document_type + top findings, for the planner


@dataclass
class ExecutionStageOutput:
    sandbox: SandboxResult | None = None
    calculations: list[CalculationResult] = field(default_factory=list)
    refusals: list[str] = field(default_factory=list)    # dimensional/domain refusals


@dataclass
class WorkflowContext:
    # -- inputs, never mutated by a stage
    task: Task
    user: User
    workspace: Path

    # -- shared services, injected so a stage can be tested with fakes
    ledger: EvidenceLedger
    tools: "ToolRegistry"
    gateway: "PolicyGateway"
    audit: "AuditLog"
    generate: Callable[..., Awaitable[tuple[str, RoutingDecision]]]
    emit: Callable[[str, dict[str, Any]], Awaitable[None]]
    checkpoint: Callable[[], None]
    is_cancelled: Callable[[], bool]

    # -- per-stage outputs
    stage_results: dict[StageName, StageResult] = field(default_factory=dict)
    vision: VisionStageOutput | None = None
    retrieval: RetrievalOutcome | None = None
    plan: AgentPlan | None = None
    execution: ExecutionStageOutput = field(default_factory=ExecutionStageOutput)
    answer: str = ""
    draft: dict[str, Any] | None = None
    claims: ClaimReport | None = None
    conflicts: list[EvidenceConflict] = field(default_factory=list)
    verification: VerificationReport | None = None
    approval: ApprovalRecord | None = None

    # -- accumulators
    limitations: list[str] = field(default_factory=list)

    @property
    def profile(self) -> TaskProfile:
        assert self.task.profile is not None
        return self.task.profile

    def evidence_block(self, **kwargs) -> str:
        block, included, omitted = self.ledger.prompt_block(**kwargs)
        if omitted:
            self.limitations.append(
                f"{len(omitted)} evidence item(s) did not fit the context budget and "
                f"were not shown to the model: {', '.join(omitted)}. Claims resting "
                f"on them cannot be cited."
            )
        self.citable_ids = included
        return block
```

That `evidence_block` helper is small but it is the fix for §1.7: truncation is now impossible
to do silently, because the only method that truncates also records what it dropped.

### 8.3 `backend/workflow/pipeline.py`

```python
class Stage(Protocol):
    name: StageName
    on_failure: Literal["abort", "continue_degraded"]

    async def applies(self, ctx: WorkflowContext) -> bool: ...
    async def run(self, ctx: WorkflowContext) -> StageResult: ...


class Pipeline:
    """Coordinates stage transitions. Contains no domain logic — if this class
    ever needs to know what a corrosion rate is, a stage is in the wrong place."""

    def __init__(self, stages: Sequence[Stage]) -> None:
        self.stages = list(stages)

    async def run(self, ctx: WorkflowContext) -> WorkflowContext:
        for stage in self.stages:
            if ctx.is_cancelled():
                await self._finish(ctx, TaskStatus.CANCELLED, "Stopped at your request.")
                return ctx

            if not await stage.applies(ctx):
                ctx.stage_results[stage.name] = _skipped(stage.name)
                await ctx.emit("task.stage.skipped", {"stage": stage.name.value})
                continue

            started = datetime.now(timezone.utc)
            await ctx.emit("task.stage.started", {"stage": stage.name.value})
            try:
                result = await stage.run(ctx)
            except TaskCancelled:
                raise
            except Exception as exc:
                result = StageResult(
                    stage=stage.name,
                    outcome=StageOutcome.FAILED,
                    detail=f"{type(exc).__name__}: {exc}",
                    started_at=started,
                    finished_at=datetime.now(timezone.utc),
                    duration_ms=_ms(started),
                    error=f"{type(exc).__name__}: {exc}",
                )

            ctx.stage_results[stage.name] = result
            ctx.limitations.extend(result.limitations)
            ctx.checkpoint()
            await ctx.emit(
                "task.stage.finished",
                {
                    "stage": stage.name.value,
                    "outcome": result.outcome.value,
                    "detail": result.detail,
                    "duration_ms": result.duration_ms,
                    "evidence_ids": result.evidence_ids,
                    **result.data,
                },
            )
            ctx.audit.record(
                category="workflow",
                action=f"{stage.name.value}:{result.outcome.value}",
                actor=ctx.user.username,
                actor_role=ctx.user.role,
                task_id=ctx.task.id,
                detail={"detail": result.detail, "duration_ms": result.duration_ms,
                        "evidence_ids": result.evidence_ids},
            )

            if result.outcome is StageOutcome.BLOCKED:
                await self._finish(ctx, TaskStatus.BLOCKED, result.detail)
                return ctx
            if result.outcome is StageOutcome.FAILED and stage.on_failure == "abort":
                await self._finish(ctx, TaskStatus.FAILED, result.error or result.detail)
                return ctx
        return ctx
```

The uniform `task.stage.started` / `task.stage.finished` envelope is what items 24 (Proof Mode)
and 29 (recovery) both need: one event shape, one audit shape, one persisted record per stage.
**DEPENDS-ON: Frontend agent** — Proof Mode timeline binds to these two events.
**DEPENDS-ON: Backend B** — `backend/workflow/checkpoints.py` persists `ctx.stage_results` and
resumes from the last `OK` stage; the `StageResult` shape above is the contract for that.

### 8.4 The nine stages, with explicit inputs / outputs / failure states

| Stage | Reads | Writes | `applies` when | `BLOCKED` when | `on_failure` |
|---|---|---|---|---|---|
| `classify` | `task.prompt`, `task.files` | `task.profile` | profile is `None` (moved out of `task_service.create_task:236`) | — | abort |
| `policy` | `profile`, `user`, `files` | `task.policy_events` | always | file access or classification denied | abort |
| `vision` | `files`, profile | `ledger` (`V*`), `ctx.vision` | `profile.requires_vision` and a PDF/image is attached | vision model denied by model policy | continue_degraded |
| `retrieve` | prompt, `ctx.vision.extraction_summary` | `ledger` (`S*`), `ctx.retrieval` | `profile.requires_retrieval` | clearance blocks every candidate | continue_degraded |
| `plan` | profile, ledger summary, tool catalogue | `task.plan` | always | — | continue_degraded (falls back to `_fallback_plan`) |
| `execute` | plan, ledger | `ledger` (`X*`, `C*`), `ctx.execution` | plan contains `python_exec`/calculation, or profile requires it | tool denied | continue_degraded |
| `verify` | `ctx.answer`, `ctx.draft`, ledger | `ctx.claims`, `ctx.conflicts`, `ctx.verification` | always | — | continue_degraded (a check that cannot run is a failed check, per `orchestrator.py:824-839`) |
| `approve` | verification, claim gate, conflicts | `task.approval`, `task.status` | always | claim gate returns `DENY` | abort |
| `deliver` | `ctx.draft`, ledger, verification | `task.deliverables` | `profile.produces_deliverable` | deliverable tool denied | continue_degraded |

Reasoning and drafting are steps *inside* `execute` and `deliver` respectively rather than
stages of their own, because they share the reasoning model's residency and splitting them
would force an extra model swap — the same argument documented at `orchestrator.py:713-718`.

One deliberate ordering change: **retrieve now runs before plan**, matching the roadmap's stage
list. Safe, because the retrieval query is built from `task.prompt` plus the vision extraction
(`orchestrator.py:776-781`) and never from the plan; and better, because the planner can then
see what was actually found.

Example stage, showing the shape in full:

```python
# backend/workflow/stages/vision.py

class VisionStage:
    name = StageName.VISION
    on_failure = "continue_degraded"

    def __init__(self, *, config=None) -> None:
        self.config = config or get_config()

    async def applies(self, ctx: WorkflowContext) -> bool:
        if not ctx.profile.requires_vision:
            return False
        return any(
            Path(f.stored_path).suffix.lower() in IMAGE_SUFFIXES | {".pdf"}
            for f in ctx.task.files
        )

    async def run(self, ctx: WorkflowContext) -> StageResult:
        started = datetime.now(timezone.utc)
        settings = self.config.settings.vision
        registered: list[str] = []
        limitations: list[str] = []
        profiled: dict[str, int] = {}
        read: dict[str, list[int]] = {}
        skipped: dict[str, list[int]] = {}

        per_file: list[tuple[StoredFile, list[RenderedPage]]] = []
        for stored in ctx.task.files:
            path = Path(stored.stored_path)
            suffix = path.suffix.lower()

            if suffix in IMAGE_SUFFIXES:
                per_file.append((stored, [_single_image_page(path)]))
                profiled[stored.filename] = 1
                continue
            if suffix != ".pdf":
                continue

            try:
                profile = profile_pdf_pages(path)
            except ParsingError as exc:
                limitations.append(f"'{stored.filename}' could not be profiled: {exc}")
                continue

            profiled[stored.filename] = profile.page_count
            limitations.extend(profile.warnings)

            # Text pages become F-evidence here, one per page, so the text half
            # of a mixed document is never lost either.
            for page_profile in profile.text_pages:
                text = _page_text(path, page_profile.page)
                if text.strip():
                    registered.append(
                        ctx.ledger.register(
                            from_file_segment(
                                stored,
                                text=text,
                                location=EvidenceLocation(
                                    page=page_profile.page,
                                    page_count=profile.page_count,
                                ),
                                parser="pymupdf-text",
                            )
                        ).id
                    )

            wanted = [p.page for p in profile.vision_pages]
            budget = int(settings.get("max_pages_per_file", 0))
            if budget and len(wanted) > budget:
                skipped[stored.filename] = wanted[budget:]
                limitations.append(
                    f"'{stored.filename}': {len(wanted) - budget} page(s) needing "
                    f"vision were not read because the configured budget is "
                    f"{budget} page(s) per file. Pages not read: "
                    f"{', '.join(str(p) for p in wanted[budget:])}."
                )
                wanted = wanted[:budget]
            if wanted:
                per_file.append(
                    (stored, rasterize_pages(path, ctx.workspace / "pages", wanted,
                                             target_edge=int(settings.get("target_edge", 1100))))
                )

        if not per_file:
            return _result(self.name, StageOutcome.SKIPPED,
                           "No visual input required rendering.", started)

        batches = build_batches(per_file, batch_size=int(settings.get("batch_pages", 3)))
        floor = float(settings.get("min_page_confidence", 0.35))
        summary: dict[str, Any] = {"findings": [], "document_types": set()}

        for batch in batches:
            await ctx.emit("task.vision.batch", {
                "filename": batch.stored.filename,
                "pages": batch.page_numbers,
                "index": batch.index,
                "total": batch.total,
            })
            text, _ = await ctx.generate(
                stage="vision_extraction",
                system_prompt=self.config.system_prompt("vision"),
                prompt=self.config.prompt(
                    "task.vision_extract_pages",
                    filename=batch.stored.filename,
                    page_count=len(batch.pages),
                    page_map=_page_map(batch),
                    prompt=ctx.task.prompt,
                ),
                images=batch.image_paths,
                format_json=True,
            )
            drafts, batch_limits = drafts_for_batch(
                batch, _parse_json(text), text,
                model_id=ctx.last_model_id, floor=floor,
            )
            for evidence in ctx.ledger.register_many(drafts):
                registered.append(evidence.id)
                read.setdefault(batch.stored.filename, []).append(evidence.location.page)
                await ctx.emit("task.vision.page", {
                    "evidence_id": evidence.id,
                    "filename": evidence.filename,
                    "page": evidence.location.page,
                    "confidence": evidence.confidence,
                })
            limitations.extend(batch_limits)
            ctx.checkpoint()          # evidence survives a crash mid-document

        for filename, total in profiled.items():
            covered = ctx.ledger.pages_covered(filename)
            missing = sorted(set(range(1, total + 1)) - covered - set(skipped.get(filename, [])))
            if missing:
                limitations.append(
                    f"'{filename}': pages {', '.join(map(str, missing))} produced no "
                    f"evidence. Nothing on those pages has been used."
                )

        ctx.vision = VisionStageOutput(
            pages_profiled=profiled,
            pages_read={k: sorted(set(v)) for k, v in read.items()},
            pages_skipped=skipped,
            batches=len(batches),
            extraction_summary=summary,
        )
        outcome = StageOutcome.DEGRADED if limitations else StageOutcome.OK
        return _result(
            self.name, outcome,
            f"Read {sum(len(v) for v in read.values())} page(s) across "
            f"{len(batches)} batch(es) from {len(profiled)} file(s).",
            started, evidence_ids=registered, limitations=limitations,
            data={"pages_profiled": profiled, "pages_read": ctx.vision.pages_read,
                  "pages_skipped": skipped},
        )
```

### 8.5 What `AgentOrchestrator` becomes

```python
class AgentOrchestrator:
    """Kept as the entry point so api/task_service.py:429 does not change.

    Its job is now: build the context, run the pipeline, map the outcome onto
    the task record. Roughly 120 lines instead of 1313.
    """

    async def run(self, task, user, persist=None) -> Task:
        started = datetime.now(timezone.utc)
        workspace = self.config.settings.path("workspaces") / task.id
        workspace.mkdir(parents=True, exist_ok=True)
        ctx = WorkflowContext(
            task=task,
            user=user,
            workspace=workspace,
            ledger=EvidenceLedger(task.id),
            tools=self.tools,
            gateway=self.gateway,
            audit=self.audit,
            generate=partial(self._generate, task, user),
            emit=partial(self._emit, task),
            checkpoint=partial(self._checkpoint, task),
            is_cancelled=partial(self._check_cancelled, task),
        )
        try:
            await get_pipeline().run(ctx)
        except TaskCancelled:
            task.status = TaskStatus.CANCELLED
            task.error = "Stopped at your request."
            await self._emit(task, "task.cancelled", {"reason": "stopped by request"})
        finally:
            task.evidence = [_to_legacy_item(e) for e in ctx.ledger.items]   # contract bridge
            task.updated_at = datetime.now(timezone.utc)
            task.duration_ms = int((task.updated_at - started).total_seconds() * 1000)
            await self._emit(task, "task.finished",
                             {"status": task.status.value, "duration_ms": task.duration_ms})
        return task
```

`_generate` (`orchestrator.py:213-333`) moves unchanged to
`backend/workflow/model_gateway.py` — it is already a clean, correct unit doing routing,
model policy, memory admission, inference and audit. It is injected into the context rather
than inherited, which is what finally makes stages testable with a fake.

### 8.6 The `task.stage` compatibility shim

`frontend/hooks/use-event-stream.ts:57` subscribes to `task.stage`. The pipeline keeps emitting
it alongside the new events, with the same `{status, message}` payload, until the frontend
migrates. Zero frontend work is required to deploy this refactor, which is the point.

### 8.7 Strangler-fig migration sequence — main is never broken

Each step is independently shippable and independently revertible. A feature flag in
`config/app.yaml` (`workflow.pipeline_enabled: false`) selects the new path; it flips to `true`
only at step 6, after parity has been demonstrated.

**Step 0 — characterisation harness.** `tests/test_orchestrator_parity.py` runs a task through
the current `run()` with every collaborator faked (scripted model responses, an in-memory tool
registry, a recording event bus) and snapshots: the ordered event list, the final `TaskStatus`,
the evidence ids and their `source_document`s, and the `VerificationReport`. This is the oracle
for every later step. No production code changes.

**Step 1 — extract `_generate` to `backend/workflow/model_gateway.py`.** Pure move.
`AgentOrchestrator._generate` becomes a two-line delegate. Parity snapshot must be byte-identical.

**Step 2 — land `backend/evidence/` beside the old ledger.** New package, new table, no caller
changes. `EvidenceLedger` in `orchestrator.py` gains a shadow write: every `add()` also
registers an `EvidenceDraft` in the new ledger. Nothing reads the new one yet. This proves the
store and the ID allocator under real traffic while the old path remains authoritative.

**Step 3 — cut over the producers, one at a time, each with its own parity run.**
Order: `file_read` → `knowledge_search` → sandbox → vision. The vision producer is last because
it is the one whose *output changes* (per-page instead of merged), so its parity snapshot is
expected to differ and is reviewed by hand. After this step `task.evidence` is populated from
the new ledger via `_to_legacy_item`, and the frontend sees richer but compatible items.

**Step 4 — land `backend/engineering/` and `backend/verification/` beside the old verifier.**
`backend/agents/verifier.py` becomes the shim described in §5.7. `orchestrator.run()` is
unchanged; the shim routes `check_sources`/`check_calculations` into the new engine. Parity
here *will* differ — fewer claims counted as supported — and that difference is the deliverable.

**Step 5 — introduce `Pipeline` with the nine stages, each stage's body lifted verbatim from
the corresponding block of `run()`.** Behind `workflow.pipeline_enabled: false`. Both paths
exist; the parity test runs both and diffs them. A stage is "done" when its lifted body passes
parity, so the lift is mechanical and reviewable block by block.

**Step 6 — flip the flag.** `run()`'s old body is deleted in the same commit that flips it, so
there is never a period with two live implementations of the same behaviour. `_visual_inputs`,
`_record_extraction`, `_extract_calculations` and the 337-line `try` block go here.

**Step 7 — delete the shim.** `backend/agents/verifier.py` removed; `backend/agents/orchestrator.py`
is ~120 lines; `backend/workflow/` owns the lifecycle.

Rollback at any step is `git revert` of one commit plus, for steps 2–3, dropping the `evidence`
table — which no other code reads until step 3 completes.

---

## 9. CONTRACT I PUBLISH

Everything in this section is consumed by Backend B and the Frontend agent. Models live in
`backend/core/schemas.py` unless stated; anything defined in a feature package is re-exported
from `schemas.py` so the frozen-contract rule at `core/schemas.py:1-6` still holds.

### 9.1 `CONTRACT:` new models

```python
# re-exported from backend/core/schemas.py

class EvidenceType(str, Enum):        # document|file|vision|calculation|execution|human
class Modality(str, Enum):            # text|table|image|numeric|graph
class DocumentStatus(str, Enum):      # draft|active|superseded|expired
class BoundingBox(BaseModel):         # x0,y0,x1,y1,page_width,page_height
class EvidenceLocation(BaseModel):    # filename,page,page_count,bbox,section,sheet,cell_range,ordinal
class Evidence(BaseModel):            # §2.1 in full
class SourceCoverage(BaseModel):
    filename: str
    source_id: str
    page_count: int
    pages_read: list[int]
    pages_skipped: list[int]
    method: dict[str, str]            # "7" -> "vision" | "text"
    complete: bool

class ClaimType(str, Enum)
class ClaimStatus(str, Enum)
class ClaimImpact(str, Enum)
class LinkRelation(str, Enum)
class ClaimQuantity(BaseModel)
class ClaimEvidenceLink(BaseModel)
class Claim(BaseModel)
class ClaimReport(BaseModel)

class ConflictSide(BaseModel)
class EvidenceConflict(BaseModel)
class ConflictResolutionRequest(BaseModel):
    resolution: Literal["prefer_left", "prefer_right", "both_invalid", "acknowledged"]
    note: str = Field(min_length=1)

class FormulaInputDescriptor(BaseModel)
class FormulaDescriptor(BaseModel)
class QuantityInput(BaseModel)
class CalculationRequest(BaseModel)
class ResolvedInput(BaseModel)
class CalculationResult(BaseModel)

class StageName(str, Enum)
class StageOutcome(str, Enum)
class StageResult(BaseModel)

class DocumentIdentity(BaseModel)
class DocumentRevision(BaseModel)
class RetrievalMode(str, Enum)
class RetrievalFilter(BaseModel)
```

### 9.2 `CONTRACT:` changed models

**`EvidenceItem`** — retained verbatim as the legacy projection of `Evidence`, so nothing
breaks. Gains optional fields, all defaulted:

```python
class EvidenceItem(BaseModel):
    # unchanged
    id: str
    source_document: str
    document_id: str | None = None
    location: str | None = None
    excerpt: str
    score: float | None = None
    department: str | None = None
    classification: Sensitivity = Sensitivity.NORMAL
    version: str | None = None
    ingested_at: datetime | None = None
    kind: Literal["knowledge_base","uploaded_file","vision_extraction","computation"] = "knowledge_base"
    # ADDED — all optional
    type: EvidenceType | None = None
    modality: Modality | None = None
    source_id: str | None = None
    filename: str | None = None
    page: int | None = None
    bbox: BoundingBox | None = None
    confidence: float = 1.0
    extraction_method: str | None = None
    extraction_model: str | None = None
    source_sha256: str | None = None
    content_sha256: str | None = None
    revision: str | None = None
    effective_date: date | None = None
    document_status: DocumentStatus | None = None
    superseded_by_document: str | None = None
    equipment_tags: list[str] = []
    retrieval_channel: str | None = None
    derived_from: list[str] = []
```

`kind` keeps its four legacy values (`EvidenceType.EXECUTION` and `HUMAN` both project to
`"computation"` / `"human"` — and `"human"` is a **new value in that Literal**, see §9.4).

**`VerificationReport`** — extended per §5.7. All five existing fields keep their meaning; ten
new fields, all defaulted.

**`VerificationCheck.kind`** — Literal widened with `"conflict"` and `"coverage"`.

**`Task`** — three additions, all defaulted:

```python
    stage_results: list[StageResult] = Field(default_factory=list)
    calculations: list[CalculationResult] = Field(default_factory=list)
    evidence_count: int = 0          # authoritative count; task.evidence may be projected/trimmed
```

**`SystemHealth.retrieval_mode`** — Literal widened:
`"embedding" | "lexical" | "hybrid" | "lexical-degraded" | "unavailable"`.

**`TaskStatus`** — unchanged. No new statuses; a blocked claim gate uses the existing `BLOCKED`.

### 9.3 `CONTRACT:` endpoints

All under the existing `/api` prefix and the existing `CurrentUser` dependency
(`api/routes/tasks.py:25`). New router `backend/api/routes/evidence.py`; knowledge routes
extend `backend/api/routes/system.py`.

```
GET  /api/tasks/{task_id}/evidence
       ?type=vision&source_id=...&page=7&filename=...
     -> EvidenceLedgerResponse {
          task_id, items: Evidence[], count, by_type: {document:4,vision:12,...},
          coverage: SourceCoverage[]
        }

GET  /api/tasks/{task_id}/evidence/{evidence_id}
     -> Evidence          404 when unknown

GET  /api/tasks/{task_id}/evidence/{evidence_id}/page.png
     -> image/png         the rendered page this evidence sits on, for bbox overlay.
                          410 when the workspace has been cleared. Policy-checked
                          identically to /api/files/{id}/download.

GET  /api/tasks/{task_id}/claims
     -> ClaimReport

GET  /api/tasks/{task_id}/claims/{claim_id}
     -> Claim             with links resolved to full Evidence objects in
                          `resolved_evidence: Evidence[]`

GET  /api/tasks/{task_id}/conflicts
     -> { task_id, conflicts: EvidenceConflict[], unresolved: int, blocking: int }

POST /api/tasks/{task_id}/conflicts/{conflict_id}/resolve
       body ConflictResolutionRequest
     -> EvidenceConflict  requires 'approval.decide'; registers H-evidence;
                          re-verifies affected claims; 409 when already resolved

GET  /api/tasks/{task_id}/calculations
     -> { task_id, calculations: CalculationResult[] }

GET  /api/tasks/{task_id}/stages
     -> { task_id, stages: StageResult[] }         (Proof Mode timeline source)

GET  /api/engineering/formulas
     -> FormulaDescriptor[]

POST /api/engineering/calculate
       body CalculationRequest  (+ optional task_id to register the result as evidence)
     -> CalculationResult       400 on UnitError/DimensionError with the refusal text
                                422 on UnsupportedInputError
                                requires 'tool.calculate'

GET  /api/knowledge/documents/{document_key}/revisions
     -> { identity: DocumentIdentity, revisions: DocumentRevision[], active: str | null }

POST /api/knowledge/revisions/{revision_id}/activate
     -> DocumentRevision[]      requires 'knowledge.manage'

GET  /api/knowledge/search?mode=normal|audit
     -> KnowledgeSearchResponse (extended: retrieval_mode gains "hybrid";
                                 results carry the new EvidenceItem fields)
```

### 9.4 `CONTRACT:` SSE events

Added to the stream. `frontend/hooks/use-event-stream.ts:56-72` must extend its list; existing
entries are untouched.

| Event | `data` |
|---|---|
| `task.stage.started` | `{stage}` |
| `task.stage.finished` | `{stage, outcome, detail, duration_ms, evidence_ids, ...stage data}` |
| `task.stage.skipped` | `{stage}` |
| `task.pdf.profiled` | `{filename, page_count, text_pages, vision_pages}` |
| `task.vision.batch` | `{filename, pages, index, total}` |
| `task.vision.page` | `{evidence_id, filename, page, confidence}` |
| `task.evidence.registered` | `{evidence_id, type, filename, page, source_id, confidence}` |
| `task.calculation` | `{evidence_id, formula_id, formula_version, label, output_value, output_unit, expression, supporting_evidence_ids}` |
| `task.calculation.refused` | `{formula_id, reason, kind: "unit"\|"dimension"\|"domain"\|"unsupported_input"}` |
| `task.claim` | `{claim_id, type, impact, status, reason, evidence_ids}` |
| `task.conflict` | `{conflict_id, subject, attribute, severity, summary, left, right}` |
| `task.retrieval` | `{mode, lexical_count, dense_count, returned, filters: {mode, statuses, departments}}` |

`task.stage` continues to be emitted unchanged (§8.6). `task.evidence` continues to be emitted
after the retrieve stage with the same shape.

### 9.5 BREAKING CHANGES — `frontend/lib/types.ts`

Flagged individually. **DEPENDS-ON: Frontend agent** for each.

| # | Change | File:line | Severity | Action |
|---|---|---|---|---|
| B1 | `EvidenceItem.kind` gains `"human"`; `EvidenceType` becomes the canonical discriminator | `types.ts:124` | **low** — declared `kind?: string`, and no component switches on its value (verified: only `console-view.tsx:192` reads `.kind`, as a display fallback) | add `type?: EvidenceType` and prefer it |
| B2 | `VerificationCheck.kind` gains `"conflict"`, `"coverage"` | `types.ts:131` | **low** — `kind?: string` | render the two new checks |
| B3 | `material_claims_total` / `_supported` change meaning and will **drop sharply** | `types.ts:145-146` | **medium** — the numbers are correct for the first time; any copy saying "claims verified" must not imply the old inflated figure | relabel to "material claims"; link to the claim list |
| B4 | `VerificationReport` gains 10 fields | `types.ts:142-149` | **none** — additive | add `claims`, `conflicts`, `coverage` |
| B5 | `Task` gains `stage_results`, `calculations`, `evidence_count` | `types.ts:220-244` | **none** — additive | Proof Mode binds to `stage_results` |
| B6 | `EvidenceItem` gains 18 optional fields | `types.ts:111-128` | **none** — additive; the three legacy aliases (`source`, `clause`, `similarity`) stay | evidence drawer shows page/bbox/confidence/revision |
| B7 | `SystemHealth.retrieval_mode` gains `"hybrid"`, `"lexical-degraded"` | `types.ts` (SystemHealth) | **medium** — this is a **union literal**, so a `switch` that is exhaustive today fails to compile | widen the union; add a label for each |
| B8 | New events on the SSE stream | `hooks/use-event-stream.ts:56-72` | **medium** — the hook filters by an explicit allow-list, so new events are silently dropped until added | extend the list |
| B9 | `KnowledgeSearchResponse.retrieval_mode` gains `"hybrid"` | `types.ts:327` region | **medium** — same union-literal issue as B7 | widen |

B7 and B9 are the only ones that can break a TypeScript build. Everything else degrades to
"the UI does not yet show the new thing", which is a safe deploy order: **backend first,
frontend follows**.

### 9.6 Interfaces I consume from other agents

- **Backend B — `backend/security/`**: `injection_risk` and `quarantined` on `Evidence` are
  written by the content sanitiser (item 13). I reserve the fields and honour them in
  `prompt_block` (quarantined evidence is excluded) and in `EvidenceMapper` (quarantined
  evidence cannot support a claim). The producer is theirs.
- **Backend B — `backend/sandbox/`**: `SandboxResult` shape is unchanged; I need `code_sha256`
  and `image_digest` added to it so `X`-evidence can be reproducible (item 28).
- **Backend B — `backend/workflow/checkpoints.py`**: consumes `StageResult` (§8.2).
- **Backend B — `backend/proof/`**: the sovereignty certificate reads
  `ledger.items` hashes, `CalculationResult.calculation_key`, `ClaimReport`, and
  `EvidenceConflict.resolution`. I provide `ledger.merkle_root()` over
  `sorted(content_sha256)` for item 26.
- **Frontend**: Proof Mode timeline ← `task.stage.*` + `GET /api/tasks/{id}/stages`;
  evidence drawer ← `GET /api/tasks/{id}/evidence` + `page.png`; claim inspector ←
  `GET /api/tasks/{id}/claims/{claim_id}`; conflict panel ← `GET /api/tasks/{id}/conflicts`.

---

## 10. TESTS — mapped to the roadmap's "Done when"

Existing files keep passing. `tests/test_evidence.py` and `tests/test_verifier_robustness.py`
change only in what they import. `tests/test_visual_inputs.py:83-94` keeps its assertion and
gets a rewritten docstring (§3.2).

### Item 1 — *"A 20-page scanned PDF can be processed end-to-end and every cited fact maps to the correct page."*

`tests/test_pdf_completeness.py`

| Test | Asserts |
|---|---|
| `test_every_page_of_a_twenty_page_scan_is_rendered` | fixture builds a 20-page image-only PDF; `rasterize_pages` over the profile returns 20 `RenderedPage`s with `page == 1..20` |
| `test_default_rasterize_has_no_cap` | `rasterize_pdf(path, dest)` with no `max_pages` returns 20 — the regression guard for `parsing.py:112` |
| `test_explicit_budget_is_still_honoured` | `max_pages=3` → 3 (keeps the old test's intent) |
| `test_mixed_document_routes_each_page_by_its_own_content` | 5-page PDF, pages 1 and 5 born-digital, 2–4 scanned → `profile.text_pages == [1,5]`, `vision_pages == [2,3,4]` |
| `test_batches_are_three_pages_and_never_span_files` | 20 vision pages across 2 files → 7 batches, every batch's `stored` identical within itself |
| `test_page_map_tells_the_model_real_page_numbers` | batch 3 renders `"image 1 = page 7"` |
| `test_every_page_produces_evidence_or_a_named_limitation` | for a scripted response omitting page 11, the limitation text contains `"page 11"` and no evidence claims page 11 |
| `test_evidence_is_persisted_before_reasoning` | after batch 2 of 7, `EvidenceStore.by_task()` already returns the pages from batches 1–2 |
| `test_ledger_pages_covered_equals_page_count` | the item-1 acceptance assertion, stated once |

### Item 2 — *"Uploading multiple files never causes a finding from one file to be attributed to another."*

`tests/test_provenance.py`

| Test | Asserts |
|---|---|
| `test_two_scans_keep_their_own_filenames` | two scanned PDFs, scripted per-file vision responses → every `V` evidence item's `filename` matches the file whose batch produced it. **The direct regression test for `orchestrator.py:429`.** |
| `test_vision_evidence_cannot_be_built_without_a_file_and_page` | `from_vision_page` raises `ProvenanceError` / `TypeError` with no `stored` or `page < 1` |
| `test_model_inventing_a_page_number_is_discarded` | response claims page 99 for a batch of 7–9 → no evidence, one limitation naming 99 |
| `test_file_read_with_unknown_id_does_not_silently_read_another_file` | regression for `tools/registry.py:257-259` |
| `test_every_evidence_item_resolves_to_a_real_source` | property test over a full run: `ledger.get(e.source_id kind)` resolves for all |
| `test_source_and_content_hashes_are_recorded` | `source_sha256 == StoredFile.sha256`, `content_sha256 == sha256(content)` |

### Item 3 — *"Vision, calculation, sandbox, file, document and human evidence are all verifiable through one interface."*

`tests/test_evidence_typing.py`

- `test_all_six_types_round_trip_through_the_ledger` — one of each registered, all resolvable
  by `get`, `by_type`, `by_source`.
- `test_prefix_and_type_cannot_disagree` — constructing `Evidence(id="F1", type=VISION)` raises.
- `test_citation_prefix_class_is_derived_from_the_enum` — adding a type to `EvidenceType`
  without touching `citations.py` still parses; the regression guard for the hand-maintained
  `[SFVCE]` literal at `verifier.py:45`.
- `test_verification_never_reads_the_citation_regex` — `ClaimVerifier` produces correct statuses
  for a draft containing **zero** inline citations (mapping is independent).

### Item 4 — *"No material claim can be produced without traceable ledger evidence or an explicit unsupported status."*

`tests/test_ledger.py`

- `test_every_material_claim_has_links_or_unsupported_status` — property over a full run: for
  each claim, `claim.links != [] or claim.status is UNSUPPORTED`.
- `test_lookup_by_task_source_type_page_and_id` — the four lookup APIs item 4 names.
- `test_ids_are_never_reissued_after_resume` — ports `test_evidence.py:51-61` to the new ledger.
- `test_prompt_block_records_what_it_omitted` — regression for `orchestrator.py:1171`.
- `test_quarantined_evidence_never_enters_a_prompt` — the Backend B interlock.

### Items 7–8 — *"The same inputs always produce the same result"* / *"unit conversion tests pass and dimensionally invalid calculations are refused before execution."*

`tests/test_engineering.py`

| Test | Asserts |
|---|---|
| `test_remaining_life_matches_api_570_worked_example` | `t_actual=9.4mm, t_required=6.0mm, CR=0.55mm/yr` → `6.1818… years`, rounded display `6.18` |
| `test_corrosion_rate_long_and_short_term` | both formulas against hand-computed values |
| `test_inspection_interval_is_the_lesser_of_half_life_and_the_class_maximum` | RL=6.18 → 3.09; RL=30 with max 5 → 5 |
| `test_identical_inputs_give_an_identical_calculation_key` | 100 executions, one distinct `calculation_key`, one distinct `output_value` |
| `test_unit_conversion_is_exact_across_systems` | `0.0217 in/yr` ≡ `0.55 mm/yr`; `9.4 mm` ≡ `0.37008 in`; mpy round-trip |
| `test_pressure_plus_thickness_is_refused` | `parse_quantity("P", 18, "mm", expect="pressure")` raises `DimensionError` **before** `fn` is called (spy asserts `fn` not invoked) |
| `test_input_without_evidence_is_refused` | `UnsupportedInputError` naming the input |
| `test_negative_corrosion_rate_is_a_domain_refusal_not_infinity` | `FormulaError` with the engineering explanation |
| `test_wall_below_minimum_refuses_rather_than_reporting_negative_life` | ditto |
| `test_asme_ug27_thin_wall_limit_is_enforced` | `t > R/2` refused with the paragraph's own limit quoted |
| `test_calculation_evidence_stores_formula_id_version_inputs_output_units_and_support` | item 7's five required fields, plus `derived_from` |
| `test_original_and_normalised_units_are_both_preserved` | item 8's explicit requirement |

### Item 9 — *"The UI can open any important claim and show exactly why it was accepted, rejected or escalated."*

`tests/test_claim_verification.py`

- `test_atomic_extraction_splits_a_compound_sentence` — "wall is 9.4 mm and the minimum is
  6.0 mm" → two claims.
- `test_each_claim_type_is_classified` — five parametrised cases.
- `test_numerical_claim_matching_a_calculation_is_verified` — status `VERIFIED`, reason names
  formula id and version.
- `test_numerical_claim_disagreeing_with_recomputation_is_conflicted` — draft says 8.2 years,
  formula gives 6.18 → `CONFLICTED`, reason quotes both.
- `test_unit_mismatched_restatement_still_matches` — "74 months" vs 6.18 years → `VERIFIED`.
- `test_claim_citing_a_nonexistent_id_is_unsupported` — `[S47]` with 4 evidence items →
  `UNSUPPORTED`, `invented_ids == ["S47"]`.
- `test_citing_real_but_irrelevant_evidence_is_unsupported` — the `CITED_BUT_UNSUPPORTED`
  path; **the regression test for `verifier.py:99-104`**.
- `test_three_shared_words_are_no_longer_support` — the exact sentence that passes today's
  `_claim_supported` token rule scores below threshold; **the regression test for
  `verifier.py:112-123`**.
- `test_high_impact_recommendation_is_always_needs_review`.
- `test_every_claim_carries_a_human_readable_reason` — property: `reason != ""` for all.
- `test_unsupported_high_impact_claim_blocks_the_gate` — `ClaimGate` → `DENY`, task `BLOCKED`,
  deliverable `released is False`.
- `test_verification_report_keeps_its_legacy_fields_populated` — the frontend contract.

### Item 10 — *"Conflicting evidence produces an explicit conflict object and blocks unsupported automatic conclusions."*

`tests/test_contradictions.py`

- `test_eighteen_bar_versus_sixteen_bar` — the roadmap's own example; one `EvidenceConflict`,
  `kind="numeric"`, `subject="V-2104"`, `attribute="design_pressure"`, severity `critical`,
  `summary == "18 bar vs 16 bar"`.
- `test_same_value_in_different_units_is_not_a_conflict` — `18 bar` vs `261 psi` → none.
- `test_active_versus_superseded_procedure` — `kind="status"`, `preferred_evidence_id` set,
  `resolution == "superseded_preferred"`, does not block.
- `test_two_revisions_of_the_same_document_conflict` — `kind="revision"`, severity `high`.
- `test_values_about_different_assets_are_not_compared` — V-2104 vs P-101.
- `test_a_document_restating_its_own_number_is_not_a_conflict`.
- `test_unresolved_high_severity_conflict_requires_human_review` — `ApprovalRecord.required`,
  reason contains the summary.
- `test_claims_resting_on_a_conflict_become_conflicted`.
- `test_conflict_object_carries_both_sides_for_side_by_side_rendering` — both `ConflictSide`s
  have `excerpt`, `filename`, `page`, `value`.
- `test_resolution_registers_human_evidence_and_reverifies` — `H1` exists, affected claims
  re-run, gate re-evaluated.

### Items 11–12 — *"Relevant answers retrieve the correct passage while respecting classification and metadata constraints"* / *"Queries automatically use the active revision."*

`tests/test_hybrid_retrieval.py`, `tests/test_revisions.py`

- `test_lexical_and_dense_run_in_parallel_and_are_fused` — both channels' ranks present on a
  fused candidate; `channel == "fused"`.
- `test_rrf_is_deterministic` — 20 runs, identical ordering.
- `test_exact_tag_query_beats_semantic_neighbour` — the case pure-dense loses: query `"TML-07"`
  returns the chunk containing `TML-07`, not the semantically similar `TML-08` chunk.
- `test_classification_filter_runs_in_sql_not_in_python` — spy on `db.query` asserts the
  restricted row is never returned; **regression for `tools/registry.py:235-240`**.
- `test_permitted_passage_is_returned_even_when_outranked_by_a_restricted_one` —
  **regression for the `top_k`-before-filter bug at `knowledge_base.py:326-331`**.
- `test_fts_query_sanitiser_handles_quotes_and_operators` — `'NEAR("a" b)'` as a user query
  does not raise and does not match everything.
- `test_every_returned_chunk_is_registered_as_evidence` — `len(outcome.candidates) == len(ledger.by_type(DOCUMENT))`.
- `test_rerank_reasons_are_attached_and_non_empty` — Proof Mode's requirement.
- `test_normal_mode_returns_only_active_revisions`.
- `test_audit_mode_requires_the_historical_permission` — `PermissionError` for a role without it.
- `test_activating_rev4_supersedes_rev3_atomically` — exactly one ACTIVE, links in both
  directions.
- `test_superseded_evidence_downgrades_the_claim_to_needs_review` — reason names Rev 4.
- `test_superseded_evidence_is_labelled_in_the_prompt_block` — `"SUPERSEDED revision"` in the
  rendered header.
- `test_document_identity_survives_a_new_file_of_the_same_revision` —
  **regression for `knowledge_base.py:154-155`**.

### Item 30 — *"Every stage is independently testable and the main pipeline primarily coordinates stage transitions."*

`tests/test_workflow_pipeline.py`, `tests/test_orchestrator_parity.py`

- `test_each_stage_runs_with_only_its_declared_inputs` — nine tests, one per stage, each
  constructing a `WorkflowContext` with fakes and no other stage having run.
- `test_blocked_stage_stops_the_pipeline_and_does_not_mark_failed` — `TaskStatus.BLOCKED`.
- `test_degraded_stage_continues_and_records_a_limitation`.
- `test_failed_abort_stage_stops_the_pipeline`.
- `test_cancellation_is_honoured_at_every_stage_boundary` — parametrised over all nine.
- `test_every_stage_emits_started_and_finished_exactly_once`.
- `test_stage_results_are_persisted_for_recovery` — the Backend B interlock.
- `test_legacy_task_stage_event_is_still_emitted` — the frontend interlock.
- `test_pipeline_matches_the_legacy_orchestrator_snapshot` — the parity oracle from step 0 of
  §8.7, run in both modes.

### Cross-cutting

`tests/adversarial/test_evidence_integrity.py` (**DEPENDS-ON: Backend B** owns the directory,
item 32; these are my contributions to it):

- fabricated citation `[S99]` → `UNSUPPORTED`, never `SUPPORTED`
- a draft that cites real evidence for an invented conclusion → `UNSUPPORTED`
- contradictory SOPs in one corpus → conflict raised, approval forced
- an outdated SOP as the only match → `NEEDS_REVIEW` with the active replacement named
- unit-mismatched calculation request → refused pre-execution
- a 20-page scan where the answer is on page 17 → the fact is found and cited to page 17

That last one is the single test that best demonstrates items 1–4 together, and it is the one
to run in front of a judge.

---

## 11. BUILD SEQUENCE

Ordered by dependency, not by roadmap number. Each line is shippable on its own.

| # | Work | Roadmap | Depends on | Effort |
|---|---|---|---|---|
| A1 | `tests/test_orchestrator_parity.py` characterisation harness | — | nothing | S |
| A2 | `backend/evidence/{models,provenance,store,ledger,citations}.py` + `evidence` table | 2, 3, 4 | A1 | **L** |
| A3 | Shadow-write from the old ledger; prove the store under real traffic | 4 | A2 | S |
| A4 | Convert producers: `file_read`, `knowledge_search`, sandbox | 2, 4 | A3 | M |
| A5 | `parsing.profile_pdf_pages` + `rasterize_pages` + `vision_batches` + `vision_merge` | 1 | A2 | M |
| A6 | `VisionStage` behaviour into the current `run()`; delete `_record_extraction` | 1, 2 | A4, A5 | M |
| A7 | `backend/engineering/{errors,units,registry,corrosion}.py` + Pint | 7, 8 | A2 | M |
| A8 | `pressure.py`, `piping.py` | 7 | A7 | S |
| A9 | `backend/verification/{models,claim_extractor,evidence_mapper,numeric_verifier,verifier}.py` | 9 | A4, A7 | **L** |
| A10 | `contradictions.py` + conflict endpoints + `from_human` | 10 | A9 | M |
| A11 | `gate.py` + `approval-rules.yaml` + gateway wiring | 9, 10 | A9, A10 | S |
| A12 | `VerificationReport` extension + `agents/verifier.py` shim | 9 | A9 | S |
| A13 | FTS5 table, triggers, backfill, `RetrievalFilter`, SQL-side filtering | 11 | A2 | M |
| A14 | `hybrid.py` + `reranker.py` + `from_retrieved_chunk` | 11 | A13 | M |
| A15 | `knowledge/{document_registry,revision_manager}.py` + revision columns | 12 | A13 | M |
| A16 | Revision warnings through prompt / claim / limitation | 12 | A15, A9 | S |
| A17 | `workflow/{context,pipeline,model_gateway}.py` + nine stages behind the flag | 30 | A6, A9, A14 | **L** |
| A18 | Flip the flag; delete the old `run()` body | 30 | A17 + parity green | S |
| A19 | New endpoints + SSE events | contract | A9, A10, A17 | M |
| A20 | Delete `agents/verifier.py`; deprecate `material_claims_*` | 9 | A18, A19 | S |

**Critical path: A1 → A2 → A4 → A9 → A17.** Everything else parallelises around it.

Parallelisable immediately after A2 lands: A5/A6 (PDF), A7/A8 (engineering), A13/A14/A15
(retrieval) are three independent tracks touching disjoint files.

**Hand-offs.** A2's `Evidence` model must land before the Frontend agent starts the evidence
drawer. A17's `StageResult` must land before Backend B starts checkpoints (item 29). A19's
endpoints must land before Proof Mode.

### What I would CUT, in the order I would cut it

The demo is Demo 1 (scanned inspection report → evidence → corrosion → verification →
approval → report) plus Demo 3's evidence half. Judge everything against that.

**Cut first — no demo impact:**

1. **`pressure.py` and `piping.py` (A8).** Four formulas nobody demonstrates. Corrosion rate +
   remaining life + inspection interval carries item 7 entirely. *Saves ~1 day.*
2. **The `EXPLICIT` retrieval mode** and `/api/knowledge/revisions/{id}/activate`. Ship
   revision *awareness* (status on evidence, the warning, ACTIVE-only default); make activation
   a seeded-data concern. *Saves ~1 day.*
3. **`from_human` / conflict resolution endpoint (part of A10).** Detect and block conflicts;
   resolving one in the UI is a nice-to-have. The `HUMAN` type stays in the enum so the
   contract does not churn. *Saves ~1 day.*
4. **Dense-channel rerank features `recency` and `section_specificity`.** Keep `term_coverage`,
   `tag_match`, `authority`, `channel_agreement`. *Saves hours.*
5. **`page.png` endpoint.** Only needed for bbox overlay, which is really item 18 (P&ID
   viewer). *Saves ~half a day.*

**Cut second — degrades the story but survives:**

6. **The model-based claim extractor (half of A9).** Ship `ClaimExtractor.deterministic` only.
   It over-segments slightly and misses cross-sentence claims, but it never hallucinates, needs
   no extra inference pass on a CPU host, and every downstream test still passes. *Saves ~1 day
   and ~8 s per task on the demo machine.*
7. **`piping`/`pressure` formula *catalogue* in the planner prompt.** Hard-bind the demo to
   the corrosion formulas via the plan.
8. **The full pipeline refactor (A17/A18).** This is the one genuinely optional item: it buys
   testability, recovery and Proof Mode structure, but it changes no behaviour a judge sees. If
   the calendar collapses, ship A1–A16 + A19 with the monolith intact and the stage events
   emitted from inside `run()` by hand. **Warning:** cutting A17 means Backend B cannot build
   item 29 (recovery) and the Frontend's Proof Mode has to read a less structured timeline —
   so cut it only in consultation with both.

**Never cut, at any cost:**

- **A2 — the evidence ledger.** Items 5, 9, 10, 16, 24, 26, 27 and 28 all read it. Without it
  the rest of the roadmap has no substrate, and the product's one-sentence claim ("evidence-
  verified") is not true.
- **A5/A6 — PDF completeness.** The demo document is a scan. Reading 4 pages of 20 is the
  defect most likely to be found by a judge who asks "what's on page 12?".
- **A4 — per-file provenance.** Two attachments in a demo and a mis-attributed finding ends the
  conversation.
- **A9 + A11 — claim verification and the gate.** The current `material_claims_supported` number
  is indefensible under questioning. Replacing it with a smaller, true number is worth more
  than any feature on this list.

### Demo-ware and embarrassment flags (shared-brief rule 6)

| Thing | Why it embarrasses | Fix |
|---|---|---|
| `test_page_count_is_capped` (`test_visual_inputs.py:83`) | the test suite asserts that dropping document pages is correct | A5; rewrite the docstring |
| `_claim_supported` token overlap (`verifier.py:112-123`) | "supported by local evidence" currently means "shares three words" | A9 |
| `source = task.files[0].filename` (`orchestrator.py:429`) | provenance is a lie with two attachments | A4/A6 |
| `f"    value = ({expression})"` (`verifier.py:190-203`) | model-authored source executed as the *verification* step | A7 |
| clearance filter after retrieval (`tools/registry.py:235-240`) | restricted content is read and ranked before being dropped | A13 |
| `document_id = sha256(name + content)` (`knowledge_base.py:154`) | Rev 4 and Rev 3 are unrelated documents | A15 |
| `except (ParsingError, Exception)` (`orchestrator.py:398`) | reads as a typo; catches everything | A6 |
| evidence lives only in `tasks.payload` | there is no ledger to inspect, export or hash | A2 |
