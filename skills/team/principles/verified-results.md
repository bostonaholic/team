# Verified results

Support verdicts with observed command results, `file:line` evidence, or a fresh query of the authoritative state.
An exit code proves command acceptance, not resulting state; re-query before claiming a mutation succeeded.
Verify third-party claims before adopting them. Reviewer or model agreement is corroboration, never proof.
For dependency claims, load the lowest admitted version and call the API; a version range or changelog cannot prove compatibility.
For recommendations, distinguish checked facts, inferences, and caller-provided claims, and state any material assumption or default that determines the advice and how the advice changes if it is false.

## Gates

- Enforce machine-checkable rules at the cheapest deterministic layer, preferring prevention and early actionable errors over model-dependent compliance.
- Treat an unknown guarantee as unsupported. Missing or unparseable verdicts do not pass: retry once with the error, then halt loudly.
- Keep inconclusive findings. Remove or downgrade a finding only after a `REFUTED` result whose supporting evidence you independently verified.
- Treat a failed capability check as unavailable and use only its declared fallback. Ambiguous irreversible instructions grant no mutation.
- Preserve the owning operation's verdict and retry rules. An optional enhancement failure cannot weaken a required gate.

## Honest reports

Allow no PASS without cited evidence. Mark unverifiable results with degraded confidence.
Report each skipped check, unavailable capability, degraded mode, and deliberate omission on its own named line, stating what would have run and why it did not. Include scope exclusions, partial input, and leftover disk or board state.
Keep required report sections. Use `No findings.`, `Not run: <reason>.`, or `Nothing declared.` when applicable.
Use `unverified` or `captured — not yet uploaded` for incomplete work, never success wording.
