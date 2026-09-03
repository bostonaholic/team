// The explicit-intent guard: one owned encoding, one owner.
//
// A side-effecting entry-point skill MUST state an explicit-intent guard in
// its description. Which skills are in that class is decided by the
// complement pair in `docs/architecture.md` ("Which skills are in that class
// is a complement pair over every write an invocation authorizes") — that
// rule is cited here, never restated, so it has one home.
//
// The encoding is one ORDERED pair of literal fragments:
//
//   GUARD_OPEN   — `Invoke ONLY on explicit`, case-SENSITIVE. The all-caps
//                  `ONLY` is the emphasis marker that makes the token
//                  load-bearing rather than incidental.
//   GUARD_CLOSE  — `never infer`, case-INSENSITIVE, because it opens a
//                  sentence in one description and rides mid-sentence in the
//                  rest — the same split `PHRASE` handles in ./skill-refs.
//
// Order is part of the contract. The close is searched for only AFTER the end
// of the open's match, never from index 0, because `never infer` carries no
// topic anchor: an unrelated close sitting earlier in the same description
// must not stand in for a deleted guard. `skills/pr-cleanup/SKILL.md` is the
// live two-close case that makes the rule bite.
//
// These three constants and this map are LOAD-BEARING. Changing the
// convention's wording, or a skill's class, means changing it HERE, in one
// place, on purpose. No test, doc, description, or expectation string may
// re-spell them.

import { join } from "node:path";

import { squash } from "./text";

export const GUARD_OPEN = "Invoke ONLY on explicit";

export const GUARD_CLOSE = "never infer";

// The teaching rendering, built from the fragments so a doc that shows the
// form cannot drift from the check that reads it. `…` is U+2026, `—` is
// U+2014. Renders to:
//   Invoke ONLY on explicit … intent — … never infer …
export const CANONICAL = `${GUARD_OPEN} … intent — … ${GUARD_CLOSE} …`;

// True when the description states the guard: the open fragment, then the
// close fragment somewhere after it. Reads through squash() because this repo
// hard-wraps, and one live description wraps between `ONLY` and `on`.
export function carriesGuard(description: string): boolean {
  const text = squash(description);
  const open = text.indexOf(GUARD_OPEN);
  if (open === -1) return false;
  const afterOpen = text.slice(open + GUARD_OPEN.length);
  return afterOpen.toLowerCase().includes(GUARD_CLOSE.toLowerCase());
}

// Class membership per user-invocable skill, keyed by repo-relative path.
// Hand-maintained on purpose: the complement pair in `docs/architecture.md`
// asks what an invocation AUTHORIZES, which no pattern over the file can
// answer. Making it a deliberate list turns "someone added a skill and never
// decided" into a red build, because the key set must equal the disk
// enumeration in both directions.
//
// `join()` builds the keys so they compare equal to the enumerator's output.
export const GUARD_CLASS: Record<string, "in" | "out"> = {
  // In class: the invocation authorizes a write to tracked files, to git
  // history or refs, or to a host outside the checkout.
  [join(".claude", "skills", "create-team-skill", "SKILL.md")]: "in",
  [join(".claude", "skills", "version-bump", "SKILL.md")]: "in",
  [join("skills", "groom-backlog", "SKILL.md")]: "in",
  [join("skills", "pr-cleanup", "SKILL.md")]: "in",
  [join("skills", "pr-open-comments", "SKILL.md")]: "in",
  [join("skills", "pr-rebase", "SKILL.md")]: "in",
  [join("skills", "pr-watch-as-author", "SKILL.md")]: "in",
  [join("skills", "pr-watch-as-reviewer", "SKILL.md")]: "in",
  [join("skills", "reflect", "SKILL.md")]: "in",
  [join("skills", "shipit", "SKILL.md")]: "in",
  [join("skills", "team", "SKILL.md")]: "in",
  [join("skills", "team-fix", "SKILL.md")]: "in",
  [join("skills", "team-implement", "SKILL.md")]: "in",
  [join("skills", "team-pr", "SKILL.md")]: "in",
  [join("skills", "team-worktree", "SKILL.md")]: "in",
  // Out of class: the invocation reads only, or writes only files under
  // `docs/plans/` and invocation-local scratch.
  [join("skills", "code-review", "SKILL.md")]: "out",
  [join("skills", "eng-design-doc-review", "SKILL.md")]: "out",
  [join("skills", "how", "SKILL.md")]: "out",
  [join("skills", "pr-verify", "SKILL.md")]: "out",
  [join("skills", "team-design", "SKILL.md")]: "out",
  [join("skills", "team-plan", "SKILL.md")]: "out",
  [join("skills", "team-question", "SKILL.md")]: "out",
  [join("skills", "team-research", "SKILL.md")]: "out",
  [join("skills", "team-structure", "SKILL.md")]: "out",
  [join("skills", "why", "SKILL.md")]: "out",
};
