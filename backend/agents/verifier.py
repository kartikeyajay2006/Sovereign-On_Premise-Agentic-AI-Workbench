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
    EvidenceItem,
    SandboxResult,
    VerificationCheck,
    VerificationReport,
)
from backend.tools.sandbox import get_sandbox

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
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
CITATION_PATTERN = re.compile(r"\[(?:[SFVCE])\d+\]")
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

    # -- calculations ------------------------------------------------------
    def check_calculations(
        self, calculations: list[dict[str, Any]]
    ) -> tuple[VerificationCheck, list[dict[str, Any]]]:
        """Recompute each asserted calculation independently in the sandbox."""
        if not calculations:
            return (
                VerificationCheck(
                    name="calculation_verification",
                    kind="calculation",
                    passed=True,
                    detail="No numeric calculations were asserted.",
                ),
                [],
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

        return (
            VerificationCheck(
                name="calculation_verification",
                kind="calculation",
                passed=not mismatches,
                detail=(
                    f"{verified_count} of {len(calculations)} calculation(s) independently "
                    f"recomputed in the sandbox and matched within "
                    f"{tolerance:.2%} tolerance."
                ),
                warnings=mismatches[:5],
            ),
            checked,
        )

    # -- code --------------------------------------------------------------
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
        body_text = " ".join(
            str(section.get("body", "")) for section in sections
        ) + " " + str(content.get("summary") or "")
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
    ) -> VerificationReport:
        claims = self.material_claims(text)
        supported = 0
        for claim in claims:
            ok, _ = self._claim_supported(claim, evidence)
            supported += int(ok)

        threshold = float(self._rules.get("min_supported_fraction", 0.6))
        fraction = (supported / len(claims)) if claims else 1.0
        hallucination = VerificationCheck(
            name="hallucination_check",
            kind="hallucination",
            passed=fraction >= threshold,
            detail=(
                f"{supported} of {len(claims)} material claim(s) traceable to local "
                f"evidence or independent computation."
                if claims
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
            material_claims_total=len(claims),
            material_claims_supported=supported,
            limitations=collected_limitations,
            completed_at=datetime.now(timezone.utc),
        )


_verifier: VerificationEngine | None = None


def get_verification_engine() -> VerificationEngine:
    global _verifier
    if _verifier is None:
        _verifier = VerificationEngine()
    return _verifier
