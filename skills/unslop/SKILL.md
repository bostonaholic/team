---
name: unslop
description: 'Removes AI-writing patterns while preserving meaning, tone, evidence, and exact contracts.'
user-invocable: false
---

# Unslop

Apply this method only to prose you author. Read
[references/rules.md](references/rules.md) before finalizing it.

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

## Compose prose methods in this order

1. Save the untouched authored draft and classify protected text.
2. Scan that draft for each distinct rule in the reference. Record a checklist
   by rule and affected claim. Zero initial matches make an empty checklist.
3. Apply `writing-prose` only to unprotected prose. A recorded checklist item
   cannot be erased, hidden, or closed by its edits.
4. Resolve each recorded item against the original claim and evidence. A
   grammar-only change does not resolve an unsupported claim.
5. Then rescan the composed result for every distinct pattern.
6. Run the self-audit and fix each remaining issue.

Exact-text contracts take first precedence. This semantic guard takes second.
Style edits take third.

## Self-audit

- Does each claim retain its evidence, tone, normative force, uncertainty, and
  time relation?
- Did every recorded match receive a substantive resolution?
- Did the rescan find no unresolved owned pattern?
- Is every protected source span byte-identical?
