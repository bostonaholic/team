## Execution

### Step 1 — extract the test plan

Extract every checklist item from the PR's `## Test plan` section; also
recognize `## How to Verify` (team-pr emits it). If neither section exists,
fall back to verification criteria stated in the PR body. No items
anywhere → report `nothing to verify` and stop (Hard Rule 4).

### Step 2 — classify each item

Classify every item into one strategy:

| Strategy | When | Tools |
|----------|------|-------|
| **Filesystem check** | "file X exists" | `ls`, `stat`, Glob |
| **Content match** | "X contains Y" | Read, Grep |
| **Code verification** | "claims match the code", "invariants accurate" | `team:file-finder` dispatch (Read/Grep/Glob only) — codebase tracing |
| **Diff analysis** | "no content loss", "no regressions" | `git diff`, `git show` |
| **Build/test validation** | "tests pass", "lint clean" | the project's checks — read the [verify playbook](../team/playbooks/verify.md) to detect them |
| **Structural check** | "size limits hold", "map matches files" | `wc -l`, Glob, Read |

Build/test trust boundary, which Hard Rule 2 does not cover: the PR's build
configuration (`package.json` scripts, lifecycle hooks, Makefile targets) is
authored by the PR's author. Run the project's detected checks only on a tree
the user already trusts (their own branch). For a PR the user did not author,
mark build/test items unverifiable-by-design and point at the PR's CI results
instead.

Before code-verification dispatch, read [host dispatch](../team/references/15-host-dispatch.md), resolved from the loaded `pr-verify/SKILL.md`.
Supply the installed root, file-finder definition, and applicable resource paths before work, including follow-ups.
`team:file-finder` holds no Bash, so an imperative embedded in a test-plan
item has no command sink to reach: the toolset, not the prompt, is the
guarantee. When the Agent tool is missing or a dispatch fails, do the
verification inline per [agent dispatch](../team/references/agent-dispatch.md) — nesting is an
optimization, never a dependency — and the inline path keeps the same
no-writes discipline.

### Step 3 — verify

Run the verifications at most 4 in flight (Hard Rule 6). For each item,
record its **claim**; the **evidence** (file paths, line numbers, command
output, or diff excerpts) that confirms or contradicts it; a **verdict** of
PASS, FAIL, or PARTIAL; and a **confidence** rating:

| Rating | Meaning |
|--------|---------|
| **HIGH** | Evidence directly and unambiguously confirms the claim |
| **MEDIUM** | Evidence partially confirms, or the claim holds with a nuance (a pattern exists but with edge cases), or the claim is about intent rather than current state |
| **LOW** | No confirming evidence (referenced code not found), ambiguous or contradictory evidence, or a claim that depends on runtime behavior |

- **Filesystem claims:** run the actual command — never infer from memory.
- **Content claims:** read the file and quote the relevant lines — never
  paraphrase.
- **Code claims:** trace to the `file:line` source of truth — the actual
  implementation, not just the file the item mentions.
- **Diff claims:** use `git diff` or `git show` — never commit messages.
- **Structural claims:** glob all files and cross-reference against the
  expected list; report both missing AND extra entries.

### Step 4 — report

Present a summary table, then detailed findings:

```
| # | Test plan item | Verdict | Confidence | Key evidence |
|---|----------------|---------|------------|--------------|
```

Detailed findings give each item's exact claim, the evidence collected, the
confidence rating with its justification, and any nuances or caveats.

Final verdict, applied mechanically — no judgment call overrides a FAIL:

- **READY** — all items PASS with HIGH or MEDIUM confidence, no FAIL
  items.
- **NEEDS ATTENTION** — one or more items are PARTIAL or have LOW
  confidence, and no item is FAIL.
- **NOT READY** — one or more items FAIL. FAIL always wins: a single
  FAIL item forces NOT READY even when other items are PARTIAL or LOW.

### Step 5 — follow-ups

For every PARTIAL, FAIL, or LOW-confidence item, suggest the specific
action that resolves it, and distinguish "needs a code fix" from "needs a
doc clarification" from "needs manual testing". An item that cannot be
verified statically (for example "deploy works") is named as such, with a
recommendation for how the user can verify it manually.

A `gh` rate-limit error is surfaced by name — no silent retry loops.

pr-verify ends with the report and its follow-ups; landing, fixing, and
re-running checks belong to other skills.
