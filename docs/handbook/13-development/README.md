# 13 · Development

> How the repository is organised, how it is tested, and how to change it without weakening it.

| Page | Covers |
|---|---|
| [13.1 Repository layout](01-repo-layout.md) | Every top-level folder, and where to find things |
| [13.2 Testing](02-testing.md) | The 435-test suite, by area; running subsets; isolation |
| [13.3 Conventions](03-conventions.md) | How code and comments are written here, and why |
| [13.4 Contributing](04-contributing.md) | Branches, commits, reviews, and a checklist before merging |

## Setting up to develop

```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
(cd frontend && npm ci)
python scripts/seed_demo_data.py
./scripts/run.sh --dev          # console with hot reload
```

The API does not reload on change. Restart it after editing Python: `./scripts/run.sh --dev` restarts both services.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 12.6 · Runtime troubleshooting](../12-operations/06-troubleshooting.md) | [↑ The AEGIS Handbook](../README.md) | [13.1 · Repository layout →](01-repo-layout.md) |

<!-- nav:end -->
