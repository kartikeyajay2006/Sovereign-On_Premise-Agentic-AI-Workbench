"""Pydantic contracts shared by the API, the agent and the frontend.

These models are the frozen contract described in
``docs/implementation-architecture.md``. The frontend consumes exactly these
shapes; no endpoint returns an ad-hoc dictionary.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# --------------------------------------------------------------------- enums
class InputType(str, Enum):
    TEXT = "text"
    DOCUMENT = "document"
    PDF = "pdf"
    SPREADSHEET = "spreadsheet"
    PRESENTATION = "presentation"
    IMAGE = "image"
    SCANNED_PDF = "scanned_pdf"
    DRAWING = "drawing"
    PID_DIAGRAM = "pid_diagram"
    CODE = "code"
    MULTIMODAL = "multimodal"


class TaskType(str, Enum):
    ANALYSIS = "analysis"
    CODING = "coding"
    CALCULATION = "calculation"
    DOCUMENT_GENERATION = "document_generation"
    VISION_ANALYSIS = "vision_analysis"
    SUMMARIZATION = "summarization"
    QUESTION_ANSWERING = "question_answering"
    # A greeting, thanks or an acknowledgement: not a task. Answered in one
    # short model call, without retrieval, claim checks or approval, because
    # it makes no claims (backend/agents/orchestrator.py, _converse).
    CONVERSATION = "conversation"


class Complexity(str, Enum):
    SIMPLE = "simple"
    MULTI_STEP = "multi_step"
    AGENTIC = "agentic"


class Sensitivity(str, Enum):
    NORMAL = "normal"
    CONFIDENTIAL = "confidential"
    SENSITIVE = "sensitive"
    RESTRICTED = "restricted"


class TaskStatus(str, Enum):
    RECEIVED = "received"
    CLASSIFIED = "classified"
    PLANNED = "planned"
    RETRIEVING = "retrieving"
    EXECUTING = "executing"
    VERIFYING = "verifying"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    DELIVERED = "delivered"
    FAILED = "failed"
    BLOCKED = "blocked"
    CANCELLED = "cancelled"


class ModelRole(str, Enum):
    REASONING = "reasoning"
    CODING = "coding"
    VISION = "vision"
    EMBEDDING = "embedding"


class PolicyDecision(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    REQUIRE_APPROVAL = "require_approval"


# ------------------------------------------------------------------ identity
class User(BaseModel):
    id: str
    username: str
    display_name: str
    role: str
    department: str
    active: bool = True
    permissions: list[str] = Field(default_factory=list)
    max_data_classification: Sensitivity = Sensitivity.NORMAL


class LoginRequest(BaseModel):
    username: str
    password: str


class RegistrationRequest(BaseModel):
    username: str
    display_name: str
    password: str
    department: str = "operations"


class Session(BaseModel):
    token: str
    user: User
    issued_at: datetime
    expires_at: datetime


# --------------------------------------------------------------------- files
class StoredFile(BaseModel):
    id: str
    task_id: str | None = None
    filename: str
    stored_path: str
    media_type: str
    size_bytes: int
    sha256: str
    input_type: InputType
    classification: Sensitivity = Sensitivity.NORMAL
    owner_id: str
    department: str
    quarantine_passed: bool = True
    quarantine_notes: list[str] = Field(default_factory=list)
    uploaded_at: datetime


# ------------------------------------------------------------ classification
class ClassificationSignal(BaseModel):
    dimension: str
    value: str
    score: float
    matched: list[str] = Field(default_factory=list)


class TaskProfile(BaseModel):
    """Structured execution profile produced by the industrial task analyzer."""

    input_type: InputType
    task_type: TaskType
    complexity: Complexity
    sensitivity: Sensitivity
    confidence: float = Field(ge=0.0, le=1.0)
    step_budget: int
    requires_retrieval: bool
    requires_vision: bool
    requires_code_execution: bool
    produces_deliverable: bool
    deliverable_format: str | None = None
    required_capabilities: list[str] = Field(default_factory=list)
    signals: list[ClassificationSignal] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)


# -------------------------------------------------------------------- models
class ModelDescriptor(BaseModel):
    id: str
    display_name: str
    family: str
    role: ModelRole
    capabilities: list[str]
    context_window: int
    quantization: str | None = None
    parameters_b: float | None = None
    approved_classifications: list[Sensitivity]
    provider: str
    provider_model: str
    available: bool = False
    registered: bool = True
    size_bytes: int | None = None
    notes: str | None = None


class RoutingDecision(BaseModel):
    requested_role: ModelRole
    required_capabilities: list[str]
    selected_model: str | None
    selected_display_name: str | None = None
    rule: str
    reason: str
    used_fallback: bool = False
    candidates: list[dict[str, Any]] = Field(default_factory=list)
    decided_at: datetime
    # The pipeline stage this decision served, when routed for one. It was
    # only ever inside `reason` as prose, so a reopened run could not say
    # which stage a declined request applied to without parsing a sentence.
    stage: str | None = None
    # What the person asked for, and what became of it. All three stay None
    # when they left the choice to the router. A preference is honoured only
    # where policy would have allowed that model anyway, so a request is
    # never a way round an approval, an installation or a capability gate --
    # and when it is declined, `preference_reason` says which gate declined
    # it, so the interface can tell them rather than quietly substitute.
    preferred_model: str | None = None
    preference_honoured: bool | None = None
    preference_reason: str | None = None


class ModelUsage(BaseModel):
    """What one model call cost, as measured.

    Every figure here is timed by the orchestrator around the call, reported
    by the runtime at the end of it, or -- the window and the output budget --
    exactly what the call was sent with. A figure the runtime did not report
    stays None. Zero is a count; None is the absence of one, and a total that
    quietly read a missing count as zero would understate the run it
    describes.
    """

    stage: str
    #: The registry id that served the call, e.g. ``qwen2.5:3b``.
    model: str
    display_name: str | None = None
    #: Tokens the runtime reports for the prompt (``prompt_eval_count``).
    prompt_tokens: int | None = None
    #: Tokens the runtime reports generating (``eval_count``). Includes any
    #: reasoning a model produced and the workbench then stripped.
    output_tokens: int | None = None
    #: Wall clock around the whole call: queueing, load, prompt and output.
    latency_ms: int
    #: ``output_tokens`` over the runtime's own generation time
    #: (``eval_duration``), so model load and prompt processing are not
    #: averaged into what reads as generation speed.
    tokens_per_second: float | None = None
    #: The context window this call was given (``num_ctx``). Stage budgets
    #: in config/routing.yaml make it far smaller than the model's declared
    #: maximum, and a prompt's share of the window it actually ran in is the
    #: figure that says how close the call came to truncation.
    context_window: int | None = None
    #: The output budget this call was given (``num_predict``).
    output_limit: int | None = None
    #: Why the runtime stopped: ``stop`` for a finished answer, ``length``
    #: when the output budget ran out first.
    done_reason: str | None = None
    #: Only a streamed call can time its first visible fragment.
    first_token_ms: int | None = None
    load_ms: int | None = None
    prompt_eval_ms: int | None = None
    eval_ms: int | None = None
    streamed: bool = False
    #: Stopped at the operator's request before the runtime finished. The
    #: runtime reports counts only in its final message, so a stopped call
    #: carries its wall clock and nothing else.
    cancelled: bool = False
    started_at: datetime


# ------------------------------------------------------------------ evidence
class EvidenceItem(BaseModel):
    """One citable piece of local evidence (reference architecture §8)."""

    id: str
    source_document: str
    document_id: str | None = None
    location: str | None = None
    page_number: int | None = None
    excerpt: str
    extraction_method: str | None = None
    extraction_model: str | None = None
    extraction_data: dict[str, Any] | None = None
    confidence: float | None = None
    source_sha256: str | None = None
    score: float | None = None
    department: str | None = None
    classification: Sensitivity = Sensitivity.NORMAL
    version: str | None = None
    ingested_at: datetime | None = None
    kind: Literal["knowledge_base", "uploaded_file", "vision_extraction", "computation"] = (
        "knowledge_base"
    )


# --------------------------------------------------------------------- tools
class ToolCall(BaseModel):
    id: str
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    ok: bool
    output_summary: str
    output: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    started_at: datetime
    duration_ms: int
    policy_decision: PolicyDecision = PolicyDecision.ALLOW


class SandboxResult(BaseModel):
    ok: bool
    exit_code: int | None
    stdout: str
    stderr: str
    duration_ms: int
    timed_out: bool = False
    memory_limit_mb: int
    static_validation_passed: bool
    static_violations: list[str] = Field(default_factory=list)
    generated_files: list[str] = Field(default_factory=list)
    network_attempts_blocked: int = 0


# ---------------------------------------------------------------- agent plan
class PlanStep(BaseModel):
    id: int
    action: str
    objective: str
    inputs: str | None = None
    status: Literal["pending", "running", "done", "failed", "skipped"] = "pending"
    result_summary: str | None = None


class AgentPlan(BaseModel):
    version: int = 1
    steps: list[PlanStep] = Field(default_factory=list)
    expected_outputs: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    created_at: datetime


# -------------------------------------------------------------- verification
class VerificationCheck(BaseModel):
    name: str
    kind: Literal["source", "calculation", "code", "document", "hallucination"]
    passed: bool
    detail: str
    evidence_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class VerificationReport(BaseModel):
    valid: bool
    checks: list[VerificationCheck] = Field(default_factory=list)
    material_claims_total: int = 0
    material_claims_supported: int = 0
    limitations: list[str] = Field(default_factory=list)
    completed_at: datetime


# ------------------------------------------------------------------ approval
class ApprovalRecord(BaseModel):
    required: bool
    reasons: list[str] = Field(default_factory=list)
    approver_roles: list[str] = Field(default_factory=list)
    decision: Literal["pending", "approved", "rejected"] | None = None
    reviewer_id: str | None = None
    reviewer_name: str | None = None
    comment: str | None = None
    decided_at: datetime | None = None


class ApprovalDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]
    comment: str | None = None


# --------------------------------------------------------------- deliverable
class Deliverable(BaseModel):
    id: str
    filename: str
    format: str
    size_bytes: int
    sha256: str
    download_url: str
    released: bool = False
    created_at: datetime


# ---------------------------------------------------------------------- task
class TaskCreateRequest(BaseModel):
    prompt: str = Field(min_length=1)
    file_ids: list[str] = Field(default_factory=list)
    deliverable_format: str | None = None
    # A registry id the person would like used. Advisory: the router honours
    # it per stage only where the model is eligible under the same policy,
    # and records why wherever it is not.
    preferred_model: str | None = Field(default=None, max_length=128)
    # A skill to run: `prompt` is then what was typed after it, and the
    # skill's template turns it into the request (backend/skills/registry.py).
    skill_id: str | None = Field(default=None, max_length=32)


class SkillInvocation(BaseModel):
    """Which skill produced a task's request, at which hash, from what input."""

    id: str
    name: str
    sha256: str
    source: str
    input: str


class PolicyEvent(BaseModel):
    subject: str
    action: str
    decision: PolicyDecision
    reason: str
    rule: str | None = None
    at: datetime


class Task(BaseModel):
    model_config = ConfigDict(use_enum_values=False)

    id: str
    prompt: str
    status: TaskStatus
    user_id: str
    user_display_name: str | None = None
    department: str | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    files: list[StoredFile] = Field(default_factory=list)
    profile: TaskProfile | None = None
    plan: AgentPlan | None = None
    preferred_model: str | None = None
    # Set when the request came from a skill: the prompt above is the skill's
    # rendering, and this is what the person typed and which skill made it.
    skill: SkillInvocation | None = None
    routing: list[RoutingDecision] = Field(default_factory=list)
    # One record per model call, in the order they ran. Persisted with the
    # task, so a run reopened later reports what it cost rather than only
    # what it said.
    usage: list[ModelUsage] = Field(default_factory=list)
    tool_calls: list[ToolCall] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    verification: VerificationReport | None = None
    approval: ApprovalRecord | None = None
    deliverables: list[Deliverable] = Field(default_factory=list)
    policy_events: list[PolicyEvent] = Field(default_factory=list)
    answer: str | None = None
    error: str | None = None
    duration_ms: int | None = None
    # Where this task sits in the worker queue, when it has not started yet.
    queue_position: int | None = None
    queue_ahead: int = 0


class TaskSummary(BaseModel):
    id: str
    prompt: str
    status: TaskStatus
    task_type: TaskType | None = None
    sensitivity: Sensitivity | None = None
    created_at: datetime
    updated_at: datetime
    deliverable_count: int = 0
    approval_required: bool = False
    user_display_name: str | None = None
    # The skill the request went through, so a list can show "/clause" and
    # what was typed rather than the skill's whole rendering.
    skill: SkillInvocation | None = None


# ----------------------------------------------------------------- knowledge
class KnowledgeDocument(BaseModel):
    id: str
    title: str
    source_path: str
    department: str
    classification: Sensitivity
    version: str
    chunk_count: int
    sha256: str
    ingested_at: datetime
    media_type: str
    size_bytes: int


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int | None = None
    departments: list[str] | None = None


class KnowledgeSearchResponse(BaseModel):
    query: str
    retrieval_mode: Literal["embedding", "lexical"]
    results: list[EvidenceItem]
    took_ms: int


# --------------------------------------------------------------------- audit
class AuditEvent(BaseModel):
    sequence: int
    id: str
    at: datetime
    actor: str
    actor_role: str | None = None
    task_id: str | None = None
    category: str
    action: str
    detail: dict[str, Any] = Field(default_factory=dict)
    prev_hash: str
    hash: str


class AuditChainStatus(BaseModel):
    valid: bool
    events: int
    broken_at: int | None = None
    head_hash: str | None = None
    checked_at: datetime


# --------------------------------------------------------------- sovereignty
class NetworkConnection(BaseModel):
    laddr: str
    raddr: str | None
    status: str
    pid: int | None
    process: str | None
    allowed: bool
    reason: str


class SovereigntyStatus(BaseModel):
    sovereign: bool
    external_api_calls: int = 0
    internet_requests: int = 0
    dns_requests: int = 0
    unapproved_connections: int = 0
    local_connections: int = 0
    monitored_since: datetime
    last_checked: datetime
    violations: list[NetworkConnection] = Field(default_factory=list)
    # False while the monitor is stopped or its last sample produced no
    # reading; monitor_error then says why.
    monitor_active: bool = True
    monitor_error: str | None = None
    interfaces: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------- sse events
class StreamEvent(BaseModel):
    event: str
    task_id: str | None = None
    at: datetime
    data: dict[str, Any] = Field(default_factory=dict)


# -------------------------------------------------------------- system state
class SystemHealth(BaseModel):
    api: bool = True
    inference_provider: str
    inference_reachable: bool
    models_registered: int
    models_available: int
    knowledge_documents: int
    knowledge_chunks: int
    retrieval_mode: Literal["embedding", "lexical", "unavailable"]
    sandbox_runtime: str
    sandbox_ready: bool
    audit_chain_valid: bool
    sovereignty_ok: bool
    uptime_seconds: float
    checked_at: datetime
