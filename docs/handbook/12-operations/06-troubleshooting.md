# 12.6 · Runtime troubleshooting

Installation problems are in [1.8](../01-getting-started/08-install-troubleshooting.md). This page is for a workbench that starts, but whose runs misbehave.

## A run ends **Refused** (blocked)

The router found no model that is installed, approved for the run's classification, and capable. The run's error says which, for example:

> No installed model satisfies role 'vision' with capabilities ['vision'] approved for classification 'restricted'. Registered but not installed: qwen2.5vl:3b.

Install the named model, or approve an installed one for that classification in `config/models.yaml` if policy allows.

> *Local inference server is unreachable; no model can be selected.*

Start Ollama.

## A run ends **Failed**

| Error | Cause | Fix |
|---|---|---|
| *Local inference failed: …timed out* | A model call exceeded `inference.request_timeout_seconds`, usually on a swapping host | Free memory; shorten outputs; see [12.5](05-performance.md) |
| *Local inference failed: … model not found* | A registered model was removed from Ollama in the last 30 s | Wait for the registry refresh, or re-pull |
| *Could not read text pages of X.pdf* | The PDF parser failed | Check the file opens; re-export it |
| *Only 2 of 3 pages rendered* | PyMuPDF could not render a page | Re-scan or re-export the PDF |
| *This task was interrupted when the workbench stopped* | The API restarted mid-run | Run again |
| *worker error: …* | An unexpected error in the worker | See `storage/logs/api.log`; report it |

## A run is **Held** and you did not expect it

Open it. The held line lists every rule that matched. The usual surprises:

| Reason | Why | If it should not hold |
|---|---|---|
| *Evidence S5 (…) is restricted, so the run is restricted too* | Retrieval admitted a Restricted passage | Correct behaviour. The question touched restricted material |
| *released_deliverable* | The run produced a document | Choose **Answer only** if you did not want one. Through the API, the word *note*, *memo* or *letter* in a request with no format makes a DOCX |
| *safety_recommendation* | The request contains *safety*, *hazard*, *shutdown*, *incident* or *statutory* | Correct behaviour |
| *verification_failure* | A check failed | Read the check; it is telling you something |

## An answer is wrong but the checks passed

Read [8.5 What verification cannot catch](../08-verification/05-limits.md). Then:

1. Open the run's transcript: were the right passages retrieved? Try the same question in **Knowledge → Retrieval test**.
2. Did the task need arithmetic? If there is no **Code** step, the model wrote the figures itself. Attach the data as CSV, or use `/remaining-life` with the readings.
3. Reject it with a note saying what was wrong, so the record shows it was caught.

## Runs are slow or stuck in the queue

- **Queued for a long time:** one worker runs one task at a time. Check what is running (the queue events name it) and stop it if it is stuck.
- **Stuck in one stage:** check `ollama ps` and `free -h`. A swapping host looks exactly like a hang.
- **Two API processes:** `pgrep -af "uvicorn backend.api.main"`. Stop all, start one.

## The console shows errors

| Symptom | Cause |
|---|---|
| 500 *socket hang up* on random requests | API started without `--timeout-keep-alive 75` |
| Pages 400 on their own JavaScript | The console was rebuilt while running; restart it (`run.sh` always does) |
| Live updates stop | The event stream dropped. It reconnects; a page reload is also safe |
| *Checking your session…* forever | The API is not answering `/api/auth/me`; check it is running |

## The Egress figure is not zero

Open **Assurance → Posture**: the violation lists the local and remote address, the process and the time. Check whether something the API launched connected out. Every violation is in the audit log under `sovereignty`. If the monitor says it **cannot observe** (the connection table was refused), run the API as a user allowed to read it, or accept that the figure is unavailable. It will not be reported as zero.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 12.5 · Performance tuning](05-performance.md) | [↑ 12 · Operations](README.md) | [13 · Development →](../13-development/README.md) |

<!-- nav:end -->
