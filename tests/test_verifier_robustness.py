"""The verifier reads model output, which is untrusted input.

A figure returned as "19.9 mm" instead of 19.9 crashed a whole run that had
otherwise succeeded: the vision model had read the scan, the procedure had been
retrieved, and the task died on a units suffix. A check that cannot complete is
a failed check, never a failed task.
"""

from __future__ import annotations

import pytest

from backend.agents.verifier import VerificationEngine, _coerce_number


class TestNumberRecovery:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            (19.9, 19.9),
            (7, 7.0),
            ("19.9", 19.9),
            ("19.9 mm", 19.9),           # the shape that crashed a run
            ("about 6.2 years", 6.2),
            ("-3.5 mm/yr", -3.5),
            ("1,250 kg", 1250.0),
            ("0.65 mm/year", 0.65),
        ],
    )
    def test_recovers_a_figure_from_model_phrasing(self, value, expected) -> None:
        assert _coerce_number(value) == pytest.approx(expected)

    @pytest.mark.parametrize("value", ["", "not measured", None, {}, [], "n/a", True])
    def test_returns_nothing_rather_than_raising(self, value) -> None:
        """Unparseable input must yield None, not an exception."""
        assert _coerce_number(value) is None


class TestCalculationCheckSurvivesBadInput:
    def test_units_suffix_does_not_raise(self) -> None:
        engine = VerificationEngine()
        check, checked = engine.check_calculations(
            [
                {
                    "label": "remaining life",
                    "expression": "(9.4 - 6.0) / 0.55",
                    "expected": "6.2 years",
                    "units": "years",
                }
            ]
        )
        assert check.name == "calculation_verification"
        assert checked, "the calculation should still be recorded"

    def test_unusable_expected_value_is_reported_not_raised(self) -> None:
        engine = VerificationEngine()
        check, checked = engine.check_calculations(
            [
                {
                    "label": "thickness",
                    "expression": "12.0 - 9.4",
                    "expected": "not measured",
                }
            ]
        )
        assert isinstance(check.passed, bool)
        assert checked[0]["recomputed"] is not None, "it is still computed independently"

    def test_broken_expression_is_reported_not_raised(self) -> None:
        engine = VerificationEngine()
        check, _ = engine.check_calculations(
            [{"label": "bad", "expression": "12.0 / /", "expected": 3}]
        )
        assert check.passed is False
        assert check.warnings, "the caller should be told which figure failed"

    def test_no_calculations_passes_quietly(self) -> None:
        engine = VerificationEngine()
        check, checked = engine.check_calculations([])
        assert check.passed is True
        assert checked == []
