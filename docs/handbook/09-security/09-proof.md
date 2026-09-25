# 9.9 · Signed proof

> The chain shows no event changed relative to its neighbours. A signature shows nobody rewrote them all.

The audit log is hash-chained ([9.5](05-audit-log.md)): editing an event breaks every hash after it. But anyone able to write the file can edit an event **and recompute every later hash**, and the chain verifies again. Red team AUDIT-02 does exactly that, on a copy. Signed roots close the gap, and per-run certificates carry the proof away from the host.

## Signed audit roots

`backend/proof/audit_roots.py`, `backend/proof/merkle.py`, `backend/proof/signer.py`.

- The host holds an **Ed25519** key in `storage/keys/proof-ed25519.pem` (created on first use, mode `0600`, git-ignored); its public half is in `proof-ed25519.pub` and at `GET /api/proof/key`. The key id is the first 16 hex characters of the SHA-256 of the raw public key.
- A **seal** is a Merkle root over every event hash in the log (RFC 6962 shape: leaves and nodes are hashed with different prefixes), with the event count, the chain head and the time, signed with the key and appended to `storage/logs/audit-roots.jsonl`. The log is sealed at every startup, with every certificate, and on request (`POST /api/audit/seal`, `audit.read.all`).
- **A broken chain is never sealed**: signing it would certify the damage.
- **Verifying** (`GET /api/audit/seals`) checks each seal's signature and key, verifies the chain, and recomputes each sealed root from the first *n* events of today's log. A history rewritten after a seal no longer produces it, however carefully the chain was recomputed.

## Run certificates

`backend/proof/certificate.py`. Issued when a run is delivered or decided, stored in `storage/proofs/<task>.json`, and served at `GET /api/tasks/{id}/certificate`.

A certificate binds, by hash:

| Part | What |
|---|---|
| Request and answer | SHA-256 of the prompt and of the answer |
| Evidence | Every item: id, kind, source, SHA-256 of the excerpt, the source file's hash, document code and revision status, page, classification |
| Calculations | Every registered-formula evaluation: formula and version, formula hash, input hash, result hash, the C item carrying it |
| Conflicts | Each one's status, who resolved it and the H evidence recording the choice |
| Verification | Every check's result; the count of each claim verdict |
| Approval | The decision, the reviewer, the time, and the **review digest** it was given against |
| Deliverables | Each file's SHA-256 |
| Audit | The signed root taken at issue, and for each of the run's audit events a **Merkle inclusion proof** under it |

The whole body is hashed (`content_sha256`) and signed.

## Verifying a certificate

```bash
# Offline: needs only the certificate and the public key
.venv/bin/python scripts/verify_certificate.py certificate.json --public-key <base64 key>

# On the host: also re-reads the audit log and the deliverable store
.venv/bin/python scripts/verify_certificate.py certificate.json --online
```

| Check | Offline | Online |
|---|:--:|:--:|
| The body hashes to `content_sha256` | ✓ | ✓ |
| The Ed25519 signature verifies | ✓ | ✓ |
| The signer is the trusted key, not merely the key the certificate carries | ✓ | ✓ |
| The audit root's own signature | ✓ | ✓ |
| Every run event is under the root (inclusion proofs) | ✓ | ✓ |
| The audit chain is intact | | ✓ |
| The log still reproduces the certified root | | ✓ |
| Each deliverable still hashes to its certified value | | ✓ |

The review screen's **Signed proof** panel runs the online checks (`POST /api/proof/verify`) and offers the certificate for download.

## Approval bound to what was reviewed

Every task carries a **review digest**: one hash over the answer, the deliverables' bytes, the calculation results and the conflict resolutions. The review screen sends the digest it displayed with the decision. If the run changed in between (a resolution, a re-render), the decision is refused: *"This run has changed since you opened it."* The digest the decision was given against is stored on the approval and in the certificate.

A reviewer can also **request a revision**: nothing is released and nothing is rejected; the run returns to its submitter with the note, and the queue shows it as *Returned*.

## Deliverables re-hashed on download

`GET /api/deliverables/{task}/{file}` hashes the file before serving it. If the bytes are not the recorded bytes, it answers 409, serves nothing, and records `deliverable / integrity_failure`. A served file carries `X-Content-SHA256`.

## Proof Mode

`backend/proof/proof_view.py`, `GET /api/runs/{id}/proof`, and the **Proof** screen (`/proof?run=<id>`, reached from **Proof** under any answer in the thread).

One run's chain on one screen, in order: **Request → Classification → Policy → Model routing → Evidence → Formula → Claim → Verification → Approval → Signed certificate**. Each link is copied from the run record: the prompt and input file hashes; the analyzer's profile; the approval requirement and every policy event with its rule; each stage's routing decision, with the model digest the runtime reported when the call was made (`ModelUsage.model_digest`; runs recorded before it say *digest not recorded*); every evidence item; every formula evaluation and conflict; every claim verdict; every verification check; the approval and whether the run still hashes to the digest it was approved against.

A link with nothing recorded is drawn empty, with the reason (*No formula applied*, *The run did not reach verification*), never as a zero or a blank figure.

The certificate link reads `storage/proofs/<task>.json` and verifies it with the same checks as `POST /api/proof/verify` (signature, trusted key, audit root, inclusion, chain, the log reproducing the root, each deliverable's bytes). Reading the view issues nothing and writes nothing to the audit log; a run with no stored certificate says so. When a certificate carries a `run.provenance` block (certificate format 2), each of its fields is listed; an older certificate simply has none.

## Limits

- The key lives on the host it signs for. Someone with root and the key can rewrite the log **and** re-sign it. Copy the public key and the seals off-host after each session; a hardware key would close this.
- A certificate proves what the run recorded, not that what it recorded was right: that is verification's job.

## Tests

`tests/test_proof_view.py`: the ten links in order and read from the record; a run with nothing recorded saying so on every link; a stored certificate verified and a tampered one failing; provenance shown only when present; another person's run refused.

`tests/test_proof.py`: Merkle inclusion for trees of 1 to 17 leaves; key permissions and persistence; a sealed log verifying; a rewritten-and-rechained log exposed; a broken chain refused a seal; a foreign key untrusted; certificates verifying offline, failing when edited, failing under a foreign key, catching an edited event (chain) and a rewritten log (root); approval bound to the digest; revision requests; the proof API; deliverables changed on disk refused.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 9.8 · Red team](08-red-team.md) | [↑ 09 · Security and governance](README.md) | [10 · Configuration reference →](../10-configuration/README.md) |

<!-- nav:end -->
