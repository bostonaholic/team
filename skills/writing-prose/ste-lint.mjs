#!/usr/bin/env node
// ste-lint: score prose drift against the writing-prose skill.
//
// Credit: the approach — a small mechanical scorer that reports prose
// violations per 100 words — comes from the "cure for AI slop" writing kit at
// https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop
// (consulted 2026-08-03). The kit carries the MIT License, Copyright (c) 2026
// Ege Çelebi. None of its code is used here: this implementation was written
// from scratch for this repository. Its violation categories come from the
// self-lint checklist in skills/writing-prose/SKILL.md, and its word lists
// hold that skill's delete-list rows and a curated subset of its
// substitution-table rows, plus inflected forms of those rows ("seamlessly",
// "comprehensively", "utilization"). The grammar
// vocabulary below (BE_FORMS, IRREGULAR_PARTICIPLES, LIGHT_VERBS,
// NOMINAL_SUFFIXES) is implementation detail for detecting the skill's
// passive-voice and nominalization rules; the skill states those rules in
// prose and lists no such vocabulary. The rows this scorer reads from the
// skill's tables were added by the same change set that added this script,
// so the skill file is the single authority for what counts as a violation,
// not an independent second source.
//
// Runs on Node, which every supported host install already has. Invoke it
// explicitly, from the directory this file sits in:
//
//     node "<skill-dir>/ste-lint.mjs" [--breakdown] [--cap N] [path ...]
//
// `<skill-dir>` is `${CLAUDE_PLUGIN_ROOT}/skills/writing-prose` on Claude
// Code. Codex sets no plugin-root variable, so pass the literal directory
// there. This file reads no environment variable and holds no relative
// import, so it runs unchanged from whatever path a host installs it to.
//
// With no paths, or with the path "-", text is read from stdin. The default
// sentence cap is 20 words (strict mode in the skill); pass --cap 25 to score
// descriptive prose at the STE-flavored cap. The script gates nothing: no
// hook, CI workflow, test, or package.json script runs it. Run it by hand to
// compare prose against a recorded baseline.
//
// Hard-wrapped markdown is reflowed before sentence segmentation: adjacent
// non-blank lines join into one logical paragraph, while each heading, list
// item, and table row stays its own unit, so a numbered step list is never
// scored as one run-on paragraph.
//
// Known false positive: the contraction check also matches possessives
// ("file's"). Both need the same human eye, so both are flagged.
//
// Pattern note: `$` does NOT bound backtracking. A `[…]+$` class retries at
// every position of a long interior run and unwinds the whole run each time,
// which is quadratic in the run's length — the reason `trimEnds` below scans
// indices instead. Read that trap as the standing rule for this file: a
// trailing `$` bounds nothing on its own, so give a quantifier a real
// boundary — \b, ^, a lookaround, or a literal delimiter. A `^…$` full-match
// test such as the --cap check is exempt: the leading `^` pins the one start
// position, which is what bounds the scan. No quantifier here nests another.
//
// Measured under Node 22 after the index-scan fix: linear to 64 MB of
// ordinary prose, and flat in the length of an interior whitespace or pipe
// run (500k interior spaces score in 0.06s; the same input took over two
// minutes against the `[…]+$` form).

import { readFileSync } from "node:fs";

// Inflect a verb: base, third-person -s, past, and -ing forms.
function verbForms(base, ...irregular) {
  if (irregular.length > 0) return [base, ...irregular];
  if (base.endsWith("e")) {
    return [base, `${base}s`, `${base}d`, `${base.slice(0, -1)}ing`];
  }
  const third = base + (/(?:ch|sh|s|x)$/.test(base) ? "es" : "s");
  return [base, third, `${base}ed`, `${base}ing`];
}

// Word lists compiled from skills/writing-prose/SKILL.md. Membership is
// curated for a low false-positive rate, so substitution-table rows whose
// left side is a common correct word in software prose (e.g. "may",
// "required", "modify") are left out. Every list is kept alphabetical.

// "Words and phrases to delete" — the skill's three named delete groups.
const MARKETING_ADJECTIVES = [
  "battle-tested", "best-in-class", "blazing-fast", "cutting-edge",
  "disruptive", "effortless", "effortlessly", "enterprise-grade",
  "game-changing", "next-generation", "powerful", "revolutionary", "robust",
  "robustly", "seamless", "seamlessly", "state-of-the-art", "world-class"
].sort();
const MODAL_HEDGES = [
  "as mentioned above", "it is important to note", "it is worth noting",
  "it should be noted", "please note that"
].sort();
const FILLER = [
  "a variety of", "aforementioned", "due to the fact that", "henceforth",
  "in order to", "in the event that"
].sort();

// "STE word substitutions" — table rows that mark slop reliably.
const SUBSTITUTION_WORDS = [...new Set([
  "additionally", "amongst", "comprehensive", "comprehensively",
  "furthermore", "moreover", "myriad", "numerous", "prior to",
  "utilization", "whilst",
  ...verbForms("acquire"), ...verbForms("commence"), ...verbForms("demonstrate"),
  ...verbForms("ensure"), ...verbForms("facilitate"), ...verbForms("initiate"),
  ...verbForms("leverage"), ...verbForms("obtain"), ...verbForms("terminate"),
  ...verbForms("utilize")
])].sort();

// Phrasal verbs the substitution table maps to one plain verb.
const PHRASAL_VERBS = [
  [verbForms("dive", "dives", "dived", "dove", "diving"), "into"],
  [verbForms("kick"), "off"],
  [verbForms("ramp"), "up"],
  [verbForms("reach"), "out"],
  [verbForms("spin", "spins", "spun", "spinning"), "up"],
  [verbForms("tear", "tears", "tore", "torn", "tearing"), "down"]
].flatMap(([forms, particle]) => forms.map((form) => `${form} ${particle}`))
  .sort();

// Grammar vocabulary for the token-pair scans below.
const BE_FORMS = new Set(["am", "are", "be", "been", "being", "is", "was", "were"]);
const IRREGULAR_PARTICIPLES = new Set([
  "begun", "bound", "broken", "brought", "built", "caught", "chosen", "cut",
  "done", "drawn", "driven", "found", "given", "gone", "held", "hidden",
  "kept", "known", "laid", "left", "lost", "made", "meant", "put", "read",
  "run", "seen", "sent", "set", "shown", "split", "taken", "thought",
  "thrown", "understood", "written"
]);
// Light verbs that carry a nominalization ("make an assessment").
const LIGHT_VERBS = new Set([
  ...verbForms("conduct"), ...verbForms("execute"), ...verbForms("perform"),
  ...verbForms("provide"), "made", "make", "makes"
]);
const NOMINAL_SUFFIXES = ["ance", "ence", "ion", "ment", "ysis"];

const LIST_ITEM = /^(?:[*+-]|[0-9]+[.)])\s+/;
const INLINE_CODE = /`[^`]+`/g;
const CONTRACTION = /\b[a-z]+[’'](?:d|ll|m|re|s|t|ve)\b/gi;
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=["'“‘(]?[A-Z0-9])/;
const GRAMMAR_TOKEN = /[a-z]+/g;

// Report order follows the skill's self-lint checklist; the delete list's
// three groups and the substitution table report separately so a drift in
// one group is visible on its own line.
const CATEGORIES = [
  "sentence-over-cap", "semicolon", "contraction", "passive-voice",
  "progressive-verb", "nominalization", "phrasal-verb",
  "marketing-adjective", "modal-hedge", "filler", "substitution-word",
  "long-paragraph"
];

function phraseRegex(phrases) {
  const escaped = phrases
    .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(`\\b(?:${escaped})\\b`, "gi");
}

const MARKETING_RE = phraseRegex(MARKETING_ADJECTIVES);
const HEDGE_RE = phraseRegex(MODAL_HEDGES);
const FILLER_RE = phraseRegex(FILLER);
const SUBSTITUTION_RE = phraseRegex(SUBSTITUTION_WORDS);
const PHRASAL_RE = phraseRegex(PHRASAL_VERBS);

// Trim a run of matching characters off both ends by scanning indices.
//
// A `[…]+$` regex is the obvious spelling and the wrong one: it retries at
// every position of a long internal run, consumes to the run's end, fails the
// anchor, and backtracks through every length. That is quadratic in the run's
// length. Index scanning is linear and cannot backtrack.
function trimEnds(text, matches) {
  let start = 0;
  let end = text.length;
  while (start < end && matches(text.charCodeAt(start))) start += 1;
  while (end > start && matches(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(start, end);
}

// Space, NUL, and the \t \n \v \f \r block at 0x09-0x0d. ASCII only, so
// parsing does not swallow exotic Unicode spaces that markdown treats as
// content.
function isAsciiSpace(code) {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0x00;
}

function isPipe(code) {
  return code === 0x7c;
}

function strip(text) {
  return trimEnds(text, isAsciiSpace);
}

// Reflow markdown into [kind, text] units.
//
// Kinds: "prose" (a whole logical paragraph, hard wraps undone),
// "list-item" (one item plus its continuation lines), "heading", and
// "table-row". Fenced code is dropped; an inline code span collapses to
// the single placeholder token "code" so it counts as one word.
function logicalUnits(text, source) {
  const units = [];
  let pending = [];
  let pendingKind = "prose";

  const flush = () => {
    if (pending.length > 0) {
      units.push([pendingKind, pending.join(" ")]);
      pending = [];
    }
  };

  let inFence = false;
  for (const rawLine of text.split("\n")) {
    let line = strip(rawLine);
    if (line.startsWith("```")) {
      inFence = !inFence;
      flush();
      continue;
    }
    if (inFence) continue;

    line = line.replace(INLINE_CODE, "code");
    if (line === "") {
      flush();
      pendingKind = "prose";
      continue;
    }
    if (line.startsWith("#")) {
      flush();
      units.push(["heading", strip(line.replace(/^#+/, ""))]);
      pendingKind = "prose";
      continue;
    }
    if (line.startsWith("|")) {
      flush();
      units.push(["table-row", trimEnds(line, isPipe).replaceAll("|", " ")]);
      pendingKind = "prose";
      continue;
    }
    const marker = LIST_ITEM.exec(line);
    if (marker) {
      flush();
      pendingKind = "list-item";
      pending.push(line.slice(marker[0].length));
      continue;
    }
    if (pending.length === 0) pendingKind = "prose";
    pending.push(line);
  }
  flush();
  if (inFence) {
    process.stderr.write(
      `ste-lint: ${source}: warning: a code fence is still open at end ` +
      "of input; text inside it was not scored\n"
    );
  }
  return units;
}

const ALNUM = /[\p{L}\p{N}]/u;

function countWords(text) {
  return text.split(/[ \t\n\v\f\r]+/)
    .filter((token) => token !== "" && ALNUM.test(token)).length;
}

function countMatches(text, regex) {
  return (text.match(regex) ?? []).length;
}

function countChar(text, char) {
  return text.split(char).length - 1;
}

// Count passive, progressive, and nominalization token patterns.
function grammarHits(sentence) {
  let passive = 0;
  let progressive = 0;
  let nominal = 0;
  const tokens = sentence.toLowerCase().match(GRAMMAR_TOKEN) ?? [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (BE_FORMS.has(token)) {
      const after = tokens[i + 1];
      if ((after.endsWith("ed") && after.length >= 4) ||
          IRREGULAR_PARTICIPLES.has(after)) {
        passive += 1;
      } else if (after.endsWith("ing") && after.length >= 5) {
        progressive += 1;
      }
    }
    if (!LIGHT_VERBS.has(token)) continue;

    for (const candidate of tokens.slice(i + 1, i + 4)) {
      if (candidate.length >= 6 &&
          NOMINAL_SUFFIXES.some((suffix) => candidate.endsWith(suffix))) {
        nominal += 1;
        break;
      }
    }
  }
  return [passive, progressive, nominal];
}

// Round to 2 decimal places the way Ruby's Float#round(2) does — half away
// from zero on the digits of the shortest decimal representation — so the
// recorded Ruby baseline scores reproduce exactly. JS Math.round(x * 100)
// diverges on values like 2.675 whose binary double sits just below the
// decimal tie.
function round2(value) {
  const repr = String(value);
  const dot = repr.indexOf(".");
  if (dot === -1 || repr.includes("e") || repr.includes("E")) return value;
  const frac = repr.slice(dot + 1);
  if (frac.length <= 2) return value;
  let scaled = BigInt(repr.slice(0, dot) + frac.slice(0, 2));
  if (frac.charCodeAt(2) >= 0x35) scaled += 1n; // first dropped digit >= '5'
  return Number(scaled) / 100;
}

// Format like Ruby's Float#to_s: shortest round-trip decimal, with a
// trailing ".0" on whole numbers.
function formatFloat(value) {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

// Format like Ruby's "%.2f": half to even on the digits of the shortest
// decimal representation. JS toFixed(2) diverges on decimal ties (0.125,
// 2.675), so the breakdown lines use this instead.
function formatFixed2(value) {
  const repr = String(value);
  if (repr.includes("e") || repr.includes("E")) return value.toFixed(2);
  const dot = repr.indexOf(".");
  if (dot === -1) return `${repr}.00`;
  const frac = repr.slice(dot + 1);
  if (frac.length <= 2) return `${repr.slice(0, dot)}.${frac.padEnd(2, "0")}`;
  let scaled = BigInt(repr.slice(0, dot) + frac.slice(0, 2));
  const dropped = frac.slice(2);
  // The shortest representation never ends in "0", so a lone "5" is an
  // exact tie and anything after a "5" means the value is above the tie.
  if (dropped[0] > "5" || (dropped[0] === "5" && dropped.length > 1)) {
    scaled += 1n;
  } else if (dropped === "5" && scaled % 2n === 1n) {
    scaled += 1n;
  }
  const text = scaled.toString().padStart(3, "0");
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

function score(text, cap, source) {
  const units = logicalUnits(text, source);
  const allText = units.map(([, unitText]) => unitText).join("\n");

  const sentenceLengths = [];
  let passive = 0;
  let progressive = 0;
  let nominal = 0;
  let longParagraphs = 0;
  for (const [kind, unitText] of units) {
    if (kind !== "prose" && kind !== "list-item") continue;

    const unitSentences = unitText.split(SENTENCE_SPLIT)
      .filter((sentence) => strip(sentence) !== "");
    if (kind === "prose" && unitSentences.length > 6) longParagraphs += 1;
    for (const sentence of unitSentences) {
      sentenceLengths.push(countWords(sentence));
      const hits = grammarHits(sentence);
      passive += hits[0];
      progressive += hits[1];
      nominal += hits[2];
    }
  }

  const counts = {
    "sentence-over-cap": sentenceLengths.filter((length) => length > cap).length,
    "semicolon": countChar(allText, ";"),
    "contraction": countMatches(allText, CONTRACTION),
    "passive-voice": passive,
    "progressive-verb": progressive,
    "nominalization": nominal,
    "phrasal-verb": countMatches(allText, PHRASAL_RE),
    "marketing-adjective": countMatches(allText, MARKETING_RE),
    "modal-hedge": countMatches(allText, HEDGE_RE),
    "filler": countMatches(allText, FILLER_RE),
    "substitution-word": countMatches(allText, SUBSTITUTION_RE),
    "long-paragraph": longParagraphs
  };
  const words = units.reduce((sum, [, unitText]) => sum + countWords(unitText), 0);
  const violations = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return {
    words,
    sentences: sentenceLengths.length,
    counts,
    violations,
    per100Words: words === 0 ? null : round2((violations * 100) / words),
    emDashes: countChar(allText, "—") + countChar(allText, "–"),
    longestSentence: sentenceLengths.reduce((max, length) => Math.max(max, length), 0)
  };
}

function render(name, result, breakdown) {
  const rate = result.per100Words;
  process.stdout.write(
    `${name}: words=${result.words} sentences=${result.sentences} ` +
    `violations=${result.violations} ` +
    `per-100-words=${rate === null ? "n/a" : formatFloat(rate)} ` +
    `em-dashes=${result.emDashes} longest-sentence=${result.longestSentence}\n`
  );
  if (!breakdown || rate === null) return;

  for (const category of CATEGORIES) {
    const count = result.counts[category];
    process.stdout.write(
      `  ${category.padEnd(20)} ${String(count).padStart(3)}  ` +
      `(${formatFixed2((count * 100) / result.words)} per 100 words)\n`
    );
  }
}

const USAGE = 'usage: ste-lint [--breakdown] [--cap N] [path ...]\n\n' +
  "Score prose against the mechanical rules in skills/writing-prose/SKILL.md,\n" +
  "as violations per 100 words.\n";
const HELP = `${USAGE}
    -b, --breakdown                  also print per-category violation counts
        --cap N                      sentence-length cap in words (default: 20)
    -h, --help                       show this help message and exit
With no paths, or with the path "-", text is read from stdin. The default
cap of 20 words is the skill's strict mode; pass --cap 25 to score
descriptive prose at the STE-flavored cap.
`;

// One `ste-lint: <path>: <reason>` line per unreadable path, matching the
// strerror text Ruby's SystemCallError produced.
const ERRNO_REASONS = {
  EACCES: "Permission denied",
  EISDIR: "Is a directory",
  ENOENT: "No such file or directory",
  ENOTDIR: "Not a directory"
};

function main(argv) {
  let breakdown = false;
  let cap = 20;
  const paths = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-b" || arg === "--breakdown") {
      breakdown = true;
    } else if (arg === "--cap" || arg.startsWith("--cap=")) {
      const value = arg === "--cap" ? argv[++i] : arg.slice("--cap=".length);
      if (value === undefined) {
        process.stderr.write(`ste-lint: missing argument: ${arg}\n${USAGE}`);
        return 2;
      }
      if (!/^-?\d+$/.test(value)) {
        process.stderr.write(`ste-lint: invalid argument: --cap ${value}\n${USAGE}`);
        return 2;
      }
      cap = Number(value);
    } else if (arg === "-h" || arg === "--help") {
      process.stdout.write(HELP);
      return 0;
    } else if (arg !== "-" && arg.startsWith("-")) {
      process.stderr.write(`ste-lint: invalid option: ${arg}\n${USAGE}`);
      return 2;
    } else {
      paths.push(arg);
    }
  }

  // fatal:true reports invalid UTF-8 instead of silently substituting U+FFFD
  // the way Buffer#toString would; ignoreBOM keeps a leading BOM as content,
  // matching Ruby's File.read.
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let failures = 0;
  for (const path of paths.length === 0 ? ["-"] : paths) {
    const name = path === "-" ? "<stdin>" : path;
    let buffer;
    try {
      buffer = readFileSync(path === "-" ? 0 : path);
    } catch (error) {
      const reason = ERRNO_REASONS[error.code] ?? error.message;
      process.stderr.write(`ste-lint: ${name}: ${reason}\n`);
      failures += 1;
      continue;
    }
    let text;
    try {
      text = decoder.decode(buffer);
    } catch (error) {
      // fatal:true throws TypeError for bad bytes. Anything else is a
      // different failure — a file past V8's max string length, say — and
      // must not be reported as an encoding problem.
      const reason = error instanceof TypeError
        ? "invalid byte sequence in UTF-8"
        : error.message;
      process.stderr.write(`ste-lint: ${name}: ${reason}\n`);
      failures += 1;
      continue;
    }
    render(name, score(text, cap, name), breakdown);
  }
  return failures === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
