# Unslop rules

Use these checks on prose you author. `unslop` owns pattern detection and
meaning preservation. `writing-prose` owns sentence mechanics such as plain
words, active voice, sentence length, filler, and consistent names.

## Claims must earn their place

- Remove a claim when the available evidence does not support it. A participle
  such as "ensuring" or "showcasing" does not prove an effect.
- Name the source of a claim. Replace "experts say" or "reports suggest" with
  a citation, or remove the attribution.
- Replace praise, importance claims, and generic conclusions with a fact,
  instruction, measurement, or cited decision.
- Keep real uncertainty. Do not make evidence sound stronger than it is.

## State facts directly

- Prefer `is`, `has`, or the concrete action over inflated substitutes.
- Remove contrast frames such as "not only X, but also Y" when two direct facts
  say the same thing.
- Do not force facts into groups of three. Use the number the subject requires.
- Use "from X to Y" only for actual endpoints on one scale. Otherwise name the
  topics separately.
- Replace supporting adverbs with a measured result or a precise verb.

## Name the concrete subject

- Remove stock AI vocabulary such as "seamless", "robust", "holistic", or
  "transformative" when it contributes no technical meaning.
- Replace vague metaphors with the file, function, service, boundary, action, or
  measured effect they hide.
- In particular, rewrite "center of gravity", "moves the needle", "surface
  area", "shape of the problem", "the right seam", "unlocks", and "tees up".
- Do not personify code or use an aphorism where a literal statement works.
- Keep one name for one concept. Do not rotate synonyms for variety.

## Format only for structure

- Use headings, lists, and bold text only when they express real hierarchy.
- Use sentence case for headings.
- Remove repeated bold-label-and-colon prefixes from list items.
- Keep a colon for a list or example, not as a dramatic sentence connector.
- Replace curly quotation marks with straight quotation marks in authored text.
- Remove decorative emoji.
- Avoid em dashes and imitation dashes. Split the sentence or use a comma when
  the relationship remains clear.

## Remove assistant mannerisms

- Start with the requested information. Remove greetings, congratulations,
  praise, and agreement that add no information.
- Remove offers for more help and statements about the act of answering.
- Remove canned openings and conclusions, rhetorical fragments, and repeated
  sentence templates.
- Keep the user's tone unless it conflicts with evidence or an exact contract.

## Decide whether a rewrite passes

A rewrite passes only when it removes the pattern and preserves the original
claim, evidence, normative force, uncertainty, and time relation. If a style
change would alter any of those, keep the original wording. Protected source
text stays byte-identical.

Inspired by Lauren Tan's [Cursor pstack unslop
skill](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md).
The categories, contracts, and wording above were authored for Team.
