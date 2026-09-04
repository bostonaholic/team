// tests/groom-backlog-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `groom-backlog` RUNTIME skill
// (skills/groom-backlog/SKILL.md) — the fourth standalone utility distributed
// to Team's users. It grooms a project backlog: it loads the whole board in
// bulk, computes a gap inventory, verifies each candidate's claims against the
// code and the tracker, ranks the verified candidates by a four-tier
// heuristic, proposes evidence-backed closures for evaporated premises,
// clusters open issues by outcome, writes a plan file, asks the consequential
// questions with a recommendation each, and stops. Nothing on the tracker
// changes before the user answers, and each closure needs its own answer.
//
// L2 and not L5: grooming drives a live tracker over the network and mutates
// shared state — the same heavy external state that keeps `shipit`,
// `pr-open-comments`, and `pr-watch-as-author` off L5. It cannot be honestly driven in
// one offline `claude -p` run, so its load-bearing rules are pinned here as
// prose assertions, where they cost milliseconds and nothing.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// groom-backlog is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "groom-backlog", "SKILL.md");
const REFERENCES = join(REPO_ROOT, "skills", "groom-backlog", "references");
// The board doc is the stated source of truth for the `Ready` WIP limit.
const PROJECT_TRACKING = join(REPO_ROOT, "docs", "project-tracking.md");
// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  if (!existsSync(SKILL) || !existsSync(REFERENCES)) return "";
  return [
    read(SKILL),
    ...readdirSync(REFERENCES)
      .filter((name) => /^\d\d-.*\.md$/.test(name))
      .sort()
      .map((name) => read(join(REFERENCES, name))),
  ].join("\n");
}
function fm(): string {
  return existsSync(SKILL) ? frontmatter(read(SKILL)) : "";
}
// The skill with its frontmatter stripped. The `description:` field restates
// several load-bearing rules for the trigger cue, so an assertion that must
// land in the method itself reads this instead of the whole file. Missing
// frontmatter → "" so scoped assertions fail, never vacuously pass.
function prose(): string {
  const text = body();
  const front = frontmatter(text);
  if (!front) return "";
  const end = text.indexOf(front) + front.length;
  return text.slice(end);
}
// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}

// Byte offsets [start, end) of a `## ` section, so one section's position can
// be compared against another's and a substring can be proved to fall inside
// one. Missing heading → [-1, -1] so ordering assertions fail, never throw.
function sectionSpan(heading: string): [number, number] {
  const text = body();
  const start = text.indexOf(`${heading}\n`);
  if (start < 0) return [-1, -1];
  const rest = text.slice(start + heading.length);
  const end = rest.indexOf("\n## ");
  return [start, end < 0 ? text.length : start + heading.length + end];
}

// The slice of the skill from a `## ` heading up to the next `## ` heading,
// derived from sectionSpan so the two cannot drift apart. Missing heading → ""
// so scoped assertions fail, never throw.
function section(heading: string): string {
  const [start, end] = sectionSpan(heading);
  if (start < 0) return "";
  return body().slice(start + heading.length, end);
}

// The slice of the skill from a `### Step` heading up to the next `###` or
// `## ` heading — the step itself, unlike section(), whose span from a `###`
// heading runs to the next `## ` and would let a later step's prose satisfy a
// token pinned to this one. Missing heading → "" so scoped assertions fail,
// never throw.
function stepSection(heading: string): string {
  const text = body();
  const start = text.indexOf(`${heading}\n`);
  if (start < 0) return "";
  const rest = text.slice(start + heading.length);
  const end = rest.search(/\n##+ /);
  return end < 0 ? rest : rest.slice(0, end);
}

// The `Ready` WIP limit, read out of the board doc that declares itself the
// source of truth. Missing file or pattern → "" so assertions fail, never throw.
function readyWipLimit(): string {
  if (!existsSync(PROJECT_TRACKING)) return "";
  return read(PROJECT_TRACKING).match(/capped at \*\*(\d+)\*\* cards/)?.[1] ?? "";
}

// The resolution-label names, read out of the `### Resolution` table of the
// board doc — derived like the WIP numeral above, never hardcoded, so a label
// rename there fails here rather than leaving the skill's recipe applying a
// label that no longer exists. Missing file, heading, or rows → [] so the
// length assertion fails, never throws.
function resolutionLabels(): string[] {
  if (!existsSync(PROJECT_TRACKING)) return [];
  const text = read(PROJECT_TRACKING);
  const start = text.indexOf("### Resolution");
  if (start < 0) return [];
  const rest = text.slice(start);
  const end = rest.indexOf("\n### ");
  const resolution = end < 0 ? rest : rest.slice(0, end);
  // flatMap narrows the optional capture group: a matched row always carries
  // it, but the type does not know that, and a dropped row still yields [].
  return [...resolution.matchAll(/^\|\s*`([a-z]+)`\s*\|/gm)].flatMap((m) =>
    typeof m[1] === "string" ? [m[1]] : [],
  );
}

describe("groom-backlog skill: frontmatter", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: groom-backlog", () => {
    expect(/^name:\s*groom-backlog\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter carries argument-hint (the board reference)", () => {
    expect(/^argument-hint:/m.test(fm())).toBe(true);
  });

  test("frontmatter pins effort: high (judgment-heavy, like pr-open-comments)", () => {
    expect(/^effort: high$/m.test(fm())).toBe(true);
  });

  test("frontmatter does NOT set disable-model-invocation (model-invocable by design)", () => {
    const f = fm();
    // Guard: an empty frontmatter must fail, not vacuously pass the absence check.
    expect(f.length).toBeGreaterThan(0);
    expect(/^disable-model-invocation:/m.test(f)).toBe(false);
  });
});

describe("groom-backlog skill: the bulk load refuses a partial board", () => {
  test("the bulk load passes an explicit --limit", () => {
    expect(prose()).toContain("--limit");
  });

  test("the bulk load asserts totalCount equals the number fetched", () => {
    const t = flat(prose());
    expect(t).toContain("totalCount");
  });

  test("each bare-array query is checked against the limit it was given", () => {
    const t = flat(prose());
    // A bare JSON array carries no count, so `totalCount` cannot cover it —
    // the fetched length is compared against the limit instead.
    expect(/--argjson limit/.test(t)).toBe(true);
  });
});

describe("groom-backlog skill: tracker text never reaches a shell argument", () => {
  test("the write recipes pass every body by file or on stdin", () => {
    const recipes = section("## Tracker recipes");
    expect(recipes.length).toBeGreaterThan(0);
    // The two write shapes that carry prose: an issue body and a request body.
    expect(recipes).toContain("--body-file");
    expect(recipes).toContain("--input");
    // Stdin, the shape pr-open-comments uses for reply text.
    expect(recipes).toContain("-F body=@-");
    // A cached title reaches the command as a variable, never as pasted prose.
    expect(recipes).toContain("jq -r");
  });

  test("no write recipe interpolates a body or description into a quoted argument", () => {
    const recipes = section("## Tracker recipes");
    expect(recipes.length).toBeGreaterThan(0);
    // `-f description="…"` / `--body "…"` are the shapes that splice prose into
    // the command line, where a backtick or $(…) in the text would execute.
    expect(/-f\s+(description|title|body)=/.test(recipes)).toBe(false);
    expect(/--body\s+"/.test(recipes)).toBe(false);
  });

  test("a description rewrite caches the pre-image first", () => {
    const t = flat(prose());
    expect(/original-body-/.test(t)).toBe(true);
  });
});

describe("groom-backlog skill: promotion contract", () => {
  test("names both supported modes", () => {
    const text = body();
    expect(text).toContain("Board mode");
    expect(text).toContain("Promotion mode");
  });

  // The cap is duplicated: docs/project-tracking.md declares it and the skill
  // quotes it as its worked example. Derive the numeral from the doc so a change
  // there fails here rather than leaving the skill promoting into a stale cap.
  test("the promotion cap is the same numeral docs/project-tracking.md declares", () => {
    const limit = readyWipLimit();
    expect(limit.length).toBeGreaterThan(0);
    const promotion = flat(section("## The promotion standard"));
    expect(promotion).toContain(`limited to ${limit}`);
    expect(promotion).toContain(`above ${limit}`);
  });

});

describe("groom-backlog skill: mode dispatch and the extraction seam", () => {
  // Half two is loadable methodology: it states its own inputs and its own
  // standard, so a future grooming agent can load the section verbatim.
  const UPWARD_REFERENCES = ["$ARGUMENTS", "--promote", "cluster", "board-level pass"];

  test("the promotion standard makes no upward reference", () => {
    const promotion = section("## The promotion standard");
    // Guard: a missing section must fail, not vacuously pass the absence checks.
    expect(promotion.length).toBeGreaterThan(0);
    for (const reference of UPWARD_REFERENCES) {
      expect(promotion).not.toContain(reference);
    }
  });

  test("the promotion standard sits below both sections that reach it", () => {
    const [promotionStart] = sectionSpan("## The promotion standard");
    const [inputStart] = sectionSpan("## Input");
    const [passStart] = sectionSpan("## The board-level pass");
    expect(inputStart).toBeGreaterThan(-1);
    expect(passStart).toBeGreaterThan(-1);
    expect(promotionStart).toBeGreaterThan(inputStart);
    expect(promotionStart).toBeGreaterThan(passStart);
  });

  test("## Input is the only section that reads $ARGUMENTS", () => {
    const text = body();
    const [inputStart, inputEnd] = sectionSpan("## Input");
    expect(inputStart).toBeGreaterThan(-1);
    expect(inputEnd).toBeGreaterThan(inputStart);
    let index = text.indexOf("$ARGUMENTS");
    // Guard: an absent token must fail, not vacuously pass the loop below.
    expect(index).toBeGreaterThan(-1);
    while (index >= 0) {
      expect(index).toBeGreaterThanOrEqual(inputStart);
      expect(index).toBeLessThan(inputEnd);
      index = text.indexOf("$ARGUMENTS", index + 1);
    }
  });
});

// Dependency analysis is the one mutation class whose failure mode is silent
// and inverted: a link drawn backwards parks startable work behind a
// non-prerequisite, and the board reads as if someone checked. These pin the
// rules that make that failure impossible to reach accidentally.
describe("groom-backlog skill: dependency analysis", () => {
  test("declared links ride the bulk load instead of a per-issue call", () => {
    const load = section("### Step 1 — Load once, in bulk");
    expect(load.length).toBeGreaterThan(0);
    // The gh field names, so a rename upstream fails here rather than at runtime.
    expect(load).toContain("blockedBy");
    expect(load).toContain("blocking");
  });

  test("a short link connection is recorded, not silently treated as unlinked", () => {
    const t = flat(prose());
    // Same completeness doctrine the board and comment loads already carry.
    expect(t).toContain("unloaded-links");
    expect(/totalCount/.test(section("### Step 1 — Load once, in bulk"))).toBe(true);
  });

  test("dependency analysis runs before the plan is written", () => {
    const [dependencyStart] = sectionSpan("### Step 6 — Find the dependencies, then propose the links");
    const [planStart] = sectionSpan("### Step 7 — Write the plan to a file");
    expect(dependencyStart).toBeGreaterThan(-1);
    expect(planStart).toBeGreaterThan(dependencyStart);
  });

  test("an inferred link is a proposal that needs its own answer", () => {
    // Dependency links are a named question class, so the plan cannot fold
    // them into an adjacent approval.
    const ask = flat(stepSection("### Step 8 — Present the consequential choices and wait"));
    expect(ask.length).toBeGreaterThan(0);
    expect(/\*\*dependency links\*\*/i.test(ask)).toBe(true);
  });

  test("the link recipe resolves a database id and sends it as an integer", () => {
    const recipes = section("## Tracker recipes");
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes).toContain("dependencies/blocked_by");
    // The endpoint is keyed by database id; the issue number and the cached
    // GraphQL node id are both wrong, and only one of them fails loudly.
    expect(recipes).toContain("--jq .id");
    // `-f issue_id=` sends a string and the endpoint rejects it 422.
    expect(recipes).toContain("-F issue_id=");
    expect(/-f\s+issue_id=/.test(recipes)).toBe(false);
  });

});

describe("groom-backlog skill: sanctioned vocabulary", () => {
  test("never claims a human gate, a human contract, or a design gate", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence check.
    expect(t.length).toBeGreaterThan(0);
    expect(
      /human[ -]gate|human (approval|design) gate|human contract|design[ -]gate/i.test(t),
    ).toBe(false);
  });
});

// Verify claims and rank before proposing. The three-outcome
// verification vocabulary and the four-tier ranking heuristic are duplicated
// across board mode (Steps 3–4) and the self-contained promotion standard, so
// both copies are pinned here — the WIP-numeral precedent for a duplicated
// value — and a drift between them fails the build.
describe("groom-backlog skill: claim verification and ranking", () => {
  // The inter-slice contract: closure prose reuses these tokens verbatim.
  const OUTCOME_TOKENS = ["**claims hold**", "**partially stale**", "**premise evaporated**"];
  // Short bold names, one per tier, identical in both copies. None may carry
  // a substring the promotion seam forbids ("cluster" included).
  const TIER_TOKENS = [
    "**shipped-behavior contradictions**",
    "**harness reliability**",
    "**high-leverage improvements**",
    "**strategic unblockers**",
  ];

  test("verification outcomes are pinned in both modes", () => {
    const verify = flat(stepSection("### Step 3 — Verify claims against the code"));
    // Guard: a missing step must fail, not vacuously pass the token checks.
    expect(verify.length).toBeGreaterThan(0);
    const promotion = flat(section("## The promotion standard"));
    expect(promotion.length).toBeGreaterThan(0);
    for (const token of OUTCOME_TOKENS) {
      expect(verify).toContain(token);
      expect(promotion).toContain(token);
    }
    // The verdict file: one dated-evidence block per issue, cited by the plan.
    expect(verify).toContain("verification.md");
  });

  test("verification runs before clustering", () => {
    const [verifyStart] = sectionSpan("### Step 3 — Verify claims against the code");
    const [clusterStart] = sectionSpan("### Step 5 — Cluster by outcome, not by component");
    expect(verifyStart).toBeGreaterThan(-1);
    expect(clusterStart).toBeGreaterThan(verifyStart);
  });

  test("ranking tiers are pinned in both copies", () => {
    const rank = flat(stepSection("### Step 4 — Rank the verified candidates"));
    // Guard: a missing step must fail, not vacuously pass the token checks.
    expect(rank.length).toBeGreaterThan(0);
    // The four tiers appear in tier order, so a silent reorder fails here.
    // Each `greater than` also proves presence: -1 never beats a real index.
    let previousTier = -1;
    for (const token of TIER_TOKENS) {
      const tier = rank.indexOf(token);
      expect(tier).toBeGreaterThan(previousTier);
      previousTier = tier;
    }
    const promotion = flat(section("## The promotion standard"));
    expect(promotion.length).toBeGreaterThan(0);
    for (const token of TIER_TOKENS) {
      expect(promotion).toContain(token);
    }
    // The tiebreaker is pinned in both copies too — this block exists so a
    // drift between them fails the build, and a board-only rephrase would
    // otherwise pass unnoticed.
    expect(rank).toContain("smaller verified scope");
    expect(promotion).toContain("smaller verified scope");
  });
});

// Evidence-backed closure proposals. Closing an issue is the one
// destructive mutation grooming can propose. These pin its recipe shape
// (evidence by file, additive label, close reason), its own mutation-class
// question, its slot in the execute order, and the decision-ticket carve-out.
describe("groom-backlog skill: evidence-backed closure proposals", () => {
  test("the closure recipe closes with a reason and travels by file", () => {
    const recipes = section("## Tracker recipes");
    // Guard: a missing section must fail, not vacuously pass the absence check.
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes).toContain("gh issue close");
    // "not planned", never "completed" — the premise died, no work was delivered.
    expect(recipes).toContain('--reason "not planned"');
    // The evidence comment travels whole by file; the mandatory pre-close
    // re-read is cached like the rewrite pre-image.
    expect(recipes).toContain("closure-evidence-");
    expect(recipes).toContain("pre-close-");
    // `--comment` is the prose-in-argument shape the shell-safety hard rule forbids.
    expect(recipes).not.toContain("--comment");
  });

  test("closures are their own mutation class and execute after new issues, before links", () => {
    // A named question class, like **dependency links**, so approving an
    // adjacent class can never carry a closure.
    const ask = flat(stepSection("### Step 8 — Present the consequential choices and wait"));
    expect(ask.length).toBeGreaterThan(0);
    expect(/\*\*closures\*\*/i.test(ask)).toBe(true);
    // The fixed execute order: a link touching a just-closed endpoint must
    // die at the endpoint re-read, so closures land before links are drawn.
    const execute = flat(stepSection("### Step 9 — Execute in dependency order"));
    expect(execute.length).toBeGreaterThan(0);
    const newIssues = execute.indexOf("new issues");
    const closures = execute.indexOf("closures");
    const links = execute.indexOf("dependency links");
    // Each `greater than` also proves presence: -1 never beats a real index.
    expect(newIssues).toBeGreaterThan(-1);
    expect(closures).toBeGreaterThan(newIssues);
    expect(links).toBeGreaterThan(closures);
  });

  test("both closure verdicts bind code-level claims to a verified checkout", () => {
    // The command that establishes the working tree is a checkout of the
    // issue's repository. Without it, an unrelated checkout reads every cited
    // path as absent, and "premise evaporated" comes for free. Pinned in both
    // copies, like the outcome tokens, so a drift between them fails here.
    // The tree is established from git, never from `gh`: `gh repo view` answers
    // for a resolved remote, so with GH_REPO set it reports that value from any
    // directory and cannot say where you are. Pinned in both copies, like the
    // outcome tokens, so a drift between them fails here.
    const CHECKOUT_COMMANDS = ["git rev-parse --show-toplevel", "git remote get-url"];
    const verify = flat(stepSection("### Step 3 — Verify claims against the code"));
    // Guard: a missing step must fail, not vacuously pass the token checks.
    expect(verify.length).toBeGreaterThan(0);
    const promotion = flat(section("## The promotion standard"));
    expect(promotion.length).toBeGreaterThan(0);
    for (const command of CHECKOUT_COMMANDS) {
      expect(verify).toContain(command);
      expect(promotion).toContain(command);
    }
    // `gh repo view` must not come back as the mechanism in either copy.
    expect(verify).not.toContain("gh repo view --json nameWithOwner");
    expect(promotion).not.toContain("gh repo view --json nameWithOwner");
  });

  test("a comment landing since the cache skips a closure in both copies", () => {
    // Hours pass between the ask turn and the execute turn, and a maintainer's
    // objection arrives as a comment. The skip is unconditional in both copies:
    // it does not ask whether the verdict rested on comment text.
    const execute = flat(stepSection("### Step 9 — Execute in dependency order"));
    // Guard: a missing step must fail, not vacuously pass the token checks.
    expect(execute.length).toBeGreaterThan(0);
    expect(execute).toContain("any comment landed since the cache");
    // The word that makes it a contract rather than a case: re-narrowing the
    // condition would have to delete this to stay coherent.
    expect(execute).toContain("unconditional");
    const promotion = flat(section("## The promotion standard"));
    expect(promotion.length).toBeGreaterThan(0);
    expect(promotion).toContain("a new comment");
  });

  test("a blocker number from tracker text is matched against the board", () => {
    // An undeclared blocker's number comes out of a comment. An issue reference
    // is not prose, so the shell-safety hard rule does not reach it, and the
    // number lands in an API path.
    const recipes = section("## Tracker recipes");
    // Guard: a missing section must fail, not vacuously pass the token checks.
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes).toContain("$RUN_DIR/issues.json");
  });

  test("a leading-dash value is guarded with a -- terminator in both copies", () => {
    // A jq -r-filled variable defeats re-parsing but not option injection: a
    // value that starts with `-` reads as an option in the receiving program.
    // The backticked bare `--` token is the terminator; the write-shape flags
    // (`--body-file`, `--input`) never match it.
    const verify = stepSection("### Step 3 — Verify claims against the code");
    // Guard: a missing step must fail, not vacuously pass the token checks.
    expect(verify.length).toBeGreaterThan(0);
    expect(/`--`/.test(verify)).toBe(true);
    const rules = section("## Hard rules");
    expect(rules.length).toBeGreaterThan(0);
    expect(/`--`/.test(rules)).toBe(true);
  });

  test("the carve-out and the doc-derived resolution labels are pinned", () => {
    // A decision, investigation, or spike ticket is never a closure candidate:
    // its deliverable is a recorded decision, not a code state.
    const verify = flat(stepSection("### Step 3 — Verify claims against the code"));
    // Guard: a missing step must fail, not vacuously pass the token checks.
    expect(verify.length).toBeGreaterThan(0);
    expect(verify).toContain("decision");
    expect(verify).toContain("investigation");
    expect(verify).toContain("spike");
    // The recipe applies one of the board doc's own resolution labels.
    const labels = resolutionLabels();
    // Guard: a failed derivation must fail here, not vacuously pass the loop.
    // No exact count: the containment loop below already catches a label the
    // doc adds but the recipe never wires in.
    expect(labels.length).toBeGreaterThan(0);
    const recipes = section("## Tracker recipes");
    expect(recipes.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(recipes).toContain(label);
    }
  });

  test("completion keeps board and promotion modes distinct", () => {
    const text = body();
    expect((text.match(/board mode/gi) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((text.match(/promotion mode/gi) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
