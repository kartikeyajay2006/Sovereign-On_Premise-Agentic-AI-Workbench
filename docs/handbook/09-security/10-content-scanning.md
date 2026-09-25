# 9.10 · Content scanning

> What a document carries is checked at every point where it could leave, and the value found is never written down.

The upload quarantine ([9.7](07-ingestion-guard.md)) decides what a file *is*; instruction screening decides which sentences are addressed to the model. Neither looked at what the text *carries*: a config export with a live password, an incident log with an operator's Aadhaar number, a design memo whose own header says Restricted, uploaded as "normal". Content scanning does.

`backend/security/dlp.py`, with the policy in `policies/dlp.yaml`.

## Boundaries

Content is scanned where it crosses from one trust scope to another:

| Boundary | What is scanned | Where |
|---|---|---|
| `upload` | The text of a file entering the workbench: text files from their bytes, PDF and Office files through the same local parsers retrieval uses | `TaskService.store_upload`, `POST /api/knowledge/documents` |
| `prompt` | Every evidence excerpt, each time a prompt is built from it; a spreadsheet's structure and a program's stdout on their way into a prompt | `_model_text`, `_prompt_safe` and `_scan_evidence` in `agents/orchestrator.py` |
| `answer` | Model output: every streamed frame, and the finished answer before it is shown or kept (conversational replies too) | `_generate_streaming`, `_release_text` |
| `deliverable` | The drafted content and the evidence excerpts a document quotes, after drafting and again at render | `_scan_deliverable`, `_render_deliverable` |

An image carries no text until the vision model reads it. It is not scanned at upload, and the audit record says so (`dlp.scanned: false`). The model's reading of it becomes evidence and is scanned at the prompt boundary like any other excerpt.

## Detectors

| Detector | Finds | Not reported |
|---|---|---|
| `private_key` | A PEM or PGP private key block with at least 64 characters of key body | A block whose body is `...` or another placeholder |
| `aws_access_key` | `AKIA`/`ASIA`/`AGPA`/`AIDA`/`AROA` + 16 characters | AWS's documented example `AKIAIOSFODNN7EXAMPLE` |
| `github_token` | `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_` tokens | `ghp_xxxx…` and other runs of three or fewer distinct characters |
| `slack_token` | `xoxb-`, `xoxp-`, `xoxa-`, `xoxr-`, `xoxs-` tokens | Placeholders |
| `jwt` | Three base64url segments whose header decodes to JSON naming an `alg` | A JWT-shaped string whose header is not JSON |
| `bearer_token` | `Bearer <token>` of 20 or more characters | Placeholders |
| `credential_assignment` | A key ending in password, passwd, pwd, passphrase, secret, api key, access key, secret key, private key, access token, auth token or token, assigned a literal value | `<your-api-key>`, `${VAR}`, `{{var}}`, `changeme`, `xxxx`, a value under six characters, a number (`max_tokens=1200000`), a code reference (`self.password`, `get_secret()`), and after `:` a value of letters only (`Password: required`, `token: SessionToken`) |
| `connection_string_password` | The password in `scheme://user:password@host` | `password`, `pass`, `secret` and other placeholders |
| `aadhaar` | 12 digits, first digit 2 to 9, in groups of four or not, that pass the **Verhoeff checksum** UIDAI uses | A number failing the checksum; all one digit |
| `pan` | Five letters, four digits, a letter, with a valid **holder-type** fourth letter (`A B C F G H J L P T`). PAN has no published checksum, so structure is what is checked | `ABCDE1234F` (D is no holder type), the published examples, `0000` |
| `email` | An email address | `example.com/.org/.net` and the reserved `.example`, `.test`, `.invalid`, `.localhost`, `.local` domains |
| `phone_in` | An Indian mobile number: 10 digits starting 6 to 9, with an optional `+91`, `0091` or `0` prefix | `9876543210` and similar examples; a figure inside a decimal or a longer number |
| `classification_marker` | A labelled marking (`**Classification:** Restricted`, `Security classification - SECRET`) in any case, or a line that is only the marking in capitals (`RESTRICTED`) | The word "restricted" in prose; a lowercase banner |

The demonstration corpus scans clean apart from its own classification headers, which agree with the classifications it is seeded with. A test holds both.

## Actions

Each detector has one action per boundary in `policies/dlp.yaml`:

| Action | `upload` | `prompt` | `answer` | `deliverable` |
|---|---|---|---|---|
| `allow` | Stored; recorded | Shown as written; recorded | Shown; recorded | Released; recorded |
| `redact` | *not accepted* | The value is replaced by `[redacted: <detector> #<fingerprint>]` in every prompt | The value is replaced before the answer is shown or kept | The value is replaced in the document and in the evidence it quotes |
| `require_approval` | *not accepted* | Shown, and the run is held | Shown, and the run is held | Rendered unreleased, and the run is held |
| `block` | Refused, HTTP 400, nothing stored | The whole evidence item is withheld from every prompt; the run continues without it | The answer is withheld and the run is held | Nothing is rendered, and the run is held |

At the upload boundary only `allow` and `block` apply: the stored file is the record of what was received and is never rewritten, and a file on its own has no approval queue. Its values are redacted or held downstream, at every boundary where its text could leave. The loader refuses a policy that sets anything else, names a detector that does not exist, or leaves one out.

A run held by content scanning carries the `sensitive_content` reason (`policies/approval-rules.yaml`). The defaults:

| | `upload` | `prompt` | `answer` | `deliverable` |
|---|---|---|---|---|
| `private_key` | block | block | redact | block |
| Other secrets | allow | redact | redact | redact |
| `aadhaar`, `pan` | allow | redact | redact | redact |
| `email`, `phone_in` | allow | allow | allow | require_approval |
| `classification_marker` | allow | allow | allow | allow |

## Classification

Each detector's `raises_to` is the classification a finding imposes on what carries it, and it only raises: secrets `restricted`, Aadhaar and PAN `sensitive`, a marking the level it asserts (`secret` and `top secret` map to `restricted`). So:

- a file uploaded as `normal` whose header says Restricted is stored as `restricted`, and its note says `classified restricted (declared normal)`; the same holds for a document added to the knowledge base;
- an evidence item carrying a secret is raised, and the run inherits it at the classification stage, with the held reason naming the item;
- a marking that asserts no more than the file, passage or run is already classified is not recorded: every procedure in the corpus is headed with its own classification, and recording that on each run that cites it would bury the findings that matter;
- what the answer or the deliverable still carries after redaction raises the run (`classification_raised: Content scanning found values classified …`). A value redacted out of them does not.

## What is recorded, and what is not

The value is never written down: not to the audit log, a policy event, a stream event, a file note or an error message. What is recorded:

| Record | Contents |
|---|---|
| Policy event `dlp.<boundary>` on the run | Subject (evidence id, `answer`, `deliverable`), decision (`allow` for allow and redact, `require_approval`, `deny` for block), a reason with counts by detector, and the rule `dlp.yaml:detectors.<id>.actions.<boundary>` |
| Audit event `security / dlp_<boundary>` | The strongest action and, per finding: detector, category, action, fingerprint, character span, where (evidence id, `content`), and `raises_to` |
| Audit events `file / uploaded`, `file / quarantined`, `knowledge / document_ingested`, `knowledge / document_refused` | The same finding records under `dlp`, or `scanned: false` with the reason |
| `extraction_data.dlp` on an evidence item | The finding records for that excerpt. The excerpt itself stays whole for the reviewer, as with instruction screening |

The fingerprint is the first 16 hex characters of **HMAC-SHA256** over the detector and the value, under a 32-byte key created on first use at `storage/keys/dlp-fingerprint.key` (owner-only where the operating system honours it). The same value gives the same fingerprint on this host, so a reviewer can see that two records saw the same key; the record does not reveal it. A plain hash would: an Aadhaar or phone number has few enough possibilities that its SHA-256 is reversed by enumeration.

The run's policy events are not drawn by any screen today; the audit view shows the records.

## Limits

- Detection is by pattern, checksum and structure. A secret in a format with no detector, or split across lines, passes. The key, the answer and the deliverable are still behind the approval gate for everything else that holds a run.
- While an answer streams, the word being written is held back until it is complete, so a token is masked before any of it is shown. A value the policy allows is shown; one spread across several words by the model (an Aadhaar number with unusual spacing) can show its first groups until the last arrives.
- Classification markings are recognised in the forms above. A marking in a page header image, or in a form no pattern covers, is not.
- A file's text is scanned up to `max_scan_chars` (2,000,000 characters); the note says when a file was scanned in part.
- The prompt-boundary scan runs before reasoning, but the run's own classification is raised afterwards, at the classification stage, as it is for evidence. A model is not re-chosen because a scan raised an item.

## Tests

`tests/adversarial/test_dlp.py`: each detector finding what it is for; placeholders, failed checksums, invalid structure, prose and code not reported; the corpus carrying only its markings; redaction, overlap and keyed fingerprints; the policy loader refusing invalid actions and missing or unknown detectors; each action at each boundary; a whole run in which the model is never shown and the reader never sees a redacted key, not even in a streamed frame; uploads refused, raised and noted; a DOCX scanned from its text; knowledge ingestion refused and raised; and after each, the audit log searched for the raw value.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 9.9 · Signed proof](09-proof.md) | [↑ 09 · Security and governance](README.md) | [10 · Configuration reference →](../10-configuration/README.md) |

<!-- nav:end -->
