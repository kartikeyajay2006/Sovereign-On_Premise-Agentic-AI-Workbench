"""Evidence identity tests.

A citation is only worth anything if it points at exactly one source. These
tests pin the property that was broken in the field: reading two attachments
produced two items both labelled ``F1``, so the finished document cited two
different documents under one identifier.
"""

from __future__ import annotations

from backend.agents.orchestrator import EvidenceLedger
from backend.core.schemas import EvidenceItem, Sensitivity


def item(kind: str, source: str) -> EvidenceItem:
    return EvidenceItem(
        id="pending",
        source_document=source,
        excerpt=f"content of {source}",
        classification=Sensitivity.CONFIDENTIAL,
        kind=kind,  # type: ignore[arg-type]
    )


class TestEvidenceLedger:
    def test_two_attachments_get_distinct_ids(self) -> None:
        ledger = EvidenceLedger([])
        first = ledger.add(item("uploaded_file", "report-a.pdf"))
        second = ledger.add(item("uploaded_file", "report-b.pdf"))
        assert first.id != second.id
        assert (first.id, second.id) == ("F1", "F2")

    def test_ids_are_unique_across_every_kind(self) -> None:
        ledger = EvidenceLedger([])
        for _ in range(3):
            ledger.add(item("uploaded_file", "a.pdf"))
            ledger.add(item("knowledge_base", "SOP-014"))
            ledger.add(item("vision_extraction", "scan.png"))
            ledger.add(item("computation", "recomputed"))

        identifiers = [entry.id for entry in ledger.items]
        assert len(identifiers) == len(set(identifiers)), identifiers

    def test_prefixes_stay_meaningful(self) -> None:
        ledger = EvidenceLedger([])
        assert ledger.add(item("knowledge_base", "SOP")).id.startswith("S")
        assert ledger.add(item("uploaded_file", "f.pdf")).id.startswith("F")
        assert ledger.add(item("vision_extraction", "scan")).id.startswith("V")
        assert ledger.add(item("computation", "calc")).id.startswith("C")

    def test_resuming_a_run_does_not_reissue_ids(self) -> None:
        """A checkpointed task carries evidence; continuing must not collide."""
        existing = [item("uploaded_file", "a.pdf"), item("uploaded_file", "b.pdf")]
        existing[0].id, existing[1].id = "F1", "F2"

        ledger = EvidenceLedger(existing)
        added = ledger.add(item("uploaded_file", "c.pdf"))

        assert added.id == "F3"
        identifiers = [entry.id for entry in ledger.items]
        assert len(identifiers) == len(set(identifiers))

    def test_extend_allocates_one_id_per_item(self) -> None:
        ledger = EvidenceLedger([])
        added = ledger.extend([item("knowledge_base", f"doc-{n}") for n in range(4)])
        assert [entry.id for entry in added] == ["S1", "S2", "S3", "S4"]
