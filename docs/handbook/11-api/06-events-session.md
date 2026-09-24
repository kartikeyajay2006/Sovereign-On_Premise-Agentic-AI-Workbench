# 11.6 · The event stream and a worked session

## `GET /api/events[?task_id=…]`

Server-Sent Events. Authenticate with the bearer header, or the `workbench_session` cookie from a browser. The stream opens with `: stream open`, replays recent structural events, then streams live. A `: keep-alive` comment arrives after 20 seconds of quiet. All 32 event types are listed in [4.6](../04-architecture/06-events.md).

```bash
curl -N http://127.0.0.1:8000/api/events?task_id=$ID -H "Authorization: Bearer $TOKEN"
```

```text
: stream open

event: task.stage
data: {"event":"task.stage","task_id":"…","at":"…","data":{"status":"retrieving","message":"Searching the local knowledge base","phase":"retrieval"}}

event: task.evidence
data: {"event":"task.evidence","task_id":"…","data":{"mode":"embedding","count":6,"items":[…]}}

event: task.token
data: {"event":"task.token","task_id":"…","data":{"stage":"drafting","text":"A pressure vessel in corrosive "}}
…
event: task.finished
data: {"event":"task.finished","task_id":"…","data":{"status":"delivered","duration_ms":18812}}
```

From Python:

```python
import httpx, json

with httpx.stream("GET", "http://127.0.0.1:8000/api/events",
                  headers={"Authorization": f"Bearer {token}"}, timeout=None) as r:
    event = None
    for line in r.iter_lines():
        if line.startswith("event: "):
            event = line[7:]
        elif line.startswith("data: "):
            print(event, json.loads(line[6:])["data"])
```

## A worked session, end to end

The repository ships a complete driver, `scripts/demo_e2e.py`, that signs in as an engineer and a reviewer, checks health, runs an agentic scanned-report task, approves it, runs a coding task and a standalone vision task, and then checks sovereignty and the audit chain:

```bash
python scripts/demo_e2e.py                # all scenarios
python scripts/demo_e2e.py --skip 1       # skip the long scanned-report scenario
python scripts/demo_e2e.py --base-url http://127.0.0.1:8100
```

> [!WARNING]
> Scenario 5 (sovereignty) currently stops with `KeyError: 'static_layer_blocks_network_import'`: the sandbox self-test's response was restructured into the `checks` list shown in [11.5](05-knowledge-sandbox-audit.md#self-test), and the driver still reads the old keys. Until it is updated, run the self-test from the Assurance screen or with `POST /api/sandbox/self-test`.

### The same thing in fifteen lines of shell

```bash
BASE=http://127.0.0.1:8000
login() { curl -s -X POST $BASE/api/auth/login -H 'content-type: application/json' \
  -d "{\"username\":\"$1\",\"password\":\"workbench\"}" | jq -r .token; }
E=$(login engineer); R=$(login reviewer)

# 1. Ask a question that will be held (it retrieves a Restricted memo)
ID=$(curl -s -X POST $BASE/api/tasks -H "Authorization: Bearer $E" -H 'content-type: application/json' \
  -d '{"prompt":"What severity applies when cladding damage exceeds 20% of an insulated section, and who must approve continued operation? Cite the clauses.","deliverable_format":"answer"}' | jq -r .id)

# 2. Wait for it to settle
until curl -s $BASE/api/tasks/$ID -H "Authorization: Bearer $E" | jq -e '.status=="awaiting_approval" or .status=="delivered" or .status=="failed"' >/dev/null; do sleep 3; done

# 3. See why it was held, then release it as the reviewer
curl -s $BASE/api/tasks/$ID -H "Authorization: Bearer $E" | jq '{answer, reasons: .approval.reasons}'
curl -s -X POST $BASE/api/tasks/$ID/approve -H "Authorization: Bearer $R" -H 'content-type: application/json' \
  -d '{"decision":"approve","comment":"Medium per SOP-MNT-022 4.1; Head of Inspection per SOP-INS-014 5.2"}' | jq .status

# 4. Prove the record
curl -s $BASE/api/audit/chain -H "Authorization: Bearer $R" | jq '{valid, events, head_hash}'
curl -s $BASE/api/sovereignty -H "Authorization: Bearer $R" | jq '{sovereign, external_calls}'
```

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 11.5 · Knowledge, sandbox, audit and sovereignty](05-knowledge-sandbox-audit.md) | [↑ 11 · API reference](README.md) | [12 · Operations →](../12-operations/README.md) |

<!-- nav:end -->
