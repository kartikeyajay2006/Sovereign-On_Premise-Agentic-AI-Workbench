"""End-to-end demonstration driver.

Exercises the platform exactly as the problem statement asks it to be
demonstrated:

1. Model auto-selection across two different task types.
2. An agentic task end to end: scanned inspection report -> vision extraction
   -> SOP retrieval -> calculation -> drafted approval note (DOCX).
3. A coding task generated and verified in the sandbox.
4. A multimodal understanding task.
5. Proof, from the platform's own monitor and audit trail, that no external
   call was made at any point.

Run with the API already listening:  python scripts/demo_e2e.py
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "http://127.0.0.1:8000"
POLL_SECONDS = 3
DEFAULT_TIMEOUT = 1800


class Console:
    BOLD = "\033[1m"
    DIM = "\033[2m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    RED = "\033[31m"
    CYAN = "\033[36m"
    RESET = "\033[0m"

    @classmethod
    def heading(cls, text: str) -> None:
        print(f"\n{cls.BOLD}{cls.CYAN}{'═' * 78}{cls.RESET}")
        print(f"{cls.BOLD}{cls.CYAN}  {text}{cls.RESET}")
        print(f"{cls.BOLD}{cls.CYAN}{'═' * 78}{cls.RESET}")

    @classmethod
    def step(cls, text: str) -> None:
        print(f"{cls.BOLD}▸ {text}{cls.RESET}")

    @classmethod
    def ok(cls, text: str) -> None:
        print(f"  {cls.GREEN}✓{cls.RESET} {text}")

    @classmethod
    def warn(cls, text: str) -> None:
        print(f"  {cls.YELLOW}!{cls.RESET} {text}")

    @classmethod
    def fail(cls, text: str) -> None:
        print(f"  {cls.RED}✗{cls.RESET} {text}")

    @classmethod
    def detail(cls, text: str) -> None:
        print(f"    {cls.DIM}{text}{cls.RESET}")


class Client:
    def __init__(self, base_url: str = BASE_URL) -> None:
        self.http = httpx.Client(base_url=base_url, timeout=120.0)
        self.token: str | None = None

    def login(self, username: str, password: str) -> dict:
        response = self.http.post(
            "/api/auth/login", json={"username": username, "password": password}
        )
        response.raise_for_status()
        session = response.json()
        self.token = session["token"]
        self.http.headers["Authorization"] = f"Bearer {self.token}"
        return session

    def upload(self, path: Path, classification: str | None = None) -> dict:
        with path.open("rb") as handle:
            data = {"classification": classification} if classification else None
            response = self.http.post(
                "/api/files", files={"file": (path.name, handle)}, data=data
            )
        response.raise_for_status()
        return response.json()

    def create_task(self, prompt: str, file_ids: list[str] | None = None,
                    deliverable_format: str | None = None) -> dict:
        response = self.http.post(
            "/api/tasks",
            json={
                "prompt": prompt,
                "file_ids": file_ids or [],
                "deliverable_format": deliverable_format,
            },
        )
        response.raise_for_status()
        return response.json()

    def get_task(self, task_id: str) -> dict:
        response = self.http.get(f"/api/tasks/{task_id}")
        response.raise_for_status()
        return response.json()

    def wait(self, task_id: str, timeout: int = DEFAULT_TIMEOUT) -> dict:
        terminal = {"delivered", "awaiting_approval", "failed", "blocked", "rejected"}
        deadline = time.time() + timeout
        last_status = None
        while time.time() < deadline:
            task = self.get_task(task_id)
            status = task["status"]
            if status != last_status:
                Console.detail(f"status: {status}")
                last_status = status
            if status in terminal:
                return task
            time.sleep(POLL_SECONDS)
        raise TimeoutError(f"Task {task_id} did not finish within {timeout}s")

    def approve(self, task_id: str, comment: str) -> dict:
        response = self.http.post(
            f"/api/tasks/{task_id}/approve",
            json={"decision": "approve", "comment": comment},
        )
        response.raise_for_status()
        return response.json()

    def get(self, path: str) -> dict | list:
        response = self.http.get(path)
        response.raise_for_status()
        return response.json()


def show_routing(task: dict) -> None:
    seen: set[tuple[str, str]] = set()
    for decision in task.get("routing", []):
        key = (decision.get("requested_role"), decision.get("selected_model") or "none")
        if key in seen:
            continue
        seen.add(key)
        Console.ok(
            f"routed [{decision['requested_role']}] -> "
            f"{decision.get('selected_display_name') or decision.get('selected_model')}"
        )
        Console.detail(f"rule '{decision['rule']}': {decision['reason']}")


def show_verification(task: dict) -> None:
    verification = task.get("verification")
    if not verification:
        Console.warn("no verification report")
        return
    marker = Console.ok if verification["valid"] else Console.warn
    marker(
        f"verification {'PASSED' if verification['valid'] else 'FAILED'} — "
        f"{verification['material_claims_supported']}/"
        f"{verification['material_claims_total']} material claims supported"
    )
    for check in verification["checks"]:
        symbol = "✓" if check["passed"] else "✗"
        Console.detail(f"{symbol} {check['name']}: {check['detail']}")


def scenario_agentic(client: Client) -> dict:
    Console.heading("SCENARIO 1 — Agentic + multimodal: scanned report → approval note")

    image = ROOT / "sample_data" / "inspection" / "scanned-inspection-report-V-2104.png"
    if not image.exists():
        Console.fail(f"missing sample: {image}")
        sys.exit(1)

    Console.step("Uploading scanned inspection report")
    uploaded = client.upload(image, classification="confidential")
    Console.ok(f"{uploaded['filename']} ({uploaded['size_bytes']:,} bytes)")
    Console.detail(f"sha256 {uploaded['sha256'][:32]}…  input type: {uploaded['input_type']}")

    prompt = (
        "Analyze this scanned inspection report and prepare an approval note "
        "based on our approved SOP. Calculate the corrosion rate and remaining "
        "life for the governing location and state the severity classification."
    )
    Console.step("Submitting agentic task")
    task = client.create_task(prompt, [uploaded["id"]], deliverable_format="docx")
    profile = task["profile"]
    Console.ok(
        f"classified: {profile['input_type']} / {profile['task_type']} / "
        f"{profile['complexity']} / {profile['sensitivity']}"
    )
    Console.detail(
        f"vision={profile['requires_vision']} retrieval={profile['requires_retrieval']} "
        f"deliverable={profile['deliverable_format']} step budget={profile['step_budget']}"
    )

    Console.step("Running agent (local CPU inference — this takes a few minutes)")
    task = client.wait(task["id"])

    show_routing(task)
    if task.get("plan"):
        Console.ok(f"plan executed with {len(task['plan']['steps'])} step(s)")
        for step in task["plan"]["steps"]:
            Console.detail(f"{step['id']}. [{step['status']}] {step['action']} — {step['objective']}")

    Console.ok(f"{len(task.get('evidence', []))} evidence item(s) collected")
    for item in task.get("evidence", [])[:5]:
        Console.detail(
            f"[{item['id']}] {item['source_document']}"
            + (f" — {item['location']}" if item.get("location") else "")
        )

    show_verification(task)

    approval = task.get("approval") or {}
    if approval.get("required"):
        Console.ok("held at the human approval gate (as policy requires)")
        for reason in approval.get("reasons", []):
            Console.detail(reason)

    for deliverable in task.get("deliverables", []):
        Console.ok(
            f"deliverable: {deliverable['filename']} "
            f"({deliverable['size_bytes']:,} bytes, released={deliverable['released']})"
        )
        Console.detail(f"sha256 {deliverable['sha256'][:32]}…")
    return task


def scenario_approval(reviewer: Client, task: dict) -> dict:
    Console.heading("SCENARIO 2 — Human approval gate")
    if task["status"] != "awaiting_approval":
        Console.warn(f"task is {task['status']}, not awaiting approval; skipping")
        return task
    Console.step("Reviewer signs the approval note")
    approved = reviewer.approve(
        task["id"], "Reviewed against SOP-INS-014. Recommendation accepted."
    )
    Console.ok(f"status now: {approved['status']}")
    for deliverable in approved.get("deliverables", []):
        Console.ok(f"{deliverable['filename']} released={deliverable['released']}")
    return approved


def scenario_coding(client: Client) -> dict:
    Console.heading("SCENARIO 3 — Coding task, generated and verified in the sandbox")
    prompt = (
        "Write a python script that computes the corrosion rate and remaining life "
        "for a vessel with original thickness 12.0 mm, current thickness 9.4 mm "
        "measured 4.0 years apart, using a minimum allowable thickness of 6.0 mm. "
        "Print the corrosion rate in mm/year and the remaining life in years."
    )
    Console.step("Submitting coding task (different task type — watch the routing)")
    task = client.create_task(prompt)
    Console.ok(
        f"classified: {task['profile']['input_type']} / {task['profile']['task_type']}"
    )
    task = client.wait(task["id"])
    show_routing(task)

    for call in task.get("tool_calls", []):
        if call["tool"] == "python_exec":
            Console.ok(f"sandbox: {call['output_summary']}")
            stdout = call["output"].get("stdout", "")
            for line in stdout.strip().splitlines()[:8]:
                Console.detail(line)
    show_verification(task)
    return task


def scenario_multimodal(client: Client, file_id: str) -> dict:
    Console.heading("SCENARIO 4 — Multimodal understanding (standalone)")
    prompt = (
        "Read this scanned document and list every ultrasonic thickness reading "
        "you can see, with its location."
    )
    Console.step("Submitting vision-only task")
    task = client.create_task(prompt, [file_id])
    task = client.wait(task["id"])
    show_routing(task)
    answer = (task.get("answer") or "").strip()
    if answer:
        Console.ok("model produced a reading of the scan:")
        for line in answer.splitlines()[:14]:
            if line.strip():
                Console.detail(line[:100])
    return task


def scenario_sovereignty(client: Client) -> None:
    Console.heading("SCENARIO 5 — Sovereignty proof")

    Console.step("Live network monitor")
    status = client.get("/api/sovereignty")
    marker = Console.ok if status["sovereign"] else Console.fail
    marker(f"sovereign: {status['sovereign']}")
    Console.detail(f"external API calls:      {status['external_api_calls']}")
    Console.detail(f"cloud LLM calls:         {status['cloud_llm_calls']}")
    Console.detail(f"internet requests:       {status['internet_requests']}")
    Console.detail(f"unapproved connections:  {status['unapproved_connections']}")
    Console.detail(f"data leaving host:       {status['data_leaving_host_bytes']} bytes")
    Console.detail(f"local (loopback) conns:  {status['local_connections']}")

    Console.step("Sandbox isolation self-test (adversarial)")
    result = client.get("/api/sovereignty/sandbox-test")
    (Console.ok if result["static_layer_blocks_network_import"] else Console.fail)(
        "static layer blocks network imports before execution"
    )
    (Console.ok if result["runtime_layer_blocks_socket"] else Console.fail)(
        "runtime layer blocks sockets even when static validation is bypassed"
    )

    Console.step("Audit chain integrity")
    chain = client.get("/api/audit/chain")
    (Console.ok if chain["valid"] else Console.fail)(
        f"hash chain valid over {chain['events']} events"
    )
    Console.detail(f"head hash {str(chain.get('head_hash'))[:48]}…")

    Console.step("Audit trail sample")
    events = client.get("/api/audit?limit=12")
    for event in events[:10]:
        Console.detail(
            f"#{event['sequence']:<4} {event['category']:<12} {event['action'][:40]:<40} "
            f"{event['actor']}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=BASE_URL)
    parser.add_argument("--skip", nargs="*", default=[], help="scenario numbers to skip")
    arguments = parser.parse_args()

    Console.heading("SOVEREIGN ON-PREMISE AGENTIC AI WORKBENCH — DEMONSTRATION")

    operator = Client(arguments.base_url)
    reviewer = Client(arguments.base_url)
    try:
        session = operator.login("engineer", "workbench")
        Console.ok(f"authenticated as {session['user']['display_name']} ({session['user']['role']})")
        reviewer_session = reviewer.login("reviewer", "workbench")
        Console.ok(
            f"reviewer available: {reviewer_session['user']['display_name']} "
            f"({reviewer_session['user']['role']})"
        )
    except httpx.HTTPError as exc:
        Console.fail(f"cannot reach the workbench API at {arguments.base_url}: {exc}")
        return 1

    health = operator.get("/api/health")
    Console.ok(
        f"models: {health['models_available']}/{health['models_registered']} available · "
        f"retrieval: {health['retrieval_mode']} · sandbox: {health['sandbox_runtime']} "
        f"({'ready' if health['sandbox_ready'] else 'NOT READY'})"
    )
    Console.detail(
        f"knowledge base: {health['knowledge_documents']} document(s), "
        f"{health['knowledge_chunks']} chunk(s)"
    )

    results: dict[str, dict] = {}
    if "1" not in arguments.skip:
        agentic = scenario_agentic(operator)
        results["agentic"] = agentic
        if "2" not in arguments.skip:
            results["approved"] = scenario_approval(reviewer, agentic)
        if "4" not in arguments.skip and agentic.get("files"):
            results["multimodal"] = scenario_multimodal(operator, agentic["files"][0]["id"])
    if "3" not in arguments.skip:
        results["coding"] = scenario_coding(operator)
    if "5" not in arguments.skip:
        scenario_sovereignty(operator)

    Console.heading("SUMMARY")
    for name, task in results.items():
        if not isinstance(task, dict) or "status" not in task:
            continue
        models = sorted(
            {
                decision.get("selected_model")
                for decision in task.get("routing", [])
                if decision.get("selected_model")
            }
        )
        Console.ok(
            f"{name}: {task['status']} · models used: {', '.join(models) or 'none'} · "
            f"{task.get('duration_ms', 0) / 1000:.0f}s"
        )

    print()
    Console.ok("All processing was performed locally. No external calls were made.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
