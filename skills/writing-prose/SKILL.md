---
name: writing-prose
description: Write or assess plain technical prose in strict instruction mode or STE-flavored descriptive mode.
user-invocable: false
---

# Writing Prose

## Input

Classify each sentence by purpose before editing.

## Plain language

- Write at seventh-grade level with common words.
- Define or link a term at first use.
- **One idea per sentence.**
- Use direct verbs instead of nominalizations.
- Use American spelling.

## Simplified Technical English (ASD-STE100)

The mode split, delete list, and self-lint adapt Ege Çelebi's MIT-licensed
[writing kit](https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop)
(© 2026).

### Two modes

- **Strict:** instructions, warnings, errors, and runbook steps. Maximum 20
  words; imperative; one action; condition before command; no conditional mood.
- **STE-flavored:** designs, ADRs, PRDs, changelogs, commit bodies, and review
  comments. Maximum 25 words; declarative text allowed. Use “would” or “could”
  only for a real alternative or consequence.

`might` is banned in both; use `can` for a real possibility. Apply mode per
sentence. A consuming format rule outranks this sentence-level guide.

### The mechanical rules

- Keep sentences and paragraphs short; one topic per paragraph.
- Write one instruction per sentence unless actions must be simultaneous.
- Use the imperative for instructions.
- Put the condition before the command.
- Use simple tenses and **active voice** unless the actor is unknown,
  irrelevant, or deliberately omitted.
- Do not stack auxiliary verbs.
- Give each word one meaning and each thing one name.
- Limit noun clusters to three words.
- Keep subjects, verbs, and articles; do not shorten by omission.
- Use vertical lists for complex text. Never join sentences with semicolons.
- Put warnings before the protected step.
- Name exact components, paths, commands, and identifiers.

### STE word substitutions

Prefer: use, make sure that, do, start, stop, before, through, but, must, can,
applicable, necessary, give, more, if, important, change, get, help, examine,
remove, and increase.

Avoid their inflated equivalents: utilize, ensure/verify/confirm,
perform/execute, initiate/commence, terminate, prior to, via, however,
should/shall/may, appropriate, required, provide, additional, whether,
significant, modify, obtain/acquire, facilitate, dive into, tear down, and
ramp up.

Use `check` as a noun; `follow` only for “come after”; `select` for a
choice and `set` for a state; `since` only for time; `or` never for
“otherwise.”

### Words and phrases to delete

Delete:

- Marketing claims: battle-tested, best-in-class, cutting-edge,
  enterprise-grade, game-changing, powerful, robust, seamless, world-class.
- Meta filler: “it is important to note,” “as mentioned above,” “in order
  to,” “a variety of,” “due to the fact that.”
- False ease: simply, just, obviously, of course.

Allow them only in quotes/citations, code/proper nouns, or terms of art whose
replacement changes meaning. Replace praise with a measurable property.

## Self-lint

Fix every hit:

1. Sentence over its mode cap.
2. Semicolon.
3. Contraction.
4. Passive voice with a known actor.
5. Hidden action: nominalization, stacked auxiliaries, or avoidable `-ing`.
6. Two names for one thing.
7. Substitution-table or delete-list word.
8. Forbidden conditional mood.
9. Empty closing sentence with no measurable claim.

Do not flag counterexamples quoted by this file.

## Mechanical score

```bash
node "<skill-dir>/ste-lint.mjs" --breakdown --cap 25 "<file>"
```

Use the absolute skill directory. Claude Code exposes it through
`${CLAUDE_PLUGIN_ROOT}/skills/writing-prose`; Codex exposes no equivalent.
The script reads only supplied paths and reports violations per 100 words. The
default cap is 20; `--cap 25` selects descriptive prose. Nothing runs it
automatically. This optional score is not a gate; Self-lint is required.

## Assessing documentation quality

- **Accuracy:** examples, APIs, flags, behavior, and version claims match code.
- **Completeness:** prerequisites, failure cases, edges, mistakes, and adjacent
  concepts are present.
- **Readability:** correct mode, one name per concept, and answers locatable
  within 30 seconds.

For review procedure and REQUIRED/RECOMMENDED classifications, use
`skills/reviewing-documentation/SKILL.md`.

## Done

Self-lint passes under the correct mode. Optional scoring, if run, is reported
as a drift signal only.
