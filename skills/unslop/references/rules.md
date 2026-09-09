# Unslop rules

Adapted from the Cursor pstack `unslop` skill under the MIT License. Primary
source checked 2026-09-09:
https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/unslop/SKILL.md

Each upstream rule has one Team owner. `writing-prose` owns a rule when its
existing style guide already defines the rewrite. `unslop` owns the remaining
AI-writing pattern.

| ID | Owner | Meaning key | Team adaptation |
|---:|---|---|---|
| 3 | `unslop` | `superficial-ing` | Detect highlighting ensuring reflecting showcasing fostering, then delete unsupported claims. Expand supported claims with concrete facts and real cited sources. |
| 5 | `unslop` | `vague-attribution` | Detect “Experts believe”, “Industry reports suggest”, and “Some critics argue”. Name the source or delete the claim. |
| 7 | `unslop` | `ai-vocabulary` | Detect additionally crucial delve enduring enhance fostering garner interplay intricate landscape pivotal showcase tapestry testament underscore vibrant. Apply `landscape` and `tapestry` only when abstract. Rewrite plainly, except delegate `additionally` to `writing-prose`. |
| 8 | `unslop` | `fancy-is` | Replace “serves as”, “stands as”, “boasts”, and “features” with `is` or `has`. |
| 9 | `unslop` | `not-just-x-but-y` | Replace “not just X, but Y” framing with the factual relationship. |
| 10 | `unslop` | `rule-of-three` | Remove forced three-part groups. Use the natural number of distinct facts. |
| 11 | `writing-prose` | `synonym-cycling` | Do not cycle through “protagonist”, “main character”, “central figure”, and “hero”. Pick one name and repeat it. |
| 12 | `unslop` | `false-ranges` | Replace “from X to Y” when X and Y are not endpoints on one scale. List the topics directly. |
| 13 | `unslop` | `em-dash` | Avoid every em dash. Use a period or comma. Do not use parentheses, an en dash, or a hyphen as a dash substitute. |
| 14 | `unslop` | `colon` | Keep colons before lists or examples. Remove mid-sentence connector colons and comparison framing so the point stands alone. |
| 15 | `unslop` | `boldface` | Do not bold every proper noun or acronym. Keep bold only when it encodes document structure. |
| 16 | `unslop` | `inline-header-lists` | Convert a bold label and colon that restates its line to prose. A bold lead-in that ends in a period, names the item, and adds new detail is allowed. |
| 17 | `unslop` | `title-case-headings` | Use sentence case for headings. |
| 18 | `unslop` | `decorative-emoji` | Remove decorative emoji from headings and bullets. |
| 19 | `unslop` | `curly-quotes` | Use straight quotes instead of curly quotes. |
| 20 | `unslop` | `chatbot-phrases` | Remove “I hope this helps!”, “Let me know if...”, “Of course!”, “Certainly!”, and “Found the smoking gun!” |
| 22 | `unslop` | `sycophancy` | Remove “Great question!” and “You're absolutely right!” Respond directly. |
| 23 | `writing-prose` | `filler` | Replace “In order to” with “To” and “Due to the fact that” with “Because”. Delete “It is important to note that”. |
| 24 | `writing-prose` | `excessive-hedging` | Replace “could potentially possibly be argued that it might” with “may”. Retain one modal when it carries real uncertainty. |
| 25 | `writing-prose` | `generic-conclusions` | Delete “The future looks bright.” State specific plans or facts. |
| 26 | `unslop` | `abstract-metaphor-nouns` | Detect every term below. Use the named replacement when it fits. Otherwise name the concrete system, action, or effect. |
| 27 | `writing-prose` | `mechanism-fact-not-feeling` | Replace feelings with an instruction, fact, mechanism, or number. Cut prose that could appear unchanged in another project's docs. |
| 28 | `writing-prose` | `dense-sentences` | If a reader must backtrack, split the sentence or drop clauses. Keep one idea per sentence. |
| 29 | `writing-prose` | `active-voice` | Detect `is`, `are`, `was`, or `were` plus a past participle and name the actor. Keep passive voice only when the actor is unknown or irrelevant. |
| 30 | `unslop` | `cut-adverbs-stronger-verb` | Replace “runs quickly” with “is fast” or a number. Replace “significantly improves” with the measured delta. Replace weak verbs instead of supporting them with adverbs. |
| 31 | `writing-prose` | `plain-word` | Replace “utilize” and “leverage” with “use”, “facilitate” with “help”, “numerous” with “many”, and “in the event that” with “if”. |
| 32 | `unslop` | `mannered-prose` | Remove aphorisms, rhetorical fragments, personified code, figurative verbs, and stock framing phrases. Replace “a dial worth turning” with “a parameter worth varying”. Rule 26 owns metaphor nouns. |
| 33 | `writing-prose` | `over-compression` | Restore subjects, verbs, articles, and connective words. Replace “Parser rejects bad date → exit 2, no write” with a complete sentence. Spell out arrows and abbreviations. |

## Rule 26 terms and replacements

Detection terms: substrate, wedge, vector, locus, vantage, nexus, primitive as
a noun, harness as a metaphor, surface in “API surface”, bedrock, scaffolding as
a metaphor, modality, paradigm, gold-plating, ratchet as a metaphor, evacuate
for moving code, endgame, north star, and flywheel.

| Term | Named replacement |
|---|---|
| `substrate` | `base` |
| `wedge in` | `add` |
| `vector` | `way` or `method` |
| `gold-plating` | `more than the job needs` |
| `ratchet` | The mechanism's real name or `a limit that only tightens` |
| `evacuate` | `move out` |
| `endgame` | `the last phase` |

## Semantic guard

Rule 24 may simplify stacked hedges but retains one word that carries the
original uncertainty. `May` can become `can` only when it states capability.
Simple tense can replace progressive or perfect tense only when both forms keep
the same time relation. These constraints also govern every `unslop` rewrite.
