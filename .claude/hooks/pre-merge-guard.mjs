#!/usr/bin/env node

/**
 * Claude Code PreToolUse(Bash) dev hook — the mechanical version-bump gate.
 *
 * Replaces the always-red version-bump-check CI workflow (#120): when a Bash
 * command would merge this repo's PR into the default branch (`gh pr merge`),
 * the hook runs .github/scripts/version-bump-required.sh against what will
 * actually merge (the PR's remote head vs the fetched base tip) and denies the
 * merge unless the script exits 0 printing an `OK:` line.
 *
 * Failure direction: fail open only before jurisdiction is decided
 * (unparseable stdin, a command the tokenizer cannot parse confidently, no
 * `gh pr merge` simple command). Once in jurisdiction, every failure —
 * gh error, fetch failure, behind-base head, deadline expiry, script verdict —
 * denies. Deny goes through two independent channels: the `deny` permission
 * payload on stdout and exit 2 with the same text on stderr, so a schema
 * change discarding one channel still leaves the other blocking.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INVARIANT_SCRIPT = join(
  REPO_ROOT,
  ".github",
  "scripts",
  "version-bump-required.sh",
);

// Each external call (gh pr view, the fetches, the script run) gets its own
// deadline so a hanging network call denies instead of riding the registered
// hook timeout into a harness kill (which would fail open). The env override
// exists for tests only (timer-knob rule, docs/testing.md).
const DEFAULT_DEADLINE_MS = 10_000;

function deadlineMs() {
  const raw = Number.parseInt(process.env.PRE_MERGE_GUARD_DEADLINE_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DEADLINE_MS;
}

function run(executable, args, extraEnv = {}) {
  return spawnSync(executable, args, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    env: { ...process.env, ...extraEnv },
    timeout: deadlineMs(),
  });
}

function succeeded(result) {
  return result.status === 0 && !result.error;
}

function describeFailure(what, result) {
  if (result.error) {
    return `pre-merge guard: ${what} failed: ${result.error.message}`;
  }
  const stderr = (result.stderr ?? "").trim();
  return `pre-merge guard: ${what} failed (exit ${result.status})${stderr ? `: ${stderr}` : ""}`;
}

// Dual deny channel: the permission payload denies the tool call, and exit 2
// is a blocking error whose stderr Claude Code feeds back to the model. The
// deny text is the only text the denied session is guaranteed to read, so it
// must carry the recovery route itself.
function deny(text) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: text,
      },
      systemMessage: text,
    }),
  );
  process.stderr.write(`${text}\n`);
  process.exit(2);
}

// --- Jurisdiction -----------------------------------------------------------

// Tokenize into simple commands (word lists), or null when the command cannot
// be parsed confidently — jurisdiction is decided only on a parsed command,
// so a null fails open. This slice-1 core bails on quotes, escapes, and
// heredocs; the quoting-aware tokenizer (slice 2) replaces the bail with real
// parsing so the documented land-path merge (which quotes its --subject)
// still engages.
function tokenize(command) {
  if (/['"\\]|<</.test(command)) return null;
  const commands = [];
  for (const segment of command.split(/\n|&&|\|\||[;|&]/)) {
    const words = segment.split(/[ \t]+/).filter(Boolean);
    if (words.length > 0) commands.push(words);
  }
  return commands;
}

function isAssignmentWord(word) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
}

function basename(word) {
  const segments = word.split("/");
  return segments[segments.length - 1];
}

// In jurisdiction iff some simple command's first three words — after
// discarding leading NAME=value assignment words — are exactly `gh pr merge`
// (the first may be a path whose basename is gh). Leading shell reserved
// words and grouping openers are deliberately NOT discarded (err narrow):
// `if …; then gh pr merge; fi`, `{ gh pr merge; }` stay out.
function findMergeCommand(commands) {
  for (const words of commands) {
    let start = 0;
    while (start < words.length && isAssignmentWord(words[start])) start += 1;
    const rest = words.slice(start);
    if (
      rest.length >= 3 &&
      basename(rest[0]) === "gh" &&
      rest[1] === "pr" &&
      rest[2] === "merge"
    ) {
      return rest;
    }
  }
  return null;
}

// gh pr merge flags that consume the following word — without this list a
// flag value would be misread as the PR selector.
const VALUE_FLAGS = new Set([
  "-t",
  "--subject",
  "-b",
  "--body",
  "-F",
  "--body-file",
  "-A",
  "--author-email",
  "--match-head-commit",
  "-R",
  "--repo",
]);

function parseMergeArgs(mergeWords) {
  let repoFlag;
  let selector;
  for (let i = 3; i < mergeWords.length; i += 1) {
    const word = mergeWords[i];
    if (word === "--repo" || word === "-R") {
      repoFlag = mergeWords[i + 1];
      i += 1;
      continue;
    }
    if (word.startsWith("--repo=")) {
      repoFlag = word.slice("--repo=".length);
      continue;
    }
    if (VALUE_FLAGS.has(word)) {
      i += 1;
      continue;
    }
    if (word.startsWith("-")) continue;
    if (selector === undefined) selector = word;
  }
  return { repoFlag, selector };
}

// --- Repo scoping -----------------------------------------------------------

function repoSlugFromUrl(url) {
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const sshMatch = cleaned.match(/^[^@]+@[^:]+:(.+)$/);
  const path = sshMatch
    ? sshMatch[1]
    : cleaned.replace(/^[a-z+]+:\/\/[^/]+\//i, "");
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  return segments.slice(-2).join("/").toLowerCase();
}

function normalizeRepoTarget(value) {
  if (value.includes("://") || /^[^@]+@[^:]+:/.test(value)) {
    return repoSlugFromUrl(value);
  }
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

// --- The invariant run ------------------------------------------------------

function resolveDefaultBranch() {
  const result = run("git", ["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (succeeded(result)) {
    const ref = result.stdout.trim();
    const prefix = "refs/remotes/origin/";
    if (ref.startsWith(prefix) && ref.length > prefix.length) {
      return ref.slice(prefix.length);
    }
  }
  // origin/HEAD is unset in fresh clones and worktrees (next-version.sh:59-61).
  return "main";
}

// Recovery routes keyed on the script verdict. At merge time there is no
// "continue" arm: a "Run version-bump." verdict means the bump is missing or
// went stale (e.g. a /shipit step-5 rebase moved the fork point).
function withRecoveryRoute(verdict) {
  if (verdict.includes("must land with no bump")) {
    return (
      `${verdict}\n` +
      "Recovery: drop the chore(version) commit, undo the changelog cut, " +
      "land plain, then re-run /shipit."
    );
  }
  if (verdict.includes("Run version-bump.")) {
    return (
      `${verdict}\n` +
      "At merge time this means the bump is missing or stale. Recovery: drop " +
      "any chore(version) commit, undo the changelog cut, re-run version-bump " +
      "from step 0, re-title, then re-run /shipit."
    );
  }
  return verdict;
}

function gate(mergeWords) {
  const { repoFlag, selector } = parseMergeArgs(mergeWords);

  if (repoFlag !== undefined) {
    const homeResult = run("git", ["remote", "get-url", "origin"]);
    const home = succeeded(homeResult)
      ? repoSlugFromUrl(homeResult.stdout)
      : null;
    if (home === null) {
      deny(
        "pre-merge guard: could not derive the home repo from the origin remote",
      );
    }
    // The invariant binds this repo only — a foreign-repo merge passes.
    if (normalizeRepoTarget(repoFlag) !== home) process.exit(0);
  }

  const view = run("gh", [
    "pr",
    "view",
    ...(selector !== undefined ? [selector] : []),
    "--json",
    "number,headRefOid,baseRefName",
  ]);
  if (!succeeded(view)) deny(describeFailure("gh pr view", view));

  let pr;
  try {
    pr = JSON.parse(view.stdout);
  } catch {
    pr = undefined;
  }
  const number = pr?.number;
  const headRefOid = pr?.headRefOid;
  const baseRefName = pr?.baseRefName;
  if (
    !Number.isInteger(number) ||
    typeof headRefOid !== "string" ||
    headRefOid === "" ||
    typeof baseRefName !== "string"
  ) {
    deny(
      `pre-merge guard: unexpected gh pr view output: ${view.stdout.trim()}`,
    );
  }

  const defaultBranch = resolveDefaultBranch();
  // The invariant gates merges into the default branch only (the old
  // workflow's trigger scope) — any other base passes.
  if (baseRefName !== defaultBranch) process.exit(0);

  const fetchBase = run("git", ["fetch", "origin", defaultBranch]);
  if (!succeeded(fetchBase)) {
    deny(describeFailure(`git fetch origin ${defaultBranch}`, fetchBase));
  }

  // GitHub publishes every PR head under refs/pull/<n>/head on the base repo,
  // so fork heads resolve exactly like same-repo heads.
  const fetchHead = run("git", ["fetch", "origin", `refs/pull/${number}/head`]);
  if (!succeeded(fetchHead)) {
    deny(
      describeFailure(`git fetch origin refs/pull/${number}/head`, fetchHead),
    );
  }

  const headResolves = run("git", [
    "rev-parse",
    "--verify",
    `${headRefOid}^{commit}`,
  ]);
  if (!succeeded(headResolves)) {
    deny(
      `pre-merge guard: PR head ${headRefOid} does not resolve locally after fetching refs/pull/${number}/head`,
    );
  }

  const baseTipResult = run("git", [
    "rev-parse",
    `refs/remotes/origin/${defaultBranch}`,
  ]);
  const baseTipOid = (baseTipResult.stdout ?? "").trim();
  if (!succeeded(baseTipResult) || baseTipOid === "") {
    deny(
      `pre-merge guard: could not resolve refs/remotes/origin/${defaultBranch}`,
    );
  }

  // Up-to-date precondition: a behind-base head yields no verdict — a rebase
  // can change both verdict inputs, so the measure must be of the state that
  // will actually merge.
  const ancestor = run("git", [
    "merge-base",
    "--is-ancestor",
    baseTipOid,
    headRefOid,
  ]);
  if (ancestor.error || ancestor.status === null) {
    deny(describeFailure("git merge-base --is-ancestor", ancestor));
  }
  if (ancestor.status !== 0) {
    deny(
      `pre-merge guard: the PR head is behind origin/${defaultBranch}. ` +
        `Recovery: rebase onto origin/${defaultBranch}, push, then re-run /shipit.`,
    );
  }

  if (!existsSync(INVARIANT_SCRIPT)) {
    deny(`pre-merge guard: missing ${INVARIANT_SCRIPT}`);
  }
  // BASE_SHA is the base TIP, never a pre-computed merge-base: the script
  // reduces the pair to the fork point itself, exactly as CI did.
  const verdict = run("bash", [INVARIANT_SCRIPT], {
    HEAD_SHA: headRefOid,
    BASE_SHA: baseTipOid,
  });
  if (succeeded(verdict) && (verdict.stdout ?? "").startsWith("OK:")) {
    // Allow silently (pre-bash-guard.mjs precedent: no output on allow).
    process.exit(0);
  }
  const text =
    `${verdict.stdout ?? ""}${verdict.stderr ?? ""}`.trim() ||
    describeFailure("version-bump-required.sh", verdict);
  deny(withRecoveryRoute(text));
}

// --- Entry ------------------------------------------------------------------

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    // Fail open — jurisdiction is decided only on a parsed command.
    process.exit(0);
  }

  const command = input?.tool_input?.command;
  if (typeof command !== "string") process.exit(0);

  const commands = tokenize(command);
  if (commands === null) process.exit(0);

  const mergeWords = findMergeCommand(commands);
  if (mergeWords === null) process.exit(0);

  // In jurisdiction from here: an unexpected crash must deny, not fall
  // through as a fail-open exit 1 (the c945395 class).
  try {
    gate(mergeWords);
  } catch (error) {
    deny(`pre-merge guard error: ${error?.message ?? String(error)}`);
  }
}

main();
