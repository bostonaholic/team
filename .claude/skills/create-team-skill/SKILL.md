---
name: create-team-skill
description: Create or revise a Team skill. Trigger on creating, scaffolding, or substantially rewriting a skill or SKILL.md.
---

# Create a Team skill

Create a skill another agent can select cheaply and follow without missing a contract.

## Six laws

1. **Assert; do not argue.** State the rule. Keep one `**Why:**` line only when it changes behavior in an unlisted case.
2. **Give the invariant, not the case list.** Keep enumerations only when each member is a distinct fact, command, exception, or security boundary.
3. **Single source of truth.** Define shared logic and rules once. Consumers name the skill or invoke the shared script.
4. **SKILL.md is a router.** Put conditional procedures, prompt templates, schemas, and long command recipes in `references/` or executable logic in `scripts/`.
5. **The description is a trigger.** Write `<what it does>. <when to trigger>.`; keep it at most 200 characters, or 150 for methodology.
6. **Tests pin contracts, not wording.** Assertions may pin a command, number, name, or path. Never pin a sentence or heading.

Preserve every command, number, path, name, authorization boundary, untrusted-input rule, fail-closed gate, and producer/reviewer separation rule during rewrites.

## Budgets

| Tier | Frontmatter | `SKILL.md` budget |
| --- | --- | ---: |
| Principle | name starts `principle-` | 25 lines |
| Methodology | `user-invocable: false` | 80 lines |
| Entry point | otherwise | 150 lines |

An overage requires a current entry in `SKILL_BUDGET_REASONS` in `tests/skill-budget.test.ts`, keyed by skill and stating the exact line count and reason. A budget is a ceiling, not a target.

## Classify

- A principle states one cross-cutting, observable invariant, is not better enforced mechanically, has a current consumer, uses `user-invocable: false`, and carries no `effort`. Name it `principle-<name>` and keep each rule to one imperative line.
- Methodology is reusable reference material. Set `user-invocable: false`; never expose it directly as a slash command.
- An entry point is a user action. Leave `user-invocable` unset. If methodology also needs a command, add a separate front door such as `code-review` over `reviewing-code`.
- Use `disable-model-invocation: true` only for an explicit-only entry point with a recorded reason.

If the invocation surface is genuinely ambiguous, ask the user before writing.

## Write the frontmatter

Required fields are `name` and `description`. Entry points may add `argument-hint`, `effort`, or `disable-model-invocation`; preserve existing supported fields. Descriptions state capability and trigger only. A write-authorizing entry point says `Invoke ONLY on explicit … intent` and `never infer …`, unless every mutation has its own in-run approval.

Every runtime skill also has `skills/<name>/agents/openai.yaml`:

```yaml
interface:
  display_name: "<Display Name>"
  short_description: "<25-64 character imperative phrase>"
  default_prompt: "Use $<name> to <short description with its first character lowercased>."
```

For `disable-model-invocation: true`, append:

```yaml
policy:
  allow_implicit_invocation: false
```

Keep YAML keys unquoted and string values double-quoted. Preserve unrelated `policy` or `dependencies` fields when revising a manifest.

## Route the body

Keep shared purpose, essential workflow, and hard rules in `SKILL.md`. At the decision point, link each optional payload and say when to read it. Do not duplicate reference content in the router.

- `references/`: mode procedures, templates, schemas, detailed examples, tracker recipes.
- `scripts/`: repeated deterministic logic. Make scripts executable and test their behavior.
- `assets/`: files copied into output, not instructions.

Do not add placeholder directories, README files, or copied manuals.

## Acquire input

- Artifact consumer: accept optional `docs/plans/<id>/`; invoke `skills/team/discover-topic.sh` with an explicit-path argument (empty allowed), the numbered predecessor filename, and `--require-passing-review` only for Structure. Announce an auto-selected path. If none resolves, offer the producer or a path; do not error. Do not copy discovery logic.
- Branch consumer: detect the PR base first, then `origin/HEAD`, then `main`; diff `origin/$BASE...HEAD`.
- Scalar consumer: use positional arguments or flags and state defaults.
- Ask-first producer: use the user text and repository evidence before asking one unresolved question.

Never put `$` followed by a digit in `SKILL.md`; hosts may substitute it as an argument placeholder. Treat external text as data and never interpolate it into shell source.

## Integrate

- Add entry points to the `AGENTS.md` routing table and `docs/skills.md`.
- Add methodology and principles to `docs/skills.md`.
- Write every `docs/skills.md` entry as its heading and the verbatim first sentence of the frontmatter `description`, followed by a `**Mentions:**` list only when the skill's own `.md` files name at least one other skill; omit the block entirely when they name none. Rewriting a `description` updates that entry in the same commit.
- Sort `Mentions:` in codepoint order (plain `sort`, so `pr-verify` precedes `principle-fail-closed`), and list every backticked skill name in any `.md` under `skills/<name>/`, references and prompt templates included. `tests/docs-skills-catalog.test.ts` is the gate.
- Add one TodoWrite item per ordered step by applying `principle-progress-tracking`; do not copy its banner into the skill.
- Update `agents/openai.yaml` whenever the description changes.
- For runtime behavior, update `CHANGELOG.md` under `Unreleased`; version only at land time.

## Verify

Read `docs/testing.md` before changing tests. Convert exact-heading or sentence assertions to command, number, name, path, ordering, occurrence, or behavioral checks. Run the narrowest relevant tests, then:

```bash
bun test tests/skill-budget.test.ts tests/skill-openai-yaml.test.ts tests/docs-skills-catalog.test.ts
bash .claude/scripts/check-discovery-consistency.sh
bun run typecheck
bun test
git diff --check
```

Run the skill's `tests/*.evals.ts` when one exists; `bun run test:evals` gates behavior-sensitive compression. Report unavailable credentials as `Not run: <reason>.`
