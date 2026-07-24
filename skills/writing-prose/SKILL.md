---
name: writing-prose
description: Clear documentation and readable explanation methodology — loaded by technical-writer agent to write prose and to assess documentation quality, grounded in plain language, readability principles, and ASD-STE100 Simplified Technical English
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

### Simplified Technical English (ASD-STE100)

Technical documentation must follow ASD-STE100 Simplified Technical English
(STE). STE removes ambiguity for every reader, including readers whose first
language is not English. The plain-language principles above are the
foundation; STE adds mechanical rules. Each rule below shows the rejected
form (Non-STE) and the fix (STE).

- **Keep sentences short.** No more than 20 words in an instruction, no more
  than 25 words in a description. A number, an abbreviation, quoted text, or
  a hyphenated group counts as one word. Split a long sentence rather than
  compress it.
- **Write one instruction per sentence.** Combine actions in one sentence
  only when the reader must do them at the same time.
  - Non-STE: *Set the TEST switch to the middle position and release the
    SHORT-CIRCUIT TEST switch.* (two separate actions)
  - STE: *1. Set the TEST switch to the middle position. 2. Release the
    SHORT-CIRCUIT TEST switch.*
  - STE (simultaneous, so one sentence is correct): *Hold the panel in its
    open position and install the fastener.*
- **Use the imperative for instructions.**
  - Non-STE: *The test can be continued.* → STE: *Continue the test.*
  - Non-STE: *Oil and grease are to be removed with a degreasing agent.* →
    STE: *Remove oil and grease with a degreasing agent.*
- **Put the condition before the command, divided by a comma.**
  - Non-STE: *Set the switch to NORMAL when the light comes on.*
  - STE: *When the light comes on, set the switch to NORMAL.*
- **Use simple verb tenses only** — simple present, simple past, simple
  future, imperative, infinitive, and past participle as an adjective. No
  perfect or progressive tenses. Use an "-ing" form only inside a technical
  noun ("error handling", "logging").
  - Non-STE: *The operator has adjusted the linkage.* → STE: *The operator
    adjusted the linkage.*
  - Non-STE: *When you are doing this procedure, obey the safety
    precautions.* → STE: *When you do this procedure, obey the safety
    precautions.*
- **Use the active voice** (see Active Voice below). In description, passive
  is permitted only when the agent is unknown. Convert a passive by naming
  the agent as the subject, switching to the imperative, or using "you".
  - Non-STE: *These values are used by the computer to calculate the energy
    consumption.* → STE: *The computer calculates the energy consumption
    from these values.*
  - Non-STE: *The volume control can be adjusted.* → STE: *Adjust the volume
    control.* (procedure) or *You can adjust the volume control.*
    (description)
- **Give each word one meaning, and each thing one name.** Do not use
  synonyms for variety, and do not reuse a word outside its one meaning.
  - Non-STE: *Make sure that the servo control unit is open. Do the test of
    the actuator. Disconnect the control unit.* (three names, one component)
  - STE: pick *actuator* and use it in all three sentences.
- **Limit noun clusters to three words.** Break longer clusters apart with
  prepositions, or hyphenate the words that form one unit.
  - Non-STE: *Runway light connection resistance calibration*
  - STE: *Calibration of the resistance of the runway light connection*
- **Do not omit words to shorten a sentence.** Keep subjects, verbs, and
  articles. No contractions ("do not", never "don't").
  - Non-STE: *If installed, remove the shims.* → STE: *If shims are
    installed, remove them.*
  - Non-STE: *Rotary switch to INPUT.* → STE: *Set the rotary switch to
    INPUT.*
- **Use a vertical list for complex text.** End the lead-in with a colon and
  put one item per line. Never use a semicolon — write two sentences instead.
- **Keep paragraphs short.** No more than six sentences, one topic per
  paragraph, topic sentence first.
- **Put warnings and cautions before the step they protect.** Start with a
  command or condition, then state the risk.
  - STE: *WARNING: Disconnect the power before you open the panel. The
    terminals carry line voltage and can cause injury.*

#### STE word substitutions

STE approves about 900 general words, each with one meaning. These
substitutions cover the non-approved words that appear most often in
software documentation:

| Instead of | Write |
|------------|-------|
| utilize | use |
| ensure, verify, confirm | make sure that |
| perform, execute, carry out, implement | do |
| initiate | start |
| terminate | stop |
| prior to | before |
| via | through |
| however | but |
| therefore | thus, as a result |
| should, shall | must |
| may | can |
| enable X to | let X |
| appropriate, suitable | applicable, correct |
| required | necessary |
| provide | give, supply |
| additional | more |
| the following steps | these steps, the steps that follow |
| whether | if |
| various | different |
| significant | important |
| maintain (a state) | keep, hold |
| trigger | cause, start |
| persist (of an error) | continue |
| modify | change |
| obtain | get |

Examples from the STE dictionary itself:

- Non-STE: *The software utilizes caching techniques to decrease data
  retrieval times.* → STE: *The software uses caching techniques to decrease
  data retrieval times.*
- Non-STE: *Functionally test the software.* → STE: *Do a functional test of
  the software.*
- Non-STE: *The database is already synchronizing.* → STE: *The database
  synchronization is in progress.*

Restricted meanings that writers commonly get wrong:

- *check* is approved only as a noun: "do a check of the logs", never
  "check the logs".
- *follow* means only "come after": "obey the instructions", not "follow
  the instructions".
- *select* means choose from alternatives ("select a language from the
  menu"); *set* means put a control in a state ("set the flag to TEST").
- *since* is approved for time only; for causation write *because*.
- *or* never means "otherwise". Write a separate sentence: "Make sure that
  the seal stays bonded. If it does not, a leak can occur."
- *monitor* means to check something over a period of time for change — not
  a generic "watch" or "track".

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
- **STE conformance.** Check prose against the ASD-STE100 rules above:
  sentence-length limits, one instruction per sentence, imperative
  instructions, simple tenses, one meaning per word, noun clusters of three
  words or fewer, and the word substitutions in the STE table (utilize,
  ensure, perform, however, should).
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

## Reviewing Documentation

The technical-writer's review methodology — applying these principles to
reviews, the documentation-gap review process (inventory, impact
analysis, cross-reference), and the REQUIRED/RECOMMENDED doc-change
classification — lives in `skills/reviewing-documentation/SKILL.md`.
This skill stays the authoring bar: the prose you write, and the rubric
that review methodology applies when it assesses prose.
