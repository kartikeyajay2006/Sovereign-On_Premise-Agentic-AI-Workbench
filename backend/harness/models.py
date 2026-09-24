"""Harness run records and the shapes the harness API returns.

These are transcribed field for field into
``frontend/features/harness/model/types.ts``. ``request<T>()`` on the client
asserts a type rather than checking one, so a field renamed here and not
there compiles cleanly and fails on screen; change both together.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

from backend.core.schemas import Sensitivity, TaskStatus
from backend.harness.definitions import AggregationKind, ChoiceOption, ExpansionSource, InputKind

InputValue = str | list[str]


class RunStatus(str, Enum):
    RUNNING = "running"
    # Cancel requested; the in-flight child is being stopped at its next
    # stage boundary and nothing further will be submitted.
    CANCELLING = "cancelling"
    # The harness drove every item it was given. Says nothing about how the
    # children fared -- the tally does that.
    FINISHED = "finished"
    CANCELLED = "cancelled"
    # The harness itself broke. Children already settled keep their records.
    FAILED = "failed"
    # The workbench stopped while the run was in progress.
    INTERRUPTED = "interrupted"


ACTIVE_RUN_STATUSES = frozenset({RunStatus.RUNNING, RunStatus.CANCELLING})


class ItemState(str, Enum):
    """Where the HARNESS is with an item, which is not the child's status."""

    PENDING = "pending"
    SUBMITTED = "submitted"
    SETTLED = "settled"
    NOT_SUBMITTED = "not_submitted"
    # The task service did not accept the child.
    SUBMIT_FAILED = "submit_failed"
    # Policy refused to submit it: the person no longer holds task.create, or
    # their account is inactive. Checked per child, as the thread checks per
    # request.
    SUBMIT_REFUSED = "submit_refused"


class HarnessOutcome(str, Enum):
    """What one item came to, derived from its child's record.

    Four of these are deliveries and they are deliberately not merged:
    "every material claim supported" and "delivered with some claims
    unsupported" are different facts, and so is "nothing to check". A
    refusal is not a pass, held is not delivered, and an item that never
    ran is not a failure of the thing it would have asked.
    """

    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    SUPPORTED = "supported"
    PARTIALLY_SUPPORTED = "partially_supported"
    NO_MATERIAL_CLAIMS = "no_material_claims"
    RELEASED_UNVERIFIED = "released_unverified"
    HELD = "held"
    REJECTED = "rejected"
    REFUSED = "refused"
    FAILED = "failed"
    CANCELLED = "cancelled"
    NOT_SUBMITTED = "not_submitted"


DELIVERED_OUTCOMES = frozenset(
    {
        HarnessOutcome.SUPPORTED,
        HarnessOutcome.PARTIALLY_SUPPORTED,
        HarnessOutcome.NO_MATERIAL_CLAIMS,
        HarnessOutcome.RELEASED_UNVERIFIED,
    }
)
UNSETTLED_OUTCOMES = frozenset(
    {HarnessOutcome.PENDING, HarnessOutcome.QUEUED, HarnessOutcome.RUNNING}
)


# ------------------------------------------------------------------ records
class DefinitionSnapshot(BaseModel):
    """The definition as it was when the run started.

    Kept on the run so an old run stays readable after its YAML is edited or
    removed, and so the report can name the exact definition by hash.
    """

    id: str
    version: int
    name: str
    source: str
    sha256: str
    aggregation: AggregationKind
    report_title: str
    report_requires_approval: bool
    limitations: list[str] = Field(default_factory=list)
    template: str
    child_timeout_seconds: int


class ScopeRecord(BaseModel):
    """The retrieval scope children of this run search, counted at start."""

    # None: every department, because the role holds cross-department read.
    departments: list[str] | None
    max_classification: Sensitivity
    documents: int
    sections: int


class HarnessItem(BaseModel):
    index: int
    key: str
    label: str
    prompt: str
    group: str | None = None
    state: ItemState = ItemState.PENDING
    task_id: str | None = None
    submitted_at: datetime | None = None
    # When the harness first saw the child running. Poll granularity, so
    # this is when it was observed, not when the worker picked it up.
    started_at: datetime | None = None
    settled_at: datetime | None = None
    note: str | None = None
    error: str | None = None


class ExcludedItem(BaseModel):
    key: str
    label: str


class HarnessTally(BaseModel):
    total: int
    settled: int
    delivered: int
    # Every outcome is present, zeros included, so a reader never has to
    # infer a zero from an absent key.
    counts: dict[HarnessOutcome, int]


class ReportApproval(BaseModel):
    required: bool
    reasons: list[str] = Field(default_factory=list)
    decision: Literal["pending", "approved", "rejected"] | None = None
    reviewer_id: str | None = None
    reviewer_name: str | None = None
    comment: str | None = None
    decided_at: datetime | None = None


class ReportFile(BaseModel):
    format: Literal["md", "json"]
    filename: str
    sha256: str
    size_bytes: int


class HarnessReportRecord(BaseModel):
    version: int
    generated_at: datetime
    generated_by: str
    reason: Literal["finished", "cancelled", "interrupted", "regenerated"]
    files: list[ReportFile]
    classification: Sensitivity
    approval: ReportApproval
    released: bool
    # Child task id -> status when this version was written. Compared with
    # the live records to say, rather than hide, that an approval since has
    # made the report out of date.
    child_statuses: dict[str, str] = Field(default_factory=dict)
    tally: HarnessTally


class HarnessRun(BaseModel):
    id: str
    harness: DefinitionSnapshot
    user_id: str
    username: str
    user_display_name: str
    role: str
    department: str
    inputs: dict[str, InputValue]
    inputs_sha256: str
    excluded: list[ExcludedItem] = Field(default_factory=list)
    scope: ScopeRecord
    status: RunStatus
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None = None
    cancel_requested_at: datetime | None = None
    cancel_requested_by: str | None = None
    error: str | None = None
    items: list[HarnessItem]
    report: HarnessReportRecord | None = None
    previous_reports: list[HarnessReportRecord] = Field(default_factory=list)


# -------------------------------------------------------------------- views
class Citation(BaseModel):
    id: str
    source_document: str
    location: str | None = None
    excerpt: str
    score: float | None = None
    classification: Sensitivity
    kind: str


class CheckSummary(BaseModel):
    name: str
    passed: bool
    detail: str


class HarnessChildView(BaseModel):
    index: int
    key: str
    label: str
    prompt: str
    group: str | None = None
    state: ItemState
    task_id: str | None = None
    task_status: TaskStatus | None = None
    outcome: HarnessOutcome
    # One plain sentence built only from the child's record.
    outcome_detail: str
    # True only for a delivered child: its answer has been released.
    released: bool
    claims_total: int | None = None
    claims_supported: int | None = None
    verification_valid: bool | None = None
    checks: list[CheckSummary] = Field(default_factory=list)
    # Answer content -- citations and unsupported-claim excerpts -- is carried
    # for released children only. A held draft is read in the thread, where
    # it is labelled as held, not through the harness.
    citations: list[Citation] = Field(default_factory=list)
    unretrieved_citations: list[str] = Field(default_factory=list)
    unsupported_claims: list[str] = Field(default_factory=list)
    approval_reasons: list[str] = Field(default_factory=list)
    reviewer_name: str | None = None
    error: str | None = None
    note: str | None = None
    duration_ms: int | None = None
    queue_position: int | None = None
    queue_ahead: int | None = None
    submitted_at: datetime | None = None
    started_at: datetime | None = None
    settled_at: datetime | None = None


class RunPermissions(BaseModel):
    """What the person viewing may do, decided by the server, not guessed."""

    can_cancel: bool
    can_regenerate_report: bool
    can_decide_report: bool
    can_download_report: bool


class ReportDownload(BaseModel):
    format: Literal["md", "json"]
    url: str
    filename: str
    sha256: str
    size_bytes: int


class ReportView(BaseModel):
    record: HarnessReportRecord
    stale: bool
    # Item indexes whose child status differs from when this version was
    # written, e.g. a held child approved since.
    changed_items: list[int] = Field(default_factory=list)
    downloads: list[ReportDownload] = Field(default_factory=list)


class HarnessRunView(BaseModel):
    id: str
    harness: DefinitionSnapshot
    user_id: str
    username: str
    user_display_name: str
    role: str
    department: str
    inputs: dict[str, InputValue]
    excluded: list[ExcludedItem]
    scope: ScopeRecord
    status: RunStatus
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None = None
    cancel_requested_at: datetime | None = None
    cancel_requested_by: str | None = None
    error: str | None = None
    children: list[HarnessChildView]
    tally: HarnessTally
    # The item currently in flight, if the run is active.
    current_index: int | None = None
    report: ReportView | None = None
    permissions: RunPermissions
    # What the outcomes above do NOT establish -- the same statements every
    # report carries, available before a report exists.
    limitations: list[str]
    # The server's clock when this view was built, so elapsed time is
    # measured against one clock rather than the browser's.
    server_time: datetime


class HarnessRunSummary(BaseModel):
    id: str
    harness_id: str
    harness_name: str
    status: RunStatus
    user_display_name: str
    created_at: datetime
    finished_at: datetime | None = None
    tally: HarnessTally
    current_index: int | None = None
    report_version: int | None = None
    report_released: bool | None = None
    report_requires_approval: bool | None = None
    report_decision: Literal["pending", "approved", "rejected"] | None = None


class HarnessInputView(BaseModel):
    id: str
    kind: InputKind
    label: str
    help: str | None = None
    placeholder: str | None = None
    required: bool
    max_chars: int
    min_items: int
    max_items: int
    options: list[ChoiceOption] = Field(default_factory=list)
    # Resolved for the person asking: "user_department" becomes theirs.
    default: str | None = None


class HarnessDefinitionView(BaseModel):
    id: str
    version: int
    name: str
    summary: str
    description: str
    inputs: list[HarnessInputView]
    expansion_source: ExpansionSource
    aggregation: AggregationKind
    template: str
    label_template: str
    report_title: str
    report_requires_approval: bool
    limitations: list[str]
    max_items: int
    child_timeout_seconds: int
    source: str
    sha256: str


class DefinitionErrorView(BaseModel):
    source: str
    message: str


class HarnessCatalogView(BaseModel):
    harnesses: list[HarnessDefinitionView]
    errors: list[DefinitionErrorView]


class PreviewItem(BaseModel):
    key: str
    index: int
    label: str
    prompt: str
    group: str | None = None


class HarnessPreview(BaseModel):
    harness_id: str
    items: list[PreviewItem]
    limit: int
    scope: ScopeRecord
    warnings: list[str]
    inputs: dict[str, InputValue]


# ----------------------------------------------------------------- requests
class HarnessPreviewRequest(BaseModel):
    inputs: dict[str, InputValue] = Field(default_factory=dict)


class HarnessStartRequest(BaseModel):
    harness_id: str = Field(min_length=1)
    inputs: dict[str, InputValue] = Field(default_factory=dict)
    # The item keys the person approved in the preview. When given, the run
    # is exactly these; if expansion no longer produces one of them the
    # start is refused rather than silently running something else.
    selected: list[str] | None = None
    # The sha256 of the definition the person previewed. If the YAML has
    # been edited since, its template may ask something else, so the start
    # is refused rather than run under wording nobody reviewed.
    definition_sha256: str | None = None


class ReportDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]
    comment: str | None = Field(default=None, max_length=2000)
