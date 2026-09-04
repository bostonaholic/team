## Confidence tiers

Every claim in the final output sits in exactly one tier. The tier
decides which output section it goes in and how it is phrased
(`principle-evidence-over-assertion`).

| Tier | Meaning | Phrasing |
|---|---|---|
| **Direct** | An author explicitly wrote why — a PR description, ticket, code comment, doc, or message states the reason | Confident, present tense, citation adjacent |
| **Supported** | Multiple independent pieces of indirect evidence converge | Confident but derived: name each contributing piece |
| **Inferred** | A reasonable reading of context; nothing states it | Hedged — "appears to", "likely", "suggests" — with the inference chain visible |
| **Speculative** | Plausible, but other explanations fit equally well | Explicitly a guess: "one possibility is X, but no direct evidence" |
| **Unknown** | You searched and found nothing | Name exactly what was searched and came up empty |

Phrasing rules:

- Causal words — "because", "was designed to", "the team decided" — claim
  Direct or Supported evidence. Using one requires a citation immediately
  adjacent. If you cannot cite it, hedge it and move it down a tier.
- **Never cite code as evidence for its own intent.** "It checks for
  null because it handles the null case" is mechanics, not motivation.
  Motivation comes from an external source or is labeled inference.
- **No rationalization.** Code that makes sense today may exist for
  reasons that no longer apply, or for no good reason. Do not retrofit a
  clean rationale onto messy history, and do not turn absence of evidence
  into evidence of absence.
- **Surface contradictions.** When two sources disagree, present both
  with their citations. Do not quietly pick the one that fits the tidier
  narrative.
- A null result from a searched source is a finding. A skipped search is
  a blind spot — and every skip is reported by name with its reason
  (`principle-skip-loudly`).
