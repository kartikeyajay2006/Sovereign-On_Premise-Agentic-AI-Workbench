"""A quoted figure is not a calculation.

Seen live: asked about an approval authority, the model listed three
"calculations" that were bare literals -- 20, 24, and 1 standing for "Head of
Inspection" -- the sandbox evaluated each to itself, and the report said
"3 of 3 calculation(s) independently recomputed and matched".
"""

from __future__ import annotations

import pytest

from backend.agents.verifier import _is_quoted_figure, get_verification_engine
from backend.tools.sandbox import get_sandbox


class TestIsQuotedFigure:
    @pytest.mark.parametrize("expression", ["20", "24.0", "-3.5", "+7", "1"])
    def test_a_bare_number_is_quoted(self, expression):
        assert _is_quoted_figure(expression) is True

    @pytest.mark.parametrize(
        "expression",
        ["(12.0 - 9.4) / 4.7", "2.6 / 12.0 * 100", "round(0.55 * 11.2, 2)", "10 ** 2"],
    )
    def test_an_expression_that_computes_is_not(self, expression):
        assert _is_quoted_figure(expression) is False

    @pytest.mark.parametrize("expression", ["", None, "1 +", "Head of Inspection"])
    def test_unparseable_or_empty_is_left_to_the_recompute_path(self, expression):
        assert _is_quoted_figure(expression) is False


class TestCalculationCheck:
    def test_required_calculation_without_an_expression_fails_closed(self):
        check, entries = get_verification_engine().check_calculations([], required=True)
        assert check.passed is False
        assert "calculation was requested" in check.detail
        assert entries == []

    def test_required_calculation_does_not_accept_quoted_source_figures(self):
        check, entries = get_verification_engine().check_calculations(
            [{"label": "Minimum thickness", "expression": "6.0", "expected": 6.0}],
            required=True,
        )
        assert check.passed is False
        assert "calculation was requested" in check.detail
        assert entries[0]["recomputed"] is None

    def test_only_quoted_figures_is_no_calculation_not_three_passes(self):
        check, entries = get_verification_engine().check_calculations(
            [
                {"label": "Insulated piping damage threshold", "expression": "20", "expected": 20},
                {"label": "Inspection interval", "expression": "24", "expected": 24},
                {"label": "Approval authority", "expression": "1", "expected": 1},
            ]
        )
        assert check.passed is True
        assert "No calculations were made" in check.detail
        assert "3 figure(s) were quoted" in check.detail
        assert "recomputed" not in check.detail.split(":")[0]
        # None of them may become "independent sandbox recomputation" evidence.
        assert all(entry["recomputed"] is None for entry in entries)
        assert all(entry["matched"] is None for entry in entries)

    @pytest.mark.skipif(
        not get_sandbox().execution_allowed[0],
        reason="this host's sandbox cannot execute, so nothing can be recomputed",
    )
    def test_a_real_calculation_is_counted_and_a_quoted_one_is_not(self):
        check, entries = get_verification_engine().check_calculations(
            [
                # Corrosion rate: (12.0 - 9.4) mm over 4.7 years.
                {"label": "Corrosion rate", "expression": "(12.0 - 9.4) / 4.7", "expected": 0.553},
                {"label": "Nominal thickness", "expression": "12.0", "expected": 12.0},
            ]
        )
        assert "1 of 1 calculation(s) independently recomputed" in check.detail
        assert "1 further figure(s) were quoted" in check.detail
        recomputed = [e for e in entries if e["recomputed"] is not None]
        assert len(recomputed) == 1 and recomputed[0]["label"] == "Corrosion rate"
