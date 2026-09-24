# 3.3 · Skills

<div align="center">
<img src="../../assets/readme/screenshot-skills.webp#gh-light-mode-only" alt="The Skills screen with the five built-in skills" width="860">
<img src="../../assets/readme/screenshot-skills-dark.webp#gh-dark-mode-only" alt="The Skills screen with the five built-in skills" width="860">
</div>

The Skills screen lists every saved instruction you can call with `/` in the Thread. The idea is explained in [2.8 Skills and harnesses](../02-concepts/08-skills-harnesses.md); this page is about the screen.

## The list

Skills are listed in two groups:

- **Built in**, marked *changed through the repository*. These are the YAML files in `config/skills/`. They cannot be edited or deleted from the interface, and a change to them is a code change, reviewed like one.
- **Added here**: skills people created on this host.

Each row shows the command (`/clause`), the name, a one-line summary and, for skills that produce a document, the format. Expand a row to see the whole template with the place your text goes, and the skill's **SHA-256**. Click **Use** to open the Thread with the skill already in the composer.

## Using a skill

1. Click **Use**, or type `/` in the Thread's composer and pick the skill.
2. The skill appears as a chip. The placeholder shows its *input hint*, for example *The situation, e.g. internal inspection of a vessel in corrosive service*.
3. Type the input and press <kbd>Enter</kbd>.

The run records the skill and its hash. In the Audit screen, the run's `task / received` event carries `skill` and `skill_sha256`, so you can always tell which version of a skill produced a past answer.

To remove a skill chip before sending, click the ✕ on the chip (*Stop using /clause*).

## Adding a skill

Requires `skill.create` (engineer, reviewer, administrator). Click **+ New skill** and fill in:

| Field | Rules | Example |
|---|---|---|
| **Command** | Lowercase letter first, then letters, digits and hyphens; 2 to 32 characters. Must not clash with an existing skill | `psv-interval` |
| **Name** | 1 to 48 characters | PSV test interval |
| **What it does, in one line** | 1 to 160 characters | The bench-test interval the SOPs set for a relief valve. |
| **Input hint** | Up to 120 characters; optional | The valve, e.g. PSV-2104A in fouling service |
| **Sent as** | The template: 8 to 1,500 characters, must contain `{input}`, and no other `{…}` placeholder | What bench-test interval do our SOPs set for {input}? |
| **Deliver as** | Answer only, DOCX, XLSX, PPTX or Markdown | Answer only |

The server enforces every rule, not just the form. A template with anything but `{input}` in braces is refused with *the only placeholder a skill may use is {input}*.

### Writing a good skill

> [!TIP]
> - **Name "our SOPs" or "our procedures"** in the template, so every run retrieves from the knowledge base whatever its task type.
> - **Leave classification words out of the template.** *Safety*, *hazard*, *shutdown*, *incident*, *statutory*, *regulatory* and *confidential* raise the sensitivity of every run the skill starts, and so hold every one of them. Let those words come from the input, so only the runs that need it are held.
> - **Ask for citations** where precision matters: *…and cite the clause.*

## Deleting a skill

The author of a skill can delete it. An administrator (`skill.manage`) can delete anyone's. Built-in skills cannot be deleted. Every creation and deletion is audited with the skill's hash.

A skill is a convenience, not a control. Deleting one never changes how past runs were checked or held.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.2 · Thread](02-thread.md) | [↑ 03 · Using the workbench](README.md) | [3.4 · Harnesses →](04-harnesses.md) |

<!-- nav:end -->
