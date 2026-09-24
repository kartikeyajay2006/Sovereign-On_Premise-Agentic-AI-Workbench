"""Every citation an answer shows must lead somewhere.

A live run cited "[V2.1]" and "[V7.3]": clause numbers worn as evidence ids,
pointing at nothing it had retrieved. Source verification did not read them
as citations, found the claims' words in another passage, and the run was
delivered with every check passed. These pin the check that now catches it,
and that it holds such a run rather than releasing it.
"""

from __future__ import annotations

from backend.agents.verifier import get_verification_engine
from backend.core.schemas import EvidenceItem


def _evidence(*ids: str) -> list[EvidenceItem]:
    return [
        EvidenceItem(id=id, excerpt=f"passage {id}", source_document="SOP-INS-021", kind="knowledge_base")
        for id in ids
    ]


class TestCitationIntegrity:
    def test_citations_that_name_recorded_evidence_pass(self) -> None:
        check = get_verification_engine().check_citations(
            "An assessment is raised when a trigger applies [S6]. Piping is referred under 7.3 [S2].",
            _evidence("S2", "S6"),
        )
        assert check.passed
        assert check.name == "citation_verification"
        assert check.evidence_ids == ["S6", "S2"]

    def test_a_clause_number_worn_as_an_id_fails(self) -> None:
        """The observed answer, verbatim."""
        check = get_verification_engine().check_citations(
            "When any one of the triggers in SOP-INS-021 Clause 2.1 to 2.6 applies [V2.1]. "
            "Piping circuits are referred for assessment under SOP-INS-017 Clause 7.3 [V7.3].",
            _evidence("S1", "S2", "S3", "S4", "S5", "S6"),
        )
        assert not check.passed
        assert "[V2.1]" in check.detail and "[V7.3]" in check.detail
        assert "2 of 2" in check.detail

    def test_one_dangling_citation_among_good_ones_fails(self) -> None:
        check = get_verification_engine().check_citations(
            "The interval is 48 months [S1]. The authority is the Head of Inspection [S9].",
            _evidence("S1", "S2"),
        )
        assert not check.passed
        assert "[S9]" in check.detail
        assert check.evidence_ids == ["S1"]

    def test_an_answer_with_no_citations_has_nothing_to_resolve(self) -> None:
        """Whether uncited claims are supported is source verification's question."""
        check = get_verification_engine().check_citations("Hello -- ask me about your procedures.", [])
        assert check.passed

    def test_a_failed_citation_check_makes_the_report_invalid(self) -> None:
        engine = get_verification_engine()
        evidence = _evidence("S1")
        text = "The interval is 48 months [S3]."
        report = engine.compile_report([engine.check_citations(text, evidence)], text=text, evidence=evidence)
        assert not report.valid
        assert any(note.startswith("citation_verification:") for note in report.limitations)
