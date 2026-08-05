---
name: writing-prose
description: Prose quality methodology for writing and assessing documentation. Grounded in plain language and ASD-STE100 Simplified Technical English in two modes — strict for instruction text, STE-flavored for descriptive prose.
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
- **Use American spelling.** Write "color", not "colour", and "analyze",
  not "analyse". One spelling standard gives each word one form.

### Simplified Technical English (ASD-STE100)

Technical documentation must follow ASD-STE100 Simplified Technical English
(STE). STE removes ambiguity for every reader, including readers whose first
language is not English. The plain-language principles above are the
foundation. STE adds mechanical rules.

The delete-list idea, the two-mode split, and the self-lint structure come
from the "cure for AI slop" writing kit at
<https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop>.
The kit carries the MIT License, © 2026 Ege Çelebi. This file restates the
ideas in its own words.

#### Two modes

The rules run in one of two modes. The mode follows the text type, not the
document. One document can hold both.

- **Strict** governs instruction text: numbered steps, warnings, error
  messages, runbook commands.
- **STE-flavored** governs descriptive prose: design documents, ADRs, PRDs,
  changelog entries, commit bodies, review comments.

The modes differ in three ways only:

- **Sentence cap.** No more than 20 words in strict mode. No more than 25
  words in STE-flavored mode.
- **Form.** Strict requires the imperative, one instruction per sentence,
  and the condition before the command. STE-flavored permits declarative
  paragraphs.
- **Conditional mood.** Strict bans "would", "could", and "might" — a step
  is a command or a condition. STE-flavored permits "would" and "could"
  only to state a real alternative or consequence, never as a hedge.
  "Might" is banned in both modes: for a real possibility write "can", the
  same mapping the table below gives "may". Otherwise delete the hedge.

Three rule bullets below restate the strict Form delta: the imperative,
one instruction per sentence, and the condition before the command. They
bind instruction text only. Every other rule, every ban list, the
substitution table, and the self-lint apply identically in both modes.
When a consuming skill's format rule conflicts with a prose rule
(git-commit's 50-character subject, changelog's headings), the consuming
skill's format rule wins. This skill governs sentence-level prose only.

#### The mechanical rules

Each rule below shows the rejected form (Non-STE) and the fix (STE).

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
- **Do not stack auxiliaries.** A chain of helper verbs hides the action.
  Write one main verb.
  - Non-STE: *It would seem that the cache may serve to reduce the load
    time.* → STE: *The cache reduces the load time.*
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
| initiate, begin, commence | start |
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
| obtain, acquire | get |
| leverage | use |
| facilitate | help |
| demonstrate | show |
| additionally, furthermore, moreover | also |
| comprehensive | complete |
| numerous, myriad | many |
| regarding, concerning | about |
| whilst | while |
| amongst | among |
| spin up | start |
| reach out | contact |
| dive into | examine |
| kick off | start |
| tear down | remove |
| ramp up | increase |

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

#### Words and phrases to delete

These words and phrases add no meaning. Delete them. Do not replace them.

- **Marketing adjectives (alphabetical):** battle-tested, best-in-class,
  blazing-fast, cutting-edge, disruptive, effortless, enterprise-grade,
  game-changing, next-generation, powerful, revolutionary, robust,
  seamless, state-of-the-art, world-class.
- **Modal hedges:** "it is important to note", "it should be noted", "it is
  worth noting", "please note that", "as mentioned above".
- **Filler:** "in order to", "a variety of", "in the event that", "due to
  the fact that", "aforementioned", "henceforth".

A delete-list word survives in three places only:

- Verbatim quotes and cited external text. To quote is to report, not to
  author.
- Code, identifiers, and proper nouns (`spin_up()`, "Leverage API").
- Established terms of art, where the substitute changes the technical
  meaning ("robust statistics").

Evaluative prose gets no exemption. Delete the adjective and state the
measurable property instead: "the error handling is robust" becomes "the
error handling retries twice, then surfaces the error".

### Active Voice

Active voice connects the actor directly to the action. Passive voice hides who
is responsible and makes sentences longer.

| Passive | Active |
|---------|--------|
| The configuration is loaded by the server | The server loads the configuration |
| An error will be thrown if the value is null | The function throws if the value is null |
| It is recommended that you | We recommend you |

**When passive is acceptable:** when the actor is unknown, irrelevant, or
deliberately omitted. An example is "The request was rejected", where the
actor is the system and context makes that obvious.

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

## Self-lint

Run this checklist on any governed text before you finalize it. Each item
names one defect. Fix every hit before the text is final.

1. **Over-cap sentence** — a sentence over the mode's cap (20 words strict,
   25 STE-flavored). Split it.
2. **Semicolon** — replace it with a period and write two sentences.
3. **Contraction** — expand it ("do not", never "don't").
4. **Passive with a known actor** — make it active. Name the actor as the
   subject.
5. **Hidden action** — an "-ing" main verb, a nominalization ("make an
   assessment"), a phrasal verb the substitution table maps ("spin up"), or
   stacked auxiliaries. Write one plain verb.
6. **Two names for one thing** — pick one name and use it everywhere.
7. **Banned word** — a delete-list word or a substitution-table word. Delete
   the first kind. Replace the second.
8. **Conditional mood** — in strict mode, any "would", "could", or "might".
   In STE-flavored mode, "would" or "could" as a hedge, or any "might".
   State the fact, or write "can" for a real possibility.
9. **Empty closer** — a closing sentence that states no measurable property
   ("provides a solid foundation for..."). Delete it.

The self-lint applies to the text an author returns, never to quoted
counter-examples — this file's own Non-STE examples break the rules on
purpose. If a reviewer cites an item and the author disputes it, the
conventional-comments framework carries the disagreement.

## Mechanical score

A bundled script scores prose against the mechanical rules in this file, as
violations per 100 words. The script sits next to this file:

```bash
node "<skill-dir>/ste-lint.mjs" --breakdown --cap 25 "<file>"
```

Replace `<skill-dir>` with the absolute path of the directory that holds this
file. On Claude Code that path is `${CLAUDE_PLUGIN_ROOT}/skills/writing-prose`,
and the host sets that variable only for a skill loaded from an installed
plugin. Codex sets no equivalent variable, so give the literal directory
there. The script itself reads no environment variable. It reads only the
paths you pass to it, so it runs the same way on every host.

The default cap of 20 words scores instruction text (strict mode). Pass
`--cap 25` to score descriptive prose at the STE-flavored cap. The score is
a drift signal, not a gate. Nothing runs the script automatically. The
`## Self-lint` checklist above remains the check you run before governed
text is final.

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
  longer current, flag it even when the behavior has not changed. The stale
  version reference creates unnecessary doubt.

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
- **STE conformance.** Check prose against the ASD-STE100 rules above. Those
  rules cover the sentence caps (20 words strict, 25 STE-flavored), one
  instruction per sentence, imperative instructions, and simple tenses. They also cover one meaning
  per word and noun clusters of three words or fewer. Last, they cover the
  word substitutions in the STE table (utilize, ensure, perform, however,
  should). Hold instruction text to strict mode and descriptive prose to
  STE-flavored mode. The `Two modes` section above defines which text type
  takes which mode. Apply the mode per sentence, not per document. A
  rationale paragraph can embed one imperative instruction: hold that
  instruction to strict mode and the surrounding sentences to STE-flavored
  mode.
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
| Empty closer | "provides a solid foundation for..." | Delete, or state the measurable property |

## Reviewing Documentation

The technical-writer's review methodology lives in
`skills/reviewing-documentation/SKILL.md`. It applies these principles to
reviews. It carries the documentation-gap review process (inventory, impact
analysis, and cross-reference) and the REQUIRED/RECOMMENDED doc-change
classification. This skill stays the authoring bar: the prose you write, and
the rubric that review methodology applies when it assesses prose.
