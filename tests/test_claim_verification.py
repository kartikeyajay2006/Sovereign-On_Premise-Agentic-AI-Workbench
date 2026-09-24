"""What "supported" is allowed to mean.

These pin the two halves of source verification that a real run exposed: which
sentences count as claims at all, and what it takes for one to be called
supported. Both were weak in the same direction -- they made the report sound
more confident than the checking behind it.
"""

from backend.agents.verifier import _corroborates, get_verification_engine
from backend.core.schemas import EvidenceItem


def _evidence(id: str, excerpt: str) -> EvidenceItem:
    return EvidenceItem(id=id, excerpt=excerpt, source_document="SOP", kind="knowledge_base")


# The passage the observed run actually cited, trimmed to the rows that matter.
S4_FINDINGS_TABLE = (
    "## 5. Findings Classification\n"
    "| High | Immediate threat to containment; thickness below t-min | "
    "Withdraw from service within 24 hours | Head of Inspection + Plant Manager |\n"
    "| Medium | Remaining life below 4 years; coating breakdown over 20% of surface | "
    "Repair within the current shutdown window | Head of Inspection |"
)


# The same facts as the corpus now carries them: SOP-INS-014 5.2, one
# decision per clause, restating its own severity, action and authority.
S4_MEDIUM_CLAUSE = (
    "### 5.2 Medium Severity\n"
    "A finding is Medium severity where any of the following applies: remaining "
    "life below 4 years; active external corrosion; coating breakdown over 20% of "
    "the surface; insulation damage permitting corrosion under insulation (CUI).\n"
    "Required action for a Medium finding: repair within the current shutdown window.\n"
    "Approval authority for a Medium finding: Head of Inspection."
)


class TestWhichSentencesAreClaims:
    def test_a_cited_sentence_is_a_material_claim(self):
        """The gap that produced "1 of 1 ... (100%)" on a three-claim answer.

        The sentence carries no quantity, no directive verb and no clause
        reference, so none of the original patterns matched it -- yet it is
        the sentence that was wrong.
        """
        engine = get_verification_engine()
        text = (
            "The approving authority for this severity classification is the "
            "Head of Inspection + Plant Manager [S4]."
        )
        assert engine.material_claims(text) == [text]

    def test_the_full_answer_yields_every_assertion(self):
        engine = get_verification_engine()
        answer = (
            "The severity is Medium [S1]. "
            "Thresholds for cladding damage exceeding 20% of an insulated section "
            "are defined in SOP-MNT-022, section 4.1. "
            "The approving authority for this severity classification is the "
            "Head of Inspection + Plant Manager [S4]."
        )
        claims = engine.material_claims(answer)
        assert len(claims) == 3, f"expected three claims, got {len(claims)}: {claims}"

    def test_prose_without_an_assertion_is_not_a_claim(self):
        engine = get_verification_engine()
        assert engine.material_claims("This section introduces the procedure.") == []


class TestCitingIsNotSupport:
    def test_a_claim_citing_an_unrelated_passage_is_not_supported(self):
        """Citing used to be sufficient on its own.

        `_claim_supported` returned True as soon as the cited id existed in the
        retrieved set, so a sentence could pass by citing at random.
        """
        engine = get_verification_engine()
        evidence = [_evidence("S1", "Insulation shall be inspected every 24 months.")]
        ok, ids = engine._claim_supported(
            "The vessel operates at 400 bar and is exempt from inspection [S1].", evidence
        )
        assert ok is False
        assert ids == []

    def test_a_claim_citing_a_passage_that_carries_it_is_supported(self):
        """Supported on its words -- authority, Medium, finding, Inspection.

        Against the old table fixture this passed only because the 4 in the
        citation id [S4] matched "below 4 years" in the passage; references
        and citation markers no longer count as figures. The clause is the
        one the corpus now carries: SOP-INS-014 5.2, as numbered prose.
        """
        engine = get_verification_engine()
        evidence = [_evidence("S4", S4_MEDIUM_CLAUSE)]
        ok, ids = engine._claim_supported(
            "The approving authority for a Medium finding is the Head of Inspection [S4].",
            evidence,
        )
        assert ok is True
        assert ids == ["S4"]

    def test_an_uncited_claim_can_still_be_corroborated(self):
        """Support does not require a citation, only corroboration."""
        engine = get_verification_engine()
        evidence = [_evidence("S1", "Cladding damage exceeding 20% is a Medium finding.")]
        ok, ids = engine._claim_supported(
            "Damage exceeding 20% of the surface is classified Medium.", evidence
        )
        assert ok is True
        assert ids == ["S1"]


class TestCorroborationLimits:
    """The bar is lexical, and this records exactly where it stops.

    A claim that reads the wrong row of a table quotes that table's own words,
    so it corroborates. This is not a bug to be fixed by tuning the threshold;
    it is why a failed check routes to a human instead of being rewritten.
    """

    def test_wrong_row_of_a_cited_table_still_corroborates(self):
        wrong = (
            "The approving authority for this severity classification is the "
            "Head of Inspection + Plant Manager"
        )
        assert _corroborates(wrong, S4_FINDINGS_TABLE) is True

    def test_shared_figures_corroborate(self):
        assert _corroborates("damage above 20% of the surface", "coating breakdown over 20%") is True

    def test_unrelated_text_does_not(self):
        assert _corroborates("The pump requires quarterly lubrication", S4_FINDINGS_TABLE) is False


class TestShortClaims:
    """A claim shorter than the match floor must still be checkable.

    The floor was a flat three matching words, so a claim carrying only two
    distinctive words could never corroborate however exactly it matched.
    "The severity is Medium [S1]" -- correct, and citing the passage that
    says precisely that -- was reported unsupported on a real run.
    """

    def test_a_two_word_claim_matching_exactly_is_corroborated(self):
        assert _corroborates(
            "The severity is Medium",
            "Where cladding damage exceeds 20% of the surface area of an insulated "
            "section, that section shall be classified as a Medium severity finding.",
        ) is True

    def test_a_short_claim_that_does_not_match_is_still_rejected(self):
        assert _corroborates(
            "The severity is Critical",
            "Insulation shall be inspected every 24 months by a competent person.",
        ) is False


class TestReferencesAreNotAgreement:
    """Citing a clause number is not agreeing with it.

    Any shared number used to corroborate, and small integers appear in nearly
    every numbered passage, so "Clause 5 requires ..." matched any passage
    containing "5.2 ..." whatever it asserted.
    """

    def test_a_clause_number_alone_does_not_corroborate(self):
        excerpt = "5.2 Medium. Remaining life below 4 years. Approval authority: Head of Inspection."
        assert _corroborates("Clause 5 requires quarterly lubrication", excerpt) is False

    def test_a_shared_document_code_does_not_corroborate(self):
        excerpt = "SOP-INS-014 Clause 3 defines t-min for the shell."
        assert _corroborates("SOP-INS-014 mandates annual valve replacement", excerpt) is False

    def test_a_lone_single_digit_is_not_a_figure(self):
        assert _corroborates("There are 4 steps", "Section 4 covers lifting operations.") is False

    def test_real_figures_still_corroborate(self):
        assert _corroborates("the interval is 24 months", "Inspect every 24 months.") is True
        assert _corroborates("a rate of 0.55 mm/yr", "measured 0.55 mm/yr at the nozzle") is True
        assert _corroborates("damage above 20% of the surface", "coating breakdown over 20%") is True

    def test_a_citation_ids_digits_never_corroborate(self):
        # [S24] must not match "24 months": the id is where the claim points.
        assert _corroborates("The limit is set out here [S24]", "Inspect every 24 months.") is False
