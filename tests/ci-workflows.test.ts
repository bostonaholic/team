// tests/ci-workflows.test.ts
//
// L2 tripwire (free, deterministic): fences Slice 3 of
// docs/plans/2026-06-15-version-at-land-time — retire the per-PR version
// gate and slim the title backstop, while leaving the consuming workflows
// (release-on-merge, harness-checks) intact.
//
// Defensive reads: a missing workflow → "" so content assertions FAIL
// cleanly rather than throwing ENOENT (the mechanical gate rejects crashes).

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const WF = (name: string) => join(REPO_ROOT, ".github", "workflows", name);

const VERSION_GATE = WF("version-gate.yml");
const PR_TITLE_SYNC = WF("pr-title-sync.yml");
const RELEASE_ON_MERGE = WF("release-on-merge.yml");
const HARNESS_CHECKS = WF("harness-checks.yml");
const VERSION_BUMP_CHECK = WF("version-bump-check.yml");

function readIf(path: string): string {
  return existsSync(path) ? read(path) : "";
}

describe("ci workflows: version gate is retired (Slice 3)", () => {
  test(".github/workflows/version-gate.yml no longer exists", () => {
    // The dev version-bump skill owns the land-time bump, and the serialized
    // land (bump-then-/shipit) replaces the per-PR gate — so the gate it
    // enforced is dead. The file is deleted.
    expect(existsSync(VERSION_GATE)).toBe(false);
  });
});

describe("ci workflows: pr-title-sync slimmed to a backstop, loop-safe (Slice 3)", () => {
  const text = readIf(PR_TITLE_SYNC);

  test("pr-title-sync.yml still exists", () => {
    expect(existsSync(PR_TITLE_SYNC)).toBe(true);
  });

  test("retains the fork-PR guard (same-repo head only)", () => {
    expect(text).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
  });

  test("retains the github-actions[bot] actor guard (loop safety)", () => {
    expect(text).toContain("github.actor != 'github-actions[bot]'");
  });

  test("delegates the version decision to pr-title-version.sh (#104)", () => {
    // The branch-relative decision (head vs merge-base, strict forward bump)
    // lives in the script so it can be pinned by deterministic git-fixture
    // tests; the workflow only acts on its output.
    expect(text).toContain(".github/scripts/pr-title-version.sh");
  });

  test("only edits the title when the script prints a non-empty result", () => {
    // The empty-output → no-op early exit keeps the workflow from touching a
    // bump-less PR's title (and from looping on its own `edited` event).
    expect(/if \[ -z "\$WANT" \]/.test(text)).toBe(true);
  });

  test("retains the already-correct no-op early exit (loop safety)", () => {
    // The rewrite fires an `edited` event that re-enters the job; with the
    // title already correct it must exit without editing, so it cannot loop.
    expect(/if \[ "\$WANT" = "\$CURRENT_TITLE" \]/.test(text)).toBe(true);
  });

  test("computes the candidate from the head SHA, not a base-tip fetch (#104)", () => {
    // Regression fence: the misfire was reading the base BRANCH TIP. The fix
    // measures the head against the merge-base, so the title is passed by
    // head.sha and the old `git fetch origin "$BASE_REF"` base-tip read is gone.
    expect(text).toContain("github.event.pull_request.head.sha");
    expect(/git fetch origin "\$BASE_REF"/.test(text)).toBe(false);
  });
});

describe("ci workflows: pr-title-version.sh decides by merge-base, not base tip (#104)", () => {
  const SCRIPT = join(REPO_ROOT, ".github", "scripts", "pr-title-version.sh");
  const src = readIf(SCRIPT);

  test("pr-title-version.sh exists", () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  test("measures against the merge-base (fork point), not the base tip", () => {
    expect(/git merge-base/.test(src)).toBe(true);
  });
});

describe("ci workflows: the always-red runtime-vs-dev bump check is retired (#120)", () => {
  test("version-bump-check.yml no longer exists", () => {
    // Team assigns the version at land time, so the workflow was structurally
    // red for the whole review lifetime of every runtime PR. The invariant is
    // now enforced at the merge attempt by the pre-merge dev hook
    // (.claude/hooks/pre-merge-guard.mjs) plus early fail-fast runs inside the
    // dev version-bump skill — no workflow replaces it (binding user ruling).
    expect(existsSync(VERSION_BUMP_CHECK)).toBe(false);
  });
});

describe("ci workflows: version-bump-required.sh enforces the runtime-vs-dev invariant (#120)", () => {
  const SCRIPT = join(REPO_ROOT, ".github", "scripts", "version-bump-required.sh");
  const src = readIf(SCRIPT);

  test("version-bump-required.sh exists", () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  test("measures the bump against the merge-base (fork point), not the base tip", () => {
    expect(/git merge-base/.test(src)).toBe(true);
  });
});

describe("ci workflows: consuming workflows stay intact (Slice 3)", () => {
  const release = readIf(RELEASE_ON_MERGE);
  const harness = readIf(HARNESS_CHECKS);

  test("release-on-merge.yml still exists", () => {
    expect(existsSync(RELEASE_ON_MERGE)).toBe(true);
  });

  test("release-on-merge.yml still reads plugin.json for the version", () => {
    expect(release).toContain(".claude-plugin/plugin.json");
  });

  test("release-on-merge.yml still extracts the `## [X.Y.Z]` changelog section", () => {
    // The awk extraction that turns the dated section into release notes is
    // load-bearing — Slice 3 must not touch it (design Out of scope).
    expect(release).toContain("CHANGELOG.md");
    expect(/awk[^\n]*## \\\[/.test(release)).toBe(true);
  });

  test("harness-checks.yml still exists", () => {
    expect(existsSync(HARNESS_CHECKS)).toBe(true);
  });

  test("harness-checks.yml still runs `bun test` (the free gate)", () => {
    expect(/^\s*run:\s*bun test\s*$/m.test(harness)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// docs/plans/2026-08-28-rss-release-feed — the RSS release feed at /rss.xml.
// ---------------------------------------------------------------------------

const PAGES = WF("pages.yml");
const RELEASE_FEED_WRAPPER = join(REPO_ROOT, "script", "build-release-feed");
const DEV_YML = join(REPO_ROOT, "dev.yml");
const JEKYLL_CONFIG = join(REPO_ROOT, "docs", "_config.yml");

// Everything from `jobs:` onward. Slicing first matters: `on.push.paths`
// entries carry the SAME 6-space `- ` list marker as a step, so a naive split
// would read a path filter as a step.
function jobsSection(text: string): string {
  const at = text.indexOf("\njobs:");
  return at === -1 ? "" : text.slice(at);
}

// Each step block of a job, with its offset, so ordering is an index compare
// (the ordering tripwire at docs/testing.md:120).
function steps(jobs: string): { body: string; at: number }[] {
  const starts: number[] = [];
  const marker = /\n      - /g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(jobs)) !== null) starts.push(match.index + 1);
  return starts.map((start, i) => ({
    body: jobs.slice(start, starts[i + 1] ?? jobs.length),
    at: start,
  }));
}

function stepContaining(jobs: string, needle: string): { body: string; at: number } {
  return steps(jobs).find((step) => step.body.includes(needle)) ?? { body: "", at: -1 };
}

describe("ci workflows: pages.yml builds the release feed before Jekyll (Slice 1)", () => {
  const pages = readIf(PAGES);
  const jobs = jobsSection(pages);
  const wrapperStep = stepContaining(jobs, "script/build-release-feed");

  test("pages.yml still exists and has a jobs section", () => {
    // Guard: an empty slice would make every ordering assertion below
    // vacuous (docs/testing.md:172-212).
    expect(existsSync(PAGES)).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);
  });

  test("runs script/build-release-feed as a step of the build job", () => {
    expect(wrapperStep.body.length).toBeGreaterThan(0);
  });

  test("the wrapper step sits after ruby/setup-ruby@v1 and before Build site", () => {
    const ruby = jobs.indexOf("ruby/setup-ruby@v1");
    const buildSite = jobs.indexOf("name: Build site");
    expect(ruby).toBeGreaterThan(-1);
    expect(buildSite).toBeGreaterThan(-1);
    expect(wrapperStep.at).toBeGreaterThan(ruby);
    expect(wrapperStep.at).toBeLessThan(buildSite);
  });

  test("the wrapper step carries no working-directory: key (decision 6)", () => {
    // The wrapper anchors its own paths at the repo root, so a
    // working-directory would be a second, disagreeing contract.
    expect(wrapperStep.body.length).toBeGreaterThan(0);
    expect(wrapperStep.body).not.toContain("working-directory:");
  });

  test("sets up Bun before the wrapper step", () => {
    const bun = jobs.indexOf("oven-sh/setup-bun@v2");
    expect(bun).toBeGreaterThan(-1);
    expect(wrapperStep.at).toBeGreaterThan(bun);
  });

  test("installs libxml2-utils, after an apt-get update, before the wrapper step", () => {
    // xmllint is a hard gate on the deploy (decision 9), so the workflow
    // declares the package rather than inheriting it from the runner image.
    // The update is mandatory: a rotated package version otherwise 404s.
    const update = jobs.indexOf("apt-get update");
    const install = jobs.indexOf("apt-get install -y libxml2-utils");
    expect(update).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(update);
    expect(wrapperStep.at).toBeGreaterThan(install);
  });

  test("the push path filter covers both generator scripts", () => {
    // Otherwise editing the generator would never redeploy the site.
    const header = pages.slice(0, pages.indexOf("\njobs:"));
    expect(header.length).toBeGreaterThan(0);
    expect(header).toContain('"scripts/build-release-feed.ts"');
    expect(header).toContain('"script/build-release-feed"');
  });
});

describe("ci workflows: `dev docs` builds the feed on the local path (Slice 1)", () => {
  const dev = readIf(DEV_YML);
  const docsRun =
    /run: "([^"]*)"/.exec(/\n  docs:\n((?:    .*\n)+)/.exec(dev)?.[1] ?? "")?.[1] ?? "";

  test("dev.yml has a docs command with a run string", () => {
    expect(docsRun.length).toBeGreaterThan(0);
  });

  test("calls the wrapper before `cd docs`, joined by the && chain", () => {
    const wrapper = docsRun.indexOf("script/build-release-feed");
    const cd = docsRun.indexOf("cd docs");
    expect(wrapper).toBeGreaterThan(-1);
    expect(cd).toBeGreaterThan(wrapper);
    expect(docsRun.slice(wrapper, cd)).toContain("&&");
  });

  test("adds no `|| true` and swallows no exit code (the wrapper owns tolerance)", () => {
    // Decision 9 puts the CI-versus-local branch in ONE place. A caller-side
    // tolerance either duplicates that rule or quietly disagrees with it.
    expect(docsRun.length).toBeGreaterThan(0);
    expect(docsRun).not.toContain("|| true");
    expect(docsRun).not.toContain("|| :");
    expect(docsRun).not.toContain("; true");
  });
});

describe("ci workflows: the wrapper writes a temp file, checks it, then moves it (Slice 1)", () => {
  const wrapper = readIf(RELEASE_FEED_WRAPPER);

  test("script/build-release-feed exists", () => {
    expect(existsSync(RELEASE_FEED_WRAPPER)).toBe(true);
  });

  test("runs `xmllint --noout` before the move onto docs/rss.xml", () => {
    // No failed run may leave a truncated feed for Jekyll to publish.
    const lint = wrapper.indexOf("xmllint --noout");
    const move = wrapper.search(/^\s*mv\s/m);
    expect(lint).toBeGreaterThan(-1);
    expect(move).toBeGreaterThan(lint);
    expect(wrapper).toContain("docs/rss.xml");
  });
});

describe("ci workflows: baseurl stays empty for the feed's absolute URLs (decision 18)", () => {
  const config = readIf(JEKYLL_CONFIG);
  const lines = config.split("\n");
  const at = lines.findIndex((line) => /^\s*baseurl:\s*""/.test(line));

  test("docs/_config.yml sets baseurl to the empty string", () => {
    expect(at).toBeGreaterThan(-1);
  });

  test("an adjacent comment names the feed as the reason", () => {
    // The feed derives absolute URLs from `url` alone, which is only correct
    // while baseurl is empty. A future maintainer who sets one gets a red test
    // that says why.
    expect(at).toBeGreaterThan(-1);
    const neighborhood = lines.slice(Math.max(0, at - 3), at + 2).join("\n");
    expect(neighborhood).toContain("rss.xml");
  });
});
