"""The answer opens with a cited lede, and the vision cache stays warm.

The thread renders an answer's first sentence as its lede, in large type. That
is only honest if the sentence is a claim the verifier checked, so the model is
told to open with one direct sentence that carries its own citation, and the
verifier reads it like every other sentence.

The instruction lives in the reasoning prompts only. The vision cache key
(backend/agents/vision_cache.py, backend/ops/readiness.py) reads the prompts
version, the vision system prompt and the page-batch prompt; none of those may
change for this, or the demo's warm cache goes cold.
"""

from __future__ import annotations

from backend.agents.orchestrator import page_batch_prompt
from backend.agents.vision_cache import _sha
from backend.agents.verifier import _sentences
from backend.core.config import get_config


def test_reasoning_prompt_asks_for_a_cited_opening_sentence():
    system = get_config().system_prompt("reasoning")
    assert "The first sentence is the answer: one direct sentence" in system
    assert "ends with the identifier of the evidence" in system
    assert "checked like one" in system


def test_answer_templates_repeat_the_cited_opening():
    config = get_config()
    plain = config.prompt("task.reason_with_evidence", evidence="[S1] x", extraction_block="", prompt="Q?")
    assert "Open with one sentence that answers the" in plain
    assert "that one included, with its" in plain
    paged = config.prompt("task.reason_with_page_evidence", evidence="[F1] x", extraction_block="", prompt="Q?")
    assert "with one sentence that answers it, cited like the rest." in paged


def test_the_lede_is_the_verifiers_first_sentence():
    # A citation written after the full stop belongs to the lede, as the
    # verifier reads it, so the lede the thread shows is the claim it checked.
    answer = "The shell is below minimum thickness. [S2] Withdraw it from service [S3]."
    first, second = _sentences(answer)
    assert first == "The shell is below minimum thickness [S2]."
    assert second.startswith("Withdraw it")


def test_vision_cache_key_inputs_unchanged():
    # Pinned from redesign/hi-vis 7460ad9, the prompts the demo cache was warmed
    # under. A change here invalidates about three minutes of every demo run.
    config = get_config()
    assert config.prompts.get("prompts_version") == 2
    assert _sha(config.system_prompt("vision")) == (
        "d868eb5e0d4a739c0f85f96c2108d1db058396a933d9cac43b73b4aa280484f6"
    )
    assert _sha(page_batch_prompt(config, "x.pdf", [1, 2])) == (
        "2cab451d062dc511ab27ae5442ea6e72198daa2dc4de239f3261a0a32aa93264"
    )
