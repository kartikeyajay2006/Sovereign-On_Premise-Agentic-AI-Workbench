"""The clause a severity rests on is the registry's, and so is a claim the registry computed.

The golden scanned-report prompt asks for "the severity and the clause it
rests on". A live run on the merged build answered "Severity Medium [C7].
Governing clause is SOP-MNT-022 Clause 4.1. Approving authority is Head of
Inspection [S3], as per SOP-INS-014 Clause 5.2." Every sentence restates the
registry: the severity formula's basis is "SOP-MNT-022 Clause 4.1: cladding
damage 35% exceeds 20% of the insulated section, a Medium finding under
SOP-INS-014 Clause 5.2". Yet the basis sentence was UNSUPPORTED (no passage
says "governing clause"), and source verification counted 1 of 4 claims
supported although claim verification had CALCULATED three of them: it asks
only whether a passage repeats a claim's words. The run was held for a
verification failure on a correct answer.

A claim that only says which clause the decision rests on, naming clauses the
decision names, is CALCULATED. One that names another clause, or says what a
clause requires, is not the registry's and is judged against the passages.
"""

from __future__ import annotations

import pytest

from backend.agents.verifier import get_verification_engine
from tests.test_governing_claim import _calculated

LIVE_ANSWER = (
    "V-2104: governing location Shell course 2 (mid); corrosion rate 0.55 mm/year; remaining life 6.18 years. "
    "Severity Medium [C7]. Governing clause is SOP-MNT-022 Clause 4.1. "
    "Approving authority is Head of Inspection [S3], as per SOP-INS-014 Clause 5.2."
)


def _verdicts(text: str):
    evidence, records, assessment, _ = _calculated()
    return get_verification_engine().claim_verdicts(text, evidence, assessment=assessment, records=records)


@pytest.mark.parametrize(
    "claim",
    [
        "Governing clause is SOP-MNT-022 Clause 4.1.",
        "The severity rests on SOP-MNT-022 Clause 4.1 and SOP-INS-014 Clause 5.2.",
        "The Medium finding is based on SOP-MNT-022 Clause 4.1: cladding damage 35% exceeds 20% of the insulated section.",
    ],
)
def test_the_clause_the_severity_rests_on_is_calculated(claim: str) -> None:
    verdict = _verdicts(claim)[0]
    assert verdict.verdict == "CALCULATED", verdict.reason
    assert "SOP-MNT-022 Clause 4.1" in verdict.reason


@pytest.mark.parametrize(
    "claim",
    [
        # A clause the decision does not rest on.
        "Governing clause is SOP-INS-021 Clause 6.1.",
        # What a clause requires is the procedure's to say, not the registry's.
        "SOP-MNT-022 Clause 4.1 requires the vessel to be decommissioned.",
        # A figure the decision does not state.
        "The severity rests on SOP-MNT-022 Clause 4.1: cladding damage 60% of the insulated section.",
    ],
)
def test_a_clause_claim_the_decision_does_not_make_is_not_calculated(claim: str) -> None:
    assert _verdicts(claim)[0].verdict != "CALCULATED"


def test_the_live_answer_passes_every_source_check() -> None:
    evidence, records, assessment, _ = _calculated()
    engine = get_verification_engine()
    claims = engine.claim_verdicts(LIVE_ANSWER, evidence, assessment=assessment, records=records)
    assert [c.verdict for c in claims] == ["CALCULATED"] * 4, [c.reason for c in claims]

    sources = engine.check_sources(LIVE_ANSWER, evidence, claims=claims)
    assert sources.passed, sources.detail
    assert "4 of 4" in sources.detail

    report = engine.compile_report([sources], text=LIVE_ANSWER, evidence=evidence, claims=claims)
    hallucination = next(c for c in report.checks if c.name == "hallucination_check")
    assert hallucination.passed, hallucination.detail
    assert report.material_claims_supported == 4


def test_without_verdicts_the_source_check_is_the_passage_test_it_was() -> None:
    evidence, _, _, _ = _calculated()
    sources = get_verification_engine().check_sources(LIVE_ANSWER, evidence)
    assert not sources.passed


def test_an_unsupported_verdict_does_not_count_as_support() -> None:
    evidence, records, assessment, _ = _calculated()
    engine = get_verification_engine()
    text = "Governing clause is SOP-INS-021 Clause 6.1. The vessel must be decommissioned under SOP-HSE-004 Clause 9.9."
    claims = engine.claim_verdicts(text, evidence, assessment=assessment, records=records)
    sources = engine.check_sources(text, evidence, claims=claims)
    assert not sources.passed
