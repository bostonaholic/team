---
name: writing-prose
description: 'Defines plain-language prose rules. Load when writing or assessing documentation in strict or STE-flavored modes.'
user-invocable: false
---

# Writing Prose

Apply plain language and Simplified Technical English (ASD-STE100) to
documentation. Read [references/style-guide.md](references/style-guide.md)
before authoring or reviewing governed prose; it contains the word table,
exceptions, examples, mechanical score command, and quality review criteria.

## Plain language

- Write at a seventh-grade reading level with common words.
- Define each acronym, domain term, or jargon term at first use.
- One idea per sentence. Prefer one plain verb to a nominalization.
- Use American spelling and one consistent name for each thing.

## Two modes

Choose per sentence:

- **Strict:** instructions, numbered steps, warnings, errors, and runbook
  commands. Cap at 20 words. Use imperative form, one instruction per sentence,
  and condition before command. Ban `would`, `could`, and `might`.
- **STE-flavored:** design documents, ADRs, PRDs, changelogs, commit bodies, and
  review comments. Cap at 25 words. Declarative prose is allowed. Use `would`
  or `could` only for an actual alternative or consequence. Ban `might`.

A consuming skill's format contract wins. This skill governs sentence prose.

## Mechanical invariants

- Use simple tenses and active voice unless the actor is unknown, irrelevant,
  or deliberately omitted.
- Keep noun clusters to three words. Do not omit subjects, verbs, or articles.
- Use lists for complex text. Never use semicolons. Keep paragraphs to six
  sentences and one topic.
- Put warnings and cautions before the protected step.
- Name concrete files, commands, paths, identifiers, and components.
- Use the substitutions, restricted meanings, and exceptions in the style guide.

## Words and phrases to delete

Delete marketing adjectives, modal prefaces, filler, and false-ease words such
as `simply`, `just`, `of course`, and `obviously`. Preserve them only in verbatim
quotes, code or proper nouns, or established technical terms whose meaning would
change. State measurable properties instead of evaluative adjectives.

## Self-lint

Before returning text, fix every:

1. sentence over its mode cap;
2. semicolon or contraction;
3. passive construction with a known actor;
4. hidden action or stacked auxiliary;
5. second name for one thing;
6. banned or substitution-table word;
7. disallowed conditional mood;
8. closer with no measurable fact.

Do not self-lint counter-examples in the style guide. Review disagreements use
`conventional-comments`.

## Documentation review

Assess accuracy, completeness, and readability. Verify commands, APIs, flags,
versions, failure cases, prerequisites, and links. A reader must locate a
specific answer within 30 seconds. For documentation-gap review and
`REQUIRED`/`RECOMMENDED` classification, read
`skills/reviewing-documentation/SKILL.md`.
