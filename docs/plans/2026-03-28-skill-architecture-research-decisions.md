# Skill Architecture Decisions

**Date:** 2026-03-28
**Product Owner:** product-owner agent
**Research Artifact:** docs/plans/2026-03-28-skill-architecture-research-research.md

---

## D1: Extraction threshold — keep 1-consumer threshold

**Decision:** Keep the current 1-consumer threshold. Extraction is justified when the methodology forms a coherent, independently maintainable body of knowledge that would meaningfully grow the consuming file if inlined.

**Rationale:** The 2-consumer rule would require inlining `worktree-isolation` (79 lines into `team/SKILL.md`'s 117 lines — a 67% increase), `changelog` and `git-commit` (both into `team-ship/SKILL.md`'s 57 lines — making it ~5x larger), and `test-driven-bug-fix` into `team-fix/SKILL.md`. Each methodology skill contains coherent, self-contained knowledge with its own error handling and lifecycle logic. VS Code and WordPress precedents justify extraction based on swappability and independent versioning, not reuse count.

**Confidence:** HIGH

---

## D2: Wire `adversarial-review/SKILL.md` to review agents

**Decision:** Wire `adversarial-review/SKILL.md` to `code-reviewer`, `security-reviewer`, `ux-reviewer`, and `technical-writer`. Each agent should load the skill and remove duplicated inline comment format and verdict criteria. `verifier` is excluded (tabular report format, not Conventional Comments).

**Rationale:** `docs/architecture.md` explicitly lists `adversarial-review` as "loaded by review agents." The skill's `description` frontmatter names its consumers. The gate type table and verdict aggregation logic exist only in the skill file, while Conventional Comments format is duplicated independently across 4 agent bodies. The pattern used by `solid-principles` (agent references skill, summarizes key points inline, delegates full methodology) is the correct model.

**Confidence:** HIGH

---

## D3: Keep current slash command registration for all skills

**Decision:** Keep the current registration mechanism for all skills. Methodology skill descriptions should communicate their purpose as loadable methodology. No separate registration category.

**Rationale:** The Claude Code plugin system has one registration mechanism. Suppressing slash command visibility would require untested workarounds. The practical confusion risk is low. The existing description convention ("loaded by X agent to do Y") already signals the intended usage pattern.

**Confidence:** MEDIUM

---

## D4: Keep `solid-principles` as a single monolithic skill

**Decision:** Keep `solid-principles` as a single monolithic skill. Do not split into individual principle files.

**Rationale:** Both consumers (`implementer` and `code-reviewer`) load the full set of 5 principles — neither applies a subset. At 157 lines, the skill is near the methodology average of 143 lines. Splitting creates 5 files to maintain instead of 1, with no loading efficiency gain. Ousterhout's "deep modules with simple interfaces" principle favors one skill with clear cohesion.

**Confidence:** HIGH

---

## D5: Document methodology catalog in `docs/architecture.md`

**Decision:** Maintain `docs/architecture.md` Section 6 (Skills methodology table) as the canonical methodology catalog. Ensure each row's description is precise about which agent types should load it. No additional discovery mechanism needed.

**Rationale:** `docs/architecture.md` is the documented entry point referenced from `CLAUDE.md`. After D2 is implemented, existing review agents will model the correct load pattern for new agent authors.

**Confidence:** MEDIUM

---

## D6: Keep `team-brainstorm` self-contained

**Decision:** Do not extract `team-brainstorm`'s session protocol. Keep it self-contained.

**Rationale:** The brainstorming session protocol is tightly coupled to the brainstorming entry point. Unlike `worktree-isolation` (lifecycle any router could follow) or `solid-principles` (domain knowledge reusable across roles), the brainstorming protocol is procedural content that only makes sense in an interactive clarification session. No second consumer exists or is foreseeable. At 169 lines, it is within normal range.

**Confidence:** HIGH

---

## D7: Soft limit of 3 methodology skills per agent

**Decision:** Establish a soft limit of 3 methodology skills per agent invocation, documented as a design guideline in `docs/architecture.md`. No hard enforcement.

**Rationale:** Current maximum is 2 skills per agent (~343 lines). At ~143 lines average, 3 skills = ~430 lines (~6,000–10,500 tokens, under 6% of 200K context). A fourth skill load signals that an agent's responsibility is too broad — an architectural smell, not a token budget problem. The limit is a design convention, not a hard constraint.

**Confidence:** MEDIUM

---

## Summary of Actionable Items

1. **Wire `adversarial-review/SKILL.md`** to 4 review agents (D2)
2. **Update `docs/architecture.md`** with methodology skill load limit guideline (D7)
3. **Update `docs/architecture.md`** methodology table to be precise about consumers (D5)
4. **Document extraction threshold** in `docs/architecture.md` (D1)
