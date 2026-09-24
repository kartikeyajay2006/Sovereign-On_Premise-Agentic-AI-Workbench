# 13.4 · Contributing

## Workflow

1. Branch from `main` with a descriptive name: `fix/sandbox-read-confinement`, `feat/formula-registry`, `docs/handbook-api`.
2. Make the change, with the test that proves it.
3. Run the checks below.
4. Open a pull request that says **what changed, why, and how it was verified**, including anything you could not verify.
5. Merge after review.

## Commit messages

Imperative subject under about 70 characters, then a body that explains the reason and the consequence, the way the existing history does:

```text
Apply clearance before ranking in knowledge search

Filtering the top k after ranking gave an operator three passages where
an engineer got six: Restricted passages took the slots and were then
removed. The filter now runs on the candidate set, so each role gets its
best six passages from what it may read.
```

## Before you merge

- [ ] `python -m pytest -q`: all pass (Windows tests skip off Windows)
- [ ] `cd frontend && npx tsc --noEmit && npm run build`
- [ ] A new behaviour has a test; a fixed bug has the test that would have caught it
- [ ] New settings are in YAML with a comment, read with a default, and documented in [section 10](../10-configuration/README.md)
- [ ] New actions audit; new stages emit events
- [ ] Nothing names a model or embeds a prompt in code
- [ ] The interface does not claim more than the code does
- [ ] For security-relevant changes: the Assurance self-test still holds 7 of 7, and the relevant page of [section 9](../09-security/README.md) is updated
- [ ] For pipeline changes: at least one scenario from `docs/DEMO.md` run end to end, and its answer checked against the stated correct answer

## Documentation

This handbook is part of the product. Change the page when you change the behaviour it describes, and keep the tone: plain, specific, and honest about limits.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 13.3 · Conventions](03-conventions.md) | [↑ 13 · Development](README.md) | [14 · Demo guide →](../14-demo-guide/README.md) |

<!-- nav:end -->
