// tests/nuke-team-plugin-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the DEV `nuke-team-plugin` skill
// (.claude/skills/nuke-team-plugin/SKILL.md) — Team's instruction-surface nuke
// experiment (docs/plans/2026-08-28-nuke-team-plugin). It archives, removes,
// and selectively restores Team's own skills/agents/hooks on a throwaway
// experiment branch, then repoints the plugin cache so the experiment is live.
//
// What this file pins, per docs/testing.md §L2: frontmatter keys and values,
// the commands and template strings the body tells the model to emit, the
// hard-coded deletion-set roots, section headings, and the order of two
// headings. Never a wording, never a proximity span, never a file length.
// Every absence assertion carries a length guard plus a positive control, so a
// renamed heading fails loudly instead of turning the sweep into a green no-op.
//
// Describe blocks are named with the acceptance criteria verbatim from
// docs/plans/2026-08-28-nuke-team-plugin/structure.md, one describe per named
// criterion, grouped by slice so a slice's fence can be run in isolation:
//   bun test tests/nuke-team-plugin-skill.test.ts -t "Slice 3"
//
// Defensive reads: a missing file → "" and a missing section → "", so every
// content assertion FAILS cleanly rather than throwing ENOENT. The mechanical
// gate rejects crashes, not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";

const REPO_ROOT = process.cwd();
// nuke-team-plugin is a DEV skill — it lives under .claude/ (not distributed),
// which is why it costs no version bump and no docs/skills.md entry.
const SKILL = join(
  REPO_ROOT,
  ".claude",
  "skills",
  "nuke-team-plugin",
  "SKILL.md",
);
const AGENTS_MD = join(REPO_ROOT, "AGENTS.md");

function readIf(path: string): string {
  return existsSync(path) ? read(path) : "";
}
function body(): string {
  return readIf(SKILL);
}
function fm(): string {
  return frontmatter(readIf(SKILL));
}
function agents(): string {
  return readIf(AGENTS_MD);
}

// Slice the body from the heading matching `re` to the next heading at the
// same or a shallower level. A heading that does not exist yields "" — the
// length guard on each dependent assertion then fails rather than passing
// vacuously (docs/testing.md, "Prove a negative check can find a positive").
function sectionFrom(re: RegExp): string {
  const lines = body().split("\n");
  const start = lines.findIndex((line) => re.test(line));
  if (start < 0) return "";
  const hashes = lines[start]!.match(/^#+/);
  const level = hashes ? hashes[0].length : 6;
  const boundary = new RegExp(`^#{1,${level}}\\s`);
  for (let i = start + 1; i < lines.length; i++) {
    if (boundary.test(lines[i]!)) return lines.slice(start, i).join("\n");
  }
  return lines.slice(start).join("\n");
}

function lineIndex(text: string, re: RegExp): number {
  return text.split("\n").findIndex((line) => re.test(line));
}

// The three sections the later slices assert against, each pinned by its
// heading — a rename is a real contract change and must fail the build.
const RESTORE_HEADING = /^##\s+Restore mode\b/;
const CACHE_STEP_HEADING = /^#{2,4}\s*Step\s+\d+\b.*cache/i;
const COMMIT_STEP_HEADING = /^#{2,4}\s*Step\s+\d+\b.*commit/i;
const TEARDOWN_HEADING = /^#{2,6}\s.*teardown/i;

function restoreSection(): string {
  return sectionFrom(RESTORE_HEADING);
}
function cacheSection(): string {
  return sectionFrom(CACHE_STEP_HEADING);
}
function teardownSection(): string {
  return sectionFrom(TEARDOWN_HEADING);
}

// Extract the markdown table that starts with `header`, up to the first blank
// line. "" when the header row is absent.
function tableAfter(text: string, header: string): string {
  const start = text.indexOf(header);
  if (start < 0) return "";
  const rest = text.slice(start);
  const end = rest.indexOf("\n\n");
  return end >= 0 ? rest.slice(0, end) : rest;
}

// --- Matchers used by the negative sweeps, each with a positive control ------

// The self-containment ban of Decision 7: no directive telling the model to
// read another instruction file, since every other one is deleted by the nuke.
// Non-global so `.test()` carries no lastIndex between calls.
const LOAD_DIRECTIVE = /^\s*>?\s*(Load|Follow)\b.*SKILL\.md/m;

// Version arithmetic on the cache entry (Decision 5's rejected alternative):
// the live entry was named by whichever checkout last ran the installer, so a
// version read today can name a directory that does not exist.
const VERSION_ARITHMETIC = /PLUGIN_VERSION|\.claude-plugin\/plugin\.json/;

// A `rm -rf` whose target ends in `/`. BSD `rm -rf link/` follows the symlink
// and deletes the checkout it points at (design-review-5.md:59).
const RM_RF_TRAILING_SLASH =
  /rm -rf\s+(?:"[^"]*"|'[^']*'|[^\s"']+)\/(?:\s|$)/;

// `$` followed by a digit — the slash-command loader substitutes it as
// `$ARGUMENTS[N]` before the model reads the body.
const POSITIONAL = /\$[0-9]/;

// awk positional field extraction, which is how the `$<digit>` token would get
// into the body (design.md:346 spells the membership gate that way).
const AWK_POSITIONAL = /awk\s+'\{\s*print/;

// The two narrower write-scope phrasings the review Major (design.md:806)
// rejected. Reproducing either builds a restore that cannot restore
// `runtime-hooks` or `dev-hooks`, whose manifest state is a hash, not `-`.
const NARROW_WRITE_SCOPE = [
  "the paths the nuke actually removed",
  "only writes recorded-absent paths",
];

// Either half of a tag deletion. Neither tag is ever removed by the skill:
// `nuke-baseline/<date>` is the archive, `nuke-result/<date>` is the
// experiment's only durable record. Non-global, so `.test()` carries no
// lastIndex between calls.
const TAG_DELETION = /\btag -d\b|\bpush --delete\b/;

// Decision 13's hard-coded scope check: every manifest path must sit inside one
// of these roots, and the roots live in the skill body, never in NUKE.md.
const DELETION_SET_ROOTS = [
  "AGENTS.md",
  "CLAUDE.md",
  "skills/",
  "agents/",
  "hooks/",
  ".claude/hooks/",
  ".claude/skills/",
  ".claude-plugin/plugin.json",
  ".claude/settings.json",
];

// ===========================================================================
// Slice 1: Nuke mode — archive, isolate, remove
// ===========================================================================

describe("Slice 1: frontmatter carries name + disable-model-invocation: true, no skills: key, and no Load/Follow …SKILL.md directive", () => {
  test("the skill file lives under .claude/skills (dev-only, never distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: nuke-team-plugin", () => {
    expect(/^name:\s*nuke-team-plugin\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter declares disable-model-invocation: true (anything that deletes is user-invocable only)", () => {
    expect(/^disable-model-invocation:\s*true\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter carries an argument-hint naming the restore mode", () => {
    expect(/^argument-hint:/m.test(fm())).toBe(true);
    expect(fm()).toContain("restore");
  });

  test("description is a block scalar", () => {
    expect(/^description:\s*\|\s*$/m.test(fm())).toBe(true);
  });

  test("description names the /nuke-team-plugin command", () => {
    expect(squash(fm())).toContain("/nuke-team-plugin");
  });

  test("description carries the shipit-style explicit-intent guard", () => {
    // The shared literal both `shipit` and `version-bump` use to fence an
    // irreversible action behind stated user intent.
    expect(squash(fm())).toContain("Invoke ONLY on explicit");
  });

  test("frontmatter carries no skills: key (Decision 7 self-containment)", () => {
    // Guard: empty frontmatter must fail, not vacuously pass the absence check.
    expect(fm().length).toBeGreaterThan(0);
    expect(/^skills:/m.test(fm())).toBe(false);
  });

  test("frontmatter carries no effort: key (dev skills carry none)", () => {
    expect(fm().length).toBeGreaterThan(0);
    expect(/^effort:/m.test(fm())).toBe(false);
  });

  test("the Load/Follow matcher fires on a planted directive", () => {
    const planted = "> Follow `skills/progress-tracking/SKILL.md`: seed a todo.";
    expect(LOAD_DIRECTIVE.test(planted)).toBe(true);
  });

  test("no body line directs the model to Load or Follow another SKILL.md", () => {
    expect(body().length).toBeGreaterThan(0);
    expect(LOAD_DIRECTIVE.test(body())).toBe(false);
  });

  test("the body names skills/ as a deletion-set path (present, never absent)", () => {
    expect(body()).toContain("skills/");
  });

  test("the body names agents/ as a deletion-set path (present, never absent)", () => {
    expect(body()).toContain("agents/");
  });
});

describe('Slice 1: nuke steps split the two scopes — repo-level commands run at "$PRIMARY_ROOT", tree mutations run at "$WORKTREE" — and baseline-tag reuse requires peeled ^{} equality + cat-file -t tag + tag -v', () => {
  test("repo-level git commands are scoped to the derived primary root", () => {
    expect(body()).toContain(`git -C "$PRIMARY_ROOT"`);
  });

  test("tree mutations are scoped to the experiment worktree", () => {
    expect(body()).toContain(`git -C "$WORKTREE"`);
  });

  test("the primary root is derived from --git-common-dir, never from the invoking directory", () => {
    expect(body()).toContain("--git-common-dir");
  });

  test("the primary root is validated against worktree list --porcelain", () => {
    expect(body()).toContain("worktree list --porcelain");
  });

  test("PRIMARY_ROOT is re-derived behind a standalone ${VAR:?} guard", () => {
    expect(body()).toContain(`: "\${PRIMARY_ROOT:?}"`);
  });

  test("WORKTREE is re-derived behind a standalone ${VAR:?} guard", () => {
    expect(body()).toContain(`: "\${WORKTREE:?}"`);
  });

  test("baseline-tag reuse compares the peeled ^{} SHA, never the tag object's own", () => {
    expect(body()).toContain("^{}");
  });

  test("baseline-tag reuse proves the tag is annotated with cat-file -t", () => {
    expect(body()).toContain("cat-file -t");
  });

  test("baseline-tag reuse proves the signature with git tag -v", () => {
    expect(body()).toContain("git tag -v");
  });

  test("tags are created annotated, signed, and with an explicit -m (a bare git tag opens $EDITOR)", () => {
    expect(body()).toContain("tag -a -s -m");
  });

  test("the baseline tag is named in the nuke-baseline/ namespace", () => {
    expect(body()).toContain("nuke-baseline/");
  });

  test("the manifest is carried in a fenced block with the nuke-manifest info string", () => {
    expect(body()).toContain("nuke-manifest");
  });

  test("the recorded post-nuke state of an edited manifest is a git hash-object value", () => {
    expect(body()).toContain("git hash-object");
  });

  test("membership is proved by exact match with grep -qxF", () => {
    expect(body()).toContain("grep -qxF");
  });

  test("path syntax is checked under LC_ALL=C", () => {
    expect(body()).toContain("LC_ALL=C");
  });

  test("the recovery line is a whole-tree git reset --hard to the archive SHA", () => {
    expect(body()).toContain("git reset --hard");
  });
});

describe("Slice 1: the remote baseline pre-flight refuses a lightweight remote tag (an unpeeled refs/tags row with no ^{} companion), not only a differing peeled SHA", () => {
  // The pre-flight reads `git ls-remote --tags origin`, which lists an
  // annotated tag's own object SHA on `refs/tags/<name>` and the commit on
  // `refs/tags/<name>^{}`. A lightweight remote tag has NO `^{}` row at all,
  // so a peeled-row-only comparison is vacuous against it (design.md:714).
  function lsRemoteBlock(): string {
    const blocks = [...body().matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map(
      (m) => m[1]!,
    );
    return blocks.filter((b) => b.includes("ls-remote --tags")).join("\n");
  }

  test("a fenced block runs the ls-remote --tags pre-flight", () => {
    expect(lsRemoteBlock().length).toBeGreaterThan(0);
  });

  test("that block reads the unpeeled refs/tags/nuke-baseline row", () => {
    expect(lsRemoteBlock()).toContain("refs/tags/nuke-baseline/");
  });

  test("that block also reads the row's ^{} companion, so a missing companion is detectable", () => {
    expect(lsRemoteBlock()).toContain("^{}");
  });

  // The three above only pin the argv, which a body that reads both rows and
  // then ignores the lightweight case would still satisfy. These pin the
  // refusal itself: the two rows are bound to named variables, compared, and
  // the comparison ends in a refusal.
  test("the two rows are bound to named variables, so they can be compared at all", () => {
    expect(lsRemoteBlock()).toContain("UNPEELED_ROW=");
    expect(lsRemoteBlock()).toContain("PEELED_ROW=");
  });

  test('an unpeeled row with NO peeled companion is the refused condition', () => {
    // Reading both rows is not the correction; refusing on
    // "present unpeeled AND absent peeled" is (design.md:714).
    expect(squash(lsRemoteBlock())).toContain(
      `[ -n "$UNPEELED_ROW" ] && [ -z "$PEELED_ROW" ]`,
    );
  });

  test("that condition refuses, naming the lightweight tag", () => {
    expect(lsRemoteBlock()).toContain("refusing:");
    expect(lsRemoteBlock()).toContain("LIGHTWEIGHT");
  });

  test("a peeled row that differs from the archive SHA is refused separately", () => {
    expect(squash(lsRemoteBlock())).toContain(
      `[ "$PEELED_ROW" != "$ARCHIVE_SHA" ]`,
    );
  });

  test("the pre-flight is read-only, so it never creates the local tag it may refuse", () => {
    // Ordering correction: the remote pre-flight runs before `tag -a -s`, so a
    // refusal leaves no stray local tag behind.
    const preflight = lineIndex(body(), /ls-remote --tags origin/);
    const create = lineIndex(body(), /tag -a -s -m "Team instruction surface/);
    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(preflight);
    expect(lsRemoteBlock()).not.toContain("tag -a -s");
  });
});

// ===========================================================================
// Slice 2: Liveness — repoint the plugin cache
// ===========================================================================

describe('Slice 2: the cache entry is identified by readlink equality with "$PRIMARY_ROOT" and never by version arithmetic, and each of the four zero-match cases carries its own remediation', () => {
  test("a cache-repoint step section exists", () => {
    expect(cacheSection().length).toBeGreaterThan(0);
  });

  test("the entry is matched by its readlink target", () => {
    expect(body()).toContain("readlink");
  });

  test("the search is scoped to the Claude Code dev plugin cache directory", () => {
    expect(body()).toContain("~/.claude/plugins/cache/team-dev/team");
  });

  test("the never-installed and real-directory cases route to script/dev-install claude", () => {
    expect(body()).toContain("script/dev-install claude");
  });

  test("the foreign-symlink case says to remove the stale link first", () => {
    // `script/dev-install claude` is a no-op here — the installer skips an
    // existing symlink (script/dev-install-claude:14,27).
    expect(body()).toContain("rm <entry>");
  });

  test("the earlier-experiment case is named by its team-nuke-<date> worktree", () => {
    expect(body()).toContain("team-nuke-");
  });

  test("the version-arithmetic matcher fires on a planted derivation", () => {
    const planted = 'PLUGIN_VERSION="$(jq -r .version .claude-plugin/plugin.json)"';
    expect(VERSION_ARITHMETIC.test(planted)).toBe(true);
  });

  test("the cache section derives no entry path from a version string", () => {
    expect(cacheSection().length).toBeGreaterThan(0);
    expect(VERSION_ARITHMETIC.test(cacheSection())).toBe(false);
  });
});

describe("Slice 2: the cache-repoint step heading appears after the commit step heading", () => {
  test("a commit step heading is present", () => {
    expect(lineIndex(body(), COMMIT_STEP_HEADING)).toBeGreaterThanOrEqual(0);
  });

  test("a cache-repoint step heading is present", () => {
    expect(lineIndex(body(), CACHE_STEP_HEADING)).toBeGreaterThanOrEqual(0);
  });

  test("the cache repoint runs AFTER the nuke commit, never before it", () => {
    // The commit must exist before the machine-wide link moves: a declined or
    // failed repoint then leaves the commit standing, never a rollback.
    const commit = lineIndex(body(), COMMIT_STEP_HEADING);
    const cache = lineIndex(body(), CACHE_STEP_HEADING);
    expect(commit).toBeGreaterThanOrEqual(0);
    expect(cache).toBeGreaterThan(commit);
  });
});

describe("Slice 2: the repoint target carries no trailing slash (or uses ln -sfn)", () => {
  test("the trailing-slash matcher fires on a planted rm -rf target", () => {
    expect(RM_RF_TRAILING_SLASH.test(`rm -rf "$ENTRY"/`)).toBe(true);
  });

  test("the trailing-slash matcher does not fire on a slash-free target", () => {
    expect(RM_RF_TRAILING_SLASH.test(`rm -rf "$ENTRY"`)).toBe(false);
  });

  test("no rm -rf line in the body ends its target with a trailing slash", () => {
    // BSD `rm -rf link/` follows the symlink and empties the checkout behind
    // it (design-review-5.md:59).
    expect(body().length).toBeGreaterThan(0);
    const offenders = body()
      .split("\n")
      .filter((line) => RM_RF_TRAILING_SLASH.test(line))
      .map((line) => line.trim());
    expect(offenders).toEqual([]);
  });
});

// ===========================================================================
// Slice 3: Selective restore
// ===========================================================================

describe("Slice 3: restore proves before it writes: exactly one nuke-manifest block, exact-match membership, LC_ALL=C path syntax plus containment in the hard-coded deletion set, tag shape + git tag -v, and the checkout runs against the peeled <tag>^{} SHA and never against the recorded string", () => {
  test("a Restore mode section exists", () => {
    expect(restoreSection().length).toBeGreaterThan(0);
  });

  test("restore reads the manifest from the nuke-manifest fenced block", () => {
    expect(restoreSection()).toContain("nuke-manifest");
  });

  test("the item id is extracted with the digit-free cut -d' ' -f1", () => {
    expect(restoreSection()).toContain(`cut -d' ' -f1`);
  });

  test("membership is proved by exact match with grep -qxF", () => {
    expect(restoreSection()).toContain("grep -qxF");
  });

  test("the path syntax check runs under LC_ALL=C", () => {
    expect(restoreSection()).toContain("LC_ALL=C");
  });

  test("the recorded baseline tag must match the dated nuke-baseline shape", () => {
    expect(restoreSection()).toContain(
      "^nuke-baseline/[0-9]{4}-[0-9]{2}-[0-9]{2}$",
    );
  });

  test("the baseline tag's signature is verified with git tag -v before any write", () => {
    expect(restoreSection()).toContain("git tag -v");
  });

  test("the trusted archive commit comes from the peeled <tag>^{} SHA", () => {
    // The recorded ARCHIVE_SHA is untrusted (NUKE.md is a tracked file anyone
    // can edit); only the tag is signed, so the checkout runs against the
    // peeled value and the recorded field is a cross-check (Decision 13).
    expect(restoreSection()).toContain("^{}");
  });

  test("the recorded-state gate checks the index, not only the working tree", () => {
    // Bound to $TOPLEVEL, not to the caller's cwd: R6 and R7 must read and
    // write the same tree, which is the one R2 proved.
    expect(restoreSection()).toContain(`git -C "$TOPLEVEL" ls-files`);
  });

  test("the recorded-state gate compares the staged blob with git rev-parse ':<path>'", () => {
    expect(restoreSection()).toContain(`git -C "$TOPLEVEL" rev-parse ":`);
  });

  test("the recorded-state gate compares the working file with git hash-object", () => {
    expect(restoreSection()).toContain(`git -C "$TOPLEVEL" hash-object`);
  });

  test("the only restore write is bound to the proved toplevel, never to the caller's cwd", () => {
    expect(restoreSection()).toContain(`git -C "$TOPLEVEL" checkout "$ARCHIVE" --`);
  });

  for (const root of DELETION_SET_ROOTS) {
    test(`the deletion-set root ${root} is hard-coded in the skill body`, () => {
      expect(body()).toContain(root);
    });
  }

  test("the skill's own directory is excluded from the scope check", () => {
    expect(body()).toContain(".claude/skills/nuke-team-plugin/");
  });
});

describe("Slice 3: restore's write scope is stated one way: every present path on the item's line, including whole-file checkout of a present-with-hash manifest; absent paths are skipped and named", () => {
  test("the write scope distinguishes present paths", () => {
    expect(restoreSection()).toContain("present");
  });

  test("the write scope names absent paths as skipped", () => {
    expect(restoreSection()).toContain("absent");
  });

  test("the runtime-hooks group item is restorable", () => {
    expect(body()).toContain("runtime-hooks");
  });

  test("the dev-hooks group item is restorable", () => {
    expect(body()).toContain("dev-hooks");
  });

  test("the narrow-phrasing matcher fires on a planted statement", () => {
    const planted = "Restore writes the paths the nuke actually removed.";
    expect(NARROW_WRITE_SCOPE.some((p) => planted.includes(p))).toBe(true);
  });

  test("the body never says restore writes only the paths the nuke removed", () => {
    // Either narrower phrasing builds a restore that silently cannot return
    // runtime-hooks or dev-hooks, whose state is a hash, not `-`
    // (review Major, design.md:806).
    expect(body().length).toBeGreaterThan(0);
    expect(squash(body())).not.toContain(NARROW_WRITE_SCOPE[0]!);
  });

  test("the body never says restore only writes recorded-absent paths", () => {
    expect(body().length).toBeGreaterThan(0);
    expect(squash(body())).not.toContain(NARROW_WRITE_SCOPE[1]!);
  });
});

describe("Slice 3: restore refuses when the worktree toplevel equals the derived primary root, and the re-restore escape clears the index (git rm -f / a checkout of the nuke commit), not only the file", () => {
  test("restore derives the toplevel with rev-parse --show-toplevel", () => {
    expect(restoreSection()).toContain("--show-toplevel");
  });

  test("restore derives the primary root so it can refuse a toplevel that equals it", () => {
    // The `present <hash>` branch is reachable in a non-nuked tree, so the
    // `-`-only state argument is not the containment proof (design.md:437).
    expect(restoreSection()).toContain("--git-common-dir");
  });

  // Deriving both values is not the correction; comparing them and refusing on
  // equality is. These three pin the comparison, its refusal, and the positive
  // containment proof that a bare "not the primary clone" leaves out.
  test("the derived toplevel is COMPARED with the derived primary root", () => {
    expect(squash(restoreSection())).toContain(
      `[ "$TOPLEVEL" != "$PRIMARY_ROOT" ]`,
    );
  });

  test("that comparison refuses, saying the toplevel is the primary clone", () => {
    expect(restoreSection()).toContain("refusing:");
    expect(squash(restoreSection())).toContain("is the primary clone");
  });

  test("containment is proved positively, not only by excluding the primary clone", () => {
    // "Not the primary clone" admits every other checkout on the machine. The
    // toplevel must carry the team-nuke-<date> shape AND be a registered
    // worktree of the derived primary root.
    expect(restoreSection()).toContain("team-nuke-[0-9]");
    expect(squash(restoreSection())).toContain(
      `git -C "$PRIMARY_ROOT" worktree list --porcelain | grep -qxF "worktree ${"${TOPLEVEL}"}"`,
    );
  });

  test("the recorded branch is shape-checked before it is compared", () => {
    // NUKE.md is data: every allowlisted field it holds carries a shape check.
    expect(restoreSection()).toContain("experiment/nuke-[0-9]");
  });

  test("the nuke commit is derived, never read from NUKE.md, with rev-list --ancestry-path", () => {
    // NUKE.md sits inside the nuke commit and cannot record its own SHA.
    expect(restoreSection()).toContain("rev-list --ancestry-path");
  });

  test("the derived nuke commit is guarded by proving its parent is the peeled archive SHA", () => {
    expect(restoreSection()).toContain(`\${NUKE_COMMIT}^`);
  });

  test("a `-` state path is cleared from tree AND index with git rm -r -f", () => {
    // A filesystem `rm` leaves the index entry, so the stated escape would
    // never clear the recorded-state gate (design.md:426).
    expect(restoreSection()).toContain(`git -C "$TOPLEVEL" rm -r -f --`);
  });

  test("a hashed manifest is returned by checking out the nuke commit, restoring the exact bytes the nuke wrote", () => {
    expect(restoreSection()).toContain(
      `git -C "$TOPLEVEL" checkout "$NUKE_COMMIT" --`,
    );
  });
});

// ===========================================================================
// Slice 4: Teardown that preserves the experiment
// ===========================================================================

describe("Slice 4: in the NUKE.md teardown template the nuke-result/ tag line precedes the worktree remove line and branch -D is last", () => {
  test("a teardown section exists in the NUKE.md template", () => {
    expect(teardownSection().length).toBeGreaterThan(0);
  });

  test("the teardown tag command names the nuke-result/ namespace", () => {
    const line = teardownSection()
      .split("\n")
      .find((l) => /tag -a -s -m/.test(l));
    expect(line ?? "").toContain("nuke-result/");
  });

  test("the nuke-result/ tag line comes BEFORE the worktree remove line", () => {
    // Preservation first: four steps separate the tag from the branch -D, and
    // the tag is what keeps every commit reachable afterwards (Decision 17).
    const tag = lineIndex(teardownSection(), /tag -a -s -m/);
    const remove = lineIndex(teardownSection(), /worktree remove/);
    expect(tag).toBeGreaterThanOrEqual(0);
    expect(remove).toBeGreaterThan(tag);
  });

  test("branch -D comes last, after the worktree remove line", () => {
    const remove = lineIndex(teardownSection(), /worktree remove/);
    const branch = lineIndex(teardownSection(), /branch -D/);
    expect(remove).toBeGreaterThanOrEqual(0);
    expect(branch).toBeGreaterThan(remove);
  });
});

describe("Slice 4: teardown carries no tag-deletion command anywhere, no --force on worktree remove, both tags created with an explicit -m, and the .2 collision line written literally beneath step 1", () => {
  test("the tag-deletion matcher fires on planted local and remote deletions", () => {
    // Controls the matcher the absence sweeps below actually use — asserting a
    // literal contains its own substring would prove nothing about them.
    expect(TAG_DELETION.test("git tag -d nuke-result/2026-08-28")).toBe(true);
    expect(
      TAG_DELETION.test("git push --delete origin nuke-result/2026-08-28"),
    ).toBe(true);
    expect(TAG_DELETION.test("git tag -a -s -m msg nuke-result/<date>")).toBe(
      false,
    );
  });

  test("the teardown section carries no local or remote tag deletion", () => {
    expect(teardownSection().length).toBeGreaterThan(0);
    const offenders = teardownSection()
      .split("\n")
      .filter((line) => TAG_DELETION.test(line))
      .map((line) => line.trim());
    expect(offenders).toEqual([]);
  });

  test("no worktree remove line carries --force", () => {
    // Mirrors skills/pr-cleanup/SKILL.md:388-391 — an uncommitted restore
    // stops the removal and shows itself instead of vanishing.
    expect(teardownSection().length).toBeGreaterThan(0);
    const forced = teardownSection()
      .split("\n")
      .filter((line) => /worktree remove/.test(line) && line.includes("--force"))
      .map((line) => line.trim());
    expect(forced).toEqual([]);
  });

  test("the teardown result tag is annotated, signed, and carries an explicit -m", () => {
    expect(teardownSection()).toContain("tag -a -s -m");
  });

  test("both tags in the body are created with an explicit -m", () => {
    const count = (body().match(/tag -a -s -m/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("the .2 collision line is written literally beneath step 1", () => {
    // Never `-f`: the tag in the way is the other run's only durable copy.
    expect(teardownSection()).toContain("nuke-result/<date>.2");
  });
});

describe("Slice 4: the tip-equality proof names git -C <primary root> on both halves and compares the SHA at the start of the ls-remote line", () => {
  test("the ls-remote proof line is scoped with git -C <primary root>", () => {
    const line = teardownSection()
      .split("\n")
      .find((l) => l.includes("ls-remote --tags"));
    expect(line ?? "").toContain("git -C <primary root>");
  });

  test("the branch-tip rev-parse proof line is scoped with git -C <primary root>", () => {
    const line = teardownSection()
      .split("\n")
      .find((l) => /rev-parse experiment\/nuke-/.test(l));
    expect(line ?? "").toContain("git -C <primary root>");
  });

  test("the ls-remote proof reads the peeled refs/tags/nuke-result ref", () => {
    expect(teardownSection()).toContain("refs/tags/nuke-result/<date>^{}");
  });

  test("the ls-remote proof takes the SHA at the start of the line with a digit-free cut -f1", () => {
    expect(teardownSection()).toContain("cut -f1");
  });
});

// ===========================================================================
// Cross-slice concerns (structure.md ## Cross-slice concerns)
// ===========================================================================

describe("Cross-slice: no $<digit> the slash-command loader would substitute, and fields are read with cut", () => {
  test("the positional matcher fires on a planted awk field reference", () => {
    const planted = `awk '{print $1}'`;
    expect(POSITIONAL.test(planted)).toBe(true);
    expect(AWK_POSITIONAL.test(planted)).toBe(true);
  });

  test("the skill body contains no $<digit>", () => {
    expect(body().length).toBeGreaterThan(0);
    const offenders = body()
      .split("\n")
      .map((line, index) => ({ line: index + 1, text: line }))
      .filter((entry) => POSITIONAL.test(entry.text))
      .map((entry) => `SKILL.md:${entry.line}: ${entry.text.trim()}`);
    expect(offenders).toEqual([]);
  });

  test("the skill body uses no awk positional field extraction", () => {
    expect(body().length).toBeGreaterThan(0);
    expect(AWK_POSITIONAL.test(body())).toBe(false);
  });

  test("manifest fields are read with the digit-free cut -d' ' -f1", () => {
    expect(body()).toContain(`cut -d' ' -f1`);
  });
});

describe("Cross-slice: AGENTS.md registers the skill as a development concern only", () => {
  const DEV_TABLE_HEADER = "| Concern | Where it lives | Who runs it |";
  const ENTRY_POINTS_HEADER = "| Command | Phase |";

  test("the runtime-vs-development table is present in AGENTS.md", () => {
    expect(tableAfter(agents(), DEV_TABLE_HEADER).length).toBeGreaterThan(0);
  });

  test("the dev table carries a row pointing at .claude/skills/nuke-team-plugin/", () => {
    expect(tableAfter(agents(), DEV_TABLE_HEADER)).toContain(
      "`.claude/skills/nuke-team-plugin/`",
    );
  });

  test("that row is owned by Plugin developers", () => {
    const row = tableAfter(agents(), DEV_TABLE_HEADER)
      .split("\n")
      .find((line) => line.includes(".claude/skills/nuke-team-plugin/"));
    expect(row ?? "").toContain("Plugin developers");
  });

  test("the Entry points table is present in AGENTS.md", () => {
    expect(tableAfter(agents(), ENTRY_POINTS_HEADER).length).toBeGreaterThan(0);
  });

  test("no Entry points row is added — the skill is disable-model-invocation, so it wants no routing-map line", () => {
    const entryPoints = tableAfter(agents(), ENTRY_POINTS_HEADER);
    // Guard: a missing table must fail, not vacuously pass the absence check.
    expect(entryPoints.length).toBeGreaterThan(0);
    expect(entryPoints).not.toContain("nuke-team-plugin");
  });
});

// ===========================================================================
// Round-2 review-fix tripwires (docs/plans/2026-08-28-nuke-team-plugin,
// design-review-5.md). Each pins a mechanic the round-2 gate found missing:
// untrusted NUKE.md values reaching the shell as literals (security CRITICAL),
// the zsh-hostile generator loop (code B1), restore bindings that never re-prove
// (code B2), and the manifest-fence / R4 / R5 hardening (security MEDIUM).
// ===========================================================================

// A bare `LINES=` assignment — the zsh special integer parameter (terminal
// height). Assigning a manifest string to it makes zsh arithmetic-evaluate the
// value on next use and abort. `MANIFEST_LINES` is the safe name; this matcher
// must NOT fire on it, so it is anchored to a non-name character before LINES.
const BARE_LINES_ASSIGN = /(^|[^A-Za-z0-9_])LINES=/m;

// A `for X in $VAR` loop over an unquoted expansion — zsh does not word-split
// it, so the loop runs once over the whole blob (code B1). Literal-list loops
// (`for p in AGENTS.md ...`) carry no `$` and never match.
const FOR_IN_UNQUOTED = /for\s+\w+\s+in\s+\$/;

describe("Round 2: untrusted NUKE.md values are bound by file-reading command substitution, never retyped (security CRITICAL S-C1)", () => {
  test("the item argument is bound by a single-quoted here-doc, so $(...) in it is inert", () => {
    expect(restoreSection()).toContain(`IFS= read -r ITEM <<'RESTORE_ITEM'`);
  });

  test("the recorded branch is read from NUKE.md by sed, not retyped", () => {
    expect(restoreSection()).toContain(
      `RECORDED_BRANCH="$(sed -n 's/^- Branch: //p'`,
    );
  });

  test("the recorded baseline tag is read from NUKE.md by sed, not retyped", () => {
    expect(restoreSection()).toContain(
      `RECORDED_TAG="$(sed -n 's/^- Baseline tag: //p'`,
    );
  });

  test("the recorded archive SHA is read from NUKE.md by sed, not retyped", () => {
    expect(restoreSection()).toContain(
      `RECORDED_ARCHIVE_SHA="$(sed -n 's/^- Archive SHA: //p'`,
    );
  });

  test("the cache-undo entry is read from NUKE.md by grep/sed before the equality gate (step 7)", () => {
    expect(body()).toContain(`RECORDED_ENTRY="$(grep -E '^ln -sfn '`);
  });

  test("step 7 refuses unless the recorded entry equals the discovered live entry", () => {
    // Mutant target: delete this equality and the undo line can name any path.
    expect(body()).toContain(`[ "$CACHE_ENTRY" = "$RECORDED_ENTRY" ]`);
  });

  test("Hard Rule 12 bans a NUKE.md/argument value as literal text in a command", () => {
    expect(squash(body())).toContain(
      "A value from `NUKE.md` or the `<item>` argument is never typed into a command",
    );
  });

  test("manifest triples are split with parameter expansion, never read by eye", () => {
    // ${REST%% *} peels one whitespace-delimited field with no subshell.
    expect(restoreSection()).toContain(`tok="${"${REST%% *}"}"`);
  });
});

describe("Round 2: the manifest variable is MANIFEST_LINES, never the zsh special LINES (code B1 / restore)", () => {
  test("the bare-LINES matcher fires on a planted assignment", () => {
    expect(BARE_LINES_ASSIGN.test('\nLINES="$(sed -n ...)"')).toBe(true);
    expect(BARE_LINES_ASSIGN.test('\nMANIFEST_LINES="$(sed ...)"')).toBe(false);
  });

  test("restore assigns MANIFEST_LINES", () => {
    expect(restoreSection()).toContain(`MANIFEST_LINES="$(sed -n`);
  });

  test("no block assigns the zsh special integer parameter LINES", () => {
    expect(body().length).toBeGreaterThan(0);
    expect(BARE_LINES_ASSIGN.test(body())).toBe(false);
  });
});

describe("Round 2: the generator enumerates per entry with while-read, not a zsh-hostile for-in (code B1)", () => {
  test("the for-in matcher fires on a planted unquoted loop", () => {
    expect(FOR_IN_UNQUOTED.test("for ENTRY in $ENTRIES; do")).toBe(true);
    expect(FOR_IN_UNQUOTED.test("for p in AGENTS.md CLAUDE.md; do")).toBe(false);
  });

  test("the manifest generator iterates entries with while IFS= read -r", () => {
    // Mutant target: revert to `for ENTRY in $ENTRIES` and zsh runs one blob
    // iteration after the tag push — a stranded tag and no commit.
    expect(body()).toContain("while IFS= read -r ENTRY");
  });

  test("no loop iterates an unquoted variable expansion with for-in", () => {
    expect(body().length).toBeGreaterThan(0);
    const offenders = body()
      .split("\n")
      .filter((line) => FOR_IN_UNQUOTED.test(line))
      .map((line) => line.trim());
    expect(offenders).toEqual([]);
  });

  test("the per-path removal loop deletes each surviving path on its own presence", () => {
    // Mutant target: the presence-guarded per-path `git rm`, not one pathspec.
    expect(body()).toContain(`git -C "$WORKTREE" rm -r -q -- "$p"`);
  });
});

describe("Round 2: restore proves within one invocation and re-proves in the escape (code B2)", () => {
  test("restore states R2 through R7 run as one Bash invocation", () => {
    expect(squash(restoreSection())).toContain(
      "R2 through R7 are one Bash invocation",
    );
  });

  test("the re-restore escape re-establishes both proofs from scratch", () => {
    expect(squash(restoreSection())).toContain(
      "re-runs R2's containment proof and R5's tag verification from scratch",
    );
  });

  test("R7 loops over the proved TRIPLES, gating and writing each present path", () => {
    expect(restoreSection()).toContain(`while IFS=' ' read -r ITEM_PATH BASELINE STATE`);
    expect(restoreSection()).toContain(`git -C "$TOPLEVEL" checkout "$ARCHIVE" -- "$ITEM_PATH"`);
  });

  test("R7 refuses only when every path on the item is absent, never on a partial", () => {
    expect(restoreSection()).toContain(`[ "$WROTE" -ge 1 ]`);
  });
});

describe("Round 2: the manifest fence and R4/R5 gates are hardened (security MEDIUM S-M1..M4)", () => {
  test("the closer matches a CommonMark 3-or-more-backtick fence (S-M1)", () => {
    // Mutant target: exactly-three closer lets a 4-backtick line run the range on.
    expect(restoreSection()).toContain(`^ \\{0,3\\}[\`]\\{3,\\}[[:space:]]*$`);
  });

  test("every extracted manifest line must match the record grammar, counted (S-M1)", () => {
    expect(restoreSection()).toContain("(pair|tree|file|group)");
    expect(restoreSection()).toContain(`[ "$TOTAL" = "$GOOD" ]`);
  });

  test("R4 is one runnable gate: baseline enum, state format, and the absent+hash contradiction (S-M4)", () => {
    // Mutant target: any of these deleted and a forged line reaches checkout.
    expect(restoreSection()).toContain("present|absent) ;;");
    expect(restoreSection()).toContain(`[ "${"${#STATE}"}" = 40 ]`);
    expect(squash(restoreSection())).toContain(
      `[ "$BASELINE" = absent ] && [ "$STATE" != - ]`,
    );
  });

  test("R4 excludes the skill's own directory case-insensitively (security LOW)", () => {
    expect(restoreSection()).toContain(`tr 'A-Z' 'a-z'`);
  });

  test("R5 binds the tag and branch to the date derived from the proved worktree (S-M2)", () => {
    // Mutant target: the two equalities, not just the interpolated strings —
    // an edited NUKE.md must not name another date's verified baseline.
    expect(restoreSection()).toContain(`NUKE_DATE="${"${TOPLEVEL##*/team-nuke-}"}"`);
    expect(restoreSection()).toContain(
      `[ "$RECORDED_TAG" = "nuke-baseline/${"${NUKE_DATE}"}" ]`,
    );
    expect(restoreSection()).toContain(
      `[ "$RECORDED_BRANCH" = "experiment/nuke-${"${NUKE_DATE}"}" ]`,
    );
  });

  test("R5's git reads are scoped to $TOPLEVEL behind a guard (S-M3)", () => {
    expect(restoreSection()).toContain(`git -C "$TOPLEVEL" tag -v "$RECORDED_TAG"`);
    expect(restoreSection()).toContain(
      `ARCHIVE="$(git -C "$TOPLEVEL" rev-parse "${"${RECORDED_TAG}"}^{}")"`,
    );
  });
});
