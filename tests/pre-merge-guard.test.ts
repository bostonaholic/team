// tests/pre-merge-guard.test.ts
//
// L3 subprocess (free, gate-tier) per docs/testing.md: the dev PreToolUse(Bash)
// hook .claude/hooks/pre-merge-guard.mjs is the mechanical gate that replaces
// the always-red version-bump-check CI workflow (#120). It must deny
// `gh pr merge` when the runtime-vs-dev bump invariant fails, allow silently
// when the invariant holds, and never touch any other command. Do NOT re-assert
// hookEventName here — tests/hook-output-schema.test.ts already sweeps
// .claude/hooks/ for it; the pins below cover the deny-specific fields and the
// exit status, which no sweep checks.
//
// The deterministic seam: a hermetic temp dir is prepended to PATH carrying
// stub `gh` and `git` executables scripted per fixture. The hook's external
// boundary (gh pr view, the fetches, rev-parse, merge-base) resolves to the
// stubs, while .github/scripts/version-bump-required.sh runs for REAL against
// the stubbed git — so every verdict sentence asserted below is the script's
// own output, never a re-typed copy. The stubs answer exactly the calls the
// invariant run makes:
//
//   gh pr view --json number,headRefOid,baseRefName   (PR selector)
//   gh repo view --json defaultBranchRef               (default-branch resolve)
//   git symbolic-ref refs/remotes/origin/HEAD          (default-branch fallback)
//   git remote get-url origin                          (home-repo derivation)
//   git fetch origin <default> / refs/pull/<n>/head    (must succeed)
//   git rev-parse ...                                  (origin tip / head oid)
//   git merge-base --is-ancestor <base tip> <head>     (up-to-date precondition)
//   git merge-base <head> <base tip>                   (the script's fork point)
//   git show <ref>:.claude-plugin/plugin.json          (the script's versions)
//   git diff --name-only ...                           (the script's file list)
//
// Timer knob per docs/testing.md: PRE_MERGE_GUARD_DEADLINE_MS shrinks the
// in-hook shared external-call budget so the hang fixture denies in
// milliseconds. The knob only shrinks — the hook clamps it to its default.

import { afterAll, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const HOOK = join(REPO_ROOT, ".claude", "hooks", "pre-merge-guard.mjs");
const SETTINGS = join(REPO_ROOT, ".claude", "settings.json");

// The verdict fixtures run the real version-bump-required.sh, which needs jq —
// same gating convention as tests/version-bump-required.test.ts.
const HAS_JQ = spawnSync("jq", ["--version"]).status === 0;

// Fixed, unmistakable object ids for the scripted git seam.
const HEAD_OID = "1111111111111111111111111111111111111111";
const MERGE_BASE_OID = "2222222222222222222222222222222222222222";
const BASE_TIP_OID = "3333333333333333333333333333333333333333";
const HOME_REMOTE_URL = "https://github.com/bostonaholic/team.git";

// Hermetic stub dirs keyed by pid (docs/testing.md), cleaned up after.
const stubDirs: string[] = [];
afterAll(() => {
  for (const dir of stubDirs) rmSync(dir, { recursive: true, force: true });
});

function newStubDir(): string {
  const dir = mkdtempSync(join(tmpdir(), `pre-merge-guard-${process.pid}-`));
  stubDirs.push(dir);
  return dir;
}

function writeStub(dir: string, name: string, body: string) {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
}

const LOUD_GH = `printf 'LOUD STUB: unexpected gh call: %s\\n' "$*" >&2; exit 99`;
const LOUD_GIT = `printf 'LOUD STUB: unexpected git call: %s\\n' "$*" >&2; exit 99`;

// Loud stubs: any gh/git call is a visible failure. Out-of-jurisdiction
// fixtures use these so an accidental engagement fails closed (deny), turning
// the pass-through assertions red — a silent pass can never mask a wrong
// engagement.
function loudStubs(): string {
  const dir = newStubDir();
  writeStub(dir, "gh", LOUD_GH);
  writeStub(dir, "git", LOUD_GIT);
  return dir;
}

// Scripted seam for engaged fixtures. Every parameter is the exact value the
// assertion depends on; the real script computes the verdict from them.
function scriptedStubs(opts: {
  headVersion?: string; // plugin.json version at the PR head
  baseVersion?: string; // plugin.json version at the merge-base
  changedFiles?: string; // the fork-point..head `diff --name-only` output
  fetchExit?: number; // exit status of both fetches (0 = success)
  ancestorExit?: number; // merge-base --is-ancestor (0 = head is up to date)
  gh?: "ok" | "fail" | "hang";
  repoView?: "ok" | "fail"; // gh repo view (the default-branch resolve)
  symbolicRefName?: string; // the LOCAL origin/HEAD branch name (can be stale)
}): string {
  const {
    headVersion = "0.33.2",
    baseVersion = "0.33.2",
    changedFiles = "docs/notes.md",
    fetchExit = 0,
    ancestorExit = 0,
    gh = "ok",
    repoView = "ok",
    symbolicRefName = "main",
  } = opts;
  const dir = newStubDir();

  const repoViewArm =
    repoView === "ok"
      ? `printf 'main\\n'; exit 0`
      : `printf 'no network\\n' >&2; exit 1`;
  const ghBody =
    gh === "hang"
      ? `sleep 30`
      : gh === "fail"
        ? `printf 'GraphQL: Could not resolve to a PullRequest\\n' >&2; exit 1`
        : `if [ "\${1:-}" = "pr" ] && [ "\${2:-}" = "view" ]; then
  case "\${3:-}" in
    "("|")") printf 'LOUD STUB: grouping paren read as the PR selector\\n' >&2; exit 99 ;;
  esac
  printf '%s\\n' '{"number":5,"headRefOid":"${HEAD_OID}","baseRefName":"main"}'
  exit 0
fi
if [ "\${1:-}" = "repo" ] && [ "\${2:-}" = "view" ]; then
  ${repoViewArm}
fi
${LOUD_GH}`;
  writeStub(dir, "gh", ghBody);

  writeStub(
    dir,
    "git",
    `cmd="\${1:-}"; shift || true
case "$cmd" in
  symbolic-ref) printf 'refs/remotes/origin/${symbolicRefName}\\n' ;;
  remote) printf '${HOME_REMOTE_URL}\\n' ;;
  fetch) exit ${fetchExit} ;;
  rev-parse)
    for arg in "$@"; do
      case "$arg" in *origin*) printf '${BASE_TIP_OID}\\n'; exit 0 ;; esac
    done
    printf '${HEAD_OID}\\n' ;;
  merge-base)
    if [ "\${1:-}" = "--is-ancestor" ]; then exit ${ancestorExit}; fi
    printf '${MERGE_BASE_OID}\\n' ;;
  show)
    case "\${1:-}" in
      ${HEAD_OID}:*) printf '{"version":"${headVersion}"}\\n' ;;
      *) printf '{"version":"${baseVersion}"}\\n' ;;
    esac ;;
  diff)
    case " $* " in
      *" --name-only "*) printf '${changedFiles}\\n' ;;
      *) : ;;
    esac ;;
  *) exit 0 ;;
esac`,
  );
  return dir;
}

type HookResult = { status: number | null; stdout: string; stderr: string };

// Run the hook exactly as Claude Code does: Bash tool JSON on stdin, decision
// on stdout, blocking errors on stderr + exit status. The spawnSync timeout
// stays under bun's 5s per-test cap so a hanging hook fails an assertion
// (status null) instead of erroring the test.
function runHook(
  command: string,
  pathDir: string,
  extraEnv: Record<string, string> = {},
): HookResult {
  const r = spawnSync("node", [HOOK], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    env: { ...process.env, PATH: `${pathDir}:${process.env.PATH}`, ...extraEnv },
    timeout: 4000,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// Parse the stdout payload without throwing: a missing/garbled payload yields
// undefined so field assertions fail cleanly instead of erroring.
function payload(stdout: string): any {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

// A violating-merge seam: dev-only diff + a version bump — the script's
// "a dev-only PR must land with no bump" cell.
function violationStubs(): string {
  return scriptedStubs({
    headVersion: "0.34.0",
    baseVersion: "0.33.2",
    changedFiles: "docs/notes.md",
  });
}

describe("slice 1: the guard denies a violating merge at the merge attempt", () => {
  test("parses with node --check", () => {
    expect(() =>
      execFileSync("node", ["--check", HOOK], { cwd: REPO_ROOT, stdio: "pipe" }),
    ).not.toThrow();
  });

  test("is registered under PreToolUse with a Bash matcher", () => {
    // An unregistered hook is dead code — the gate silently vanishes.
    const settings = existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, "utf-8")) : {};
    const entries: any[] = settings?.hooks?.PreToolUse ?? [];
    const registered = entries.some(
      (entry) =>
        entry?.matcher === "Bash" &&
        (entry?.hooks ?? []).some(
          (h: any) =>
            typeof h?.command === "string" &&
            h.command.includes(".claude/hooks/pre-merge-guard.mjs"),
        ),
    );
    expect(registered).toBe(true);
  });

  test("the registered command executes and allows a benign command", () => {
    // The registration pin above checks only the string. A moved hook file, a
    // syntax error, or a broken $CLAUDE_PROJECT_DIR resolution would make the
    // registered command itself fail — a failure mode the harness degrades to
    // a permit — so run it exactly as Claude Code would and require a clean
    // silent allow.
    const settings = JSON.parse(readFileSync(SETTINGS, "utf-8"));
    const entries: any[] = settings?.hooks?.PreToolUse ?? [];
    const registeredCommand = entries
      .flatMap((entry) => entry?.hooks ?? [])
      .map((hook: any) => hook?.command)
      .find(
        (command: any) =>
          typeof command === "string" && command.includes("pre-merge-guard.mjs"),
      );
    expect(registeredCommand).toBeDefined();
    const r = spawnSync("bash", ["-c", registeredCommand as string], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
      timeout: 4000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("fails open on garbage stdin", () => {
    // Jurisdiction is decided only on a parsed command: before it is
    // decided, the hook cannot see a command and must not block anything.
    const r = spawnSync("node", [HOOK], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      input: "not json {{",
      env: { ...process.env, PATH: `${loudStubs()}:${process.env.PATH}` },
      timeout: 4000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout ?? "").toBe("");
  });

  test("denies on a tokenizer crash instead of failing open", () => {
    // The span scanners recurse with the nesting depth, so adversarially
    // deep "$("$("$(… nesting blows the stack (RangeError). A crash says
    // nothing about what bash would run — unlike the tokenizer's null,
    // reserved for input bash itself refuses — so it must deny, never ride
    // the fail-open exit. Loud stubs: the deny happens before any external
    // call.
    const r = runHook(
      `gh pr merge 5 --subject ${'"$('.repeat(200_000)}`,
      loudStubs(),
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("pre-merge guard error");
  });

  test("denies on a behind-base head", () => {
    // The up-to-date precondition fails before the script runs — a rebase can
    // change both verdict inputs, so a behind-base head yields no verdict.
    const r = runHook("gh pr merge 5 --squash", scriptedStubs({ ancestorExit: 1 }));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("rebase");
    expect(r.stderr).toContain("/shipit");
  });

  test("denies when gh pr view fails", () => {
    const r = runHook("gh pr merge 5 --squash", scriptedStubs({ gh: "fail" }));
    expect(r.status).toBe(2);
    // Every in-jurisdiction deny carries a labeled recovery route.
    expect(r.stderr).toContain("Recovery:");
  });

  test("denies when the fetch fails", () => {
    // Degrading is acceptable for a version compute, not for a verdict — the
    // fetch must succeed, a deliberate deviation from next-version.sh's
    // warn-and-continue fetch fallback.
    const r = runHook("gh pr merge 5 --squash", scriptedStubs({ fetchExit: 1 }));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Recovery:");
  });

  test("denies on budget expiry", () => {
    // The stub gh hangs far past the env-shrunk external-call budget. A slow
    // network and a failing network must land on the same side of the gate:
    // expiry is an in-jurisdiction failure that denies.
    const r = runHook("gh pr merge 5 --squash", scriptedStubs({ gh: "hang" }), {
      PRE_MERGE_GUARD_DEADLINE_MS: "200",
    });
    expect(r.status).toBe(2);
  });

  test("denies when the budget is exhausted before the first external call", () => {
    // Exercises run()'s pre-exhaustion branch (the hang test above rides the
    // per-call timeout kill instead): a 1ms budget expires while the hook
    // reads 20MB of stdin, so gate() finds nothing left before it spawns
    // anything — the loud stubs prove no external call happens. The payload
    // is sized an order of magnitude past what today's hardware reads in
    // 1ms, so the race stays unambiguous as hardware speeds up.
    const bulk = "x".repeat(20_000_000);
    const r = runHook(`gh pr merge 5 --squash # ${bulk}`, loudStubs(), {
      PRE_MERGE_GUARD_DEADLINE_MS: "1",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("budget expired");
  });

  test("passes through a foreign --repo merge silently", () => {
    // The invariant binds this repo only. The home repo derives from the
    // origin remote (never hardcoded), which the stub answers; every other
    // gh/git call fails loudly so a wrong engagement cannot pass silently.
    const dir = newStubDir();
    writeStub(dir, "gh", LOUD_GH);
    writeStub(
      dir,
      "git",
      `if [ "\${1:-}" = "remote" ]; then printf '${HOME_REMOTE_URL}\\n'; exit 0; fi\n${LOUD_GIT}`,
    );
    const r = runHook("gh pr merge 5 --repo other/repo --squash", dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  // pflag accepts a short flag's value after `=` and after boolean flags in
  // the same cluster — every spelling of a foreign repo must read as foreign
  // (never `-R=x/y` as the mangled slug `=x/y`, never `-dRx/y` as no flag).
  const foreignRepoSpellings = [
    "gh pr merge 5 -Rother/repo --squash",
    "gh pr merge 5 -R=other/repo --squash",
    "gh pr merge 5 -dRother/repo",
    "gh pr merge 5 -dR=other/repo",
  ];

  for (const command of foreignRepoSpellings) {
    test(`passes through a foreign short-flag merge silently: ${command}`, () => {
      const dir = newStubDir();
      writeStub(dir, "gh", LOUD_GH);
      writeStub(
        dir,
        "git",
        `if [ "\${1:-}" = "remote" ]; then printf '${HOME_REMOTE_URL}\\n'; exit 0; fi\n${LOUD_GIT}`,
      );
      const r = runHook(command, dir);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("");
    });
  }
});

describe.if(HAS_JQ)("slice 1: verdict mapping through the real script", () => {
  test("denies a violating merge with the full envelope", () => {
    // The c945395-class pin: envelope, not only decision. Dual deny channel —
    // exit 2 + stderr for the blocking path, the deny payload for the
    // permission path. The deny text is the only text the denied session is
    // guaranteed to read, so it must carry the recovery route.
    const r = runHook("gh pr merge 5 --squash", violationStubs());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("must land with no bump");
    expect(r.stderr).toContain("/shipit");
    const p = payload(r.stdout);
    expect(p?.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(p?.hookSpecificOutput?.permissionDecisionReason ?? "").toContain(
      "must land with no bump",
    );
    expect(p?.systemMessage ?? "").not.toBe("");
  });

  test("allows silently on an OK verdict", () => {
    // Dev-only diff, no bump → the script prints
    // `OK: runtime_changed=false bumped=false (…)` and exits 0 — the hook
    // allows with no output at all (pre-bash-guard.mjs's silent-allow
    // precedent).
    const r = runHook(
      "gh pr merge 5 --squash",
      scriptedStubs({
        headVersion: "0.33.2",
        baseVersion: "0.33.2",
        changedFiles: "docs/notes.md",
      }),
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("resolves the default branch from GitHub, not a stale origin/HEAD", () => {
    // An upstream default-branch rename leaves the local origin/HEAD ref
    // pointing at the old name; trusting it makes baseRefName read as
    // non-default and lands on the ALLOW side. GitHub is authoritative.
    const r = runHook(
      "gh pr merge 5 --squash",
      scriptedStubs({
        headVersion: "0.34.0",
        baseVersion: "0.33.2",
        changedFiles: "docs/notes.md",
        symbolicRefName: "renamed-away-from-main",
      }),
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("must land with no bump");
  });

  test("falls back to the local origin/HEAD when gh repo view fails", () => {
    const r = runHook(
      "gh pr merge 5 --squash",
      scriptedStubs({
        headVersion: "0.34.0",
        baseVersion: "0.33.2",
        changedFiles: "docs/notes.md",
        repoView: "fail",
      }),
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("must land with no bump");
  });

  test("denies on the missing-bump verdict", () => {
    // Runtime diff, no bump → the verdict ending "Run version-bump." — the
    // only place that verdict means "continue" is version-bump's step 0; at
    // merge time there is no continue arm, so it denies.
    const r = runHook(
      "gh pr merge 5 --squash",
      scriptedStubs({
        headVersion: "0.33.2",
        baseVersion: "0.33.2",
        changedFiles: "skills/team/SKILL.md",
      }),
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Run version-bump.");
  });
});

// Slice 2's fixture tables ARE the jurisdiction spec: the in/out lists below
// are the executable rendering of the quoting-aware first-words rule,
// including the ruling that leading reserved words and grouping openers are
// NOT discarded.

describe("slice 2: out of jurisdiction — never gated, proven by loud stubs", () => {
  const outShapes = [
    // Quoted data; the only simple command starts with `git`.
    `git commit -m "feat(hooks): gate gh pr merge"`,
    // First word `grep`, quoted and unquoted.
    `grep -rn "gh pr merge" skills/`,
    `grep gh pr merge`,
    // Heredoc bodies are data, never split into commands.
    `cat <<'EOF'\ngh pr merge 5\nEOF`,
    // A here-string operand is data, never a word.
    `grep merge <<<"gh pr merge 5"`,
    // Indirection is never unwrapped.
    `bash -c "gh pr merge 5"`,
    `env gh pr merge`,
    `eval "gh pr merge"`,
    `xargs gh pr merge`,
    // A flag between the three words breaks the first-words rule.
    `gh -R other/repo pr merge`,
    // Not the `gh pr merge` command.
    `gh api repos/o/r/pulls/5/merge`,
    // Leading reserved words and grouping openers are NOT discarded
    // (resolved narrow-side).
    `if gh pr checks; then gh pr merge 5; fi`,
    `{ gh pr merge; }`,
    `( gh pr merge )`,
    `case x in *) gh pr merge;; esac`,
    // Wrapper commands beyond time/exec/! are NOT stripped (narrow-side
    // ruling) — documented residue in docs/versioning.md's scope caveat.
    `command gh pr merge 5`,
    `nohup gh pr merge 5`,
    `nice gh pr merge 5`,
    `timeout 60 gh pr merge 5`,
    `stdbuf -o0 gh pr merge 5`,
    // Brace expansion is not performed — documented residue.
    `gh pr {merge,}`,
    `gh pr merge{,}`,
    // Parameter expansion is not performed — documented residue, same
    // never-expanded class as brace expansion.
    `A=merge; gh pr $A`,
    // ANSI-C quoted text is data: one word, never a command.
    `echo $'gh pr merge'`,
    `git commit -m $'fix: don\\'t gate gh pr merge'`,
    // Tokenization failure → not engaged (fail open).
    `echo "gh pr merge`,
    `cat <<EOF\ngh pr merge 5`,
  ];

  for (const command of outShapes) {
    test(`passes through: ${command.replace(/\n/g, "\\n")}`, () => {
      const r = runHook(command, loudStubs());
      expect(r.status).toBe(0);
      expect(r.stdout).toBe("");
    });
  }
});

describe.if(HAS_JQ)("slice 2: in jurisdiction — every simple command is tested", () => {
  const inShapes = [
    `gh pr merge`,
    `gh pr checks && gh pr merge 5`,
    `gh pr checks; gh pr merge`,
    `gh pr merge | tee merge.log`,
    `yes | gh pr merge`,
    // Leading NAME=value assignment words are discarded before matching.
    `GH_TOKEN=x gh pr merge`,
    // A `<<<` here-string is not a heredoc: the operand is consumed as data
    // and the merge command after it still engages.
    `jq -e .ok <<<"$json" && gh pr merge 5`,
    // Every merge command in a compound command is gated: a foreign-repo
    // first merge is out of scope but never allows the home-repo second one.
    `gh pr merge 5 --repo other/repo && gh pr merge 6`,
    // gh documents `--repo [HOST/]OWNER/REPO`: a host-qualified value still
    // names this repo and must engage, not read as foreign.
    `gh pr merge 5 --repo github.com/bostonaholic/team`,
    `gh pr merge 5 --repo=github.com/bostonaholic/team`,
    // The combined short-flag form carries the repo in the same word — pflag
    // also accepts it after `=` and after boolean flags in the same cluster.
    `gh pr merge 5 -Rbostonaholic/team`,
    `gh pr merge 5 -R=bostonaholic/team`,
    `gh pr merge 5 -dRbostonaholic/team`,
    `gh pr merge 5 -dR=bostonaholic/team`,
    // A leading `time` prefix or redirection word still runs the merge, and
    // bash allows a redirection between ANY words of a simple command.
    `time gh pr merge 5`,
    `time -p gh pr merge`,
    `>merge.log gh pr merge 5`,
    `2>/dev/null gh pr merge 5`,
    `2>&1 gh pr merge 5`,
    `gh 2>/dev/null pr merge`,
    // The pure prefixes `!` and `exec` leave the merge words intact and bash
    // runs them — unlike grouping openers, which stay out (resolved
    // narrow-side, see the out-shapes above).
    `! gh pr merge 5`,
    `exec gh pr merge 5`,
    `exec -a argv0name gh pr merge 5`,
    // The tokenizer used to bail to null on these, but bash warns and RUNS
    // the merge — and the arithmetic-shift shape is fully valid, with no
    // warning at all. A parse bail must never fail open on a command the
    // shell executes.
    `gh pr merge 5 --squash <<EOF`,
    `gh pr merge 5 && cat <<EOF`,
    `(( 1 << 2 )) && gh pr merge 5`,
    `(( 1 << 2 ))\ngh pr merge 5`,
    `gh pr merge 5 \\`,
    `echo a<<b; gh pr merge 5`,
    // ANSI-C quoting: \' inside $'…' is a literal apostrophe, never a
    // closer. Treating it as a plain quote flips parity, bails the parse to
    // null, and fails open on a merge bash executes — exactly the land
    // path's --subject shape when a PR title carries an apostrophe.
    `gh pr merge 5 --squash --subject $'v1 fix: don\\'t break (#1)'`,
    `gh pr merge 5 --squash --body $'x\\'y' --subject "t"`,
    `echo $'a\\'b' ; gh pr merge --squash`,
    // $"…" is the locale-translated string — quoting-wise a plain "…".
    `gh pr merge 5 --squash --subject $"hello"`,
    // $(…) inside "…" nests full quoting: the '\'' idiom inside a command
    // substitution inside a double-quoted subject must not flip parity.
    `gh pr merge 5 --squash --subject "$(jq -r .title <<<'{"title":"don'\\''t"}') (#5)"`,
    // Bash's metacharacter rule: an unquoted < or > ALWAYS ends a word, even
    // glued to one of the first three command words.
    `gh pr merge>merge.log 5`,
    `gh>merge.log pr merge 5`,
    `gh pr>merge.log merge 5`,
    `gh pr merge&>merge.log`,
    `gh pr merge</dev/null`,
    `gh pr merge >|merge.log`,
    `gh pr merge 5 >merge.log 2>&1`,
    // A process substitution as the redirection TARGET: bash runs the merge
    // with its output piped into the substitution, so a "no target" null
    // here would fail open — the only no-wrapper tail shape that did.
    `gh pr merge 5 --squash > >(tee merge.log)`,
    `gh pr merge 5 --squash 2> >(tee merge.log >&2)`,
    `gh pr merge 5 --squash &> >(cat)`,
    `gh pr merge 5 --squash < <(true)`,
    // $(…) nests full quoting inside a double-quoted redirection target or
    // here-string operand — the same shared-scanner rule as word position,
    // so the inner " must not close the string and cascade to null.
    `gh pr merge 5 >"$(echo 'a"b')"`,
    `true <<<"$(echo 'a"b')" && gh pr merge 5`,
    // An unquoted $(…) as the redirection target is one word to bash: a
    // metacharacter break at its `(` would scatter grouping words into the
    // first-words window and fail open when the redirection precedes
    // `merge`.
    `gh pr 2>$(echo log) merge 5 --squash`,
    `>$(echo log) gh pr merge 5 --squash`,
    // bash keeps a lone trailing backslash as a literal redirection target
    // (a file named "\") and runs the merge.
    `gh pr merge 5 > \\`,
    // A subshell whose LAST command is the merge: the trailing `)` rides
    // along as a word — it must neither widen jurisdiction (the leading-`(`
    // command stays out) nor be read as the PR selector (the scripted stub's
    // gh loud-fails on a paren selector).
    `(cd /tmp && gh pr merge)`,
    // A glued fd digit is part of the operator, never a stray word that
    // breaks the first-words rule.
    `gh 2<<EOF pr merge --squash`,
    `gh pr 2<<EOF merge --squash`,
    `2<<EOF gh pr merge --squash`,
    `gh 3<<<x pr merge --squash`,
    // `time` matches on its basename, like gh itself.
    `/usr/bin/time gh pr merge 5`,
    // Array-assignment prefixes are single assignment words, so the merge
    // words after them still read as the command.
    `FOO=(a b) gh pr merge 5`,
    `FOO+=(a b) gh pr merge 5`,
  ];

  for (const command of inShapes) {
    test(`engages and denies under a violation verdict: ${command.replace(/\n/g, "\\n")}`, () => {
      const r = runHook(command, violationStubs());
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("must land with no bump");
    });
  }
});
