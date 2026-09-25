"""Verification engine.

Before anything reaches a human, the platform tries to falsify its own output:

* **source verification** - are material claims backed by retrieved evidence?
* **calculation verification** - every numeric result the model asserts is
  recomputed independently inside the sandbox and compared within tolerance.
* **code verification** - generated code must have executed cleanly.
* **document verification** - the drafted deliverable must carry the structure
  and citations the policy demands.
* **hallucination check** - the aggregate judgement over material claims.

Thresholds live in ``policies/approval-rules.yaml``. A failed verification does
not silently pass; it either triggers a replan or escalates to a human, per the
fail-safe principle.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from backend.core.config import get_config
from backend.core.schemas import (
    CalculationRecord,
    ClaimVerdict,
    ConflictRecord,
    EvidenceItem,
    IntegrityAssessment,
    SandboxResult,
    VerificationCheck,
    VerificationReport,
)
from backend.tools.sandbox import get_sandbox

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
# Figures an answer states, for comparison with the formula registry.
RATE_IN_TEXT = re.compile(r"(\d+(?:\.\d+)?)\s*mm\s*(?:/|per)\s*(?:yr|year|y)\b", re.IGNORECASE)
LIFE_IN_TEXT = re.compile(r"(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b", re.IGNORECASE)
SEVERITY_WORD = re.compile(r"\b(high|medium|low|severe|critical|moderate|minor|major)\b", re.IGNORECASE)
# A model asked for a number will sometimes answer "19.9 mm" or "about 6.2".
# Verification reads model output, which is untrusted input, so the figure is
# recovered rather than assumed.
LEADING_NUMBER = re.compile(r"-?\d+(?:\.\d+)?")
# Must cover every prefix EvidenceLedger.PREFIXES can mint — S knowledge base,
# F uploaded file, V vision extraction, C computation — plus the E fallback for
# an unrecognised kind. While this matched only S and F, a citation of a vision
# extraction or a calculation read as no citation at all, so an answer drawn
# from a scanned drawing counted as uncited and failed verification on evidence
# it had in fact used.
CITATION_PATTERN = re.compile(r"\[(?:[SFVCEH])\d+\]")
# Anything the answer presents as a citation: a bracketed id of capitals and
# digits, with dotted parts -- "[S1]", and also "[V2.1]", which the small model
# writes when it borrows a clause number for an evidence id. Wider than
# CITATION_PATTERN on purpose. That pattern says what a well-formed citation
# looks like; this one finds everything a reader would take for one, so a
# marker that points at nothing cannot pass as a citation by being malformed.
CITATION_LIKE_PATTERN = re.compile(r"\[([A-Z]{1,3}\d+(?:\.\d+)*)\]")
PAGE_CITATION_PATTERN = re.compile(r"\[((?:F|V)\d+)\]")
PAGE_MENTION_PATTERN = re.compile(r"\bpages?\s+(\d+)\b", re.IGNORECASE)
NUMBER_PATTERN = re.compile(r"-?\d+(?:\.\d+)?")
# Where a claim POINTS rather than what it SAYS: clause and section numbers
# and document codes. They are removed before figures are compared, because
# a claim reading "Clause 5 requires quarterly lubrication [S3]" shared the
# "5" with any passage containing "5.2 Medium ..." and was corroborated by it,
# whatever it asserted. Citing a clause number is not agreeing with it.
#
# Citation markers too. "[S4]" carries a digit, and the claim "The approving
# authority for a Medium finding is the Head of Inspection [S4]" was being
# corroborated by the 4 in its own citation id matching "below 4 years" in
# the passage -- a test asserting that claim was supported had been passing
# on that digit alone.
REFERENCE_PATTERN = re.compile(
    r"(?:\b(?:clause|section|sections|para|paragraph|table|rev(?:ision)?)\s*|§\s*)"
    r"\d+(?:\.\d+)*"
    r"|\[[A-Z]\d+\]"
    r"|\b[A-Z]{2,}(?:-[A-Z]{2,})*-\d+\b",
    re.IGNORECASE,
)


def _figures(text: str) -> set[str]:
    """The quantities in a sentence, stripped of the references it cites.

    A lone single digit is not a figure worth matching on: "1", "4" and "5"
    appear in nearly every numbered passage, so a match on one says nothing
    about whether the passage carries the claim. A decimal, a figure of two
    or more digits, or a digit written with its unit or a percent sign still
    counts -- "20%", "0.55 mm/yr", "24 months" all do.
    """
    stripped = REFERENCE_PATTERN.sub(" ", text)
    figures: set[str] = set()
    for match in re.finditer(r"-?\d+(?:\.\d+)?(\s*(?:%|mm|cm|m\b|kg|bar|psi|kpa|mpa|°c|years?|months?|days?|hours?|hrs?))?", stripped, re.IGNORECASE):
        number = match.group(0).strip()
        digits = re.sub(r"[^\d.]", "", number)
        has_unit = bool(match.group(1))
        if has_unit or "." in digits or len(digits.replace(".", "")) >= 2:
            figures.add(re.match(r"-?\d+(?:\.\d+)?", number).group(0))
    return figures


def _stated_conclusions(text: str) -> list[str]:
    """Rates, remaining lives and severity bands an answer asserts."""
    stated = [f"{match.group(1)} mm/year" for match in RATE_IN_TEXT.finditer(text or "")]
    for sentence in SENTENCE_SPLIT.split(text or ""):
        if re.search(r"remaining\s+life", sentence, re.IGNORECASE):
            stated += [f"a remaining life of {m.group(1)} years" for m in LIFE_IN_TEXT.finditer(sentence)]
        anchor = sentence.lower().find("severity")
        if anchor >= 0:
            bands = list(SEVERITY_WORD.finditer(sentence))
            if bands:
                band = min(bands, key=lambda m: abs(m.start() - anchor)).group(1)
                stated.append(f"a {band.capitalize()} severity")
    return list(dict.fromkeys(stated))


# A disposition: only the approving authority named by the procedures takes
# it. The answer may recommend one; it may not state one as settled.
DECISION_CLAIM = re.compile(
    r"\b(?:continued?\s+(?:in\s+)?(?:service|operation|operating)|continues\s+(?:in\s+)?(?:service|operation)"
    r"|remains?\s+in\s+service|return(?:ed)?\s+to\s+service|fit\s+for\s+(?:continued\s+)?service"
    r"|safe\s+to\s+(?:operate|continue)|(?:may|can|should)\s+(?:continue|operate|remain)"
    r"|released?\s+for\s+service|extend(?:ed|ing)?\s+the\s+(?:inspection\s+)?interval|defer(?:red|ral)?)\b",
    re.IGNORECASE,
)
ENGINEERING_CLAIM = re.compile(
    r"\b(?:corrosion\s+rate|remaining\s+life|severity|governing|t-?min|minimum\s+(?:allowable\s+)?thickness"
    r"|next\s+(?:thickness\s+survey|measurement|inspection)|metal\s+loss|fitness-for-service)\b",
    re.IGNORECASE,
)
QUANTITY_CLAIM = re.compile(r"\d+(?:\.\d+)?\s*(?:mm|%|years?|months?|bar|mpa|psi|°c)", re.IGNORECASE)
PROCEDURAL_CLAIM = re.compile(r"\b(?:shall|must|required|clause|approv\w*\s+authority|approving)\b", re.IGNORECASE)
ISO_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
# A sentence reporting that a conclusion is withheld, not asserting one.
WITHHOLDING = re.compile(
    r"\b(?:withh[eo]ld|cannot\s+be\s+(?:stated|calculated|determined|confirmed|assessed)"
    r"|not\s+(?:be\s+)?(?:stated|calculated|determined)|pending|until\b.{0,60}\bresol\w*"
    r"|disagree\w*|conflict\w*|discrepan\w*|inconsistent)\b",
    re.IGNORECASE,
)


def _names_value(claim: str, stated: str | None) -> bool:
    """Whether a claim states one candidate's value (by its figures, or its words)."""
    if not stated:
        return False
    figures = _figures(stated)
    if figures:
        return bool(figures & _figures(claim))
    return stated.casefold() in claim.casefold()


def _claim_kind(claim: str) -> str:
    if DECISION_CLAIM.search(claim):
        return "recommendation"
    if ENGINEERING_CLAIM.search(claim):
        return "engineering"
    if QUANTITY_CLAIM.search(claim):
        return "numerical"
    if PROCEDURAL_CLAIM.search(claim):
        return "procedural"
    return "factual"


def _coerce_number(value: Any) -> float | None:
    """Recover a number from whatever the model actually returned.

    Passing model output straight to ``float()`` crashed a whole run on
    ``"19.9 mm"``: a units suffix took down a task that had otherwise
    succeeded. Anything unparseable yields ``None``, which the caller reports
    as an unverifiable figure rather than an error.
    """
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        match = LEADING_NUMBER.search(value.replace(",", ""))
        if match:
            try:
                return float(match.group(0))
            except ValueError:
                return None
    return None


WORD_PATTERN = re.compile(r"[A-Za-z][A-Za-z\-]{4,}")


def _is_quoted_figure(expression: Any) -> bool:
    """Whether an "expression" is only a number restating itself.

    Parsed, never evaluated: model output is untrusted input. A bare
    constant, or a negated one, computes nothing; anything with an operator,
    a name or a call does. An expression that does not parse is left to the
    recomputation path, which reports it as not evaluable.
    """
    import ast

    text = str(expression or "").strip()
    if not text:
        return False
    try:
        node = ast.parse(text, mode="eval").body
    except SyntaxError:
        return False
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        node = node.operand
    return isinstance(node, ast.Constant) and isinstance(node.value, (int, float))


def _corroborates(claim: str, excerpt: str) -> bool:
    """Whether a passage carries the substance of a claim.

    Two signals, both lexical: a figure from the claim appearing in the
    passage, or enough of its distinctive words doing so.

    This is deliberately a low bar, and its limit is worth stating where
    someone will read it. It establishes that a claim is ABOUT the passage it
    cites -- it cannot establish that the passage supports it. A claim reading
    the wrong row of a table quotes that table's own words and passes here.
    Catching that needs entailment, or the reviewer this system routes to,
    which is why a failed check holds the task for a human rather than
    rewriting the answer.
    """
    # Figures only, references stripped first -- see REFERENCE_PATTERN. The
    # excerpt is stripped too, so its own "5.2" heading cannot match a claim.
    figures = _figures(claim)
    if figures and figures & _figures(excerpt):
        return True

    # The words test sees the claim without its references as well, so a
    # document code or "section" cannot make up one of the matching words.
    tokens = {word.lower() for word in WORD_PATTERN.findall(REFERENCE_PATTERN.sub(" ", claim))}
    if not tokens:
        return False
    excerpt_tokens = {word.lower() for word in WORD_PATTERN.findall(excerpt)}
    overlap = tokens & excerpt_tokens
    # The floor cannot exceed what the claim has to offer. Requiring three
    # matching words flatly meant a short claim could never corroborate
    # however exact it was: "The severity is Medium [S1]" carries two
    # distinctive words, matched both against the passage that says exactly
    # that, and was still reported unsupported.
    required = min(len(tokens), max(3, int(len(tokens) * 0.35)))
    return len(overlap) >= required


class VerificationEngine:
    """Independent checks over model and tool output."""

    def __init__(self) -> None:
        self.config = get_config()
        self.sandbox = get_sandbox()

    @property
    def _rules(self) -> dict[str, Any]:
        return self.config.approval_rules.get("verification", {})

    # -- material claims ---------------------------------------------------
    def material_claims(self, text: str) -> list[str]:
        """Sentences carrying a quantity, a directive, or a clause reference."""
        patterns = [
            re.compile(pattern, re.IGNORECASE)
            for pattern in self._rules.get("material_claim_patterns", [])
        ]
        claims: list[str] = []
        for sentence in SENTENCE_SPLIT.split(text or ""):
            candidate = sentence.strip()
            if len(candidate) < 15:
                continue
            if any(pattern.search(candidate) for pattern in patterns):
                claims.append(candidate)
        return claims

    @staticmethod
    def _claim_supported(claim: str, evidence: list[EvidenceItem]) -> tuple[bool, list[str]]:
        """A claim is supported if it cites evidence, or its numbers/terms appear in it."""
        cited = CITATION_PATTERN.findall(claim)
        if cited:
            referenced = {marker.strip("[]") for marker in cited}
            matching = [item for item in evidence if item.id in referenced]
            # Citing a passage that was retrieved is not the same as that
            # passage saying what the claim says. This returned True on the
            # existence of the id alone, so any sentence ending in [S1] was
            # "supported" whatever it asserted -- the check could be passed by
            # citing at random. The claim's own terms must also appear in the
            # passage it names.
            for item in matching:
                if _corroborates(claim, item.excerpt):
                    return True, [item.id]
            if matching:
                return False, []

        for item in evidence:
            if _corroborates(claim, item.excerpt):
                return True, [item.id]
        return False, []

    def check_sources(self, text: str, evidence: list[EvidenceItem]) -> VerificationCheck:
        claims = self.material_claims(text)
        if not claims:
            return VerificationCheck(
                name="source_verification",
                kind="source",
                passed=True,
                detail="No material claims requiring documentary support were made.",
            )
        if not evidence:
            return VerificationCheck(
                name="source_verification",
                kind="source",
                passed=False,
                detail=(
                    f"{len(claims)} material claim(s) were made but no local evidence "
                    "was retrieved to support them."
                ),
                warnings=[claim[:160] for claim in claims[:5]],
            )

        supported = 0
        unsupported: list[str] = []
        used_ids: set[str] = set()
        for claim in claims:
            ok, ids = self._claim_supported(claim, evidence)
            if ok:
                supported += 1
                used_ids.update(ids)
            else:
                unsupported.append(claim[:160])

        fraction = supported / len(claims)
        threshold = float(self._rules.get("min_supported_fraction", 0.6))
        return VerificationCheck(
            name="source_verification",
            kind="source",
            passed=fraction >= threshold,
            detail=(
                f"{supported} of {len(claims)} material claims are supported by local "
                f"evidence ({fraction:.0%}; threshold {threshold:.0%})."
            ),
            evidence_ids=sorted(used_ids),
            warnings=unsupported[:5],
        )

    def check_citations(self, text: str, evidence: list[EvidenceItem]) -> VerificationCheck:
        """Every citation the answer shows must name evidence this run recorded.

        Observed on a live run: asked when a Fitness-For-Service assessment is
        raised, the model cited "[V2.1]" and "[V7.3]" -- clause numbers worn as
        evidence ids, pointing at nothing the run retrieved. Source
        verification did not see them as citations at all, found words from
        each claim in another passage, and the run was delivered with every
        check passed and two citations a reader could not follow. Whether a
        claim is corroborated is source verification's question; whether each
        citation leads anywhere is this one's.
        """
        markers = CITATION_LIKE_PATTERN.findall(text or "")
        if not markers:
            return VerificationCheck(
                name="citation_verification",
                kind="source",
                passed=True,
                detail="The answer carries no citations to resolve.",
            )
        known = {item.id for item in evidence}
        # In the order the answer first uses them.
        seen = list(dict.fromkeys(markers))
        unresolved = [marker for marker in seen if marker not in known]
        if unresolved:
            listed = ", ".join(f"[{marker}]" for marker in unresolved[:5])
            return VerificationCheck(
                name="citation_verification",
                kind="source",
                passed=False,
                detail=(
                    f"{len(unresolved)} of {len(seen)} cited id(s) name no evidence this run "
                    f"recorded: {listed}. A reader following them finds nothing."
                ),
                evidence_ids=[marker for marker in seen if marker in known],
                warnings=[f"[{marker}] is not an evidence id of this run" for marker in unresolved[:5]],
            )
        return VerificationCheck(
            name="citation_verification",
            kind="source",
            passed=True,
            detail=f"All {len(seen)} cited id(s) name evidence this run recorded.",
            evidence_ids=seen,
        )

    def check_page_citations(self, text: str, evidence: list[EvidenceItem]) -> VerificationCheck:
        """Reject page citations whose stated page differs from their source."""
        by_id = {item.id: item for item in evidence}
        problems: list[str] = []
        used: set[str] = set()
        for sentence in SENTENCE_SPLIT.split(text or ""):
            cited = PAGE_CITATION_PATTERN.findall(sentence)
            if not cited:
                continue
            mentioned_pages = {int(value) for value in PAGE_MENTION_PATTERN.findall(sentence)}
            for evidence_id in cited:
                item = by_id.get(evidence_id)
                if item is None:
                    problems.append(f"[{evidence_id}] has no evidence item")
                    continue
                used.add(evidence_id)
                if mentioned_pages and item.page_number not in mentioned_pages:
                    problems.append(
                        f"[{evidence_id}] is from page {item.page_number}, not "
                        f"page {', '.join(str(page) for page in sorted(mentioned_pages))}"
                    )
                if item.excerpt == "No legible content extracted from this page." and "no legible content" not in sentence.lower():
                    problems.append(f"[{evidence_id}] contains no legible content to support a fact")
        return VerificationCheck(
            name="page_citation_verification",
            kind="source",
            passed=not problems,
            detail="Page citations match their evidence pages." if not problems else "; ".join(problems[:5]),
            evidence_ids=sorted(used),
            warnings=problems[:5],
        )

    # -- calculations ------------------------------------------------------
    def check_calculations(
        self, calculations: list[dict[str, Any]], *, required: bool = False
    ) -> tuple[VerificationCheck, list[dict[str, Any]]]:
        """Recompute each asserted calculation independently in the sandbox.

        ``required`` is reserved for a task explicitly classified as a
        calculation. An absence of arithmetic is harmless in a procedural
        question, but it is a failed control for "calculate remaining life".
        """
        if not calculations:
            return (
                VerificationCheck(
                    name="calculation_verification",
                    kind="calculation",
                    passed=not required,
                    detail=(
                        "A calculation was requested but no independently "
                        "recomputable expression was produced."
                        if required
                        else "No numeric calculations were asserted."
                    ),
                ),
                [],
            )

        # A figure quoted from a source is not a calculation, and recomputing
        # it proves nothing.
        #
        # Observed on a live run: asked about an approval authority, the model
        # listed "Insulated piping damage threshold: 20", "Inspection interval:
        # 24" and "Approval authority: 1 (Head of Inspection)" as calculations
        # -- bare literals, one of them a person encoded as the number 1. The
        # sandbox evaluated 20 and got 20, and the report said "3 of 3
        # calculation(s) independently recomputed and matched": a pass for
        # three tautologies, on the check whose whole claim is independence.
        # A literal is now reported as quoted and never counted as recomputed;
        # only an expression that actually computes something is.
        quoted = [c for c in calculations if _is_quoted_figure(c.get("expression"))]
        calculations = [c for c in calculations if not _is_quoted_figure(c.get("expression"))]
        quoted_entries = [
            {
                **dict(c),
                "recomputed": None,
                "matched": None,
                "note": "quoted from the sources, not calculated; nothing to recompute",
            }
            for c in quoted
        ]
        if not calculations:
            return (
                VerificationCheck(
                    name="calculation_verification",
                    kind="calculation",
                    passed=not required,
                    detail=(
                        (
                            "A calculation was requested but no independently recomputable "
                            "expression was produced. "
                        )
                        if required
                        else ""
                    ) + (
                        f"No calculations were made: {len(quoted)} figure(s) were quoted "
                        "from the sources rather than computed, so there was nothing to "
                        "recompute."
                    ),
                ),
                quoted_entries,
            )

        tolerance = float(self._rules.get("calculation_tolerance", 0.01))
        program_lines = ["import json", "results = []"]
        for index, calculation in enumerate(calculations):
            expression = str(calculation.get("expression", "")).strip()
            if not expression:
                continue
            program_lines.append("try:")
            program_lines.append(f"    value = ({expression})")
            program_lines.append(
                f"    results.append({{'index': {index}, 'value': float(value), 'error': None}})"
            )
            program_lines.append("except Exception as exc:")
            program_lines.append(
                f"    results.append({{'index': {index}, 'value': None, 'error': str(exc)}})"
            )
        program_lines.append("print(json.dumps(results))")

        result: SandboxResult = self.sandbox.execute("\n".join(program_lines))
        recomputed: list[dict[str, Any]] = []
        if result.ok and result.stdout.strip():
            try:
                for row in json.loads(result.stdout.strip().splitlines()[-1]):
                    recomputed.append(row)
            except (json.JSONDecodeError, IndexError):
                pass

        checked: list[dict[str, Any]] = []
        mismatches: list[str] = []
        verified_count = 0

        by_index = {row["index"]: row for row in recomputed}
        for index, calculation in enumerate(calculations):
            row = by_index.get(index)
            entry = dict(calculation)
            if row is None or row.get("value") is None:
                entry["recomputed"] = None
                entry["matched"] = False
                entry["note"] = (
                    row.get("error") if row else "expression could not be evaluated"
                )
                mismatches.append(f"{calculation.get('label', 'calculation')}: not evaluable")
            else:
                recomputed_value = float(row["value"])
                entry["recomputed"] = round(recomputed_value, 6)
                expected = _coerce_number(calculation.get("expected"))
                if expected is None:
                    entry["matched"] = True
                    entry["note"] = "computed independently; model asserted no value"
                    verified_count += 1
                else:
                    expected_value = expected
                    denominator = abs(expected_value) or 1.0
                    difference = abs(recomputed_value - expected_value) / denominator
                    entry["matched"] = difference <= tolerance
                    entry["note"] = (
                        f"relative difference {difference:.4%} "
                        f"(tolerance {tolerance:.2%})"
                    )
                    if entry["matched"]:
                        verified_count += 1
                    else:
                        mismatches.append(
                            f"{calculation.get('label', 'calculation')}: model asserted "
                            f"{expected_value}, independent recomputation gave "
                            f"{recomputed_value:.4f}"
                        )
            checked.append(entry)

        quoted_note = (
            f" {len(quoted)} further figure(s) were quoted from the sources, not computed."
            if quoted
            else ""
        )
        return (
            VerificationCheck(
                name="calculation_verification",
                kind="calculation",
                passed=not mismatches,
                detail=(
                    f"{verified_count} of {len(calculations)} calculation(s) independently "
                    f"recomputed in the sandbox and matched within "
                    f"{tolerance:.2%} tolerance.{quoted_note}"
                ),
                warnings=mismatches[:5],
            ),
            checked + quoted_entries,
        )

    # -- code --------------------------------------------------------------
    # -- deterministic engineering -----------------------------------------
    def check_engineering(
        self,
        text: str,
        assessment: IntegrityAssessment,
        records: list[CalculationRecord],
    ) -> VerificationCheck:
        """Every rate, life and severity the answer states must be the registry's.

        The formula registry computed these figures from the evidence. An
        answer that states a different corrosion rate, a remaining life no
        formula produced, or a severity band other than the computed one is
        contradicting the calculation, whatever its citations say. This is the
        check a wrong figure written as prose used to walk past.
        """
        decision = next((r.evidence_id for r in records if (r.subject or "").endswith("· decision")), None)
        if assessment.status == "conflicted":
            stated = _stated_conclusions(text)
            disputed = ", ".join(assessment.conflicts) or "an input"
            return VerificationCheck(
                name="engineering_verification",
                kind="calculation",
                passed=not stated,
                detail=(
                    f"Conflicted: the sources disagree about {disputed}, yet the answer states "
                    f"{'; '.join(stated[:3])}, which no formula could compute from conflicting inputs."
                    if stated else
                    f"Conflicted: the sources disagree about {disputed}. The answer withholds the "
                    "conclusion instead of choosing between them."
                ),
                evidence_ids=list(assessment.source_evidence_ids),
                warnings=stated[:5],
            )
        if assessment.status != "calculated":
            stated = RATE_IN_TEXT.findall(text or "") or LIFE_IN_TEXT.findall(text or "")
            return VerificationCheck(
                name="engineering_verification",
                kind="calculation",
                passed=not stated,
                detail=(
                    f"Cannot calculate: missing {', '.join(assessment.missing)}. The answer states figures "
                    "the evidence cannot support." if stated else
                    f"Cannot calculate: missing {', '.join(assessment.missing)}. The answer states no figure "
                    "in their place."
                ),
                evidence_ids=list(assessment.evidence_ids),
            )

        rates = sorted({round(float(v["value"]), 6) for r in records if r.status == "calculated"
                        for k, v in r.outputs.items() if v.get("unit") == "mm/year" and v.get("value") is not None})
        lives = sorted({round(float(v["value"]), 4) for r in records if r.status == "calculated"
                        for k, v in r.outputs.items() if k == "remaining_life" and v.get("value") is not None})
        years_known = sorted({round(float(i.value), 4) for r in records for i in r.inputs
                              if i.unit == "year" and isinstance(i.value, (int, float))}
                             | {round(float(v["value"]), 4) for r in records for k, v in r.outputs.items()
                                if v.get("unit") == "year" and v.get("value") is not None})

        def close(value: float, known: list[float]) -> bool:
            return any(abs(value - k) <= max(0.005, abs(k) * 0.01) for k in known)

        problems: list[str] = []
        for match in RATE_IN_TEXT.finditer(text or ""):
            value = float(match.group(1))
            if not close(value, rates):
                problems.append(
                    f"the answer states {value:g} mm/year, but the formula registry computed "
                    f"{assessment.governing_rate_mm_yr:g} mm/year at the governing location "
                    f"({assessment.governing_location})"
                )
        for sentence in SENTENCE_SPLIT.split(text or ""):
            if not re.search(r"remaining\s+life|life\s+of", sentence, re.IGNORECASE):
                continue
            for match in LIFE_IN_TEXT.finditer(sentence):
                value = float(match.group(1))
                if not close(value, lives) and not close(value, years_known):
                    problems.append(
                        f"the answer states a remaining life of {value:g} years; the registry computed "
                        f"{assessment.remaining_life_years:g} years at {assessment.governing_location}"
                        if assessment.remaining_life_years is not None
                        else f"the answer states a remaining life of {value:g} years that no formula produced"
                    )
        if assessment.severity:
            for sentence in SENTENCE_SPLIT.split(text or ""):
                anchor = sentence.lower().find("severity")
                bands = list(SEVERITY_WORD.finditer(sentence))
                if anchor < 0 or not bands:
                    continue
                # The band the sentence assigns is the one nearest the word
                # "severity": "a Medium severity finding, not High" says Medium.
                band = min(bands, key=lambda m: abs(m.start() - anchor)).group(1)
                if band.lower() != assessment.severity.lower():
                    problems.append(
                        f"the answer classifies the finding as {band}, but the severity computed under "
                        f"the procedures is {assessment.severity.capitalize()} ({assessment.severity_basis})"
                    )
        problems = list(dict.fromkeys(problems))
        return VerificationCheck(
            name="engineering_verification",
            kind="calculation",
            passed=not problems,
            detail=(
                "Every rate, remaining life and severity the answer states matches the formula registry "
                f"({assessment.governing_location}: {assessment.governing_rate_mm_yr:g} mm/year, "
                + (f"{assessment.remaining_life_years:g} years" if assessment.remaining_life_years is not None
                   else "not limited by corrosion")
                + (f", {assessment.severity.capitalize()}" if assessment.severity else "") + ")."
                if not problems else "; ".join(problems[:4]) + "."
            ),
            evidence_ids=[i for i in [decision, *assessment.evidence_ids] if i],
            warnings=problems[:5],
        )

    # -- claims --------------------------------------------------------------
    def claim_verdicts(
        self,
        text: str,
        evidence: list[EvidenceItem],
        *,
        assessment: IntegrityAssessment | None = None,
        records: list[CalculationRecord] | None = None,
        conflicts: list[ConflictRecord] | None = None,
    ) -> list[ClaimVerdict]:
        """A verdict for every material claim, with the evidence it rests on.

        The order of the rules is the order of authority. A claim touching a
        disputed input is CONFLICTED whatever else supports it; a disposition
        REQUIRES_HUMAN_DECISION however well argued; a figure the registry
        computed is CALCULATED (or UNSUPPORTED if it disagrees with it); only
        then is a claim SUPPORTED by a passage that carries it.
        """
        records = records or []
        every_conflict = [c for c in conflicts or [] if c.kind == "input"]
        open_conflicts = [c for c in every_conflict if c.status == "unresolved" and c.impact == "high"]
        by_id = {item.id: item for item in evidence}
        calculated = assessment is not None and assessment.status == "calculated"
        computed: dict[float, str] = {}
        if calculated:
            for record in records:
                if record.status != "calculated" or record.formula_id == "time.years_between":
                    continue
                for entry in record.outputs.values():
                    value = entry.get("value") if isinstance(entry, dict) else None
                    if isinstance(value, (int, float)) and not isinstance(value, bool):
                        computed.setdefault(round(float(value), 4), record.evidence_id or "")
            for value in (assessment.local_metal_loss_percent, assessment.interval_months):
                if isinstance(value, (int, float)):
                    computed.setdefault(round(float(value), 4), assessment.evidence_ids[-1] if assessment.evidence_ids else "")
        approver = (assessment.approver if assessment and assessment.approver else "the approving authority")

        verdicts: list[ClaimVerdict] = []
        for index, claim in enumerate(self.material_claims(text), start=1):
            kind = _claim_kind(claim)
            cited = [marker.strip("[]") for marker in CITATION_PATTERN.findall(claim)]
            known_cited = [marker for marker in cited if marker in by_id]

            def verdict(value: str, ids: list[str], reason: str) -> ClaimVerdict:
                return ClaimVerdict(
                    id=f"M{index}", text=claim[:400], kind=kind, verdict=value,
                    evidence_ids=list(dict.fromkeys(i for i in ids if i)), reason=reason,
                )

            conclusions = _stated_conclusions(claim)
            if every_conflict and WITHHOLDING.search(claim) and not conclusions:
                # Reporting the disagreement is what the answer is meant to
                # do; it is carried by the conflict's own sources, and by the
                # resolution once there is one.
                resolved = [c for c in every_conflict if c.resolution]
                verdicts.append(verdict(
                    "SUPPORTED",
                    [candidate.evidence_id for c in every_conflict for candidate in c.candidates]
                    + [c.resolution.evidence_id for c in resolved],
                    f"Reports the disagreement recorded as {', '.join(c.id for c in every_conflict)}"
                    + (f", since resolved by {', '.join(c.resolution.evidence_id for c in resolved)}." if resolved else "."),
                ))
                continue
            conflicted_verdict: ClaimVerdict | None = None
            for conflict in open_conflicts:
                named = [c for c in conflict.candidates if _names_value(claim, c.stated)]
                values = " vs ".join(f"{c.stated} [{c.evidence_id}]" for c in conflict.candidates)
                ids = [c.evidence_id for c in conflict.candidates]
                if conclusions and kind in ("engineering", "numerical", "recommendation"):
                    conflicted_verdict = verdict(
                        "CONFLICTED", ids,
                        f"States {', '.join(conclusions[:2])}, which depends on {conflict.label}, and the "
                        f"sources disagree about it ({values}); conflict {conflict.id} is unresolved.",
                    )
                elif len(named) == 1 and len(conflict.candidates) > 1:
                    conflicted_verdict = verdict(
                        "CONFLICTED", ids,
                        f"Takes {named[0].stated} from {named[0].evidence_id} for {conflict.label}, although "
                        f"the sources disagree ({values}); conflict {conflict.id} is unresolved.",
                    )
                elif len(named) > 1:
                    conflicted_verdict = verdict(
                        "SUPPORTED", ids, f"Reports both values of {conflict.label} recorded as {conflict.id}.",
                    )
                if conflicted_verdict is not None:
                    break
            if conflicted_verdict is not None:
                verdicts.append(conflicted_verdict)
                continue
            if kind == "recommendation":
                verdicts.append(verdict(
                    "REQUIRES_HUMAN_DECISION", known_cited,
                    f"A disposition is decided by {approver}; the workbench may recommend it but not settle it.",
                ))
                continue
            if calculated and kind in ("engineering", "numerical", "procedural"):
                contradiction = self.check_engineering(claim, assessment, records)
                if not contradiction.passed:
                    verdicts.append(verdict("UNSUPPORTED", list(assessment.evidence_ids[-1:]),
                                            "Contradicts the formula registry: " + contradiction.detail))
                    continue
                figures = [float(f) for f in _figures(claim)]
                matched = [(f, computed[round(f, 4)]) for f in figures if round(f, 4) in computed]
                dated = bool(assessment.next_due and assessment.next_due in claim)
                banded = bool(assessment.severity and re.search(
                    rf"\bseverity\b.*\b{assessment.severity}\b|\b{assessment.severity}\b.*\bseverity\b",
                    claim, re.IGNORECASE))
                # The approving authority is an output of the severity
                # formula (the SOP-OPS-008 matrix), not a passage to quote.
                authority = (assessment.approver or "").split(" (")[0]
                authorised = bool(authority and authority.lower() in claim.lower()
                                  and re.search(r"approv", claim, re.IGNORECASE))
                if matched or dated or banded or authorised:
                    c_ids = [i for i in known_cited if i.startswith("C")] or [ident for _, ident in matched] \
                        or list(assessment.evidence_ids[-1:])
                    shown = ", ".join(f"{f:g}" for f, _ in matched)
                    parts = [p for p in (shown, assessment.next_due if dated else "",
                                         f"{assessment.severity.capitalize()} severity" if banded else "",
                                         f"approving authority {authority}" if authorised else "") if p]
                    verdicts.append(verdict(
                        "CALCULATED", c_ids,
                        f"{', '.join(parts)} computed by registered formulas from "
                        f"{', '.join(assessment.source_evidence_ids) or 'the evidence'}, not by the model.",
                    ))
                    continue
            ok, ids = self._claim_supported(claim, evidence)
            if ok:
                source = by_id.get(ids[0])
                where = f"{source.source_document}{', ' + source.location if source and source.location else ''}" if source else ids[0]
                verdicts.append(verdict("SUPPORTED", ids, f"Its figures or terms appear in {ids[0]} ({where})."))
            else:
                verdicts.append(verdict(
                    "UNSUPPORTED", known_cited,
                    (f"It cites {', '.join(known_cited)}, which does not carry it." if known_cited
                     else "No retrieved or cited evidence carries it."),
                ))
        return verdicts

    def check_claims(self, verdicts: list[ClaimVerdict]) -> VerificationCheck:
        """High-impact claims may not stand unsupported or on disputed evidence."""
        blocking = [
            v for v in verdicts
            if v.verdict == "CONFLICTED" or (v.verdict == "UNSUPPORTED" and v.kind == "engineering")
        ]
        counts: dict[str, int] = {}
        for v in verdicts:
            counts[v.verdict] = counts.get(v.verdict, 0) + 1
        summary = ", ".join(f"{count} {name.lower().replace('_', ' ')}" for name, count in sorted(counts.items()))
        return VerificationCheck(
            name="claim_verification",
            kind="source",
            passed=not blocking,
            detail=(
                f"{len(verdicts)} material claim(s): {summary or 'none'}."
                + (f" {len(blocking)} high-impact claim(s) stand on disputed or no evidence." if blocking else "")
            ),
            evidence_ids=sorted({i for v in verdicts for i in v.evidence_ids}),
            warnings=[f"{v.id} {v.verdict}: {v.text[:120]} — {v.reason[:160]}" for v in blocking[:5]],
        )

    def check_code(self, result: SandboxResult | None) -> VerificationCheck:
        if result is None:
            return VerificationCheck(
                name="code_verification",
                kind="code",
                passed=True,
                detail="No code was generated or executed for this task.",
            )
        must_exit_zero = bool(self._rules.get("code_must_exit_zero", True))
        if not result.static_validation_passed:
            return VerificationCheck(
                name="code_verification",
                kind="code",
                passed=False,
                detail=(
                    "Generated code was rejected by static security validation before "
                    "execution."
                ),
                warnings=result.static_violations[:5],
            )
        passed = (result.exit_code == 0) if must_exit_zero else result.ok
        detail = (
            f"Sandbox execution exited {result.exit_code} in {result.duration_ms}ms; "
            f"{len(result.stdout.splitlines())} line(s) of output; "
            f"{result.network_attempts_blocked} network attempt(s) blocked."
        )
        if result.timed_out:
            detail = "Sandbox execution exceeded its time limit and was terminated."
        return VerificationCheck(
            name="code_verification",
            kind="code",
            passed=passed,
            detail=detail,
            warnings=[result.stderr.strip()[:300]] if result.stderr.strip() and not passed else [],
        )

    # -- document ----------------------------------------------------------
    def check_document(
        self, content: dict[str, Any] | None, evidence: list[EvidenceItem]
    ) -> VerificationCheck:
        if not content:
            return VerificationCheck(
                name="document_verification",
                kind="document",
                passed=True,
                detail="No deliverable was drafted for this task.",
            )
        problems: list[str] = []
        if not str(content.get("title") or "").strip():
            problems.append("document has no title")
        sections = content.get("sections") or []
        if not sections:
            problems.append("document has no body sections")
        # Everything the rendered note prints: bodies, bullets, the summary
        # and each finding's reference. Reading bodies alone failed a note
        # whose citations sat in its bullets and findings.
        body_text = " ".join(
            " ".join([str(section.get("body", "")), *map(str, section.get("bullets") or [])])
            for section in sections
        ) + " " + str(content.get("summary") or "") + " " + " ".join(
            str(finding.get("reference") or "") + " " + str(finding.get("description") or "")
            for finding in content.get("findings") or []
            if isinstance(finding, dict)
        )
        if evidence and not CITATION_PATTERN.search(body_text):
            problems.append(
                "evidence was retrieved but the draft contains no inline citations"
            )
        if not str(content.get("recommendation") or "").strip():
            problems.append("document states no recommendation")

        return VerificationCheck(
            name="document_verification",
            kind="document",
            passed=not problems,
            detail=(
                "Draft satisfies the structural and citation requirements."
                if not problems
                else f"{len(problems)} structural problem(s) found in the draft."
            ),
            warnings=problems,
        )

    # -- aggregate ---------------------------------------------------------
    def compile_report(
        self,
        checks: list[VerificationCheck],
        *,
        text: str,
        evidence: list[EvidenceItem],
        limitations: list[str] | None = None,
        claims: list[ClaimVerdict] | None = None,
    ) -> VerificationReport:
        material = self.material_claims(text)
        supported = 0
        for claim in material:
            ok, _ = self._claim_supported(claim, evidence)
            supported += int(ok)

        threshold = float(self._rules.get("min_supported_fraction", 0.6))
        fraction = (supported / len(material)) if material else 1.0
        hallucination = VerificationCheck(
            name="hallucination_check",
            kind="hallucination",
            passed=fraction >= threshold,
            detail=(
                f"{supported} of {len(material)} material claim(s) traceable to local "
                f"evidence or independent computation."
                if material
                else "Output contains no unsupported material claims."
            ),
            warnings=(
                []
                if fraction >= threshold
                else ["Material claims exceed the unsupported threshold."]
            ),
        )
        all_checks = [*checks, hallucination]
        collected_limitations = list(limitations or [])
        for check in all_checks:
            if not check.passed:
                collected_limitations.append(f"{check.name}: {check.detail}")

        return VerificationReport(
            valid=all(check.passed for check in all_checks),
            checks=all_checks,
            material_claims_total=len(material),
            material_claims_supported=supported,
            claims=list(claims or []),
            limitations=collected_limitations,
            completed_at=datetime.now(timezone.utc),
        )


_verifier: VerificationEngine | None = None


def get_verification_engine() -> VerificationEngine:
    global _verifier
    if _verifier is None:
        _verifier = VerificationEngine()
    return _verifier
