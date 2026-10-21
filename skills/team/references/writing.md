# Writing Standards

The prose bar for every artifact and finding. Read this file before
finalizing any prose you author.

## Protect exact text first

Keep source material byte-identical: user text, quotes, vendor output, code,
identifiers, commands, flags, numbers, frontmatter, schemas, parser tokens,
and templates.

## Preserve meaning

Protect normative `must`, `shall`, and `should`, `may` when it grants
permission or states possibility, and real uncertainty carried by `may`,
`might`, or `could`. Preserve progressive and perfect tense when they encode
current activity, completion, duration, or event order. Change these forms
only when the claim keeps the same meaning.

Precedence: exact-text contracts, then this semantic guard, then style edits.
A consuming skill's format contract wins over the modes and busy-reader rules,
never over this semantic guard. The STE substitution table is a
style edit and never overrides this guard.

## Compose prose methods in this order

1. Classify protected text in the untouched draft.
2. Record each rule match by affected claim. Resolve each against the
   original claim and evidence; a style or grammar edit does not resolve an
   unsupported claim.
3. Apply style rules only to unprotected prose, then rescan for every pattern.

## Self-audit (meaning)

A rewrite passes only when it removes the pattern, every recorded match got a
substantive resolution, each claim keeps its evidence, tone, normative force,
uncertainty, and time relation, and every protected span is byte-identical.
Otherwise keep the original wording.

## Rules

- **Claims earn their place.** Remove claims the evidence does not support; a
  participle such as "ensuring" does not prove an effect. Name the source or
  drop the attribution ("experts say"). Replace praise, importance claims,
  and generic conclusions with a fact, measurement, or cited decision.
- **State facts directly.** No "not only X, but also Y" frames, forced groups
  of three, "from X to Y" without real endpoints, or adverbs in place of a
  measured result.
- **Name the concrete subject.** Replace stock AI vocabulary and vague
  metaphors ("center of gravity", "moves the needle", "surface area", "shape
  of the problem", "the right seam", "unlocks", "tees up") with the file,
  function, boundary, action, or measured effect. Do not personify code.
- **Format only for structure.** Headings, lists, and bold only for real
  hierarchy. Sentence-case headings. No repeated bold-label-and-colon list
  prefixes, dramatic colons, curly quotes, decorative emoji, or em dashes and
  imitation dashes.
- **No assistant mannerisms** (greetings, praise, offers of more help, canned
  openings and closers, rhetorical fragments, repeated sentence templates,
  statements about the act of answering). Keep the user's tone unless it
  conflicts with evidence or an exact contract.
- **Remove incidentals.** Delete background, caveats, and history that do not
  change the reader's decision, narration of your search, and restatement.
  When the reader asked for history or rationale, it is the subject.

## One busy reader

Applies to any text that asks a reader to decide or act: a PR description,
design summary, changelog entry, review comment, or status report. When a
brief requires the verdict as the terminal line, keep the supporting detail
above it.

- Lead with the recommendation, finding, or request in the first sentence.
- A PR title states the change, not the area it touches.
- Close with the action, the owner, and the date.
- Delete sentences that describe the document instead of the subject.
- Write to a person ("you", "we"). Be specific. Take a stand.
- Keep it to one page; a longer document opens with a standalone summary.

## Plain language

Write at a seventh-grade reading level. Define acronyms at first use. One idea
per sentence; prefer a plain verb to a nominalization. Use American spelling.

### No unexplained specialist terms

Replace a field-specific term the reader may not know with plain language, or
define it at first use. When the term controls an action or decision, its
definition states what the reader does, which inputs or sources they may use,
and what condition passes or fails; a link cannot replace that definition.
Keep an established technical term when its first use gives the reader enough
to act and judge the result.

## Two modes

Choose per sentence:

- **Strict:** instructions, numbered steps, warnings, errors, and runbook
  commands. Cap at 20 words. Use imperative form, one instruction per sentence,
  and condition before command. Ban `would`, `could`, and `might`.
- **STE-flavored:** design documents, ADRs, PRDs, changelogs, commit bodies, and
  review comments. Cap at 25 words. Declarative prose is allowed. Use `would`
  or `could` only for an actual alternative or consequence. Ban `might`.

## Simplified Technical English (ASD-STE100)

Credit: the delete-list idea, the two-mode split, and the self-lint structure
come from the MIT-licensed "cure for AI slop" kit
(<https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop>,
© 2026 Ege Çelebi), restated in Team's own words.

### The mechanical rules

- Simple tenses only (present, past, future, imperative, infinitive, past
  participle as adjective). "-ing" only inside a technical noun ("error
  handling").
- Active voice. Passive only when the actor is unknown, irrelevant, or
  deliberately omitted. No stacked auxiliaries.
- Condition first, divided by a comma. Combine actions only when the reader
  must do them at the same time.
- One meaning per word, one name per thing. Noun clusters of three words or
  fewer.
- Keep subjects, verbs, and articles. No contractions. No semicolons; write
  two sentences or a vertical list.
- Paragraphs of six sentences or fewer, one topic each, topic sentence first.
- Warnings and cautions before the step they protect.
- Name the thing; put commands, paths, and identifiers in code.

### STE word substitutions

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

Modals (`must`, `shall`, `should`, `may`, `might`, `could`) are governed by
[Preserve meaning](#preserve-meaning), never by this table.

Restricted meanings: *check* is a noun only ("do a check of the logs");
*follow* means only "come after" (write "obey the instructions"); *select*
means choose from alternatives, *set* means put a control in a state; *since*
is for time only (causation is *because*); *or* never means "otherwise";
*monitor* means to check over a period of time for change.

### Words and phrases to delete

Delete these. Do not replace them.

- **Marketing adjectives:** battle-tested, best-in-class, blazing-fast,
  cutting-edge, disruptive, effortless, enterprise-grade, game-changing,
  next-generation, powerful, revolutionary, robust, seamless,
  state-of-the-art, world-class.
- **Modal hedges:** "it is important to note", "it should be noted", "it is
  worth noting", "please note that", "as mentioned above".
- **Filler:** "in order to", "a variety of", "in the event that", "due to the
  fact that", "aforementioned", "henceforth".
- **False ease:** "simply", "just", "of course", "obviously".

A delete-list word survives only in verbatim quotes and cited external text;
code, identifiers, and proper nouns (`spin_up()`, "Leverage API"); and terms
of art where the substitute changes the meaning ("robust statistics").
Evaluative prose gets no exemption: "the error handling is robust" becomes
"the error handling retries twice, then surfaces the error".

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
   appear in the first paragraph;
10. unexplained specialist term, including a term that controls an action or
    decision but omits the action, allowed inputs or sources, or pass-or-fail
    condition.

Do not self-lint quoted counter-examples. Review disagreements use the
[finding format](references/findings.md).

## Mechanical score

A bundled script scores prose against the mechanical rules, as violations per
100 words:

```bash
node "<skill-dir>/ste-lint.mjs" --breakdown --cap 25 "<file>"
```

`<skill-dir>` is the absolute directory holding `ste-lint.mjs`: on Claude Code,
`${CLAUDE_PLUGIN_ROOT}/skills/team/references`; elsewhere, the literal
directory. Omit `--cap 25` (default 20) to score instruction text. The score
is a drift signal, not a gate; `## Self-lint` remains the final check.

## Assessing documentation quality

- **Accuracy.** Do examples run, do APIs and flags exist, does documented
  behavior match? Flag a stale version reference even when behavior is
  unchanged, and flag "as of the latest release" wording.
- **Completeness.** Failure cases, edge cases, common mistakes, upfront
  prerequisites, and links to needed adjacent concepts.
- **Readability.** The rules above. A reader finds the answer to a specific
  question in under 30 seconds.

For documentation-gap review and `REQUIRED`/`RECOMMENDED` classification, read
`references/documentation-reviewer.md`.

Detection categories inspired by Lauren Tan's [Cursor pstack unslop
skill](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md).
