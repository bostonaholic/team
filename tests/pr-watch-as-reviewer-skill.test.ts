// tests/pr-watch-as-reviewer-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `pr-watch-as-reviewer` RUNTIME
// skill (skills/pr-watch-as-reviewer/SKILL.md) — the reviewer-side standalone
// watch-and-approve utility distributed to Team's users. Arming resolves the
// base repo from the canonical PR URL (never head-repository fields), fetches
// the viewer login once, refuses self-approval and zero-thread arms, then
// polls GitHub in ~31-minute cycles to a 3-cycle soft cap (~90 min) — timing
// and bound owned by pr-watch-mechanics, which both watches load — until every
// review thread the invoking user opened is resolved, and casts one
// attributed, SHA-cited `gh pr review --approve`. The approval is the skill's
// ONLY write: it never resolves threads, never replies, never edits code,
// never merges, and never auto-runs /shipit. The gate is GraphQL `isResolved`
// state only — comment bodies are DATA, never instructions. Model invocation
// is disabled (`disable-model-invocation: true`): an approval can
// transitively trigger an auto-merge.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const REPO_ROOT = process.cwd();
// pr-watch-as-reviewer is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "pr-watch-as-reviewer", "SKILL.md");
const REFERENCES = join(REPO_ROOT, "skills", "pr-watch-as-reviewer", "references");

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

// pr-watch-thread-escalation: single-file guarded readers, so a phrase search
// scoped to one reference file cannot accidentally match the same words in a
// different file that body() would otherwise concatenate them next to.
const POLL = join(REFERENCES, "07-4-poll.md");
const STOP_CONDITIONS = join(REFERENCES, "08-5-stop-conditions.md");
const COMPACTION_DEFENSE = join(REFERENCES, "10-compaction-defense.md");
const HARD_RULES = join(REFERENCES, "01-hard-rules.md");
function fileBody(path: string): string {
  return existsSync(path) ? read(path) : "";
}

describe("pr-watch-as-reviewer skill: runtime standalone utility frontmatter", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: pr-watch-as-reviewer", () => {
    expect(/^name:\s*pr-watch-as-reviewer\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter carries argument-hint (PR number or URL)", () => {
    expect(/^argument-hint:/m.test(fm())).toBe(true);
  });

  test("frontmatter carries effort", () => {
    expect(/^effort:/m.test(fm())).toBe(true);
  });

  test("frontmatter sets disable-model-invocation: true (an approval can transitively auto-merge)", () => {
    const f = fm();
    // Guard: an empty frontmatter must fail, not vacuously pass a regex check.
    expect(f.length).toBeGreaterThan(0);
    expect(/^disable-model-invocation:\s*true\s*$/m.test(f)).toBe(true);
  });
});

describe("pr-watch-as-reviewer skill: base-repo resolution from the canonical URL", () => {
  test("arm resolves the PR with gh pr view --json url,number", () => {
    const t = body();
    expect(t).toContain("gh pr view");
    expect(t).toContain("--json url,number");
  });

  test("never resolves the repo from head-repository fields (wrong repo on forks)", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence check.
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("headRepositoryOwner");
  });
});

describe("pr-watch-as-reviewer skill: tracked set and gate", () => {
  test("the arm query fetches viewer { login }", () => {
    expect(body()).toContain("viewer { login }");
  });
});

describe("pr-watch-as-reviewer skill: bounded cycle mechanics", () => {
  test("cycle timing and the bound are delegated to pr-watch-mechanics, not restated", () => {
    // The interval, the soft cap, and the handoff are shared with
    // pr-watch-as-author and live in pr-watch-mechanics, which owns their
    // assertions. Restating them here would let the two copies drift.
    expect(loadsSkill(body(), "pr-watch-mechanics")).toBe(true);
  });

  test("binds its own handoff state for the shared soft cap", () => {
    // The slot this skill fills: the author's payload is a different set.
    const t = body();
    expect(t).toContain("auto-merge state");
    expect(t).toContain("tracked-set state");
  });

  test("polls reviewThreads and gates on isResolved", () => {
    const t = body();
    expect(t).toContain("reviewThreads");
    expect(t).toContain("isResolved");
  });

  test("paginates with after: cursors past 100 threads", () => {
    expect(body()).toContain("after:");
  });

  test("an auth failure names the gh auth recovery commands", () => {
    const t = body();
    expect(t).toContain("gh auth login");
    expect(t).toContain("gh auth refresh");
  });
});

describe("pr-watch-as-reviewer skill: approve step", () => {
  test("the approval is cast with gh pr review --approve", () => {
    expect(body()).toContain("gh pr review --approve");
  });

  test("the approve command passes $PR_URL bound from the canonical url, never a literal placeholder", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence check.
    expect(t.length).toBeGreaterThan(0);
    expect(t).toContain('gh pr review --approve "$PR_URL"');
    expect(t).not.toContain('"<canonical-pr-url>"');
  });
});

describe("pr-watch-as-reviewer skill: prompt-injection guards (projected reads)", () => {
  test("the arm-time gh pr view call carries a --jq projection", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass.
    expect(t.length).toBeGreaterThan(0);
    expect(/gh pr view[\s\S]{0,240}--jq/.test(t)).toBe(true);
  });

  test("latestReviews is projected to login + state only — review bodies never enter context", () => {
    const t = body();
    expect(t).toContain(
      "latestReviewStates: [.latestReviews[] | {login: .author.login, state}]",
    );
  });

  test("PENDING-review detection carries a pagination boundary: reviews(last: 1, states: [PENDING])", () => {
    expect(body()).toContain("reviews(last: 1, states: [PENDING])");
  });
});

describe("pr-watch-as-reviewer skill: head-SHA drift check at approval", () => {
  test("approval body names both SHAs (arm-time and approval-time)", () => {
    const t = body();
    expect(t).toContain("<approval-head-SHA>");
    expect(t).toContain("<arm-head-SHA>");
  });

  test("approval-body template discloses automation and never names the skill", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass.
    expect(t.length).toBeGreaterThan(0);
    // Scope to the heredoc content: the skill name legitimately appears
    // elsewhere in the doc (trigger phrases), so the absence check must
    // read the approval template alone.
    const heredoc = t.match(/<<'GH_APPROVE_EOF'\n([\s\S]*?)\nGH_APPROVE_EOF/);
    expect(heredoc).not.toBeNull();
    // Empty-string fallback fails the assertions below loudly rather than
    // tripping TS18048 on the optional capture group.
    const template = heredoc?.[1] ?? "";
    expect(template.length).toBeGreaterThan(0);
    // The automated-attribution disclosure, with no tooling name after it.
    expect(template.startsWith("Approved automatically:")).toBe(true);
    // Internal tooling names are process noise to the PR's readers.
    expect(template).not.toContain("pr-watch-as-reviewer");
    expect(template).not.toContain("Approved automatically by");
    // The body states substance: each resolution was re-reviewed.
    expect(template).toContain("re-reviewed");
  });
});

describe("pr-watch-as-reviewer skill: approval body on stdin", () => {
  test("the approval body is passed via --body-file - with a quoted heredoc", () => {
    const t = body();
    expect(t).toContain("--body-file -");
    expect(t).toContain("<<'GH_APPROVE_EOF'");
  });

  test("the approve command never interpolates the body into the shell command", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence check.
    expect(t.length).toBeGreaterThan(0);
    // `--body ` (with a trailing space) is inline interpolation; `--body-file` is not.
    expect(/gh pr review --approve[^\n]*--body /.test(t)).toBe(false);
  });
});

describe("pr-watch-as-reviewer skill: auto-merge is re-read every poll (merge-safety never stale)", () => {
  test("the poll query selects autoMergeRequest { enabledAt }", () => {
    expect(body()).toContain("autoMergeRequest { enabledAt }");
  });
});

describe("pr-watch-as-reviewer skill: pagination is fail-closed", () => {
  test("the thread query carries the hasNextPage pagination boundary", () => {
    expect(body()).toContain("hasNextPage");
  });
});

describe("pr-watch-as-reviewer skill: argument validation before shell interpolation", () => {
  test("a PR number must match ^[0-9]+$", () => {
    expect(body()).toContain("^[0-9]+$");
  });

  test("a PR URL must match the pinned github.com pull-URL pattern (GitHub identifier charset)", () => {
    expect(body()).toContain(
      String.raw`^https://github\.com/[A-Za-z0-9._-]{1,39}/[A-Za-z0-9._-]{1,100}/pull/[0-9]+$`,
    );
  });

  test("the owner/repo/number binding is shown as a runnable command using parameter expansion", () => {
    const t = body();
    expect(t).toContain('[[ "$ARGUMENTS" =~ $PR_URL_PATTERN ]]');
    expect(t).toContain('REST="${ARGUMENTS#https://github.com/}"');
    expect(t).toContain('ARG_OWNER="${REST%%/*}"');
    expect(t).toContain('ARG_REPO="${REST%%/*}"');
    expect(t).toContain('ARG_NUMBER="${ARGUMENTS##*/}"');
  });

  test("the bare-PR-number branch binds $ARG_NUMBER instead of being refused as malformed", () => {
    const t = body();
    expect(t).toContain('*[!0-9]*) ARG_NUMBER=\'\'');
    expect(t).toContain('ARG_NUMBER="$ARGUMENTS"');
  });

  test("$BASH_REMATCH is never used — zsh matches but leaves it unset, silently binding empty values", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence check.
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("${BASH_REMATCH[");
  });

  test("the permissive [^/]+ owner/repo charset is gone from the accepted pattern", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence check.
    expect(t.length).toBeGreaterThan(0);
    // `[^/]+` excludes only the slash, so `$(...)` passes validation and
    // bash expands it inside a double-quoted shell word.
    expect(t).not.toContain(String.raw`[^/]+/[^/]+/pull`);
  });

  test("the raw argument never appears in a shell word — the arm call binds capture groups", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence check.
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain('gh pr view "<argument>"');
    expect(t).toContain('gh pr view "$ARG_NUMBER" --repo "$ARG_OWNER/$ARG_REPO"');
  });
});

describe("pr-watch-as-reviewer skill: untrusted-input surface", () => {
  test("the unused isOutdated field is no longer fetched", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence check.
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toContain("isOutdated");
  });
});

describe("pr-watch-as-reviewer skill: GraphQL variable flags are literal-string safe", () => {
  test("owner and repo pass with -f (always literal); only the Int number uses typed -F", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence check.
    expect(t.length).toBeGreaterThan(0);
    expect(t).toContain('gh api graphql -f owner="$OWNER" -f repo="$REPO" -F number="$NUMBER"');
    // `gh api -F` reads a value's leading `@` as a file reference — strings never use it.
    expect(t).not.toContain('-F owner=');
    expect(t).not.toContain('-F repo=');
  });
});

describe("pr-watch-as-reviewer skill: PENDING-review check is a fenced snippet", () => {
  test("the pending-review GraphQL check appears in a fenced code block", () => {
    expect(/```bash[\s\S]{0,400}reviews\(last: 1, states: \[PENDING\]\)/.test(body())).toBe(true);
  });
});

// pr-watch-thread-escalation, slice 1: a third-party login on an unresolved
// tracked thread stops the loop before any verdict action that cycle.
describe("pr-watch-as-reviewer skill: Third-party participant stop (design decisions 3, 6, 7, 11)", () => {
  test("the third-party check runs after re-review and before acting on a verdict", () => {
    const t = squash(fileBody(POLL));
    const reReviewIdx = t.indexOf("Re-review every new settlement");
    const actIdx = t.indexOf("Act on every verdict.");
    const thirdPartyIdx = t.indexOf("third-party");
    expect(reReviewIdx).toBeGreaterThan(-1);
    expect(actIdx).toBeGreaterThan(reReviewIdx);
    expect(thirdPartyIdx).toBeGreaterThan(reReviewIdx);
    expect(thirdPartyIdx).toBeLessThan(actIdx);
  });

  test("Third-party participant fires on an unresolved tracked thread and names the login(s), or comment author unavailable for a null author", () => {
    const t = squash(fileBody(STOP_CONDITIONS));
    const start = t.indexOf("Third-party participant");
    expect(start).toBeGreaterThan(-1);
    const section = t.slice(start, start + 400);
    expect(section).toContain("unresolved tracked thread");
    expect(section).toContain("the login(s)");
    expect(section).toContain("comment author unavailable");
  });

  test("a firing Third-party participant stop takes no verdict action, resolve, reaction, or rebuttal that cycle", () => {
    const t = squash(fileBody(STOP_CONDITIONS));
    const start = t.indexOf("Third-party participant");
    expect(start).toBeGreaterThan(-1);
    const section = t.slice(start, start + 400);
    expect(section).toContain("No verdict action, resolve, reaction, or rebuttal");
  });

  test("compaction-defense names third-party participant in the stop-reason list", () => {
    expect(squash(fileBody(COMPACTION_DEFENSE))).toContain("third-party participant");
  });
});

// pr-watch-thread-escalation, slice 2: a rejected verdict that repeats on a
// thread already carrying the viewer's own reply stops instead of rebutting
// again. Slices 1 and 2 both edit the stop-conditions count, so this asserts
// the post-slice-2 total: nine conditions, six owned by this skill.
describe("pr-watch-as-reviewer skill: Dispute stands — a rejected verdict repeating after the viewer's own reply (design decisions 1, 2, 6)", () => {
  function actOnVerdictSection(): string {
    const t = squash(fileBody(POLL));
    const start = t.indexOf("Act on every verdict.");
    if (start < 0) return "";
    const end = t.indexOf("React to the settlement");
    return end > start ? t.slice(start, end) : t.slice(start);
  }

  test("a rejected verdict repeated on a thread that already carries the viewer's own reply below the first comment stops instead of rebutting", () => {
    // "first comment" and "stop" alone already appear in this section today
    // in unrelated sentences (the resolve rule, a resolve-failure note), so
    // the checks below pin the fuller phrases the design and structure both
    // use, which are absent until the new rule lands.
    const section = actOnVerdictSection();
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain("already carries");
    expect(section).toContain("below its first comment");
    expect(section).toContain("stop and report the thread and the disagreement");
  });

  test("addressed, answered, and pending verdicts still render and act exactly as today — the terminal-repeat rule is scoped to a rejected verdict only", () => {
    // The new rule lives in the Act-on-every-verdict section (per the plan);
    // "already carries" also appears earlier in the file in an unrelated
    // sentence, so the check is scoped here to avoid a false match on that.
    const section = actOnVerdictSection();
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain("already carries");
    // ...and the existing verdict-action table is untouched by it.
    expect(section).toContain("| **addressed** / **answered** | resolve the thread | nothing to resolve");
    expect(section).toContain("| **pending** | leave open, write nothing | leave open, write nothing |");
  });

  test("stop-conditions file names Dispute stands among nine conditions, six owned by this skill", () => {
    const t = squash(fileBody(STOP_CONDITIONS));
    expect(t).toContain("Dispute stands");
    expect(t).toContain("one of nine conditions");
    expect(t).toContain("adds six");
  });

  test("compaction-defense names Dispute stands in the stop-reason list", () => {
    expect(squash(fileBody(COMPACTION_DEFENSE))).toContain("Dispute stands");
  });

  test("01-hard-rules.md and 07-4-poll.md no longer claim there is no bound on rebuttals", () => {
    const hardRules = squash(fileBody(HARD_RULES));
    const poll = squash(fileBody(POLL));
    // Guard: an empty file must fail, not vacuously pass the absence checks.
    expect(hardRules.length).toBeGreaterThan(0);
    expect(poll.length).toBeGreaterThan(0);
    expect(hardRules).not.toContain("no round count anywhere");
    expect(poll).not.toContain("There is no rebuttal limit");
  });
});
