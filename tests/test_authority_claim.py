"""Who recommends and who approves is the registry's, and is verified as such.

The engineering stage tells the model "Under SOP-OPS-008 this finding is
recommended by the Inspection Engineer and the Head of Inspection, and
approved by the Plant Manager" and to cite the decision item. A live run on
the PSV-2104A record restated exactly that, cited [C1], and claim
verification called it UNSUPPORTED ("It cites C1, which does not carry it"):
only the joined form "Head of Inspection + Plant Manager" was recognised.
The recommending and approving roles are outputs of the severity decision
(SOP-OPS-008 Clause 2), so a claim that puts each role on the right side of
"approved" is CALCULATED; one that swaps them is not.
"""

from __future__ import annotations

import pytest

from backend.agents.verifier import get_verification_engine
from backend.engineering.stage import register_evidence
from tests.test_relief_assessment import assessed, evidence


def _registered():
    records, assessment = assessed()
    items = evidence()
    numbers = iter(range(1, 100))

    def add(item):
        item.id = f"C{next(numbers)}"
        items.append(item)
        return item

    register_evidence(records, assessment, items, add)
    return items, records, assessment


def _verdict(text: str) -> str:
    items, records, assessment = _registered()
    verdicts = get_verification_engine().claim_verdicts(text, items, assessment=assessment, records=records)
    return verdicts[0].verdict


@pytest.mark.parametrize(
    "claim",
    [
        "The finding was recommended by the Inspection Engineer and the Head of Inspection, "
        "and approved by the Plant Manager under SOP-OPS-008 [C1].",
        "The finding is approved by the Plant Manager [C1].",
    ],
)
def test_the_authority_as_the_stage_states_it_is_calculated(claim: str) -> None:
    assert _verdict(claim) == "CALCULATED"


@pytest.mark.parametrize(
    "claim",
    [
        "The finding is recommended by the Plant Manager and approved by the Head of Inspection [C1].",
        # The Head of Inspection recommends a High finding; it does not approve it.
        "The finding is approved by the Plant Manager and the Head of Inspection [C1].",
    ],
)
def test_misplaced_roles_are_not_calculated(claim: str) -> None:
    assert _verdict(claim) != "CALCULATED"
