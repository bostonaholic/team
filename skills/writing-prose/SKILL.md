---
name: writing-prose
description: Clear documentation and readable explanation methodology — loaded by technical-writer agent to write prose and to assess documentation quality, grounded in plain language and readability principles
user-invocable: false
---

# Writing Prose

Documentation exists to transfer understanding. Every word that does not
transfer understanding is a word that costs the reader without paying them.
Apply these principles when writing prose and when assessing it — they govern
the documentation you produce as well as the documentation you review.

## Core Principles

### Plain Language First

Write for the reader's comprehension, not the author's expertise.

- **Write at a seventh-grade reading level.** Short sentences, common words,
  no unexplained jargon. When a technical term is unavoidable, the "Define
  terms at first use" bullet below covers it.
- **Use familiar words.** "Use" not "utilize". "Start" not "initiate". "Show"
  not "demonstrate". When a shorter, common word exists, choose it.
- **One idea per sentence.** Long sentences with multiple clauses force readers
  to hold context while parsing structure. Split them.
- **Define terms at first use.** Every acronym, domain term, or jargon word
  should be defined or linked when it first appears. Never assume the reader
  knows what you know.
- **Avoid nominalizations.** "Make a decision" → "decide". "Provide an
  explanation" → "explain". Nominalizations hide the actor and the action.

### Active Voice

Active voice connects the actor directly to the action. Passive voice hides who
is responsible and makes sentences longer.

| Passive | Active |
|---------|--------|
| The configuration is loaded by the server | The server loads the configuration |
| An error will be thrown if the value is null | The function throws if the value is null |
| It is recommended that you | We recommend you |

**When passive is acceptable:** When the actor is unknown, irrelevant, or
deliberately omitted (e.g., "The request was rejected" when the actor is the
system and that is obvious from context).

### Concrete Over Abstract

Abstract statements make readers do extra work to ground them in reality.

- **Name the thing.** "The component" → "the UserProfile component". "The
  method" → "`authenticate()`". "The file" → "`config/database.yml`".
- **Show, don't just tell.** Follow every rule or principle with a concrete
  example. "Avoid side effects" without an example is half an explanation.
- **Use examples for every non-obvious claim.** If a developer reading the
  docs for the first time might ask "what does that look like?", answer it
  immediately with an example.

### Structure for Scannability

Readers rarely read documentation linearly. They scan for the section they
need, then read that section carefully.

- **Lead with the most important information.** Inverted pyramid: conclusion
  first, supporting detail after. Put the "what" before the "how" before the
  "why" (unless the "why" motivates the "what").
- **Use headers to signal topic changes.** Every major topic shift warrants a
  header. Headers should be noun phrases or imperative verbs, not questions
  (questions force readers to parse them twice).
- **Use lists for parallel items.** Three or more parallel items belong in a
  list, not a comma-separated sentence. Lists are faster to scan than prose
  for enumeration.
- **Use tables for comparisons.** When comparing two or more things across
  the same attributes, a table conveys the comparison instantly. Prose
  comparisons require mental tabulation.
- **Use code blocks for anything technical.** Commands, file paths, code
  snippets, environment variable names — all of these belong in code blocks,
  not inline prose. This signals "copy this exactly" and enables syntax
  highlighting.

## Assessing Documentation Quality

When reviewing documentation, evaluate each piece against these dimensions:

### Accuracy

Is the documentation true? Stale documentation is worse than missing
documentation because it actively misleads.

- **Check against current code.** Do the examples still run? Do the APIs
  described still exist? Do the command flags shown still work?
- **Check against current behavior.** Does the documented behavior match what
  the system actually does?
- **Flag version drift.** If documentation references a version that is no
  longer current, flag it even if the behavior has not changed — the version
  reference creates unnecessary doubt.

### Completeness

Does the documentation cover everything the reader needs to succeed?

- **Happy path only?** Most documentation covers the success case. Assess
  whether failure cases, edge cases, and common mistakes are also covered.
- **Prerequisites stated?** If the reader must have X installed or configured
  before following the documentation, are those prerequisites stated upfront?
- **Missing context?** Does the reader need to understand adjacent concepts
  not explained here? Are those concepts linked or explained?

### Readability

Can a typical reader understand this in one pass?

- **Grade level.** Hold documentation to the same seventh-grade reading-level
  bar that governs authoring: short sentences, common words, no unexplained
  jargon. Long sentences, rare words, and deep nesting all increase cognitive
  load.
- **Consistent terminology.** If the same concept is called "user", "account",
  and "principal" in different parts of the documentation, readers will not
  know if these are synonyms. Pick one term and use it consistently.
- **Scannable structure.** Can a reader locate the answer to a specific
  question in under 30 seconds? If not, the structure needs improvement.

## Common Documentation Smells

These patterns reliably indicate documentation that needs improvement:

| Smell | Example | Fix |
|-------|---------|-----|
| Wall of text | Paragraph with 8+ sentences | Break into sections with headers |
| Missing example | "Call `authenticate()` with valid credentials" | Show actual call with real-looking inputs |
| Jargon without definition | "The PEP8-compliant token is serialized via JWT" | Define or link each term |
| Passive-everything | "An error is returned when..." | "The function returns an error when..." |
| Version-specific without version | "As of the latest release..." | "As of v2.3..." |
| "Simply" or "just" | "Simply run the migration" | Remove — implies ease the reader may not feel |
| Unexplained acronym | "Configure the IAM role for RBAC" | "Configure the IAM (Identity and Access Management) role for RBAC (Role-Based Access Control)" |

## Applying This to Reviews

When the technical-writer agent identifies documentation gaps or assesses
documentation quality, apply these principles:

1. **Classify by impact.** A readability issue in a tutorial affects all
   readers. An accuracy issue in a reference doc affects anyone who uses that
   feature. Weight your recommendations accordingly.

2. **Be specific about the failure mode.** "This is hard to read" is not
   actionable. "This paragraph uses passive voice in every sentence, which
   obscures who performs each action" is actionable.

3. **Suggest the direction, not the rewrite.** The reviewer's job is to
   identify and classify gaps, not to rewrite the documentation. Point to the
   principle being violated and what would satisfy it — leave the rewrite to
   the author.

4. **Acknowledge what works.** Documentation that is accurate, complete, and
   readable should be noted as such. Reviewers who only identify problems
   provide incomplete signal.

## Documentation-Gap Review Process

The technical-writer's procedure for reviewing a diff against existing
documentation:

1. **Read the diff.** Run `git diff HEAD~1` (or the appropriate range) to
   understand what changed.

2. **Inventory existing documentation.** Search for:
   - Project README files (`**/README*`)
   - Documentation directories (`docs/`, `doc/`)
   - Inline documentation (JSDoc, docstrings, type definitions)
   - API documentation (OpenAPI specs, route comments)
   - Configuration documentation (environment variable docs, setup guides)
   - Changelog or release notes

3. **Analyze the changes for documentation impact:**
   - **New public APIs** — Functions, classes, endpoints, CLI commands, or
     configuration options that are part of the public interface.
   - **Changed behavior** — Existing functionality that now works differently.
   - **Removed functionality** — Features, APIs, or options that no longer exist.
   - **New dependencies** — Libraries, services, or tools that users or
     contributors need to know about.
   - **Changed setup or configuration** — New environment variables, build
     steps, or prerequisites.

4. **Cross-reference.** For each change identified above, check whether
   existing documentation accurately reflects the new state. Look for:
   - Documentation that references removed code or old behavior
   - Code examples that no longer work
   - Setup instructions that are now incomplete
   - Type definitions or interfaces that changed but whose docs did not

## Doc-Change Classification

### REQUIRED

The documentation gap would cause users or contributors to fail. Examples:
- New public API with no documentation at all
- Setup instructions that are now incorrect
- Removed feature still documented as available
- New required environment variable not documented

### RECOMMENDED

The documentation gap could cause confusion but would not block usage. Examples:
- Complex feature that works but lacks usage examples
- Inline comments that are now stale
- Missing changelog entry for a notable change
- Type definitions that could benefit from JSDoc
