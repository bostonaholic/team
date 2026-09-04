# Writing Prose Style Guide

The authoring bar for documentation, and the rubric a reviewer holds prose to.

## Plain language

- **Write at a seventh-grade reading level.** Short sentences, common words,
  no unexplained jargon.
- **Define terms at first use.** Every acronym, domain term, or jargon word is
  defined or linked when it first appears.
- **One idea per sentence.**
- **Avoid nominalizations.** "Make a decision" → "decide". They hide the actor
  and the action.
- **Use American spelling.** "color", not "colour"; "analyze", not "analyse".

## Simplified Technical English (ASD-STE100)

STE removes ambiguity for every reader, including readers whose first language
is not English. Plain language above is the foundation; STE adds mechanical
rules.

The delete-list idea, the two-mode split, and the self-lint structure come
from the "cure for AI slop" writing kit at
<https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop>.
The kit carries the MIT License, © 2026 Ege Çelebi. This file restates the
ideas in its own words.

### Two modes

The mode follows the text type, not the document. One document can hold both.

- **Strict** governs instruction text: numbered steps, warnings, error
  messages, runbook commands.
- **STE-flavored** governs descriptive prose: design documents, ADRs, PRDs,
  changelog entries, commit bodies, review comments.

They differ in three ways only:

- **Sentence cap.** 20 words strict, 25 STE-flavored.
- **Form.** Strict requires the imperative, one instruction per sentence, and
  the condition before the command. STE-flavored permits declarative
  paragraphs.
- **Conditional mood.** Strict bans "would", "could", and "might". STE-flavored
  permits "would" and "could" only to state a real alternative or consequence,
  never as a hedge. "Might" is banned in both: for a real possibility write
  "can". Otherwise delete the hedge.

Apply the mode **per sentence, not per document** — a rationale paragraph can
embed one imperative instruction, which takes strict mode while the sentences
around it take STE-flavored. Every other rule below binds both modes. When a
consuming skill's format rule conflicts with a prose rule (git-commit's
50-character subject, changelog's headings), the consuming skill wins. This
skill governs sentence-level prose only.

### The mechanical rules

Each rule shows the rejected form (Non-STE) and the fix (STE).

- **Keep sentences short.** A number, an abbreviation, quoted text, or a
  hyphenated group counts as one word. Split a long sentence rather than
  compress it.
- **Write one instruction per sentence.** Combine actions only when the reader
  must do them at the same time.
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
- **Use simple verb tenses only** — simple present, simple past, simple future,
  imperative, infinitive, and past participle as an adjective. No perfect or
  progressive tenses. Use an "-ing" form only inside a technical noun ("error
  handling", "logging").
  - Non-STE: *The operator has adjusted the linkage.* → STE: *The operator
    adjusted the linkage.*
- **Do not stack auxiliaries.**
  - Non-STE: *It would seem that the cache may serve to reduce the load time.*
    → STE: *The cache reduces the load time.*
- **Use the active voice.** Passive is permitted only when the actor is
  unknown, irrelevant, or deliberately omitted ("The request was rejected").
  Convert a passive by naming the actor as the subject, switching to the
  imperative, or using "you".
  - Non-STE: *These values are used by the computer to calculate the energy
    consumption.* → STE: *The computer calculates the energy consumption from
    these values.*
  - Non-STE: *The volume control can be adjusted.* → STE: *Adjust the volume
    control.* (procedure) or *You can adjust the volume control.* (description)
- **Give each word one meaning, and each thing one name.** No synonyms for
  variety.
  - Non-STE: *Make sure that the servo control unit is open. Do the test of
    the actuator. Disconnect the control unit.* (three names, one component)
  - STE: pick *actuator* and use it in all three sentences.
- **Limit noun clusters to three words.**
  - Non-STE: *Runway light connection resistance calibration*
  - STE: *Calibration of the resistance of the runway light connection*
- **Do not omit words to shorten a sentence.** Keep subjects, verbs, and
  articles. No contractions.
  - Non-STE: *If installed, remove the shims.* → STE: *If shims are installed,
    remove them.*
  - Non-STE: *Rotary switch to INPUT.* → STE: *Set the rotary switch to INPUT.*
- **Use a vertical list for complex text.** End the lead-in with a colon, one
  item per line. Never a semicolon — write two sentences.
- **Keep paragraphs short.** No more than six sentences, one topic each, topic
  sentence first.
- **Put warnings and cautions before the step they protect.**
  - STE: *WARNING: Disconnect the power before you open the panel. The
    terminals carry line voltage and can cause injury.*
- **Name the thing.** "The component" → "the UserProfile component". "The
  file" → "`config/database.yml`". Put commands, paths, and identifiers in
  code blocks.

### STE word substitutions

STE approves about 900 general words, each with one meaning. These cover the
non-approved words that appear most often in software documentation:

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

Restricted meanings writers commonly get wrong:

- *check* is approved only as a noun: "do a check of the logs", never "check
  the logs".
- *follow* means only "come after": "obey the instructions".
- *select* means choose from alternatives; *set* means put a control in a
  state ("set the flag to TEST").
- *since* is approved for time only; for causation write *because*.
- *or* never means "otherwise". Write a separate sentence.
- *monitor* means to check something over a period of time for change.

### Words and phrases to delete

These add no meaning. Delete them. Do not replace them.

- **Marketing adjectives:** battle-tested, best-in-class, blazing-fast,
  cutting-edge, disruptive, effortless, enterprise-grade, game-changing,
  next-generation, powerful, revolutionary, robust, seamless,
  state-of-the-art, world-class.
- **Modal hedges:** "it is important to note", "it should be noted", "it is
  worth noting", "please note that", "as mentioned above".
- **Filler:** "in order to", "a variety of", "in the event that", "due to the
  fact that", "aforementioned", "henceforth".
- **False ease:** "simply", "just", "of course", "obviously" — they imply an
  ease the reader may not feel.

A delete-list word survives in three places only: verbatim quotes and cited
external text; code, identifiers, and proper nouns (`spin_up()`, "Leverage
API"); and established terms of art where the substitute changes the technical
meaning ("robust statistics").

Evaluative prose gets no exemption. Delete the adjective and state the
measurable property: "the error handling is robust" becomes "the error
handling retries twice, then surfaces the error".

## Self-lint

Run this on any governed text before you finalize it. Each item names one
defect. Fix every hit.

1. **Over-cap sentence** — over the mode's cap (20 strict, 25 STE-flavored).
   Split it.
2. **Semicolon** — replace with a period and two sentences.
3. **Contraction** — expand it.
4. **Passive with a known actor** — name the actor as the subject.
5. **Hidden action** — an "-ing" main verb, a nominalization, a phrasal verb
   the substitution table maps, or stacked auxiliaries. Write one plain verb.
6. **Two names for one thing** — pick one and use it everywhere.
7. **Banned word** — a delete-list word or a substitution-table word. Delete
   the first kind. Replace the second.
8. **Conditional mood** — in strict mode, any "would", "could", or "might". In
   STE-flavored mode, "would" or "could" as a hedge, or any "might".
9. **Empty closer** — a closing sentence that states no measurable property
   ("provides a solid foundation for..."). Delete it.

The self-lint applies to the text an author returns, never to quoted
counter-examples — this file's own Non-STE examples break the rules on
purpose. If a reviewer cites an item and the author disputes it, the
conventional-comments framework carries the disagreement.

## Mechanical score

A bundled script scores prose against the mechanical rules, as violations per
100 words:

```bash
node "<skill-dir>/ste-lint.mjs" --breakdown --cap 25 "<file>"
```

Replace `<skill-dir>` with the absolute path of the directory holding this
file. On Claude Code that is `${CLAUDE_PLUGIN_ROOT}/skills/writing-prose`, and
the host sets that variable only for a skill loaded from an installed plugin.
Codex sets no equivalent variable, so give the literal directory there. The
script reads no environment variable — only the paths you pass it.

The default cap of 20 scores instruction text; `--cap 25` scores descriptive
prose. The score is a drift signal, not a gate. Nothing runs it automatically.
`## Self-lint` remains the check you run before governed text is final.

## Assessing documentation quality

When reviewing documentation, evaluate three dimensions:

- **Accuracy.** Stale documentation is worse than missing documentation
  because it actively misleads. Do the examples still run? Do the APIs and
  flags still exist? Does documented behavior match actual behavior? Flag a
  stale version reference even when behavior has not changed — and flag
  "as of the latest release" wording, which names no version at all.
- **Completeness.** Most documentation covers only the happy path. Assess
  whether failure cases, edge cases, and common mistakes are covered, whether
  prerequisites are stated upfront, and whether adjacent concepts the reader
  needs are linked or explained.
- **Readability.** Hold prose to the rules above — strict mode for instruction
  text, STE-flavored for descriptive prose, applied per sentence. Check that
  one concept carries one name throughout, and that a reader can locate the
  answer to a specific question in under 30 seconds.

The technical-writer's review methodology lives in
`skills/reviewing-documentation/SKILL.md`. It applies these principles to
reviews and carries the documentation-gap review process and the
REQUIRED/RECOMMENDED doc-change classification. This skill stays the authoring
bar.
