"""Contradictions between sources outside the formula inputs.

Input conflicts cover only what a formula reads. A datasheet that says V-2107
is designed for 18 bar and a memo that says 16 bar disagree about the vessel
just as much, and an answer that repeats one of them has chosen silently.
These facts are read by pattern, never by the model, and a contradiction is a
``fact`` conflict: announced, told to the model, and every claim that takes a
side is CONFLICTED until a person resolves it.

The false positives matter as much as the detection: a false contradiction
withholds a true answer. Each non-conflict below is one the extractor must
not raise.
"""

from __future__ import annotations

import asyncio
import glob
from datetime import datetime, timezone
from pathlib import Path

from backend.agents.orchestrator import AgentOrchestrator, EvidenceLedger
from backend.agents.verifier import get_verification_engine
from backend.core.schemas import ApprovalRecord, EvidenceItem, Task, TaskStatus
from backend.engineering.facts import extract_facts, fact_block, fact_conflicts
from backend.engineering.stage import unresolved
from tests.test_conflicts import REVIEWER, _run, _scan, _sheet
from tests.test_engineering import V2104_TRANSCRIPTION
from tests.test_engineering_pipeline import ENGINEER

ROOT = Path(__file__).resolve().parents[1]


def _passage(item_id: str, document: str, text: str, *, status: str = "active") -> EvidenceItem:
    return EvidenceItem(id=item_id, source_document=document, document_id=f"doc-{document}", excerpt=text,
                        kind="knowledge_base", revision_status=status)


def _upload(item_id: str, name: str, text: str) -> EvidenceItem:
    return EvidenceItem(id=item_id, source_document=name, excerpt=text, kind="uploaded_file")


DATASHEET = _passage("S1", "V-2107 datasheet", "Equipment Tag: V-2107\nDesign pressure: 18 bar(g)\n"
                                                "Design temperature: 180 °C")
MEMO = _upload("F1", "operations-memo.md", "The operating limits of V-2107 were reviewed. V-2107 design "
                                           "pressure is 16 bar(g), as registered.")


# ------------------------------------------------------------------ detection
def test_two_sources_stating_different_values_are_a_fact_conflict() -> None:
    records = fact_conflicts([DATASHEET, MEMO], [])
    assert len(records) == 1
    record = records[0]
    assert (record.id, record.kind, record.status, record.impact) == ("K1", "fact", "unresolved", "high")
    assert record.subject == "V-2107" and record.label == "V-2107 Design pressure"
    assert record.field == "fact:V-2107:design_pressure"
    assert [(c.stated, c.evidence_id) for c in record.candidates] == [("18 bar(g)", "S1"), ("16 bar(g)", "F1")]
    assert [c.value for c in record.candidates] == [1.8, 1.6] and record.candidates[0].unit == "MPa"
    assert "16 bar(g)" in record.candidates[1].source_text
    assert record in unresolved(records)


def test_the_same_value_in_other_units_is_not_a_conflict() -> None:
    for stated in ("1.8 MPa", "261 psig", "1800 kPa"):
        other = _upload("F2", "note.md", f"V-2107 design pressure: {stated}.")
        assert fact_conflicts([DATASHEET, other], []) == [], stated
    fahrenheit = _upload("F2", "note.md", "V-2107 design temperature: 356 °F.")
    assert fact_conflicts([DATASHEET, fahrenheit], []) == []


def test_a_difference_beyond_the_written_precision_is_a_conflict() -> None:
    # 10.5 bar is 10.45-10.55: 10.6 bar is outside it.
    first = _upload("F1", "a.md", "P-101 design pressure 10.5 bar(g).")
    second = _upload("F2", "b.md", "P-101 design pressure 10.6 bar(g).")
    assert len(fact_conflicts([first, second], [])) == 1


def test_a_point_inside_a_range_is_not_a_conflict() -> None:
    ranged = _upload("F2", "envelope.md", "V-2107 design pressure 15 to 20 bar(g).")
    assert fact_conflicts([DATASHEET, ranged], []) == []
    bounded = _upload("F3", "limit.md", "V-2107 design pressure not exceeding 20 bar(g).")
    assert fact_conflicts([DATASHEET, bounded], []) == []
    # A point outside the range is.
    outside = _upload("F4", "envelope.md", "V-2107 design pressure 10-12 bar(g).")
    assert len(fact_conflicts([DATASHEET, outside], [])) == 1


def test_different_subjects_are_not_compared() -> None:
    # The replacement V-2104R is not V-2104.
    replacement = _passage("S2", "ENG-DBM-2104", "Replacement vessel tag V-2104R. Design pressure 12.0 bar(g).")
    scan = EvidenceItem(id="V1", source_document="scan", excerpt=V2104_TRANSCRIPTION, kind="vision_extraction")
    assert {f.subject for f in extract_facts(replacement)} == {"V-2104R"}
    assert fact_conflicts([scan, replacement], []) == []


def test_a_superseded_revision_is_left_to_revision_control() -> None:
    current = _passage("S1", "SOP-INS-099 Rev 2", "SOP-INS-099 Clause 3.2 sets the test pressure at 15 bar(g).")
    old = _passage("S2", "SOP-INS-099 Rev 1", "SOP-INS-099 Clause 3.2 sets the test pressure at 13 bar(g).",
                   status="superseded")
    assert {f.subject for f in extract_facts(current)} == {"SOP-INS-099 Clause 3.2"}
    assert fact_conflicts([current, old], []) == []
    # Two revisions both in force would be a contradiction.
    assert len(fact_conflicts([current, _passage("S3", "SOP-INS-099 copy", old.excerpt)], [])) == 1


def test_one_document_describing_a_change_is_not_two_witnesses() -> None:
    change = _upload("F1", "moc.md", "PSV-2104A set pressure 10.5 bar(g). After the change, PSV-2104A set "
                                     "pressure 12.0 bar(g).")
    assert fact_conflicts([change], []) == []
    # Two passages of one document are one source, too.
    first = _passage("S1", "memo", "PSV-2104A set pressure 10.5 bar(g).")
    second = _passage("S2", "memo", "PSV-2104A set pressure 12.0 bar(g).")
    assert fact_conflicts([first, second], []) == []


def test_an_input_conflict_is_not_reported_twice() -> None:
    task, _ = _run()
    before = [c.id for c in task.conflicts]
    other = _upload("F9", "other.md", "Equipment Tag: V-2104\nNominal thickness: 14.0 mm")
    records = fact_conflicts([*task.evidence, other], task.conflicts)
    assert [c.id for c in records][: len(before)] == before
    # The scan says 12.0 mm; nominal is compared as a formula input, and only
    # when that input is itself in conflict is the fact skipped. Here it is not.
    assert [c.field for c in records[len(before):]] == ["fact:V-2104:nominal_thickness"]
    from backend.core.schemas import ConflictRecord

    as_input = ConflictRecord(id="K9", kind="input", field="nominal", label="Nominal Thickness",
                              impact="high", status="unresolved")
    assert fact_conflicts([*task.evidence, other], [as_input]) == [as_input]


def test_the_sample_corpus_raises_no_false_contradiction() -> None:
    # Every document shipped in sample_data, and the V-2104 scan and field
    # sheet: they agree, so nothing may be raised.
    evidence = [_scan(), _sheet()]
    paths = sorted(glob.glob(str(ROOT / "sample_data" / "**" / "*.md"), recursive=True))
    for index, path in enumerate(paths):
        status = "superseded" if "archive" in path else "active"
        evidence.append(_passage(f"S{index}", Path(path).stem, Path(path).read_text(encoding="utf-8"), status=status))
    assert fact_conflicts(evidence, []) == []


def test_facts_are_read_from_the_real_scan_transcription() -> None:
    scan = EvidenceItem(id="V1", source_document="scan", excerpt=V2104_TRANSCRIPTION, kind="vision_extraction")
    facts = {(f.subject, f.attribute): f.stated for f in extract_facts(scan)}
    assert facts[("V-2104", "design_pressure")] == "10.5 bar(g)"
    assert facts[("V-2104", "design_temperature")] == "145 deg C"
    assert facts[("V-2104", "in_service_date")] == "18 Feb 2006"
    # A real-shaped contradiction: a memo giving V-2104 a different design temperature.
    memo = _upload("F2", "memo.md", "V-2104 design temperature 160 °C per the registered datasheet.")
    records = fact_conflicts([scan, memo], [])
    assert [(r.label, [c.stated for c in r.candidates]) for r in records] == [
        ("V-2104 Design temperature", ["145 deg C", "160 °C"])
    ]


def test_dates_disagree_by_the_day() -> None:
    first = _upload("F1", "a.md", "Equipment Tag: V-2107\nIn Service Since: 18 Feb 2006")
    same = _upload("F2", "b.md", "V-2107 in service since 2006-02-18.")
    other = _upload("F3", "c.md", "V-2107 in service since 18 February 2007.")
    assert fact_conflicts([first, same], []) == []
    records = fact_conflicts([first, other], [])
    assert [c.value for c in records[0].candidates] == ["2006-02-18", "2007-02-18"]


def test_existing_conflicts_keep_their_ids() -> None:
    records = fact_conflicts([DATASHEET, MEMO], [])
    again = fact_conflicts([DATASHEET, MEMO], records)
    assert again == records


# ----------------------------------------------------------- model and claims
def test_the_model_is_told_both_values_and_told_not_to_choose() -> None:
    block = fact_block(fact_conflicts([DATASHEET, MEMO], []))
    assert "18 bar(g) in [S1]" in block and "16 bar(g) in [F1]" in block
    assert "do not state either value as the fact" in block and "conflict K1" in block


def test_a_claim_that_takes_one_side_is_conflicted() -> None:
    conflicts = fact_conflicts([DATASHEET, MEMO], [])
    engine = get_verification_engine()
    text = (
        "V-2107 has a design pressure of 18 bar(g) [S1]. "
        "The sources disagree on the V-2107 design pressure: 18 bar(g) [S1] against 16 bar(g) [F1]. "
        "Hot work on the tank farm requires a gas test."
    )
    verdicts = engine.claim_verdicts(text, [DATASHEET, MEMO], conflicts=conflicts)
    assert verdicts[0].verdict == "CONFLICTED" and "K1" in verdicts[0].reason
    assert verdicts[1].verdict == "SUPPORTED"
    assert all(v.verdict != "CONFLICTED" for v in verdicts[2:])
    assert engine.check_claims(verdicts).passed is False


# ---------------------------------------------------------------- the run
def _fact_run() -> tuple[Task, AgentOrchestrator]:
    now = datetime.now(timezone.utc)
    task = Task(id="t-facts", prompt="What is the design pressure of V-2107?", status=TaskStatus.EXECUTING,
                user_id=ENGINEER.id, created_at=now, updated_at=now)
    ledger = EvidenceLedger(task.evidence)
    ledger.add(DATASHEET.model_copy(update={"id": "pending"}))
    ledger.add(MEMO.model_copy(update={"id": "pending"}))
    orchestrator = AgentOrchestrator()
    orchestrator._persist = None
    asyncio.run(orchestrator._fact_stage(task, ENGINEER, ledger))
    task.answer = "The sources disagree on the V-2107 design pressure, so it is withheld."
    task.status = TaskStatus.AWAITING_APPROVAL
    task.approval = ApprovalRecord(
        required=True, approver_roles=["reviewer", "administrator"], decision="pending",
        reasons=["unresolved_conflict: sources disagree"],
    )
    return task, orchestrator


def test_the_stage_records_and_announces_the_conflict() -> None:
    task, _ = _fact_run()
    assert [(c.id, c.kind, c.status) for c in task.conflicts] == [("K1", "fact", "unresolved")]
    assert [c.evidence_id for c in task.conflicts[0].candidates] == ["S1", "F1"]


def test_a_reviewer_resolves_a_fact_conflict_through_the_same_endpoint_logic() -> None:
    task, orchestrator = _fact_run()
    asyncio.run(orchestrator.resolve_conflict(
        task, REVIEWER, "K1", candidate=None, value="17 bar(g)", reason="Nameplate read on site today."))
    conflict = task.conflicts[0]
    assert conflict.status == "resolved" and conflict.resolution.stated == "17 bar(g)"
    assert conflict.resolution.value == 1.7 and conflict.resolution.unit == "MPa"
    human = next(item for item in task.evidence if item.kind == "human")
    assert "accepted 17 bar(g)" in human.excerpt
    assert not unresolved(task.conflicts)
    assert task.approval.reasons == []
    assert task.assessment is None and task.calculations == []


def test_a_resolved_value_must_be_the_same_kind_of_quantity() -> None:
    import pytest

    task, orchestrator = _fact_run()
    with pytest.raises(ValueError, match="different kind of quantity"):
        asyncio.run(orchestrator.resolve_conflict(
            task, REVIEWER, "K1", candidate=None, value="17 mm", reason="Nameplate read on site today."))


def test_the_calculation_is_not_withheld_by_a_fact_conflict() -> None:
    # V-2104's inputs agree; a contradiction about its design temperature is
    # recorded, but the formulas' decision does not depend on it.
    memo = _upload("pending", "memo.md", "V-2104 design temperature 160 °C per the registered datasheet.")
    task, orchestrator = _run(extra=[memo])
    ledger = EvidenceLedger(task.evidence)
    asyncio.run(orchestrator._fact_stage(task, ENGINEER, ledger))
    assert task.assessment.status == "calculated"
    fact = next(c for c in task.conflicts if c.kind == "fact")
    assert fact.label == "V-2104 Design temperature"
    assert fact.id not in task.assessment.conflicts
