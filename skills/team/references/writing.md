# Writing Standards

The authoring procedure and prose bar for every artifact and finding. Read this
file before finalizing any prose you author. Apply exact-text and meaning
protection before prose style.

## Protect exact text first

Do not rewrite source material: user text, quotes, vendor output, code,
identifiers, commands, flags, numbers, frontmatter, schemas, parser tokens, or
templates. Use source material as evidence, but keep its bytes unchanged.

## Preserve meaning

Protect normative `must`, `shall`, and `should`. Protect `may` when it grants
permission or states possibility. Preserve real uncertainty carried by `may`,
`might`, or `could`. Preserve progressive and perfect tense when they encode
current activity, completion, duration, or event order. Change these forms only
when the resulting claim has the same meaning.

Exact-text contracts take first precedence. This semantic guard takes second.
Style edits take third.

## Compose prose methods in this order

1. Save the untouched authored draft and classify protected text.
2. Scan that draft for each distinct rule below. Record a checklist by rule and
   affected claim. Zero initial matches make an empty checklist.
3. Apply style rules only to unprotected prose. A recorded checklist item
   cannot be erased, hidden, or closed by its edits.
4. Resolve each recorded item against the original claim and evidence. A
   grammar-only change does not resolve an unsupported claim.
5. Then rescan the composed result for every distinct pattern.
6. Run the self-audit and fix each remaining issue.

## Self-audit (meaning)

- Does each claim retain its evidence, tone, normative force, uncertainty, and
  time relation?
- Did every recorded match receive a substantive resolution?
- Did the rescan find no unresolved owned pattern?
- Is every protected source span byte-identical?

## Rules

Use these checks on prose you author. Pattern detection and meaning
preservation come first; sentence mechanics such as plain words, active voice,
sentence length, filler, and consistent names follow.

### Claims must earn their place

- Remove a claim when the available evidence does not support it. A participle
  such as "ensuring" or "showcasing" does not prove an effect.
- Name the source of a claim. Replace "experts say" or "reports suggest" with
  a citation, or remove the attribution.
- Replace praise, importance claims, and generic conclusions with a fact,
  instruction, measurement, or cited decision.
- Keep real uncertainty. Do not make evidence sound stronger than it is.

### State facts directly

- Prefer `is`, `has`, or the concrete action over inflated substitutes.
- Remove contrast frames such as "not only X, but also Y" when two direct facts
  say the same thing.
- Do not force facts into groups of three. Use the number the subject requires.
- Use "from X to Y" only for actual endpoints on one scale. Otherwise name the
  topics separately.
- Replace supporting adverbs with a measured result or a precise verb.

### Name the concrete subject

- Remove stock AI vocabulary such as "seamless", "robust", "holistic", or
  "transformative" when it contributes no technical meaning.
- Replace vague metaphors with the file, function, service, boundary, action, or
  measured effect they hide.
- In particular, rewrite "center of gravity", "moves the needle", "surface
  area", "shape of the problem", "the right seam", "unlocks", and "tees up".
- Do not personify code or use an aphorism where a literal statement works.
- Keep one name for one concept. Do not rotate synonyms for variety.

### Format only for structure

- Use headings, lists, and bold text only when they express real hierarchy.
- Use sentence case for headings.
- Remove repeated bold-label-and-colon prefixes from list items.
- Keep a colon for a list or example, not as a dramatic sentence connector.
- Replace curly quotation marks with straight quotation marks in authored text.
- Remove decorative emoji.
- Avoid em dashes and imitation dashes. Split the sentence or use a comma when
  the relationship remains clear.

### Remove assistant mannerisms

- Start with the requested information. Remove greetings, congratulations,
  praise, and agreement that add no information.
- Remove offers for more help and statements about the act of answering.
- Remove canned openings and conclusions, rhetorical fragments, and repeated
  sentence templates.
- Keep the user's tone unless it conflicts with evidence or an exact contract.

### Decide whether a rewrite passes

A rewrite passes only when it removes the pattern and preserves the original
claim, evidence, normative force, uncertainty, and time relation. If a style
change would alter any of those, keep the original wording. Protected source
text stays byte-identical.

## One busy reader

The rules that follow govern sentences. This one governs the whole document.

Kenneth Roman and Joel Raphaelson wrote *Writing That Works: How to Communicate
Effectively in Business* about memos and proposals. A pull request description
is the same job: one busy reader, one decision, no time. So are a design
summary, a changelog entry, a review comment, and a status report. Apply these
rules to any text that asks a reader to decide or act.

- **Lead with the recommendation.** Put the recommendation, the finding, or the
  request in the first sentence. Support follows it. A reader who stops after
  the first paragraph must still know what you want.
- **Make the title say something.** A PR title states the change, not the area
  it touches.
- **Name the action, the owner, and the date.** Close with what the reader does
  next. A document that asks for nothing gets nothing.
- **Cut the throat-clearing.** Delete "The purpose of this document is to" and
  every other sentence that describes the document instead of the subject.
- **Write to a person.** Use "you" and "we". Answer the reader's question: what
  does this change for me?
- **Be specific.** Give the number, the date, the file, or the measurement. A
  generality is a claim the reader cannot check.
- **Take a stand.** State the recommendation you hold. A hedge hands the
  decision back to the reader.
- **Keep it to one page.** A longer document opens with a summary that stands
  alone. Headings and lists carry the rest.
- **Read it aloud before you send it.** Rewrite each sentence you cannot say
  out loud.

## Plain language

- **Write at a seventh-grade reading level.** Short sentences, common words,
  no unexplained jargon.
- **Define terms at first use.** Every acronym, domain term, or jargon word is
  defined or linked when it first appears.
- **One idea per sentence.** Prefer one plain verb to a nominalization.
- **Use American spelling.** "color", not "colour"; "analyze", not "analyse".
- Use one consistent name for each thing.

## Two modes

Choose per sentence:

- **Strict:** instructions, numbered steps, warnings, errors, and runbook
  commands. Cap at 20 words. Use imperative form, one instruction per sentence,
  and condition before command. Ban `would`, `could`, and `might`.
- **STE-flavored:** design documents, ADRs, PRDs, changelogs, commit bodies, and
  review comments. Cap at 25 words. Declarative prose is allowed. Use `would`
  or `could` only for an actual alternative or consequence. Ban `might`.

A consuming skill's format contract wins. These modes govern sentence prose.

## Simplified Technical English (ASD-STE100)

STE removes ambiguity for every reader, including readers whose first language
is not English. Plain language above is the foundation; STE adds mechanical
rules.

The delete-list idea, the two-mode split, and the self-lint structure come
from the "cure for AI slop" writing kit at
<https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop>.
The kit carries the MIT License, © 2026 Ege Çelebi. This file restates the
ideas in its own words.

### The mechanical rules

- **Use simple verb tenses only** — simple present, simple past, simple future,
  imperative, infinitive, and past participle as an adjective. No perfect or
  progressive tenses. Use an "-ing" form only inside a technical noun ("error
  handling", "logging").
- **Use the active voice.** Passive is permitted only when the actor is
  unknown, irrelevant, or deliberately omitted ("The request was rejected").
- **Do not stack auxiliaries.**
- **Write one instruction per sentence.** Combine actions only when the reader
  must do them at the same time.
- **Use the imperative for instructions.**
- **Put the condition before the command, divided by a comma.**
- **Give each word one meaning, and each thing one name.** No synonyms for
  variety.
- **Limit noun clusters to three words.**
- **Do not omit words to shorten a sentence.** Keep subjects, verbs, and
  articles. No contractions.
- **Use a vertical list for complex text.** End the lead-in with a colon, one
  item per line. Never a semicolon — write two sentences.
- **Keep paragraphs short.** No more than six sentences, one topic each, topic
  sentence first.
- **Put warnings and cautions before the step they protect.**
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

Before returning text, fix every:

1. sentence over its mode cap;
2. semicolon or contraction;
3. passive construction with a known actor;
4. hidden action or stacked auxiliary;
5. second name for one thing;
6. banned or substitution-table word;
7. disallowed conditional mood;
8. closer with no measurable fact;
9. buried point — the recommendation, the finding, or the request does not
   appear in the first paragraph.

Do not self-lint quoted counter-examples. Review disagreements use the
[finding format](../code-review/references/findings.md).

## Mechanical score

A bundled script scores prose against the mechanical rules, as violations per
100 words:

```bash
node "<skill-dir>/ste-lint.mjs" --breakdown --cap 25 "<file>"
```

Replace `<skill-dir>` with the absolute path of the directory holding
`ste-lint.mjs`. On Claude Code that is
`${CLAUDE_PLUGIN_ROOT}/skills/team/references`, and the host sets that
variable only for a skill loaded from an installed plugin. Codex sets no
equivalent variable, so give the literal directory there. The script reads no
environment variable — only the paths you pass it.

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

For documentation-gap review and `REQUIRED`/`RECOMMENDED` classification, read
`../code-review/references/documentation-reviewer.md`.

The detection categories above are inspired by Lauren Tan's [Cursor pstack
unslop
skill](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md).
The categories, contracts, and wording were authored for Team.
