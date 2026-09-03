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


# ------------------------------------------------------------------ evidence
class EvidenceItem(BaseModel):
    """One citable piece of local evidence (reference architecture §8)."""

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
    routing: list[RoutingDecision] = Field(default_factory=list)
    tool_calls: list[ToolCall] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    verification: VerificationReport | None = None
    approval: ApprovalRecord | None = None
    deliverables: list[Deliverable] = Field(default_factory=list)
    policy_events: list[PolicyEvent] = Field(default_factory=list)
    answer: str | None = None
    error: str | None = None
    duration_ms: int | None = None


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
    cloud_llm_calls: int = 0
    internet_requests: int = 0
    dns_requests: int = 0
    data_leaving_host_bytes: int = 0
    unapproved_connections: int = 0
    local_connections: int = 0
    monitored_since: datetime
    last_checked: datetime
    violations: list[NetworkConnection] = Field(default_factory=list)
    monitor_active: bool = True
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
