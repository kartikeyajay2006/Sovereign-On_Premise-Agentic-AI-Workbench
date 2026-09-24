# 3.10 · Keyboard and themes

AEGIS is built to be driven from the keyboard. Nothing here is required; everything here is faster.

## Going places: <kbd>G</kbd> then a letter

Press <kbd>G</kbd>, then within about a second one of these letters:

| Keys | Goes to |
|---|---|
| <kbd>G</kbd> <kbd>T</kbd> | **Thread** |
| <kbd>G</kbd> <kbd>I</kbd> | **Skills** |
| <kbd>G</kbd> <kbd>H</kbd> | **Harnesses** |
| <kbd>G</kbd> <kbd>A</kbd> | **Approvals** |
| <kbd>G</kbd> <kbd>K</kbd> | **Knowledge** |
| <kbd>G</kbd> <kbd>P</kbd> | **Assurance · Posture** |
| <kbd>G</kbd> <kbd>S</kbd> | **Assurance · Sandbox** |
| <kbd>G</kbd> <kbd>L</kbd> | **Assurance · Audit** (the *log*) |

The sequence is taken before a screen's own single-key shortcuts see it, so <kbd>G</kbd> <kbd>A</kbd> goes to Approvals rather than approving something. It is ignored while a dialog is open or while you are typing in a field.

## The command palette: <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd>

Also the **Search** button in the sidebar. Type to filter; <kbd>↑</kbd> <kbd>↓</kbd> (or <kbd>Ctrl</kbd>+<kbd>P</kbd> / <kbd>Ctrl</kbd>+<kbd>N</kbd>) to move; <kbd>Enter</kbd> to choose; <kbd>Esc</kbd> to close.

| Group | Contents |
|---|---|
| **Go to** | Every place, with a one-line hint of what it is for |
| **Recent runs** | Your latest runs, by their request |
| **Harness runs** | Recent harness jobs |
| **Actions** | *New run*, *Containment self-test*, *Sign in as* each other demo account, *Sign out* |

## In the Thread

| Keys | Action |
|---|---|
| <kbd>Enter</kbd> | Send |
| <kbd>Shift</kbd> + <kbd>Enter</kbd> | New line |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> | Send |
| <kbd>/</kbd> at the start | Open the skills and harnesses menu |
| <kbd>Enter</kbd> or <kbd>Tab</kbd> in the menu | Take the highlighted skill |
| <kbd>Esc</kbd> in the menu | Close it |

## In Approvals

| Keys | Action |
|---|---|
| <kbd>J</kbd> / <kbd>↓</kbd> | Next |
| <kbd>K</kbd> / <kbd>↑</kbd> | Previous |
| <kbd>Enter</kbd> | Open |
| <kbd>A</kbd> | Approve |
| <kbd>R</kbd> | Reject |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> | Confirm the decision |
| <kbd>Esc</kbd> | Back to the list |

## In the Sandbox

| Keys | Action |
|---|---|
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Run the code in the editor |

## Light and dark

The moon/sun button at the bottom of the sidebar switches between the light and dark themes. Your choice is kept in the browser (`localStorage`, key `aegis-theme`). With no choice saved, AEGIS follows your system's preference. The theme is applied before the page paints, so there is no flash of the wrong colours.

The light theme is warm paper and ink; the dark theme is a warm night. Both use the same four status colours: **green** for sovereign and delivered, **blue** for active, **amber** for held and waiting, **red** for refused, failed and critical.

## Motion

Animations are short and purposeful: a run's steps appear as they happen, and the audit ribbon sweeps as it verifies. If your system asks for reduced motion, AEGIS honours it.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 3.9 · Audit](09-audit.md) | [↑ 03 · Using the workbench](README.md) |  |

<!-- nav:end -->
