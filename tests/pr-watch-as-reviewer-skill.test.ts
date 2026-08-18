// tests/pr-watch-as-reviewer-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `pr-watch-as-reviewer` RUNTIME
// skill (skills/pr-watch-as-reviewer/SKILL.md) — the reviewer-side standalone
// watch-and-approve utility distributed to Team's users. Arming resolves the
// base repo from the canonical PR URL (never head-repository fields), fetches
// the viewer login once, refuses self-approval and zero-thread arms, then
// polls GitHub in ~31-minute cycles for up to 48 cycles (~24 h) until every
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

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// pr-watch-as-reviewer is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "pr-watch-as-reviewer", "SKILL.md");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(SKILL) ? read(SKILL) : "";
}
function fm(): string {
  return existsSync(SKILL) ? frontmatter(read(SKILL)) : "";
}
// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}

describe("pr-watch-as-reviewer skill: runtime standalone utility frontmatter", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: pr-watch-as-reviewer", () => {
    expect(/^name:\s*pr-watch-as-reviewer\s*$/m.test(fm())).toBe(true);
  });

  test("description carries trigger phrases incl. the literal /pr-watch-as-reviewer", () => {
    const f = flat(fm());
    expect(/description:.*Trigger on/i.test(f)).toBe(true);
    // Pin the FULL literal — a bare prefix of the name would false-pass.
    expect(f).toContain("/pr-watch-as-reviewer");
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
  test("sleeps in bounded chunks: the literal sleep 600 appears", () => {
    expect(body()).toContain("sleep 600");
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

describe("pr-watch-as-reviewer skill: README Codex removal command targets the guarded skill", () => {
  // Codex ignores disable-model-invocation, so the README tells Codex users
  // to remove this skill after installing. A rename or move of the skill
  // must fail the build until the README's removal path moves with it.
  const README = join(REPO_ROOT, "README.md");

  // Defensive read: missing file → "" so assertions FAIL (not throw).
  function readmeBody(): string {
    return existsSync(README) ? read(README) : "";
  }

  // Every rm -rf target must be a real skill that actually sets the flag —
  // a rename or move must fail the build until the README path moves with it.
  function removalTargets(readme: string): string[] {
    // Match the path shape only, never the surrounding prose, so a README
    // rewrite that keeps the paths correct stays green.
    return [...readme.matchAll(/rm -rf .*\/skills\/([A-Za-z0-9._-]+)/g)].map(
      (m) => m[1] ?? "",
    );
  }

  // Skills on disk that disable model invocation — the set the README owes
  // Codex users a removal line for.
  function guardedSkills(): string[] {
    const skillsRoot = join(REPO_ROOT, "skills");
    return readdirSync(skillsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => {
        const file = join(skillsRoot, name, "SKILL.md");
        if (!existsSync(file)) return false;
        return /^disable-model-invocation:\s*true\s*$/m.test(
          frontmatter(read(file)),
        );
      })
      .sort();
  }

  test("every rm -rf path names a skill that exists and disables model invocation", () => {
    const readme = readmeBody();
    // Guard: a missing README must fail cleanly, not vacuously pass.
    expect(readme.length).toBeGreaterThan(0);

    const targets = removalTargets(readme);
    expect(targets.length).toBeGreaterThan(0);

    for (const targetName of targets) {
      const targetSkill = join(REPO_ROOT, "skills", targetName, "SKILL.md");
      expect(existsSync(targetSkill)).toBe(true);

      const targetFrontmatter = existsSync(targetSkill)
        ? frontmatter(read(targetSkill))
        : "";
      expect(/^disable-model-invocation:\s*true\s*$/m.test(targetFrontmatter)).toBe(
        true,
      );
    }
  });

  test("the removal list covers every skill that disables model invocation", () => {
    // The dangerous direction: a NEW user-only skill ships, Codex ignores its
    // flag, and the README never tells anyone to remove it. Set equality
    // catches that as well as a stale line for a deleted skill.
    const readme = readmeBody();
    expect(readme.length).toBeGreaterThan(0);
    expect([...new Set(removalTargets(readme))].sort()).toEqual(guardedSkills());
  });
});
