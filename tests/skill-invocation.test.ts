// tests/skill-invocation.test.ts
//
// L2 tripwire (free, deterministic): every skill in the distributed plugin
// carries a recorded, machine-checked invocation classification, and the
// explicit-intent guard on a remote-mutating skill is checked for PLACEMENT,
// not left to a reviewer's eye.
//
// Why a pinned map. Before this file, a new skill could ship side-effecting
// and unguarded and nothing failed — the guard rule lived only in prose
// (docs/architecture.md, "the guard wording is the author's responsibility")
// and it had already failed five times on disk. EXPECTED_INVOCATION turns
// that rule into a build gate: the 82nd skill fails key-set equality with its
// own name in the diff until somebody classifies it.
//
// ---------------------------------------------------------------------------
// The row schema
// ---------------------------------------------------------------------------
//
//   class          model-only | user-only | both
//                  DERIVED. Re-checked against frontmatter on disk every run.
//   mutates        none | local | remote
//                  DECLARED. Worst case across every mode the skill offers,
//                  including what it transitively reaches.
//   guard          none | clause | gate | caller
//                  Only `clause` is derived (the anchor check below). `gate`,
//                  `caller` and `none` are declared.
//   noGuardReason  Required, non-empty, when `guard` is `caller`, and when a
//                  `mutates: local` row declares `guard: none`.
//
// ---------------------------------------------------------------------------
// The 200-character bound and how it is counted
// ---------------------------------------------------------------------------
//
// A `guard: clause` row must carry BOTH halves of the guard — one positive
// anchor and one negative anchor from the closed sets below — ending at or
// before character 200. The bound is INCLUSIVE: an anchor ending at 200
// passes, at 201 fails.
//
// The count is taken on descriptionText() output, not on the raw file: the
// `description:` block-scalar lines, each trimmed, joined with one space.
// That is what a host reads after YAML folding, so it is the only offset that
// means anything.
//
// 200 is a stated estimate of where a Codex-style description truncation
// lands, not a measured budget (CHANGELOG.md, 0.31.0 Security, records one
// real truncation that cut a tail guard). Revisit it when a truncation is
// observed against a FRONT-LOADED guard, never merely because a description
// grew.
//
// ---------------------------------------------------------------------------
// What this file cannot check (four declared columns)
// ---------------------------------------------------------------------------
//
// 1. `mutates` is an author's reading of a skill body. No test derives it.
// 2. `gate` names an in-run approval prompt in body prose. Fenced to one name
//    below so adding a second is a decision, not a typo.
// 3. `caller` is a pointer, not a mechanism: the row inherits whatever guard
//    its loading entry points carry. Fenced to `class: model-only` and forced
//    to name its loaders in the reason. The reason's prose stays unchecked,
//    but the loader set behind it does not: it is derived from disk below,
//    and every derived loader must carry a guard clause of its own.
// 4. `noGuardReason` is free prose. Only its non-emptiness is checked.
//
// This suite runs in this repo's CI and never reaches an installed host, so it
// protects the AUTHORING of guards, not their ENFORCEMENT.

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { descriptionText, frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const SKILLS_ROOT = join(REPO_ROOT, "skills");

type InvocationClass = "model-only" | "user-only" | "both";
type Mutates = "none" | "local" | "remote";
type Guard = "none" | "clause" | "gate" | "caller";

interface InvocationRow {
  class: InvocationClass;
  mutates: Mutates;
  guard: Guard;
  noGuardReason?: string;
}

// The closed anchor sets. A guard clause is recognised by these and nothing
// else: an author who rewords a clause into something that means the same
// thing without an anchor fails this suite, and the fix is to restore one.
// Case-insensitive; deliberately non-global so `.match()` reports a stable
// index.
const POSITIVE_ANCHORS: RegExp[] = [/invoke only on explicit/i, /only on explicit/i];
const NEGATIVE_ANCHORS: RegExp[] = [/never infer/i];
const ANCHOR_BOUND = 200;

// The `gate` creep fence. `gate` means an in-run, per-mutation human approval
// prompt in the skill body — the one safeguard that reaches all three hosts,
// because nothing about it lives in frontmatter. Exactly one skill earns it.
// A second name here is a DECISION about which irreversible acts deserve a
// blocking prompt, never a classification tidy-up.
const GATE_FENCE = ["groom-backlog"];

// Boundary fixtures for the inclusive bound. `never infer` is 11 characters,
// so 189 filler characters put its end exactly at 200 and 190 put it at 201.
const NEGATIVE_ANCHOR_AT_BOUND = `${"x".repeat(189)}never infer`;
const NEGATIVE_ANCHOR_PAST_BOUND = `${"x".repeat(190)}never infer`;
// Both anchors present, but the negative one lands past the bound at 233 —
// the tail-guard shape a Codex truncation is documented to cut.
const DESCRIPTION_WITH_TAIL_NEGATIVE_ANCHOR = `Invoke only on explicit intent. ${NEGATIVE_ANCHOR_PAST_BOUND}`;

const EXPECTED_INVOCATION: Record<string, InvocationRow> = {
  // -- model-only: pipeline artifact authoring -----------------------------
  // Loaded by a pipeline agent to produce or shape docs/plans/<id>/*.md.
  // Everything they touch is a file in the working tree.
  "artifact-frontmatter": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes only docs/plans/<id>/ artifact frontmatter in the working tree.",
  },
  "authoring-designs": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes design.md in the working tree; recoverable by deleting the file.",
  },
  "decomposing-intent": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes task.md and questions.md in the working tree.",
  },
  "documenting-decisions": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes an ADR file in the working tree.",
  },
  "planning-implementation": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes plan.md in the working tree.",
  },
  "product-requirements-doc": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes prd.md in the working tree.",
  },
  "researching-codebases": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes research.md in the working tree; reads everything else.",
  },
  "slicing-work": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes structure.md in the working tree.",
  },
  "technical-design-doc": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes a design document in the working tree.",
  },
  "qrspi-workflow": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Orchestration procedure; its writes are pipeline artifacts under docs/plans/.",
  },
  "cross-model-review": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason:
      "Spawns vendor CLIs read-only and records their dispositions in docs/plans/ artifacts.",
  },

  // -- model-only: code and repository work --------------------------------
  // These change the working tree or local git state. Every effect stays on
  // the developer's machine and is recoverable with ordinary version control,
  // which is why none of them carries a guard.
  changelog: {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Edits CHANGELOG.md in the working tree.",
  },
  "git-commit": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Commits locally; nothing leaves the machine until a caller pushes.",
  },
  "implementing-slices": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Edits source and commits locally inside an already-authorized run.",
  },
  "refactoring-to-patterns": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Edits source in the working tree.",
  },
  "running-quality-checks": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Runs project checks; their build artifacts stay on the machine.",
  },
  "systematic-debugging": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Edits source and runs local commands while reproducing a defect.",
  },
  "test-driven-bug-fix": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes tests and edits source in the working tree.",
  },
  "test-first-development": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes test files in the working tree.",
  },
  "verifying-ux": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Boots the app locally and exercises it; the process dies with the run.",
  },
  "worktree-isolation": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason: "Creates and removes local git worktrees; no remote ref is touched.",
  },
  // `sweeping-local-state` stays `local`, defended on LOCALITY, not on the
  // ownership table in its own body. Two grounds. (1) Its contract scopes it
  // to state left "on the machine" — its own description's wording in
  // skills/sweeping-local-state/SKILL.md.
  // (2) A `.teamteardown` line is runtime input from a consuming repo, not one
  // of the four authoring-time dispatch forms this map sweeps — outside the
  // map's universe by construction, not overlooked by it. Residual: a repo
  // COULD declare a hosted target in `.teamteardown`, and no test would see
  // it. The alternative, `mutates: remote`, would force `guard: caller`, whose
  // reason would have to name `worktree-isolation` — a `user-invocable: false`
  // loader carrying no clause to point at, which breaks that value's premise.
  "sweeping-local-state": {
    class: "model-only",
    mutates: "local",
    guard: "none",
    noGuardReason:
      "Scoped by its own contract to state left on the machine; the repo-declared command list is runtime input, not a dispatch form.",
  },

  // -- model-only: the one remote mutator ----------------------------------
  // `tracking-tickets` moves a ticket to in-progress and in-review, a mutation
  // on a public tracker. It carries no clause of its own because no user
  // routes to it: `user-invocable: false` means the description is never a
  // routing target. Its guard is whatever its four loaders carry.
  "tracking-tickets": {
    class: "model-only",
    mutates: "remote",
    guard: "caller",
    noGuardReason:
      "Never routed to directly (user-invocable: false). Loaded through the Skill tool by team, team-fix, team-pr, and pr-watch-as-author, each of which carries its own explicit-intent clause. That set is derived from disk and re-checked below, not taken from this sentence.",
  },

  // -- model-only: pure reference, no effects ------------------------------
  // Reference material an agent reads. Following one changes how a caller
  // reasons, never what is on disk.
  "conventional-comments": { class: "model-only", mutates: "none", guard: "none" },
  "engineering-standards": { class: "model-only", mutates: "none", guard: "none" },
  "finding-files": { class: "model-only", mutates: "none", guard: "none" },
  "nested-agents": { class: "model-only", mutates: "none", guard: "none" },
  "product-thinking": { class: "model-only", mutates: "none", guard: "none" },
  "review-severity-tiers": { class: "model-only", mutates: "none", guard: "none" },
  "reviewing-documentation": { class: "model-only", mutates: "none", guard: "none" },
  "reviewing-security": { class: "model-only", mutates: "none", guard: "none" },
  solid: { class: "model-only", mutates: "none", guard: "none" },
  "systems-thinking": { class: "model-only", mutates: "none", guard: "none" },
  "test-style": { class: "model-only", mutates: "none", guard: "none" },
  "writing-prose": { class: "model-only", mutates: "none", guard: "none" },

  // -- model-only: the principle-* family (23) -----------------------------
  // One cross-cutting invariant each, consulted by citation. Pure reference:
  // no file, no command, no remote call.
  "principle-blind-the-investigator": { class: "model-only", mutates: "none", guard: "none" },
  "principle-bounded-loops": { class: "model-only", mutates: "none", guard: "none" },
  "principle-deep-agents-narrow-seams": { class: "model-only", mutates: "none", guard: "none" },
  "principle-evidence-over-assertion": { class: "model-only", mutates: "none", guard: "none" },
  "principle-explicit-intent": { class: "model-only", mutates: "none", guard: "none" },
  "principle-fail-closed": { class: "model-only", mutates: "none", guard: "none" },
  "principle-files-are-the-contract": { class: "model-only", mutates: "none", guard: "none" },
  "principle-fix-root-causes": { class: "model-only", mutates: "none", guard: "none" },
  "principle-generator-evaluator": { class: "model-only", mutates: "none", guard: "none" },
  "principle-human-owns-the-ends": { class: "model-only", mutates: "none", guard: "none" },
  "principle-idempotent-reruns": { class: "model-only", mutates: "none", guard: "none" },
  "principle-least-privilege": { class: "model-only", mutates: "none", guard: "none" },
  "principle-mechanical-gates": { class: "model-only", mutates: "none", guard: "none" },
  "principle-never-interpolate": { class: "model-only", mutates: "none", guard: "none" },
  "principle-optimization-never-dependency": { class: "model-only", mutates: "none", guard: "none" },
  "principle-plan-present-wait": { class: "model-only", mutates: "none", guard: "none" },
  "principle-pre-image-first": { class: "model-only", mutates: "none", guard: "none" },
  "principle-progress-tracking": { class: "model-only", mutates: "none", guard: "none" },
  "principle-record-assumptions": { class: "model-only", mutates: "none", guard: "none" },
  "principle-scope-fence": { class: "model-only", mutates: "none", guard: "none" },
  "principle-single-source-of-truth": { class: "model-only", mutates: "none", guard: "none" },
  "principle-skip-loudly": { class: "model-only", mutates: "none", guard: "none" },
  "principle-untrusted-input-is-data": { class: "model-only", mutates: "none", guard: "none" },

  // -- user-only (3): disable-model-invocation: true ------------------------
  // The flag is Claude-Code-and-Antigravity only; Codex ignores it and the
  // documented remedy there is to DELETE the skill. So each of these carries a
  // front-loaded clause on top of the flag — belt and braces, and the clause
  // is the half that survives on a host that drops the flag.
  "pr-rebase": { class: "user-only", mutates: "remote", guard: "clause" }, // force-pushes the branch
  "pr-watch-as-reviewer": { class: "user-only", mutates: "remote", guard: "clause" }, // submits a review / approval
  // `reflect` ALSO runs an in-run approval gate — skills/reflect/SKILL.md,
  // "Nothing mutates before you answer", and the approval prompts its
  // procedure carries. Its row stays `clause` because the `gate` fence is a
  // closed one-item list, not because the gate is absent. Recorded here so
  // nobody re-derives it and "corrects" the row.
  reflect: { class: "user-only", mutates: "remote", guard: "clause" }, // rewrites SKILL.md files, files public issues

  // -- both (20) ------------------------------------------------------------
  // Routable by a user AND reachable by the model. Every remote mutator here
  // needs a clause, because the description IS the routing surface.
  "code-review": { class: "both", mutates: "none", guard: "none" }, // reads a diff, reports findings
  "eng-design-doc-review": {
    class: "both",
    mutates: "local",
    guard: "none",
    noGuardReason: "Dispatches a read-only reviewer; the verdict lands in a docs/plans/ artifact.",
  },
  // `groom-backlog` can close an issue whose premise evaporated — an
  // irreversible public mutation. Its guard is an IN-RUN approval prompt,
  // one per issue, which is the only safeguard that reaches all three hosts
  // because it is body text rather than frontmatter.
  "groom-backlog": { class: "both", mutates: "remote", guard: "gate" },
  how: { class: "both", mutates: "none", guard: "none" }, // read-only by its own contract
  why: { class: "both", mutates: "none", guard: "none" }, // read-only by its own contract
  "pr-verify": { class: "both", mutates: "none", guard: "none" }, // read-only; verifies claims
  "pr-cleanup": { class: "both", mutates: "remote", guard: "clause" }, // deletes the remote branch
  "pr-open-comments": { class: "both", mutates: "remote", guard: "clause" }, // pushes fixes, resolves threads
  "pr-watch-as-author": { class: "both", mutates: "remote", guard: "clause" }, // loops until merge, pushes
  shipit: { class: "both", mutates: "remote", guard: "clause" }, // merges the PR
  team: { class: "both", mutates: "remote", guard: "clause" }, // full pipeline: pushes and opens a PR
  "team-fix": { class: "both", mutates: "remote", guard: "clause" }, // compressed pipeline: pushes and opens a PR
  "team-implement": { class: "both", mutates: "remote", guard: "clause" }, // full-pipeline mode pushes and drafts a PR
  "team-pr": { class: "both", mutates: "remote", guard: "clause" }, // commits, pushes, opens the PR
  "team-design": {
    class: "both",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes design.md and its review artifacts in the working tree.",
  },
  "team-plan": {
    class: "both",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes plan.md in the working tree.",
  },
  "team-question": {
    class: "both",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes task.md and questions.md in the working tree.",
  },
  "team-research": {
    class: "both",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes research.md in the working tree; reads everything else.",
  },
  "team-structure": {
    class: "both",
    mutates: "local",
    guard: "none",
    noGuardReason: "Writes structure.md in the working tree.",
  },
  "team-worktree": {
    class: "both",
    mutates: "local",
    guard: "none",
    noGuardReason: "Creates a local git worktree and branch; no remote ref is touched.",
  },
};

// ---------------------------------------------------------------------------
// Disk side. Rebuilt here from the filesystem the way
// tests/guarded-skill-prose.test.ts's guardedSkills() does, so both sides of
// every comparison come from the same source of truth and no map is
// cross-imported.
// ---------------------------------------------------------------------------

// A `skills/<name>/` directory with no SKILL.md is SKIPPED, never thrown on:
// an in-progress skill folder must not turn this suite red for the wrong
// reason.
function skillNamesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(root, name, "SKILL.md")))
    .sort();
}

function skillNames(): string[] {
  return skillNamesUnder(SKILLS_ROOT);
}

function skillFrontmatter(name: string): string {
  return frontmatter(read(join(SKILLS_ROOT, name, "SKILL.md")));
}

type ClassVerdict = InvocationClass | "contradiction";

// Both patterns are anchored `^...$` and applied to the FRONTMATTER SLICE
// only, so a body line that mimics a frontmatter field cannot be counted.
//
// A file setting BOTH flags is a contradiction, not a first-match win: hidden
// from the slash-command menu AND blocked from the model equals unreachable.
// It is reported as its own verdict so the class assertion names it.
function deriveClass(fm: string): ClassVerdict {
  const hiddenFromMenu = /^user-invocable:\s*false\s*$/m.test(fm);
  const blockedFromModel = /^disable-model-invocation:\s*true\s*$/m.test(fm);
  if (hiddenFromMenu && blockedFromModel) return "contradiction";
  if (hiddenFromMenu) return "model-only";
  if (blockedFromModel) return "user-only";
  return "both";
}

// ---------------------------------------------------------------------------
// Schema, anchors, and fences as pure functions over rows, so each check can
// be pointed at a synthetic input and watched to fire (docs/testing.md,
// "Prove a negative check can find a positive").
// ---------------------------------------------------------------------------

function schemaViolations(rows: Record<string, InvocationRow>): string[] {
  const out: string[] = [];
  for (const [name, row] of Object.entries(rows)) {
    const reason = (row.noGuardReason ?? "").trim();
    // A remote mutator must be guarded. No `noGuardReason` buys an exception:
    // that exception is local-only.
    if (row.mutates === "remote" && row.guard === "none") {
      out.push(`${name}: mutates remote with guard none`);
    }
    if (row.mutates === "local" && row.guard === "none" && reason === "") {
      out.push(`${name}: mutates local with guard none and no noGuardReason`);
    }
    if (row.guard === "caller") {
      // `caller` exists for descriptions no user routes to. On a routable row
      // it would hide a missing clause behind a pointer.
      if (row.class !== "model-only") out.push(`${name}: guard caller on a ${row.class} row`);
      if (reason === "") out.push(`${name}: guard caller with no noGuardReason`);
    }
  }
  return out.sort();
}

// Earliest END index of any anchor in the set, or null when none matches.
function anchorEnd(text: string, patterns: RegExp[]): number | null {
  let earliest: number | null = null;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.index === undefined) continue;
    const end = match.index + match[0].length;
    if (earliest === null || end < earliest) earliest = end;
  }
  return earliest;
}

function withinBound(text: string, patterns: RegExp[]): boolean {
  const end = anchorEnd(text, patterns);
  return end !== null && end <= ANCHOR_BOUND;
}

function anchorViolations(
  rows: Record<string, InvocationRow>,
  descriptionOf: (name: string) => string,
): string[] {
  const out: string[] = [];
  for (const [name, row] of Object.entries(rows)) {
    if (row.guard !== "clause") continue;
    const text = descriptionOf(name);
    const positive = anchorEnd(text, POSITIVE_ANCHORS);
    const negative = anchorEnd(text, NEGATIVE_ANCHORS);
    if (positive === null) out.push(`${name}: no positive anchor`);
    else if (positive > ANCHOR_BOUND) {
      out.push(`${name}: positive anchor ends at ${positive}, past ${ANCHOR_BOUND}`);
    }
    if (negative === null) out.push(`${name}: no negative anchor`);
    else if (negative > ANCHOR_BOUND) {
      out.push(`${name}: negative anchor ends at ${negative}, past ${ANCHOR_BOUND}`);
    }
  }
  return out.sort();
}

// Skills that hand `tracking-tickets` to the Skill tool. `\s+` between the
// words spans the line wrap the phrase takes inside a SKILL.md paragraph, so a
// wrapped call site counts like any other.
const TRACKING_TICKETS_LOAD = /Skill\s+tool\s+with\s+`tracking-tickets`/;

function trackingTicketsLoaders(): string[] {
  return skillNames().filter(
    (name) =>
      name !== "tracking-tickets" &&
      TRACKING_TICKETS_LOAD.test(read(join(SKILLS_ROOT, name, "SKILL.md"))),
  );
}

function namesWithGuard(rows: Record<string, InvocationRow>, guard: Guard): string[] {
  return Object.entries(rows)
    .filter(([, row]) => row.guard === guard)
    .map(([name]) => name)
    .sort();
}

function descriptionOnDisk(name: string): string {
  return descriptionText(skillFrontmatter(name));
}

// Skills whose recorded class contradicts their frontmatter, one readable line
// each, so a single run names every offender. A skill with no row is left to
// the key-set equality check, which owns that failure.
function classDisagreements(): string[] {
  return skillNames().flatMap((name) => {
    const row = EXPECTED_INVOCATION[name];
    if (row === undefined) return [];
    const derived = deriveClass(skillFrontmatter(name));
    return derived === row.class ? [] : [`${name}: recorded ${row.class}, disk says ${derived}`];
  });
}

// ---------------------------------------------------------------------------

describe("EXPECTED_INVOCATION covers every skill on disk", () => {
  test("the scan sees the whole skills tree, not an empty haystack", () => {
    // Blindness floor. Without it, a mis-scoped directory read turns every
    // check below into a green no-op and nothing announces it. A floor, not an
    // exact count: adding a skill is ordinary work.
    expect(skillNames().length).toBeGreaterThan(60);
    expect(Object.keys(EXPECTED_INVOCATION).length).toBeGreaterThan(60);
  });

  test("the EXPECTED_INVOCATION key set equals the skills on disk", () => {
    // Key-set equality BOTH directions: a new skill with no row and a stale
    // row with no skill each fail here, with the offending name in the diff.
    expect(Object.keys(EXPECTED_INVOCATION).sort()).toEqual(skillNames());
  });

  test("a skills/<name>/ directory with no SKILL.md is skipped, never thrown on", () => {
    const root = mkdtempSync(join(tmpdir(), `skill-invocation-${process.pid}-${Date.now()}-`));
    try {
      mkdirSync(join(root, "real-skill"));
      writeFileSync(join(root, "real-skill", "SKILL.md"), "---\nname: real-skill\n---\n");
      mkdirSync(join(root, "half-built-skill"));
      writeFileSync(join(root, "loose-file.md"), "not a skill\n");

      expect(skillNamesUnder(root)).toEqual(["real-skill"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("every row's class is the class its frontmatter declares", () => {
  test("no skill's recorded class disagrees with disk", () => {
    expect(classDisagreements()).toEqual([]);
  });

  test("a file setting both user-invocable: false and disable-model-invocation: true is rejected", () => {
    // Not resolved by first match. Hidden from the menu AND blocked from the
    // model is unreachable, which is a defect, not a class.
    const contradictory = ["name: nowhere", "user-invocable: false", "disable-model-invocation: true"].join("\n");
    expect(deriveClass(contradictory)).toBe("contradiction");

    expect(deriveClass("name: a\nuser-invocable: false")).toBe("model-only");
    expect(deriveClass("name: b\ndisable-model-invocation: true")).toBe("user-only");
    expect(deriveClass("name: c")).toBe("both");
  });

  test("the class predicate reads frontmatter only, never the body", () => {
    // A body line can look exactly like a frontmatter field. Feed a well-formed
    // file whose BODY mimics both class fields and confirm neither is counted.
    const file = [
      "---",
      "name: mimic",
      "description: A skill whose body mimics frontmatter.",
      "---",
      "",
      "user-invocable: false",
      "disable-model-invocation: true",
      "",
      "Body prose.",
    ].join("\n");

    expect(deriveClass(frontmatter(file))).toBe("both");
  });

  test("the mimic shape is real, not hypothetical", () => {
    // skills/how/SKILL.md carries a body line that begins `read-only:` at
    // column zero — the same shape a class field takes. The frontmatter slice
    // must not contain it, and `how` must still classify as `both`.
    const raw = read(join(SKILLS_ROOT, "how", "SKILL.md"));
    expect(/^read-only:/m.test(raw)).toBe(true);
    expect(/^read-only:/m.test(frontmatter(raw))).toBe(false);
    expect(deriveClass(frontmatter(raw))).toBe("both");
  });
});

describe("the row schema", () => {
  test("EXPECTED_INVOCATION satisfies the schema", () => {
    expect(schemaViolations(EXPECTED_INVOCATION)).toEqual([]);
  });

  test("a mutates: remote row with guard: none fails, reason or not", () => {
    expect(
      schemaViolations({ pusher: { class: "both", mutates: "remote", guard: "none" } }),
    ).toEqual(["pusher: mutates remote with guard none"]);

    expect(
      schemaViolations({
        pusher: {
          class: "both",
          mutates: "remote",
          guard: "none",
          noGuardReason: "it is fine, honestly",
        },
      }),
    ).toEqual(["pusher: mutates remote with guard none"]);
  });

  test("a mutates: local row with guard: none needs a non-whitespace noGuardReason", () => {
    const missing: Record<string, InvocationRow> = {
      writer: { class: "model-only", mutates: "local", guard: "none" },
    };
    expect(schemaViolations(missing)).toEqual([
      "writer: mutates local with guard none and no noGuardReason",
    ]);

    const whitespace: Record<string, InvocationRow> = {
      writer: { class: "model-only", mutates: "local", guard: "none", noGuardReason: "   \n\t " },
    };
    expect(schemaViolations(whitespace)).toEqual([
      "writer: mutates local with guard none and no noGuardReason",
    ]);

    const filled: Record<string, InvocationRow> = {
      writer: {
        class: "model-only",
        mutates: "local",
        guard: "none",
        noGuardReason: "Writes one file in the working tree.",
      },
    };
    expect(schemaViolations(filled)).toEqual([]);
  });

  test("guard: caller is legal only on a model-only row, and must carry a reason", () => {
    const routable: Record<string, InvocationRow> = {
      pointer: {
        class: "both",
        mutates: "remote",
        guard: "caller",
        noGuardReason: "Loaded by /team.",
      },
    };
    expect(schemaViolations(routable)).toEqual(["pointer: guard caller on a both row"]);

    const userOnly: Record<string, InvocationRow> = {
      pointer: {
        class: "user-only",
        mutates: "remote",
        guard: "caller",
        noGuardReason: "Loaded by /team.",
      },
    };
    expect(schemaViolations(userOnly)).toEqual(["pointer: guard caller on a user-only row"]);

    const reasonless: Record<string, InvocationRow> = {
      pointer: { class: "model-only", mutates: "remote", guard: "caller" },
    };
    expect(schemaViolations(reasonless)).toEqual(["pointer: guard caller with no noGuardReason"]);

    const legal: Record<string, InvocationRow> = {
      pointer: {
        class: "model-only",
        mutates: "remote",
        guard: "caller",
        noGuardReason: "Loaded only by skills/team/SKILL.md:42, which carries its own clause.",
      },
    };
    expect(schemaViolations(legal)).toEqual([]);
  });
});

describe("guard: clause anchor placement", () => {
  test("every guard: clause row carries both anchors within the first 200 characters", () => {
    expect(anchorViolations(EXPECTED_INVOCATION, descriptionOnDisk)).toEqual([]);
  });

  test("the anchor finder locates a real anchor", () => {
    // Positive control. A check that finds nothing has not distinguished
    // "absent" from "blind" — point it at text known to carry both halves.
    const guarded =
      "Invoke ONLY on explicit ship intent — never infer it from a green PR. Trigger on \"ship it\" or \"/shipit\".";
    expect(anchorEnd(guarded, POSITIVE_ANCHORS)).toBe(23);
    expect(anchorEnd(guarded, NEGATIVE_ANCHORS)).toBe(49);
    expect(
      anchorViolations({ shipit: { class: "both", mutates: "remote", guard: "clause" } }, () => guarded),
    ).toEqual([]);
  });

  test("a clause row whose description carries neither anchor reports both halves", () => {
    const plain = "Land a reviewed pull request. Trigger on \"ship it\" or \"/shipit\".";
    expect(
      anchorViolations({ shipit: { class: "both", mutates: "remote", guard: "clause" } }, () => plain),
    ).toEqual(["shipit: no negative anchor", "shipit: no positive anchor"]);
  });

  test("the 200-character bound is inclusive: an anchor ending at 200 passes", () => {
    expect(anchorEnd(NEGATIVE_ANCHOR_AT_BOUND, NEGATIVE_ANCHORS)).toBe(200);
    expect(withinBound(NEGATIVE_ANCHOR_AT_BOUND, NEGATIVE_ANCHORS)).toBe(true);
  });

  test("the 200-character bound is inclusive: an anchor ending at 201 fails", () => {
    expect(anchorEnd(NEGATIVE_ANCHOR_PAST_BOUND, NEGATIVE_ANCHORS)).toBe(201);
    expect(withinBound(NEGATIVE_ANCHOR_PAST_BOUND, NEGATIVE_ANCHORS)).toBe(false);
  });

  test("a clause row whose negative anchor sits past the bound reports its offset", () => {
    expect(
      anchorViolations(
        { tail: { class: "both", mutates: "remote", guard: "clause" } },
        () => DESCRIPTION_WITH_TAIL_NEGATIVE_ANCHOR,
      ),
    ).toEqual(["tail: negative anchor ends at 233, past 200"]);
  });

  test("only guard: clause rows are anchor-checked", () => {
    // A `gate`, `caller`, or `none` row has no description contract here, so
    // an empty description must not be reported.
    const rows: Record<string, InvocationRow> = {
      gated: { class: "both", mutates: "remote", guard: "gate" },
      pointed: { class: "model-only", mutates: "remote", guard: "caller", noGuardReason: "x" },
      inert: { class: "model-only", mutates: "none", guard: "none" },
    };
    expect(anchorViolations(rows, () => "")).toEqual([]);
  });
});

describe("the guard fences", () => {
  test("guard: gate is fenced to exactly groom-backlog", () => {
    expect(namesWithGuard(EXPECTED_INVOCATION, "gate")).toEqual(GATE_FENCE);
  });

  test("an empty gate fence with a gate row present fails rather than passing vacuously", () => {
    const rows: Record<string, InvocationRow> = {
      "some-new-skill": { class: "both", mutates: "remote", guard: "gate" },
    };
    expect(namesWithGuard(rows, "gate")).not.toEqual([]);
    expect(namesWithGuard(rows, "gate")).toEqual(["some-new-skill"]);
  });
});

describe("the guard: caller row inherits a real guard from every loader", () => {
  // `tracking-tickets` carries no clause of its own, so its whole safety is
  // its loaders'. Deriving that set from disk means a new or renamed loader is
  // classified here, rather than drifting away from a hand-written sentence.
  test("the loader sweep finds call sites, not an empty set", () => {
    // Blindness floor: an empty sweep would make the guard check below pass
    // against a tree with no loaders at all.
    expect(trackingTicketsLoaders().length).toBeGreaterThan(0);
  });

  test("the loader pattern matches a call site split across two lines", () => {
    // Positive control for the wrap. skills/team-fix/SKILL.md breaks the
    // phrase after "Skill", which a single-line pattern would drop silently.
    expect(TRACKING_TICKETS_LOAD.test("Call the Skill\n   tool with `tracking-tickets` and")).toBe(
      true,
    );
  });

  test("every skill that loads tracking-tickets carries its own guard clause", () => {
    const unguarded = trackingTicketsLoaders().filter(
      (name) => EXPECTED_INVOCATION[name]?.guard !== "clause",
    );
    expect(unguarded).toEqual([]);
  });
});

describe("no surface still claims the guard wording is unchecked", () => {
  // Three surfaces asserted the guard wording is "NOT machine-checked", and the
  // dev authoring guide told it to every author mid-description. The anchor
  // check above makes all three false. Asserted as an ABSENCE, in the shape
  // tests/architecture.test.ts uses for retired doc strings, so the sentence
  // cannot survive in one copy or creep back into a fourth.
  const RETIRED_CLAIM = /not\s+machine-checked/i;

  const SURFACES = [
    join(REPO_ROOT, "docs", "architecture.md"),
    join(REPO_ROOT, ".claude", "skills", "create-team-skill", "SKILL.md"),
    join(REPO_ROOT, "tests", "pr-rebase-skill.test.ts"),
  ];

  test("the retired claim is absent from every surface that carried it", () => {
    const surviving = SURFACES.filter((file) => {
      const text = read(file);
      // Guard: a renamed or moved surface must fail here, not turn the
      // absence check into a green no-op.
      expect(text.length).toBeGreaterThan(0);
      return RETIRED_CLAIM.test(text);
    });
    expect(surviving).toEqual([]);
  });

  test("the absence sweep can find a positive", () => {
    // docs/testing.md, "Prove a negative check can find a positive".
    expect(RETIRED_CLAIM.test("The guard wording is NOT machine-checked.")).toBe(true);
  });
});
