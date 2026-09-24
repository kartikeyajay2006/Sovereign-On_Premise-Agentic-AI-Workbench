# 5.4 · The Ollama client

`backend/models_layer/client.py` is the only code that talks to the model runtime.

## Loopback only

When the client is created, it checks `inference.base_url`. The host must be `localhost` or resolve to a **loopback** address; anything else raises `NonLocalEndpointError`, and the API answers HTTP 503:

```json
{
  "detail": "…",
  "sovereignty": "refused: inference endpoint must be loopback"
}
```

A misconfiguration, or an attempt to point the workbench at a remote GPU server or a cloud endpoint, fails loudly instead of sending data off the host.

## Calls

| Method | Runtime endpoint | Used for |
|---|---|---|
| `list_models` | `GET /api/tags` | Registry reconciliation |
| `generate` | `POST /api/generate` (not streamed) | Plans, calculation extraction, vision reading, code, conversation |
| `stream` | `POST /api/generate` (streamed) | Drafting the answer, token by token |
| `embed` | `POST /api/embed` | Embedding passages at ingestion and queries at retrieval |

Every call sends `keep_alive` and the options the router assembled for the stage: the model's `generation_defaults`, then the stage's `num_predict` and `num_ctx`. For a model with `serving.thinking: false`, `think: false` is sent so Qwen3 answers without deliberating first.

Timeouts come from `inference.connect_timeout_seconds` (10) and `inference.request_timeout_seconds` (600). On a CPU host a vision call over three pages can legitimately take minutes.

## Images

Images go to the runtime base64-encoded. Before encoding, any image whose long edge exceeds `inference.max_image_edge_px` (1,100 px) is downscaled with Lanczos resampling. A 1,700 px scan costs several times the image tokens of an 1,100 px one while adding little legibility, which makes this the single largest lever on how long reading a document takes. If resizing fails for any reason, the original is sent: a task is never failed over a resize.

## Reasoning blocks

Some models emit `<think>…</think>` deliberation. The orchestrator strips those blocks from every answer, and while streaming it withholds text until a block closes, so a reader never sees half a deliberation.

## Usage telemetry

The runtime reports statistics with every response, and the client turns them into a usage record kept on the run:

| Field | Meaning |
|---|---|
| `prompt_tokens`, `output_tokens` | Tokens in and out |
| `load_ms` | Time spent loading the model for this call (non-zero means a cold start) |
| `prompt_eval_ms`, `eval_ms` | Time reading the prompt, and generating |
| `first_token_ms` | Time to the first token, for streamed calls |
| `tokens_per_second` | Output speed |
| `context_window` | The `num_ctx` sent |
| `done_reason` | Why generation stopped: `stop` (finished) or `length` (hit the budget) |
| `latency_ms` | Wall-clock time of the call, measured by the orchestrator |
| `output_limit` | The `num_predict` budget the call was sent with |
| `streamed`, `cancelled` | Whether the call streamed, and whether it was stopped before the runtime answered |

A figure the runtime did not report stays `null`. Zero is a count; `null` is the absence of one, so a total never quietly treats a missing count as zero.

The Thread's usage footer totals these per run. A `done_reason` of `length` on a draft means the answer was cut off by its budget; raise `stage_output_tokens.drafting` if that happens often.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 5.3 · Memory and residency](03-residency.md) | [↑ 05 · Models and routing](README.md) | [5.5 · Adding a model →](05-adding-a-model.md) |

<!-- nav:end -->
