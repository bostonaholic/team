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
 * The script is read out of the PR HEAD COMMIT, never from this checkout's
 * working tree (#232). The script IS the definition of "runtime file", so a PR
 * that extends that definition must be judged by the definition it lands, not
 * by the one it replaces. This file's own location is no guide to that: hooks
 * resolve through $CLAUDE_PROJECT_DIR, and worktrees live under
 * <repo>/.claude/worktrees/, so the path above routinely lands in the OUTER
 * main checkout while the branch being merged sits in a worktree. Reading from
 * the commit removes the coupling entirely. That read needs a trusted head:
 * a fork head is unreviewed code, and running its script would execute that
 * code locally, which this repo already refuses for fork PRs
 * (docs/testing.md §5) — so a fork whose script differs from this checkout's
 * denies instead.
 *
 * Failure direction: fail open only before jurisdiction is decided
 * (unparseable stdin, a parsed command with no `gh pr merge` simple
 * command). A command the tokenizer cannot parse fails CLOSED whenever its
 * raw text could spell `merge` — bash executes a multi-line input one
 * complete command at a time, so an earlier-line merge has already run by
 * the time a later line hits the syntax error — and open only when no
 * literal merge can be present. A crash anywhere, including inside the
 * tokenizer, denies. Once in jurisdiction, every failure —
 * gh error, fetch failure, behind-base head, deadline expiry, script verdict —
 * denies. Deny goes through two independent channels: the `deny` permission
 * payload on stdout and exit 2 with the same text on stderr, so a schema
 * change discarding one channel still leaves the other blocking.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Repo-relative, because the script is read out of a commit. The absolute path
// below is used only to compare against a fork head's copy.
const INVARIANT_SCRIPT_PATH = ".github/scripts/version-bump-required.sh";
const INVARIANT_SCRIPT = join(REPO_ROOT, ...INVARIANT_SCRIPT_PATH.split("/"));

// All external calls (gh, the fetches, the script run) share ONE overall
// budget, kept below the registered hook timeout (.claude/settings.json) so a
// slow chain of calls denies here instead of riding the registered timeout
// into a harness kill (which would fail open). Per-call deadlines cannot give
// that guarantee: their worst case sums past any registered timeout. The env
// override exists for tests only (timer-knob rule, docs/testing.md) and is
// clamped so it can only shrink the budget, never widen it.
const DEFAULT_BUDGET_MS = 45_000;

function initialBudgetMs() {
  const raw = Number.parseInt(process.env.PRE_MERGE_GUARD_DEADLINE_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0
    ? Math.min(raw, DEFAULT_BUDGET_MS)
    : DEFAULT_BUDGET_MS;
}

const budgetExpiresAtMs = Date.now() + initialBudgetMs();

function run(executable, args, extraEnv = {}) {
  const remainingMs = budgetExpiresAtMs - Date.now();
  if (remainingMs <= 0) {
    deny(
      "pre-merge guard: the external-call budget expired before the verdict. " +
        "Recovery: check network and gh auth, then re-run /shipit.",
    );
  }
  return spawnSync(executable, args, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    env: { ...process.env, ...extraEnv },
    timeout: remainingMs,
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

// The extracted gate script lives in a temp dir for the length of one run.
// deny() exits the process, so `finally` never runs — every exit path clears it
// explicitly instead, or the guard litters tmp on each denied merge.
let scratchDir = null;

function clearScratch() {
  if (scratchDir === null) return;
  const dir = scratchDir;
  scratchDir = null;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // A leftover temp dir is not worth failing a verdict over.
  }
}

// Dual deny channel: the permission payload denies the tool call, and exit 2
// is a blocking error whose stderr Claude Code feeds back to the model. The
// deny text is the only text the denied session is guaranteed to read, so it
// must carry the recovery route itself.
function deny(text) {
  clearScratch();
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

// Quote-context scanners. Each takes the index of its opening delimiter and
// returns the index just past the closing one, or null when the context never
// closes — a bash syntax error. main() denies on a null whose text could spell
// a merge, so a scanner that nulls on input bash actually runs costs a false
// deny rather than a bypass. Reading a context as the WRONG kind is the
// dangerous direction: that can flip quote parity and mis-split words without
// ever nulling, which is a silent bypass.

function scanSingleQuote(command, openIndex) {
  const close = command.indexOf("'", openIndex + 1);
  return close === -1 ? null : close + 1;
}

// $'…' — ANSI-C quoting: backslash escapes ANY next character, so \' is a
// literal apostrophe, never a closer. Reading it as a plain single quote flips
// quote parity on a command bash executes, which mis-splits every word after
// it.
function scanAnsiCQuote(command, openIndex) {
  let i = openIndex + 1;
  while (i < command.length) {
    const c = command[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "'") return i + 1;
    i += 1;
  }
  return null;
}

// `…` command substitution: bash scans to the first backslash-unescaped
// closing backtick and re-lexes the body as its own context, so quotes
// inside the body never open or close anything in the surrounding text —
// reading them there flips quote parity on valid input. The span is
// consumed as data; the body is never parsed (the same indirection residue
// as $(…)).
function scanBacktickSpan(command, openIndex) {
  let i = openIndex + 1;
  while (i < command.length) {
    const c = command[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") return i + 1;
    i += 1;
  }
  return null;
}

// A balanced-paren span — $(…), <(…), >(…), NAME=(…), ((…)) — honoring the
// quote contexts inside it, where a `)` is data. Comments and case patterns
// inside a substitution are NOT parsed (see the tokenize contract below).
function scanParenSpan(command, openIndex) {
  let depth = 1;
  let i = openIndex + 1;
  while (i < command.length && depth > 0) {
    const c = command[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = scanSingleQuote(command, i);
      if (end === null) return null;
      i = end;
      continue;
    }
    if (c === "$" && command[i + 1] === "'") {
      const end = scanAnsiCQuote(command, i + 1);
      if (end === null) return null;
      i = end;
      continue;
    }
    if (c === '"') {
      const body = readDoubleQuoteBody(command, i);
      if (body === null) return null;
      i = body.end;
      continue;
    }
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    i += 1;
  }
  return depth === 0 ? i : null;
}

// The ONE double-quote scanner. Every "…" in the input — a word, a
// redirection target, a heredoc terminator, a string inside a paren span —
// goes through here: a second inline scanner is how the same defect (an
// inner quote closing the string) reappears one layer down. Returns the
// index just past the closing quote plus the word contribution, or null
// when the string never closes (a bash syntax error).
function readDoubleQuoteBody(command, openIndex) {
  let text = "";
  let i = openIndex + 1;
  while (i < command.length) {
    const c = command[i];
    if (c === '"') return { end: i + 1, text };
    if (c === "\\" && i + 1 < command.length) {
      text += command[i + 1];
      i += 2;
      continue;
    }
    // Inside "…", $(…) opens a full command context where quotes nest — a
    // " or ' inside the substitution must not close or flip this string
    // (the `"$(… '…'\''…' …)"` land-path subject shape).
    if (c === "$" && command[i + 1] === "(") {
      const end = scanParenSpan(command, i + 1);
      if (end === null) return null;
      text += command.slice(i, end);
      i = end;
      continue;
    }
    // Backticks nest a substitution inside "…" exactly like $(…): bash
    // re-lexes the body, so a " inside it must not close this string.
    if (c === "`") {
      const end = scanBacktickSpan(command, i);
      if (end === null) return null;
      text += command.slice(i, end);
      i = end;
      continue;
    }
    text += c;
    i += 1;
  }
  return null;
}

// Tokenize into simple commands (word lists) under bash's lexing rules, or
// null when the command cannot be parsed confidently. A null claims
// NOTHING about what bash would run — bash executes a multi-line input one
// complete command at a time, so a merge on an earlier line has already
// run when a later line hits the syntax error. main() therefore turns a
// null into a DENY whenever the raw text could spell `merge` through
// quoting and splicing characters, and into a permit only when it cannot.
// A merge spelled with nothing but those characters therefore has no
// fail-open path, parseable or not. What still reaches a permit is the
// never-expanded residue below, and it reaches it the same way on both
// paths.
//
// The single structural invariant (bash's own rule): the metacharacters
// space, tab, newline, |, &, ;, (, ), <, > ALWAYS end a word when unquoted.
// Every branch below is one of two kinds — a quoted/expansion span consumed
// as data (quotes, escapes, $'…', $"…", $(…), `…`, ((…)), <(…), heredoc
// bodies, here-string operands, redirection targets: data never creates or
// hides a word boundary), or a metacharacter handler that first ends the
// current word. A commit message or grep that mentions the phrase never
// engages, while the documented land-path merge parses and engages whatever
// quoting its --subject text needs. Bash tolerates and RUNS an unterminated
// heredoc and a trailing backslash, so those parse the way bash reads them
// instead of nulling: data must stay data (a heredoc-body merge never
// engages) and a runnable merge must gate, not bounce off the deny above.
//
// Named residue that survives this contract — exactly these, all of the
// same never-expanded class, and all equally invisible to main()'s
// raw-text prefilter because the literal letters `merge` appear only after
// an expansion the guard never performs:
//   - parameter expansion (`A=merge; gh pr $A` keeps the literal word
//     "$A", never "merge");
//   - brace expansion (`gh pr {merge,}` reads as one word);
//   - $'…' word CONTENT keeps numeric escapes undecoded ($'\x67h' reads as
//     "x67h", never "gh");
//   - a substitution BODY is never parsed: a merge inside `…` or $(…) is
//     unseen, and a `)` in a comment or case pattern inside $(…) ends the
//     span early, misreading the words after it (when that cascades to
//     null, a merge-bearing text now denies instead of permitting);
//   - an EMPTY substitution glued into a word (`gh pr mer``ge`, mer$(:)ge)
//     expands away in bash but reads here as a span between two word
//     fragments, so the word is never the literal "merge". This one parses,
//     so the raw-text prefilter never sees it.
// Indirection (bash -c, eval, env, xargs, command substitution, wrapper
// commands beyond time/exec/!) is never unwrapped — accepted over-narrow
// residue, named in docs/versioning.md.
function tokenize(command) {
  const commands = [];
  let words = [];
  let word = "";
  let wordStarted = false;
  // Whether quoted or escaped text contributed to the current word: bash
  // folds a glued digit into a redirection operator as its fd number ONLY
  // when the digit is unquoted (`"2">x` redirects fd 1, not fd 2), and
  // NAME=(…) is an array assignment only when NAME= is unquoted.
  let wordHadQuoting = false;
  const pendingHeredocs = [];
  let i = 0;
  const length = command.length;

  const endWord = () => {
    if (wordStarted) words.push(word);
    word = "";
    wordStarted = false;
    wordHadQuoting = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) {
      commands.push(words);
      words = [];
    }
  };
  const skipBlanks = () => {
    while (command[i] === " " || command[i] === "\t") i += 1;
  };

  // Read a quoted/escaped word used as a heredoc terminator, a here-string
  // operand, or a redirection target.
  const readRedirectionWord = () => {
    let value = "";
    let sawAny = false;
    while (i < length) {
      const c = command[i];
      if (c === "'") {
        const end = scanSingleQuote(command, i);
        if (end === null) return null;
        value += command.slice(i + 1, end - 1);
        i = end;
        sawAny = true;
        continue;
      }
      if (c === "$" && command[i + 1] === "'") {
        const end = scanAnsiCQuote(command, i + 1);
        if (end === null) return null;
        value += command.slice(i + 2, end - 1).replace(/\\(.)/g, "$1");
        i = end;
        sawAny = true;
        continue;
      }
      if (c === "$" && command[i + 1] === '"') {
        // $"…" is quoting-wise a plain "…", here as in word position:
        // reading the $ literally mangles a heredoc terminator (<<$"EOF"
        // must terminate on EOF, not $EOF), and a never-matched terminator
        // swallows the rest of the input as body.
        i += 1;
        continue;
      }
      if (c === '"') {
        const body = readDoubleQuoteBody(command, i);
        if (body === null) return null;
        value += body.text;
        i = body.end;
        sawAny = true;
        continue;
      }
      if (c === "\\") {
        if (i + 1 >= length) {
          // bash keeps a lone backslash at end-of-input as a literal word
          // character: `gh pr merge > \` redirects to a file named "\" and
          // RUNS the merge, so an empty-target null here would deny a real
          // merge instead of gating it.
          value += c;
          i += 1;
          sawAny = true;
          continue;
        }
        value += command[i + 1];
        i += 2;
        sawAny = true;
        continue;
      }
      // An unquoted command substitution is one word to bash
      // (`2>$(echo log)` redirects to the file the substitution names, and
      // the command RUNS), so it is consumed as a span exactly like the
      // word-position branch — never a metacharacter break at its `(`,
      // which would scatter grouping words into the first-words window.
      if (c === "$" && command[i + 1] === "(") {
        const end = scanParenSpan(command, i + 1);
        if (end === null) return null;
        value += command.slice(i, end);
        i = end;
        sawAny = true;
        continue;
      }
      // A process substitution glues into the surrounding word wherever it
      // appears (`> >(tee log)` redirects into it and the command RUNS), so
      // it is consumed as a span exactly like the word-position branch —
      // never a metacharacter break that reads as "no target".
      if ((c === "<" || c === ">") && command[i + 1] === "(") {
        const end = scanParenSpan(command, i + 1);
        if (end === null) return null;
        value += command.slice(i, end);
        i = end;
        sawAny = true;
        continue;
      }
      if (" \t\n;|&<>()".includes(c)) break;
      value += c;
      i += 1;
      sawAny = true;
    }
    return sawAny ? value : null;
  };

  while (i < length) {
    const ch = command[i];
    const next = command[i + 1];

    if (ch === "'") {
      const end = scanSingleQuote(command, i);
      if (end === null) return null; // unbalanced quote
      word += command.slice(i + 1, end - 1);
      wordStarted = true;
      wordHadQuoting = true;
      i = end;
      continue;
    }
    if (ch === '"') {
      const body = readDoubleQuoteBody(command, i);
      if (body === null) return null; // unbalanced quote
      word += body.text;
      wordStarted = true;
      wordHadQuoting = true;
      i = body.end;
      continue;
    }
    if (ch === "\\") {
      if (i + 1 >= length) {
        // bash keeps a lone backslash at end-of-input as a literal word
        // character and runs the command (`echo a \` prints "a \"), so a
        // null here would falsely deny a command the shell executes.
        word += ch;
        wordStarted = true;
        i += 1;
        continue;
      }
      if (next === "\n") {
        i += 2; // line continuation: no word break, no command break
        continue;
      }
      word += next;
      wordStarted = true;
      wordHadQuoting = true;
      i += 2;
      continue;
    }
    if (ch === "$" && next === "'") {
      const end = scanAnsiCQuote(command, i + 1);
      if (end === null) return null; // unterminated $'…' — bash refuses
      word += command.slice(i + 2, end - 1).replace(/\\(.)/g, "$1");
      wordStarted = true;
      wordHadQuoting = true;
      i = end;
      continue;
    }
    if (ch === "$" && next === '"') {
      // $"…" is the locale-translated string: quoting-wise identical to "…".
      i += 1;
      continue;
    }
    if (ch === "$" && next === "(") {
      // Command substitution (or $((…)) arithmetic — the paren scan covers
      // both) is data: never unwrapped, never a boundary.
      const end = scanParenSpan(command, i + 1);
      if (end === null) return null; // unterminated $(… — bash refuses
      word += command.slice(i, end);
      wordStarted = true;
      i = end;
      continue;
    }
    if (ch === "`") {
      // Backtick command substitution is data, exactly like $(…) — leaving
      // it to the fallthrough would read a # inside the body as an
      // outer-line comment and swallow the commands after the span.
      const end = scanBacktickSpan(command, i);
      if (end === null) return null; // unterminated `… — bash refuses
      word += command.slice(i, end);
      wordStarted = true;
      i = end;
      continue;
    }
    if (
      ch === "(" &&
      wordStarted &&
      !wordHadQuoting &&
      /^[A-Za-z_][A-Za-z0-9_]*\+?=$/.test(word)
    ) {
      // NAME=(…) / NAME+=(…) array assignment: the one place bash lexes an
      // unquoted `(` into a word. Without this the assignment splits, and
      // the words after it stop reading as an assignment-prefixed command.
      const end = scanParenSpan(command, i);
      if (end === null) return null; // unbalanced — bash refuses
      word += command.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "(" && next === "(") {
      // An arithmetic span — `(( 1 << 2 ))` — is data: `<<` inside it is a
      // shift, never a heredoc opener, and bash runs whatever follows.
      const end = scanParenSpan(command, i);
      if (end === null) return null; // unbalanced — bash refuses
      word += command.slice(i, end);
      wordStarted = true;
      i = end;
      continue;
    }
    if (ch === "(" || ch === ")") {
      // A grouping paren becomes its own word, never discarded: a subshell
      // merge `( gh pr merge )` stays out of jurisdiction (the narrow-side
      // grouping ruling), and a case-pattern `)` never bails the parse to
      // null on input bash runs.
      endWord();
      words.push(ch);
      i += 1;
      continue;
    }
    if (ch === "\n") {
      endCommand();
      i += 1;
      // Heredoc bodies are data: consume lines up to each terminator without
      // ever splitting them into commands. A body whose terminator never
      // appears runs to end-of-input — bash warns ("here-document delimited
      // by end-of-file") but EXECUTES the commands already parsed, so bailing
      // to null here would deny on any body that merely mentions a merge.
      while (pendingHeredocs.length > 0) {
        const { terminator, stripTabs } = pendingHeredocs.shift();
        while (i <= length) {
          let lineEnd = command.indexOf("\n", i);
          const atEnd = lineEnd === -1;
          if (atEnd) lineEnd = length;
          let line = command.slice(i, lineEnd);
          if (stripTabs) line = line.replace(/^\t+/, "");
          i = atEnd ? length + 1 : lineEnd + 1;
          if (line === terminator || atEnd) break;
        }
      }
      continue;
    }
    if (ch === " " || ch === "\t") {
      endWord();
      i += 1;
      continue;
    }
    if (ch === "#" && !wordStarted) {
      const lineEnd = command.indexOf("\n", i);
      i = lineEnd === -1 ? length : lineEnd;
      continue;
    }
    if (ch === "<" || ch === ">") {
      if (next === "(") {
        // Process substitution is a WORD (it expands to a /dev/fd path and
        // glues to adjacent word text), never a redirection.
        const end = scanParenSpan(command, i + 1);
        if (end === null) return null; // unbalanced — bash refuses
        word += command.slice(i, end);
        wordStarted = true;
        i = end;
        continue;
      }
      // Bash folds a glued, unquoted, all-digit word into the operator as
      // its fd number (`2>/dev/null`, `gh 2<<EOF pr merge`); any other
      // in-progress word is complete — `merge>log` still merges.
      if (wordStarted && !wordHadQuoting && /^\d+$/.test(word)) {
        word = "";
        wordStarted = false;
      } else {
        endWord();
      }
      if (ch === "<" && next === "<" && command[i + 2] === "<") {
        // Here-string: the operand is data — leaving any `<` behind would
        // push a phantom heredoc whose missing terminator fails the whole
        // parse open.
        i += 3;
        skipBlanks();
        if (readRedirectionWord() === null) return null;
        continue;
      }
      if (ch === "<" && next === "<") {
        i += 2;
        let stripTabs = false;
        if (command[i] === "-") {
          stripTabs = true;
          i += 1;
        }
        skipBlanks();
        const terminator = readRedirectionWord();
        if (terminator === null) return null;
        pendingHeredocs.push({ terminator, stripTabs });
        continue;
      }
      // Plain redirection: consume the operator (>> >& >| <& <>) and
      // discard its target word. A missing target is a bash syntax error, so
      // nothing runnable is lost when that nulls.
      i += 1;
      if (ch === ">" && (command[i] === ">" || command[i] === "|")) i += 1;
      else if (command[i] === "&") i += 1;
      else if (ch === "<" && command[i] === ">") i += 1;
      skipBlanks();
      if (readRedirectionWord() === null) return null;
      continue;
    }
    if (ch === "&") {
      if (next === ">") {
        // &>out / &>>out — redirection, not a control operator: the merge
        // words before it are a complete simple command that still runs.
        endWord();
        i += 2;
        if (command[i] === ">") i += 1;
        skipBlanks();
        if (readRedirectionWord() === null) return null;
        continue;
      }
      endCommand();
      i += next === "&" ? 2 : 1;
      continue;
    }
    if (ch === "|") {
      endCommand();
      i += next === "|" || next === "&" ? 2 : 1;
      continue;
    }
    if (ch === ";") {
      endCommand();
      i += 1;
      continue;
    }
    word += ch;
    wordStarted = true;
    i += 1;
  }

  // A heredoc whose body never started (no newline before end-of-input) is an
  // empty body to bash: it warns and executes, so the parsed commands stand.
  endCommand();
  return commands;
}

function isAssignmentWord(word) {
  return /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(word);
}

function basename(word) {
  const segments = word.split("/");
  return segments[segments.length - 1];
}

// In jurisdiction iff some simple command's first three words — after
// discarding leading assignment words (NAME=value, NAME+=value, and the
// NAME=(array) form the tokenizer folds into one word), leading words that
// are entirely a command substitution (see below), and the pure prefixes
// `time` (matched on its basename so `/usr/bin/time` counts, its
// `-p`/`--` flags stripped), `!`, and `exec` (and its `-c`/`-l`/`-a NAME`
// flags) — are exactly `gh pr merge` (the first may be a path whose
// basename is gh). Redirections never appear here: the tokenizer consumes
// each operator and its target. Leading shell reserved words other than
// those prefixes, grouping openers, and other wrapper commands (command,
// nohup, nice, timeout, stdbuf, env) are deliberately NOT discarded (err
// narrow): `if …; then gh pr merge; fi`, `{ gh pr merge; }`, and
// `nohup gh pr merge` stay out — named residue in docs/versioning.md.
// Every match is collected: a compound command is gated on ALL of its
// merge commands, so an out-of-scope first merge can never allow a later
// one.
function findMergeCommands(commands) {
  const matches = [];
  for (const words of commands) {
    let start = 0;
    while (start < words.length) {
      const word = words[start];
      if (isAssignmentWord(word) || word === "!") {
        start += 1;
        continue;
      }
      if (
        (word.startsWith("`") && word.endsWith("`") && word.length >= 2) ||
        (word.startsWith("$(") && word.endsWith(")"))
      ) {
        // A leading word that is entirely a command substitution expands
        // BEFORE command lookup, and an empty expansion leaves the following
        // words as the command (`` `true` gh pr merge `` runs the merge).
        // The expansion is unknowable here, so discard the word and err
        // toward gating: a non-empty expansion at worst yields a false deny
        // on the narrow side, never a bypass.
        start += 1;
        continue;
      }
      if (basename(word) === "time") {
        start += 1;
        while (words[start] === "-p" || words[start] === "--") start += 1;
        continue;
      }
      if (word === "exec") {
        start += 1;
        while (start < words.length && words[start].startsWith("-")) {
          const flagWord = words[start];
          start += 1;
          if (flagWord === "--") break;
          // `-a NAME` binds the next word as argv0, so the command being
          // exec'd is the word after NAME.
          if (flagWord.includes("a")) start += 1;
        }
        continue;
      }
      break;
    }
    const rest = words.slice(start);
    if (
      rest.length >= 3 &&
      basename(rest[0]) === "gh" &&
      rest[1] === "pr" &&
      rest[2] === "merge"
    ) {
      matches.push(rest);
    }
  }
  return matches;
}

// gh pr merge long flags that consume the following word — without this list
// a flag value would be misread as the PR selector.
const LONG_VALUE_FLAGS = new Set([
  "--subject",
  "--body",
  "--body-file",
  "--author-email",
  "--match-head-commit",
  "--repo",
]);

// gh pr merge short flags that take a value. Inside a pflag cluster
// (`-dRowner/repo`) the first of these ends the cluster: the rest of the word
// is its value.
const VALUE_SHORT_FLAGS = new Set(["t", "b", "F", "A", "R"]);

function parseMergeArgs(mergeWords) {
  let repoFlag;
  let selector;
  let helpRequested = false;
  for (let i = 3; i < mergeWords.length; i += 1) {
    const word = mergeWords[i];
    // A bare grouping paren rides along as its own word (`(cd x && gh pr
    // merge)` ends with a `)` word). It is shell syntax, not an argument —
    // reading it as the selector makes gh pr view fail with a misleading
    // network/auth diagnosis. Skipped only here, never in findMergeCommands,
    // where discarding it would widen jurisdiction past the narrow-side
    // `( gh pr merge )` grouping ruling.
    if (word === "(" || word === ")") continue;
    if (word.startsWith("--")) {
      // cobra's help flag prints help and never merges, so gating it is a
      // pure false deny. Reached only in FLAG position: a --help consumed
      // as a value below (`--subject --help` merges with that subject)
      // never lands here.
      if (word === "--help") {
        helpRequested = true;
        continue;
      }
      if (word.startsWith("--repo=")) {
        repoFlag = word.slice("--repo=".length);
        continue;
      }
      if (word === "--repo") {
        repoFlag = mergeWords[i + 1];
        i += 1;
        continue;
      }
      if (LONG_VALUE_FLAGS.has(word)) i += 1;
      continue;
    }
    if (word.startsWith("-") && word.length > 1) {
      // A pflag short-flag cluster: boolean flags may precede one value flag,
      // whose value is the rest of the word — after an optional `=`, so
      // `-R=x/y` and `-Rx/y` name the same repo — or the next word.
      for (let j = 1; j < word.length; j += 1) {
        // An `h` among the booleans is cobra's help shorthand (-h, -dh); an
        // `h` after a value flag is that flag's value (-th is --subject h)
        // and the break below keeps it out of here.
        if (word[j] === "h") {
          helpRequested = true;
          continue;
        }
        if (!VALUE_SHORT_FLAGS.has(word[j])) continue;
        let value = word.slice(j + 1);
        if (value.startsWith("=")) value = value.slice(1);
        if (value === "") {
          value = mergeWords[i + 1];
          i += 1;
        }
        if (word[j] === "R") repoFlag = value;
        break;
      }
      continue;
    }
    if (word.startsWith("-")) continue;
    if (selector === undefined) selector = word;
  }
  return { repoFlag, selector, helpRequested };
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
  // gh accepts `[HOST/]OWNER/REPO` — reduce to the last two path segments so
  // a host-qualified value still names this repo instead of reading foreign.
  // The host is dropped even when it is a genuinely foreign GHE host carrying
  // the same owner/repo slug: that value reads as home and gets gated — a
  // false deny on the narrow side, never a bypass.
  const segments = value.trim().replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.length < 2) return null;
  return segments.slice(-2).join("/").toLowerCase();
}

// --- The invariant run ------------------------------------------------------

function resolveDefaultBranch() {
  // GitHub is authoritative: the base check compares this against
  // baseRefName, which also comes from GitHub, and the local origin/HEAD
  // ref goes stale on an upstream default-branch rename — a wrong guess
  // lands on the ALLOW side of the base check. The local ref is only the
  // fallback for when gh cannot answer.
  const view = run("gh", [
    "repo",
    "view",
    "--json",
    "defaultBranchRef",
    "--jq",
    ".defaultBranchRef.name",
  ]);
  if (succeeded(view)) {
    const name = view.stdout.trim();
    if (name !== "") return name;
  }
  const result = run("git", ["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (succeeded(result)) {
    const ref = result.stdout.trim();
    const prefix = "refs/remotes/origin/";
    if (ref.startsWith(prefix) && ref.length > prefix.length) {
      return ref.slice(prefix.length);
    }
  }
  deny(
    "pre-merge guard: could not resolve the default branch (gh repo view " +
      "failed and origin/HEAD is unset). Recovery: run " +
      "`git remote set-head origin --auto`, then re-run /shipit.",
  );
}

// Recovery routes keyed on the script verdict. At merge time there is no
// "continue" arm: the "cannot merge until version-bump runs at land time"
// verdict means the bump is missing or went stale (e.g. a /shipit step-5
// rebase moved the fork point). That verdict is only actionable HERE, at the
// merge attempt — earlier in the PR's life it is the expected state.
function withRecoveryRoute(verdict) {
  if (verdict.includes("must land with no bump")) {
    return (
      `${verdict}\n` +
      "Recovery: drop the chore(version) commit, undo the changelog cut, " +
      "land plain, then re-run /shipit."
    );
  }
  if (verdict.includes("cannot merge until version-bump runs at land time")) {
    return (
      `${verdict}\n` +
      "At merge time this means the bump is missing or stale. Recovery: drop " +
      "any chore(version) commit, undo the changelog cut, re-run version-bump " +
      "from step 0, re-title, then re-run /shipit."
    );
  }
  return verdict;
}

// Gate one merge command: return to allow it (or to skip it as out of
// scope), deny() to block. Allow must never exit the process — a compound
// command can carry further merge commands that still need gating.
function gate(mergeWords) {
  const { repoFlag, selector, helpRequested } = parseMergeArgs(mergeWords);

  // A help invocation merges nothing — skip it before any external call.
  if (helpRequested) return;

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
    const target = normalizeRepoTarget(repoFlag);
    if (target === null) {
      deny(`pre-merge guard: could not parse the --repo target: ${repoFlag}`);
    }
    // The invariant binds this repo only — a foreign-repo merge passes.
    if (target !== home) return;
  }

  const view = run("gh", [
    "pr",
    "view",
    ...(selector !== undefined ? [selector] : []),
    "--json",
    "number,headRefOid,baseRefName,isCrossRepository",
  ]);
  if (!succeeded(view)) {
    deny(
      `${describeFailure("gh pr view", view)}\n` +
        "If this merge targets another repo's PR, pass --repo explicitly. " +
        "Recovery: check network and gh auth (gh auth status), then re-run /shipit.",
    );
  }

  let pr;
  try {
    pr = JSON.parse(view.stdout);
  } catch {
    pr = undefined;
  }
  const number = pr?.number;
  const headRefOid = pr?.headRefOid;
  const baseRefName = pr?.baseRefName;
  const isCrossRepository = pr?.isCrossRepository;
  // The full-oid shape check keeps headRefOid from ever reaching git as an
  // option-shaped or ref-expression argument.
  if (
    !Number.isInteger(number) ||
    typeof headRefOid !== "string" ||
    !/^[0-9a-f]{40}$/.test(headRefOid) ||
    typeof baseRefName !== "string" ||
    typeof isCrossRepository !== "boolean"
  ) {
    deny(
      "pre-merge guard: unexpected gh pr view output (expected an integer " +
        "number, a 40-hex-char headRefOid, a string baseRefName, and a " +
        "boolean isCrossRepository): " +
        `${view.stdout.trim()}\n` +
        "Recovery: check gh (gh --version, gh auth status), then re-run /shipit.",
    );
  }

  const defaultBranch = resolveDefaultBranch();
  // The invariant gates merges into the default branch only (the old
  // workflow's trigger scope) — any other base passes.
  if (baseRefName !== defaultBranch) return;

  const fetchBase = run("git", ["fetch", "origin", defaultBranch]);
  if (!succeeded(fetchBase)) {
    deny(
      `${describeFailure(`git fetch origin ${defaultBranch}`, fetchBase)}\n` +
        "Recovery: check network and git credentials, then re-run /shipit.",
    );
  }

  // GitHub publishes every PR head under refs/pull/<n>/head on the base repo,
  // so fork heads resolve exactly like same-repo heads.
  const fetchHead = run("git", ["fetch", "origin", `refs/pull/${number}/head`]);
  if (!succeeded(fetchHead)) {
    deny(
      `${describeFailure(`git fetch origin refs/pull/${number}/head`, fetchHead)}\n` +
        "Recovery: check network and git credentials, then re-run /shipit.",
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

  // The gate script as of the PR head, which is the definition of "runtime
  // file" that this merge lands (#232). A head that carries no script yields no
  // verdict.
  const headScript = run("git", [
    "show",
    `${headRefOid}:${INVARIANT_SCRIPT_PATH}`,
  ]);
  if (!succeeded(headScript) || (headScript.stdout ?? "") === "") {
    deny(
      `pre-merge guard: the PR head carries no ${INVARIANT_SCRIPT_PATH}. ` +
        "Recovery: restore it on the branch " +
        `(git checkout origin/${defaultBranch} -- ${INVARIANT_SCRIPT_PATH}), ` +
        "push, then re-run /shipit.",
    );
  }

  // A fork head's script is unreviewed code, and this repo withholds trust from
  // fork PRs by policy (docs/testing.md §5), so it is never executed. An
  // identical copy is this checkout's own content and runs normally; a divergent
  // one denies and hands the operator the diff.
  if (isCrossRepository) {
    const local = existsSync(INVARIANT_SCRIPT)
      ? readFileSync(INVARIANT_SCRIPT, "utf-8")
      : null;
    if (local !== headScript.stdout) {
      deny(
        `pre-merge guard: PR #${number} comes from a fork and its ` +
          `${INVARIANT_SCRIPT_PATH} differs from this checkout's. The guard ` +
          "does not execute a gate script it has not reviewed, so it cannot " +
          "render a verdict. Recovery: read the head's copy " +
          `(git show ${headRefOid}:${INVARIANT_SCRIPT_PATH}), and land the PR ` +
          "deliberately, on another merge surface, once you trust it.",
      );
    }
  }

  scratchDir = mkdtempSync(join(tmpdir(), "pre-merge-guard-gate-"));
  const scriptPath = join(scratchDir, "version-bump-required.sh");
  writeFileSync(scriptPath, headScript.stdout);

  // BASE_SHA is the base TIP, never a pre-computed merge-base: the script
  // reduces the pair to the fork point itself, exactly as CI did.
  const verdict = run("bash", [scriptPath], {
    HEAD_SHA: headRefOid,
    BASE_SHA: baseTipOid,
  });
  if (succeeded(verdict) && (verdict.stdout ?? "").startsWith("OK:")) {
    // Allow silently (check-registry-sync.mjs precedent: no output on allow).
    clearScratch();
    return;
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

  // Any crash from here denies, never falls through as a fail-open exit 1
  // (the c945395 class). That covers the tokenizer too: its span scanners
  // recurse with the nesting depth, so adversarially deep nesting can blow
  // the stack (RangeError), and a crash says nothing about what bash would
  // run. The whole command is allowed only when every merge command in it
  // passes or is out of scope.
  try {
    const commands = tokenize(command);
    if (commands === null) {
      // Fail closed on a parse failure that could hide a merge. Five review
      // rounds each found a fresh input the tokenizer nulls on but bash
      // (partially) executes — most simply, a multi-line input whose merge
      // line has already run when a later line hits the syntax error. A null
      // says "unparseable", never "harmless", so the safe verdict is deny.
      // The raw-text prefilter keeps everyday unparseable-but-mergeless
      // commands silent. Everything bash can splice into the middle of a
      // word without changing it is stripped first, so the letters m-e-r-g-e
      // stay adjacent however the word is spelled: a line continuation
      // (mer\<newline>ge), then the quoting and expansion-introducing
      // characters (mer\ge, mer"g"e, mer$''ge, mer$'g'e). What survives is
      // the never-expanded class the tokenizer also cannot see through —
      // parameter and brace expansion, numeric escapes, substitution bodies
      // — which dodges this filter and the parseable path alike (see the
      // tokenize contract).
      const spliceFree = command
        .replace(/\\\n/g, "")
        .replace(/[\\'"`$]/g, "");
      if (!spliceFree.includes("merge")) process.exit(0);
      deny(
        "pre-merge guard: could not parse this command, and its text may " +
          "spell `gh pr merge`. Bash runs each complete earlier line before " +
          "a later syntax error, so an unparseable command is denied rather " +
          "than risk an unchecked merge slipping through. Recovery: fix the " +
          "shell syntax, or re-run the merge alone as a plain " +
          "`gh pr merge <number> --squash …` command.",
      );
    }

    const mergeCommandList = findMergeCommands(commands);
    if (mergeCommandList.length === 0) process.exit(0);

    for (const mergeWords of mergeCommandList) gate(mergeWords);
  } catch (error) {
    deny(`pre-merge guard error: ${error?.message ?? String(error)}`);
  }
}

main();
