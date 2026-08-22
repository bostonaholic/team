// Acceptance fence for the thin-agents-over-skills refactor: every agent
// file becomes an identity-only wrapper (60-90 lines) whose procedure lives
// in a preloaded methodology skill — 9 new skills plus folds into existing
// skills. L2 static-invariant tripwires per docs/testing.md: read source,
// assert the contract, execute nothing. The suite passes only when the
// whole refactor is complete.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";
import { E2E_TOUCHFILES } from "./helpers/touchfiles";

const REPO_ROOT = process.cwd();

function agentPath(name: string): string {
  return join(REPO_ROOT, "agents", `${name}.md`);
}

function skillPath(name: string): string {
  return join(REPO_ROOT, "skills", name, "SKILL.md");
}

// Missing-file reads return "" so dependent checks fail as assertions
// (expected "" to contain ...), never as ENOENT crashes.
function readOrEmpty(path: string): string {
  return existsSync(path) ? read(path) : "";
}

// Everything after the closing frontmatter marker.
function body(text: string): string {
  const parts = text.split(/^---$/m);
  return parts.slice(2).join("---");
}

// The `skills:` preload list from an agent's frontmatter, sorted.
function preloads(agentFile: string): string[] {
  const lines = frontmatter(readOrEmpty(agentFile)).split("\n");
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (/^skills:\s*$/.test(line)) {
      inList = true;
      continue;
    }
    if (inList) {
      const match = line.match(/^\s+-\s+(\S+)\s*$/);
      if (match?.[1] !== undefined) out.push(match[1]);
      else inList = false;
    }
  }
  return out.sort();
}

const ALL_AGENTS = [
  "code-reviewer",
  "design-author",
  "file-finder",
  "implementer",
  "planner",
  "questioner",
  "researcher",
  "security-reviewer",
  "structure-planner",
  "technical-writer",
  "test-architect",
  "ux-reviewer",
  "verifier",
];

// The 9 new methodology skills, the agent whose procedure each one carries,
// and a marker string from the moved content that must survive the move.
const NEW_SKILLS: { skill: string; agent: string; anchor: string }[] = [
  { skill: "implementing-slices", agent: "implementer", anchor: "acceptance test" },
  { skill: "running-quality-checks", agent: "verifier", anchor: "speed order" },
  { skill: "verifying-ux", agent: "ux-reviewer", anchor: "curl" },
  { skill: "decomposing-intent", agent: "questioner", anchor: "questions.md" },
  { skill: "authoring-designs", agent: "design-author", anchor: "design.md" },
  { skill: "researching-codebases", agent: "researcher", anchor: "research.md" },
  { skill: "finding-files", agent: "file-finder", anchor: "questions.md" },
  { skill: "slicing-work", agent: "structure-planner", anchor: "structure.md" },
  { skill: "planning-implementation", agent: "planner", anchor: "plan.md" },
];


describe("thin agents: new methodology skills exist with the methodology-skill frontmatter contract", () => {
  for (const { skill } of NEW_SKILLS) {
    test(`skills/${skill}/SKILL.md exists`, () => {
      expect(existsSync(skillPath(skill))).toBe(true);
    });

    test(`${skill} frontmatter: name, description, user-invocable false, no effort`, () => {
      const fm = frontmatter(readOrEmpty(skillPath(skill)));
      expect(fm).toMatch(new RegExp(`^name: ${skill}$`, "m"));
      expect(fm).toMatch(/^description: .{20,}/m);
      expect(fm).toMatch(/^user-invocable: false$/m);
      expect(/^effort:/m.test(fm)).toBe(false);
    });

    test(`${skill} body is present`, () => {
      expect(readOrEmpty(skillPath(skill)).length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// The principle-* family (design tests 2-7).
//
// Each member is a single-claim skill discovered by description, pointed to
// from the source skills whose prose it now carries. Every check below is an
// L2 static tripwire: read the source, assert the contract, execute nothing.
// ---------------------------------------------------------------------------

// The member-count guard. Without it, a renamed prefix or an empty glob turns
// every per-member sweep below into a permanently green no-op
// (docs/testing.md, "Prove a negative check can find a positive"). The value
// walks the slice ladder 1 / 5 / 9 / 14 / 19 as each batch of principles
// lands — the same per-slice treatment as the documentation count strings.
const EXPECTED_PRINCIPLE_COUNT = 1;

// The slice whose prose has moved. MOVED_RUNS below carries every marker of
// the whole change, and a marker only becomes checkable once its own slice
// moves the prose it was lifted from, so the test-6 sweeps read the markers up
// to this slice and no further. Walks 1 / 2 / 3 / 4 / 5 beside the count above.
const CURRENT_SLICE = 1;

const SKILLS_ROOT = join(REPO_ROOT, "skills");

// Every repo-root skill directory holding a SKILL.md, sorted. The scan never
// reaches .claude/skills/**, which is development tooling, not the library.
function allSkillNames(): string[] {
  return readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(skillPath(name)))
    .sort();
}

function principleSkillNames(): string[] {
  return allSkillNames().filter((name) => name.startsWith("principle-"));
}

// The holder scan for tests 4 and 5: every skill outside the family. Excluding
// the family is what lets a `## Boundary` cite a sibling without polluting that
// sibling's `## Where it applies` set.
function nonFamilySkillNames(): string[] {
  return allSkillNames().filter((name) => !name.startsWith("principle-"));
}

// Text from `heading` to the next heading line; "" when the heading is missing
// (tests/methodology.test.ts sectionFrom).
function sectionFrom(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) return "";
  const afterHeading = start + heading.length;
  const next = text.slice(afterHeading).search(/\n##/);
  if (next === -1) return text.slice(start);
  return text.slice(start, afterHeading + next);
}

// sectionFrom returns the heading text plus its body, so a bare length check on
// it passes for a section that holds nothing. Strip the heading first.
function sectionBody(text: string, heading: string): string {
  const section = sectionFrom(text, heading);
  if (section === "") return "";
  return section.slice(heading.length).trim();
}

function bulletCount(text: string): number {
  return (text.match(/^- /gm) ?? []).length;
}

// Marker matching: flatten line wraps, squash the whitespace, case-fold, and
// strip the emphasis characters from marker and haystack alike. This repo
// hard-wraps prose, so a single-line regex sweeps straight past a sentence
// that spans two lines (docs/testing.md, "Prove a negative check can find a
// positive").
function normalizeForMarkers(text: string): string {
  return squash(text.replace(/[*_]/g, "")).trim().toLowerCase();
}

const RULES_OUT_HEADING = "## What it rules out";
const BOUNDARY_HEADING = "## Boundary";
const WHERE_IT_APPLIES_HEADING = "## Where it applies";

const SKILL_PATH_PATTERN = /skills\/[a-z0-9-]+\/SKILL\.md/g;

// The 26 moved runs (design test 6). A marker is one contiguous run of prose
// that leaves a source skill, held here as the source's own lines so it can be
// audited against the line range it was lifted from. The lines join on a single
// space because normalizeForMarkers squashes whitespace anyway.
//
// Per-slice budget: 3 / 6 / 3 / 8 / 6 = 26. Rows 7, 15, 16, and 18 move no
// prose, so they contribute no marker.
const MOVED_RUNS: { slice: number; owner: string; source: string; run: string[] }[] = [
  // ---- Slice 1 (3) ----
  {
    slice: 1,
    owner: "principle-construct-with-collaborators",
    source: "solid-principles", // :76-82
    run: [
      "**Construct with collaborators. Call with work.** The constructor takes the",
      "long-lived collaborators that define what the object IS — its clients,",
      "loggers, clock, database handle. Methods take the per-call work parameters. A",
      "`ReportGenerator(reportingDb, clock)` serves many date ranges through",
      "`generate(startDate, endDate)`. A",
      "`ReportGenerator(reportingDb, clock, startDate, endDate)` needs a new instance",
      "per query and conflates identity with work.",
    ],
  },
  {
    slice: 1,
    owner: "principle-construct-with-collaborators",
    source: "engineering-standards", // :131 (after the retained bold lead) -135
    run: [
      "Constructors take",
      "long-lived dependencies (clock, DB, logger, HTTP client) that define",
      "identity. Methods take per-call work parameters (date range, request body).",
      "Constructors do no work — no I/O, no static lookups, no expensive",
      "computation.",
    ],
  },
  {
    slice: 1,
    owner: "principle-construct-with-collaborators",
    source: "refactoring-to-patterns", // :52 (mid-line) -57
    run: [
      "The fix is one rule:",
      "**construct with collaborators, call with work.** Long-lived dependencies",
      "(HTTP client, DB, clock, logger) are injected through the constructor;",
      "per-call parameters (date ranges, query strings, request bodies) go on the",
      "method; constructors assign and return, doing no work at all. Production wires",
      "real collaborators; tests substitute fakes at construction.",
    ],
  },

  // ---- Slice 2 (6) ----
  {
    slice: 2,
    owner: "principle-one-level-of-abstraction",
    source: "engineering-standards", // :136 (after the retained bold lead) -139
    run: [
      "A function calls functions",
      "one level below its own. If one function does both high-level orchestration",
      "and low-level byte work, extract the low-level work into a helper named at",
      "the surrounding level.",
    ],
  },
  {
    slice: 2,
    owner: "principle-targeted-exception-scopes",
    source: "engineering-standards", // :140 (after the retained bold lead) -142
    run: [
      "Wrap exactly the call that can throw.",
      "Catch the specific exception subclass. Rethrow with the original cause",
      "chained. Never `catch (Exception e)` around a large block.",
    ],
  },
  {
    slice: 2,
    owner: "principle-rule-of-three",
    source: "engineering-standards", // :27 (mid-line) -28
    run: [
      "Apply the **Rule of",
      "Three**: tolerate duplication the second time, extract on the third.",
    ],
  },
  {
    slice: 2,
    owner: "principle-one-level-of-abstraction",
    source: "refactoring-to-patterns", // :45 (mid-line) -46
    run: [
      "**A function calls functions one",
      "level of abstraction below its own — never two or more at once.**",
    ],
  },
  {
    slice: 2,
    owner: "principle-one-change-per-commit",
    source: "refactoring-to-patterns", // :10 (mid-line) -11
    run: [
      "**Never refactor while also adding features** —",
      "separate the two activities into separate commits.",
    ],
  },
  {
    slice: 2,
    owner: "principle-one-change-per-commit",
    source: "git-commit", // :100-105
    run: [
      "A commit should contain exactly one logical change. If you find yourself",
      "writing \"and\" in the commit message, the commit probably contains two changes",
      "that should be two commits.",
      "",
      "**Bad:** \"Fix login bug and add user profile endpoint\"",
      "**Good:** Two separate commits — one for the fix, one for the endpoint.",
    ],
  },

  // ---- Slice 3 (3) ----
  {
    slice: 3,
    owner: "principle-comment-the-why",
    source: "engineering-standards", // :35-67
    run: [
      "Comments never explain WHAT the code does. Intention-revealing names and",
      "structure carry that. A comment is permitted only for a non-obvious WHY, such",
      "as a constraint, a workaround, or a surprising requirement, and only when",
      "neither intention-revealing code nor tests can carry the explanation.",
      "",
      "- **Rewrite first.** A comment that feels necessary is a signal to rewrite the",
      "  code until the comment is unnecessary. Extract a well-named function or",
      "  variable before reaching for a comment.",
      "- **No ticket/issue IDs, plan/slice/phase markers, or doc-section references",
      "  in comments.** They rot: the tracker migrates, the plan is deleted, the",
      "  section is renumbered, and the comment becomes a lie.",
      "  Exemption: an upstream-bug link where the link IS the why — a workaround",
      "  pointing at a public issue URL stays true for exactly as long as the",
      "  workaround does. The ban targets internal trackers and pipeline artifacts,",
      "  not those links.",
      "- **No process narration.** Describe the code as it exists now. No dates,",
      "  corrections, changelog entries, or historical narration. Never describe the",
      "  edit that produced the code. Never mention the user, the prompt, review",
      "  feedback, ticket discussion, or agent instructions. Marker phrases such as",
      "  \"Previously\", \"Originally\", \"As of\", \"Correction\", \"Temporary fix from\", and",
      "  \"This was changed because\" are detection hints, not the rule itself.",
      "- **Document non-obvious constraints and deliberate oddities.** This is the",
      "  permitted comment class: API limits, compatibility, security assumptions,",
      "  performance, ordering, concurrency, and framework surprises. For a",
      "  deliberate oddity, state the consequence of removing or simplifying the code.",
      "- **Local, concise, precise, verified.** Place a comment next to the code it",
      "  explains. Name the exact condition, risk, or dependency — never \"handle edge",
      "  case\". Document only verified behavior. Refer to symbols and stable",
      "  identifiers, never to line numbers or file layout.",
      "- **No duplicated documentation.** Do not repeat what types, tests, names, and",
      "  public docs already carry. Link an external spec only when the code",
      "  implements a precise external contract.",
      "- **No commented-out code.** Version control remembers deleted code.",
    ],
  },
  {
    slice: 3,
    owner: "principle-comment-the-why",
    source: "engineering-standards", // :72-82
    run: [
      "- **Maintain: remove obsolete comments, preserve repo style.** A change that",
      "  invalidates a comment updates or deletes it in the same diff.",
      "- **Doc comments on exported/public interfaces are exempt.** They follow the",
      "  ecosystem's convention (JSDoc, docstrings, rustdoc) and define the",
      "  abstraction. The why-only rule governs implementation comments. A doc",
      "  comment that merely repeats the signature is a what-comment, not an exempt",
      "  doc comment.",
      "",
      "**Decision Test.** Before you keep a comment: does it explain why? Would code",
      "or tests carry it better? Is it true after this change, with no reference to",
      "the process? Will it still be true when the surrounding code changes?",
    ],
  },
  {
    slice: 3,
    owner: "principle-make-findings-actionable",
    source: "conventional-comments", // :26 (after the retained lead) -27
    run: [
      "A finding without a reason loses",
      "the rationale for the next reader of the diff.",
    ],
  },

  // ---- Slice 4 (8) ----
  {
    slice: 4,
    owner: "principle-separate-generator-from-evaluator",
    source: "code-review", // :8 (after the retained what-to-do sentence) -11
    run: [
      "The generator (the",
      "agent that wrote the code) must never evaluate its own output. This separation",
      "prevents self-evaluation bias — the tendency to see what you intended to write",
      "rather than what you actually wrote.",
    ],
  },
  {
    slice: 4,
    owner: "principle-separate-generator-from-evaluator",
    source: "code-review", // :30
    run: ["The cardinal rule: **Do not let the same model grade its own exam.**"],
  },
  {
    slice: 4,
    owner: "principle-separate-generator-from-evaluator",
    source: "code-review", // :41-42
    run: [
      "The separation runs both directions. A reviewer blocks the line and changes",
      "nothing. A producer changes the tree and casts no verdict.",
    ],
  },
  {
    slice: 4,
    owner: "principle-every-rule-reaches-every-surface",
    source: "code-review", // :222-225 (cut at the sentence; :225-228 retained)
    run: [
      "When the changed code or prose has more than one way in — two entry modes,",
      "a path documented as usable on its own, a split across turns or processes —",
      "a new rule added to one is not added to the others by implication. Take",
      "each rule the diff adds and name where it now holds.",
    ],
  },
  {
    slice: 4,
    owner: "principle-rules-outrank-precedent",
    source: "nested-agents", // :175-177
    run: [
      "Precedent",
      "records what someone did; a rule records what is permitted, and the gap",
      "between them is exactly the debt a rule exists to stop growing.",
    ],
  },
  {
    slice: 4,
    owner: "principle-rules-outrank-precedent",
    source: "systems-thinking", // :111-114
    run: [
      "Convention governs where no written",
      "rule speaks. Where one does, the rule wins and the precedent is a second",
      "violation rather than a defence — a pattern's presence on the default",
      "branch says it shipped, not that it is permitted.",
    ],
  },
  {
    slice: 4,
    owner: "principle-every-rule-reaches-every-surface",
    source: "eng-design-doc-review", // :193 (after the retained bold lead) -199
    run: [
      "Skip this step when",
      "the design defines one path in. When it defines more than one — two entry",
      "modes, a section that claims to be loadable on its own, a split across",
      "turns — take each rule or safeguard the design introduces and ask which",
      "surfaces state it. A design can satisfy step 4 *per surface in isolation*",
      "while the surfaces disagree with each other, so the categories above will",
      "not catch this.",
    ],
  },
  {
    slice: 4,
    owner: "principle-name-the-alternative",
    source: "documenting-decisions", // :115, the one sentence between two retained imperatives
    run: ["Every decision implies rejected alternatives."],
  },

  // ---- Slice 5 (6) ----
  {
    slice: 5,
    owner: "principle-record-the-assumption",
    source: "authoring-designs", // :64, the trailing clause
    run: ["an unmarked guess is a defect"],
  },
  {
    slice: 5,
    owner: "principle-record-the-assumption",
    source: "authoring-designs", // :67
    run: ["Deferral is itself a recorded choice."],
  },
  {
    slice: 5,
    owner: "principle-ask-for-refutation",
    source: "nested-agents", // :78 (cut at the sentence) -79
    run: [
      "A helper",
      "that knows your conclusion will anchor to it and verify nothing.",
    ],
  },
  {
    slice: 5,
    owner: "principle-verify-before-you-adopt",
    source: "nested-agents", // :88 (cut at the sentence)
    run: ["A helper's error in your output is your error."],
  },
  {
    slice: 5,
    owner: "principle-verify-before-you-adopt",
    source: "nested-agents", // :193-195
    run: [
      "The pass removes false positives. It must never remove a true positive.",
      "List refuted findings under a `### Refuted by verification` section of",
      "your report (auditable, not silently dropped).",
    ],
  },
  {
    slice: 5,
    owner: "principle-verify-before-you-adopt",
    source: "cross-model-review", // :226 (after the retained anti-laundering lead) -227
    run: [
      "An external vendor proposes; you verify;",
      "only your verification promotes.",
    ],
  },
];

const ACTIVE_MOVED_RUNS = MOVED_RUNS.filter(({ slice }) => slice <= CURRENT_SLICE);

describe("principle-* family contract (tests 2-7) at expected member count 1", () => {
  test("every principle skill declares its directory name, a discovery-only description, and user-invocable false", () => {
    const names = principleSkillNames();
    expect(names.length).toBe(EXPECTED_PRINCIPLE_COUNT);

    const offenders: string[] = [];
    for (const name of names) {
      const fm = frontmatter(readOrEmpty(skillPath(name)));
      if (!new RegExp(`^name: ${name}$`, "m").test(fm)) {
        offenders.push(`${name}: frontmatter name does not match the directory`);
      }
      const description = fm.match(/^description: (.*)$/m)?.[1] ?? "";
      if (description.length < 20 || description.length > 180) {
        offenders.push(
          `${name}: description is ${description.length} characters, outside 20-180`,
        );
      }
      // Discovery-only form: "— pointed to by <sources> when <situation>."
      if (!/—\s*pointed to by .+ when .+\.$/.test(description)) {
        offenders.push(
          `${name}: description does not end in "— pointed to by <sources> when <situation>."`,
        );
      }
      if (!/^user-invocable: false$/m.test(fm)) {
        offenders.push(`${name}: frontmatter does not set user-invocable: false`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no principle skill declares an effort key", () => {
    // A principle skill is never loaded by an agent, so it inherits effort and
    // must not pin one (tests/architecture.test.ts:274-281).
    const names = principleSkillNames();
    expect(names.length).toBe(EXPECTED_PRINCIPLE_COUNT);

    const offenders = names.filter((name) =>
      /^effort:/m.test(frontmatter(readOrEmpty(skillPath(name)))),
    );
    expect(offenders).toEqual([]);
  });

  test("every principle skill carries one title, three non-empty sections, and the bullet floors", () => {
    const names = principleSkillNames();
    expect(names.length).toBe(EXPECTED_PRINCIPLE_COUNT);

    const offenders: string[] = [];
    for (const name of names) {
      const content = readOrEmpty(skillPath(name));
      const titles = (content.match(/^# /gm) ?? []).length;
      if (titles !== 1) offenders.push(`${name}: has ${titles} "# " headings, expected 1`);

      const rulesOut = sectionBody(content, RULES_OUT_HEADING);
      const boundary = sectionBody(content, BOUNDARY_HEADING);
      const whereItApplies = sectionBody(content, WHERE_IT_APPLIES_HEADING);

      if (rulesOut.length === 0) offenders.push(`${name}: "${RULES_OUT_HEADING}" is missing or empty`);
      if (boundary.length === 0) offenders.push(`${name}: "${BOUNDARY_HEADING}" is missing or empty`);
      if (whereItApplies.length === 0) {
        offenders.push(`${name}: "${WHERE_IT_APPLIES_HEADING}" is missing or empty`);
      }

      const rulesOutBullets = bulletCount(rulesOut);
      if (rulesOutBullets < 3) {
        offenders.push(
          `${name}: "${RULES_OUT_HEADING}" has ${rulesOutBullets} bullets, needs at least 3`,
        );
      }
      const boundaryBullets = bulletCount(boundary);
      if (boundaryBullets < 1) {
        offenders.push(
          `${name}: "${BOUNDARY_HEADING}" has ${boundaryBullets} bullets, needs at least 1`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every principle is reachable from at least one non-family pointer, and cites only non-family sources", () => {
    const names = principleSkillNames();
    expect(names.length).toBe(EXPECTED_PRINCIPLE_COUNT);
    const holders = nonFamilySkillNames();
    expect(holders.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const name of names) {
      const declared = [
        ...new Set(
          sectionBody(readOrEmpty(skillPath(name)), WHERE_IT_APPLIES_HEADING).match(
            SKILL_PATH_PATTERN,
          ) ?? [],
        ),
      ];
      if (declared.length === 0) {
        offenders.push(
          `${name}: "${WHERE_IT_APPLIES_HEADING}" names no literal skills/<name>/SKILL.md path`,
        );
      }
      for (const path of declared) {
        if (path.startsWith("skills/principle-")) {
          offenders.push(`${name}: "${WHERE_IT_APPLIES_HEADING}" names the family path ${path}`);
        }
      }

      // The pointer floor: a bare-name mention does not count, and a path
      // inside a sibling principle does not count — otherwise two siblings
      // satisfy the floor for each other.
      const pointer = `skills/${name}/SKILL.md`;
      const pointingSources = holders.filter((holder) =>
        readOrEmpty(skillPath(holder)).includes(pointer),
      );
      if (pointingSources.length === 0) {
        offenders.push(`${name}: no non-family SKILL.md names ${pointer}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("each Where it applies list equals the on-disk set of skills that point at it", () => {
    const names = principleSkillNames();
    expect(names.length).toBe(EXPECTED_PRINCIPLE_COUNT);
    const holders = nonFamilySkillNames();
    expect(holders.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const name of names) {
      const declared = [
        ...new Set(
          sectionBody(readOrEmpty(skillPath(name)), WHERE_IT_APPLIES_HEADING).match(
            SKILL_PATH_PATTERN,
          ) ?? [],
        ),
      ].sort();
      for (const path of declared) {
        if (!existsSync(join(REPO_ROOT, path))) {
          offenders.push(`${name}: "${WHERE_IT_APPLIES_HEADING}" names ${path}, which is not on disk`);
        }
      }

      const pointer = `skills/${name}/SKILL.md`;
      const onDisk = holders
        .filter((holder) => readOrEmpty(skillPath(holder)).includes(pointer))
        .map((holder) => `skills/${holder}/SKILL.md`)
        .sort();
      if (declared.join(", ") !== onDisk.join(", ")) {
        offenders.push(
          `${name}: declared [${declared.join(", ")}] but the pointing set on disk is [${onDisk.join(", ")}]`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  test("moved exactly once: each moved run is gone from the source skill it left", () => {
    // Positive control (design test 6, "Prove a negative check can find a
    // positive"): before the prose moves, every one of these assertions is red
    // because the run is still in its source file. A marker that passes
    // pre-move was mis-lifted and must be re-lifted, never accepted.
    const offenders: string[] = [];
    for (const { owner, source, run } of ACTIVE_MOVED_RUNS) {
      const marker = normalizeForMarkers(run.join(" "));
      const content = readOrEmpty(skillPath(source));
      // Guard: a renamed or deleted source, or an empty marker, would make the
      // absence check pass for the wrong reason.
      if (content.length === 0) {
        offenders.push(`${source}: SKILL.md is missing or empty, so its absence check is blind`);
        continue;
      }
      if (marker.length === 0) {
        offenders.push(`${owner}: empty marker lifted from ${source}`);
        continue;
      }
      if (normalizeForMarkers(content).includes(marker)) {
        offenders.push(`${source}: still holds the run that moved to ${owner} — "${marker.slice(0, 60)}…"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("moved exactly once: no moved run has a second home in another skill", () => {
    const everySkill = allSkillNames();
    expect(everySkill.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const { owner, source, run } of ACTIVE_MOVED_RUNS) {
      const marker = normalizeForMarkers(run.join(" "));
      if (marker.length === 0) {
        offenders.push(`${owner}: empty marker lifted from ${source}`);
        continue;
      }
      for (const skill of everySkill) {
        if (skill === owner) continue;
        const content = readOrEmpty(skillPath(skill));
        if (content.length === 0) {
          offenders.push(`${skill}: SKILL.md is missing or empty, so its absence check is blind`);
          continue;
        }
        if (normalizeForMarkers(content).includes(marker)) {
          offenders.push(`${skill}: holds a second copy of the run owned by ${owner} — "${marker.slice(0, 60)}…"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no principle suppresses a pause, stop, wait, or ask", () => {
    // The mechanical half of Decision 10: a principle auto-loaded into a
    // session must not soften a shipped human-approval gate.
    const names = principleSkillNames();
    expect(names.length).toBe(EXPECTED_PRINCIPLE_COUNT);

    const banned = [/never (pause|stop|wait|ask)/i, /do not wait/i, /without (asking|approval)/i];
    const offenders: string[] = [];
    for (const name of names) {
      const content = body(readOrEmpty(skillPath(name)));
      for (const pattern of banned) {
        const hit = content.match(pattern);
        if (hit) offenders.push(`${name}: body matches ${pattern} — "${hit[0]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("thin agents: new skills carry the moved procedure content", () => {
  for (const { skill, agent, anchor } of NEW_SKILLS) {
    test(`${skill} carries ${agent} procedure content (mentions "${anchor}")`, () => {
      expect(readOrEmpty(skillPath(skill))).toContain(anchor);
    });
  }
});

describe("thin agents: frontmatter skills preloads per agent", () => {
  const EXPECTED_PRELOADS: Record<string, string[]> = {
    "code-reviewer": ["code-review", "conventional-comments", "cross-model-review", "nested-agents", "progress-tracking"],
    "design-author": ["authoring-designs", "product-thinking", "progress-tracking", "writing-prose"],
    "file-finder": ["finding-files"],
    implementer: ["implementing-slices", "nested-agents", "progress-tracking"],
    planner: ["planning-implementation", "progress-tracking", "systems-thinking"],
    questioner: ["decomposing-intent", "product-thinking", "progress-tracking"],
    researcher: ["nested-agents", "progress-tracking", "researching-codebases", "systems-thinking"],
    "security-reviewer": ["code-review", "conventional-comments", "nested-agents", "progress-tracking", "reviewing-security"],
    "structure-planner": ["product-thinking", "progress-tracking", "slicing-work", "systems-thinking"],
    "technical-writer": ["code-review", "conventional-comments", "progress-tracking", "reviewing-documentation", "writing-prose"],
    "test-architect": ["progress-tracking", "test-first-development"],
    "ux-reviewer": ["code-review", "progress-tracking", "verifying-ux"],
    verifier: ["progress-tracking", "running-quality-checks"],
  };

  for (const [agent, expected] of Object.entries(EXPECTED_PRELOADS)) {
    test(`${agent} preloads exactly: ${expected.join(", ")}`, () => {
      expect(preloads(agentPath(agent))).toEqual(expected);
    });
  }
});

describe("thin agents: wrapper bodies point at their procedure skills", () => {
  // Convention: a wrapper keeps a one-line pointer (or a preload note
  // naming the path) for each skill it runs on — the body must name it.
  for (const { skill, agent } of NEW_SKILLS) {
    test(`${agent} body names ${skill}`, () => {
      expect(body(readOrEmpty(agentPath(agent)))).toContain(skill);
    });
  }
});

describe("thin agents: fold targets absorbed the moved methodology", () => {
  test("engineering-standards absorbs the implementer quality bullets (Construct with collaborators)", () => {
    expect(readOrEmpty(skillPath("engineering-standards"))).toContain("Construct with collaborators");
  });

  test("engineering-standards' When Implementing section points at the construct-with-collaborators principle", () => {
    // Companion to the assertion above: the claim keeps reaching this reader
    // after it moves out, through a pointer rather than a restatement.
    const section = sectionFrom(
      readOrEmpty(skillPath("engineering-standards")),
      "## When Implementing",
    );
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain("skills/principle-construct-with-collaborators/SKILL.md");
  });

  test("test-style carries the test-architect audit bar; test-first-development points at it", () => {
    // The audit bar folded into test-first-development during the
    // thin-agents refactor, then moved to the just-in-time test-style skill.
    expect(readOrEmpty(skillPath("test-style"))).toContain("| Deterministic inputs |");
    expect(readOrEmpty(skillPath("test-first-development"))).toContain("test-style/SKILL.md");
  });

  test("reviewing-security carries the security methodology; code-review keeps the pointer", () => {
    // The security-reviewer methodology folded into code-review during the
    // thin-agents refactor, then moved to its own just-in-time skill.
    const reviewingSecurity = readOrEmpty(skillPath("reviewing-security"));
    expect(reviewingSecurity).toContain("OWASP");
    expect(reviewingSecurity).toContain("CRITICAL — Hard Gate");
    const codeReview = readOrEmpty(skillPath("code-review"));
    expect(codeReview).toContain("reviewing-security/SKILL.md");
  });

  test("code-review absorbs the code-reviewer inspection checklist (off-by-one)", () => {
    expect(readOrEmpty(skillPath("code-review"))).toContain("off-by-one");
  });

  test("reviewing-documentation carries the technical-writer doc-change classification; writing-prose keeps the pointer", () => {
    // The doc-change classification folded into writing-prose during the
    // thin-agents refactor, then moved to the just-in-time
    // reviewing-documentation skill (preloaded by technical-writer).
    const reviewingDocumentation = readOrEmpty(skillPath("reviewing-documentation"));
    expect(reviewingDocumentation).toContain("REQUIRED");
    expect(reviewingDocumentation).toContain("RECOMMENDED");
    expect(reviewingDocumentation).toContain("Documentation-Gap Review Process");
    expect(readOrEmpty(skillPath("writing-prose"))).toContain(
      "reviewing-documentation/SKILL.md",
    );
  });

  test("nested-agents body carries the folded scout caps", () => {
    expect(body(readOrEmpty(skillPath("nested-agents")))).toMatch(/scout/i);
  });

  test("nested-agents body carries the folded skeptic-pass caps", () => {
    expect(body(readOrEmpty(skillPath("nested-agents")))).toMatch(/skeptic/i);
  });

  test("nested-agents per-agent caps name all four Agent-tool holders in the body", () => {
    const content = body(readOrEmpty(skillPath("nested-agents")));
    for (const holder of ["researcher", "implementer", "code-reviewer", "security-reviewer"]) {
      expect(content).toContain(holder);
    }
  });
});

describe("thin agents: duplicated summaries deleted from wrappers", () => {
  test("implementer no longer inlines the SOLID summary", () => {
    expect(readOrEmpty(agentPath("implementer"))).not.toContain('No "and" in names');
  });

  test("implementer no longer inlines the refactoring summary", () => {
    expect(readOrEmpty(agentPath("implementer"))).not.toContain("Name the smell and the pattern");
  });

  test("implementer no longer restates comment discipline", () => {
    expect(readOrEmpty(agentPath("implementer"))).not.toContain("No commented-out code");
  });

  test("code-reviewer no longer restates comment discipline", () => {
    expect(readOrEmpty(agentPath("code-reviewer"))).not.toContain("commented-out code");
  });

  test("code-reviewer no longer inlines the inspection checklist", () => {
    expect(readOrEmpty(agentPath("code-reviewer"))).not.toContain("off-by-one");
  });

  test("questioner no longer restates the envelope protocol details", () => {
    expect(readOrEmpty(agentPath("questioner"))).not.toContain("single label-only question");
  });

  test("design-author no longer inlines the envelope example", () => {
    expect(readOrEmpty(agentPath("design-author"))).not.toContain("Example envelope");
  });
});

describe("thin agents: haiku skills are self-contained", () => {
  // verifier and file-finder run on haiku, which cannot be trusted to chase
  // cross-references — their skills must carry everything inline.
  for (const skill of ["finding-files", "running-quality-checks"]) {
    test(`${skill} has no skills/ cross-references`, () => {
      const content = readOrEmpty(skillPath(skill));
      expect(content.length).toBeGreaterThan(0);
      expect(content).not.toContain("skills/");
    });
  }
});

describe("thin agents: documentation counts agree at 57 skills", () => {
  const SKILLS_MD = join(REPO_ROOT, "docs", "skills.md");
  const ARCHITECTURE_MD = join(REPO_ROOT, "docs", "architecture.md");

  test("skills/ holds exactly 57 SKILL.md files", () => {
    const count = readdirSync(join(REPO_ROOT, "skills")).filter((name) =>
      existsSync(join(REPO_ROOT, "skills", name, "SKILL.md")),
    ).length;
    expect(count).toBe(57);
  });

  test("docs/skills.md documents every skill: ### entry count equals the on-disk count", () => {
    // Every per-skill entry in docs/skills.md is an h3; nothing else in the
    // file uses that level. A drift here means an entry was added or lost
    // without the catalog (or the filesystem) following.
    const entries = read(SKILLS_MD).match(/^### /gm) ?? [];
    const count = readdirSync(join(REPO_ROOT, "skills")).filter((name) =>
      existsSync(join(REPO_ROOT, "skills", name, "SKILL.md")),
    ).length;
    expect(entries.length).toBe(count);
  });

  test("AGENTS.md heading reads Skills (57)", () => {
    expect(read(join(REPO_ROOT, "AGENTS.md"))).toContain("## Skills (57)");
  });

  test("docs/skills.md description counts 57 skills and no stale 56", () => {
    const flattened = read(SKILLS_MD).replace(/\s+/g, " ");
    expect(flattened).toContain("57 skills");
    // The methodology subtotal climbs toward 56 as the principle-* family
    // lands, so the guard pins the whole phrase and never a bare 56.
    expect(flattened).not.toContain("56 skills");
  });

  test("docs/skills.md split sentence sums to 57", () => {
    expect(read(SKILLS_MD).replace(/\s+/g, " ")).toContain(
      "11 pipeline entry-point + 8 standalone utility + 38 methodology = 57",
    );
  });

  test("docs/architecture.md counts all 57 skills in both locations and no stale 55/54/53/51/31", () => {
    const content = read(ARCHITECTURE_MD);
    expect(content).toContain("all 57 skills");
    expect(content).not.toContain("all 56 skills");
    // Stale-guard: the count appears twice in this doc; a half-swept second
    // occurrence passes a bare toContain, so forbid the old value outright
    // (no-stale-31 precedent).
    expect(content).not.toContain("all 55 skills");
    expect(content).not.toContain("all 54 skills");
    expect(content).not.toContain("all 53 skills");
    expect(content).not.toContain("all 51 skills");
    expect(content).not.toContain("31 skills");
  });

  // Previously unpinned count locations — they drifted silently before, so
  // each gains a pin, and docs/skills.md gains a stale-guard on the old
  // methodology count (catches its description sentence going stale).
  test("README.md counts 57 entry-point + methodology skills", () => {
    expect(read(join(REPO_ROOT, "README.md")).replace(/\s+/g, " ")).toContain(
      "57 entry-point + methodology skills",
    );
  });

  test("README.md counts all 57 skills in the Antigravity install line", () => {
    expect(read(join(REPO_ROOT, "README.md")).replace(/\s+/g, " ")).toContain(
      "all 57 skills",
    );
  });

  test("docs/cross-host-portability.md counts 57 skills and no stale 56", () => {
    const flattened = read(join(REPO_ROOT, "docs", "cross-host-portability.md")).replace(
      /\s+/g,
      " ",
    );
    expect(flattened).toContain("57 skills");
    // The count appears four times in this doc; a half-swept occurrence
    // passes a bare toContain, so forbid the old value outright.
    expect(flattened).not.toContain("56 skills");
  });

  test("docs/index.md counts all 57 skills", () => {
    expect(read(join(REPO_ROOT, "docs", "index.md")).replace(/\s+/g, " ")).toContain(
      "all 57 skills",
    );
  });

  test("docs/skills.md counts 38 methodology skills and no stale 37", () => {
    const flattened = read(SKILLS_MD).replace(/\s+/g, " ");
    expect(flattened).toContain("The 38 methodology skills");
    expect(flattened).not.toContain("37 methodology");
  });

  test("docs/architecture.md exempts own-procedure skills from the 3-skill soft limit", () => {
    const content = squash(read(ARCHITECTURE_MD));
    expect(content).toMatch(/procedure skill/i);
    expect(content).toMatch(/does not count/i);
  });

  for (const { skill } of NEW_SKILLS) {
    test(`docs/skills.md documents ${skill}`, () => {
      expect(read(SKILLS_MD)).toContain(`\`${skill}\``);
    });
  }
});

describe("thin agents: name-collision pairs documented", () => {
  const SKILLS_MD = join(REPO_ROOT, "docs", "skills.md");
  const COLLISION_PAIRS: [string, string][] = [
    ["finding-files", "file-finder"],
    ["authoring-designs", "design-author"],
    ["implementing-slices", "implementer"],
    ["planning-implementation", "planner"],
    ["verifying-ux", "ux-reviewer"],
  ];

  for (const [skill, agent] of COLLISION_PAIRS) {
    test(`collision row ${skill} / ${agent} exists`, () => {
      const row = new RegExp(`^\\|\\s*\`${skill}\`\\s*\\|\\s*\`${agent}\`\\s*\\|`, "m");
      expect(read(SKILLS_MD)).toMatch(row);
    });
  }
});

describe("thin agents: eval diff-selection keeps firing on the new skills", () => {
  const TOUCHFILE_ADDITIONS: Record<string, string[]> = {
    "team-question-neutral-questions": ["skills/decomposing-intent/**"],
    "team-design-seeded-research-and-task": ["skills/authoring-designs/**"],
    "team-research-answers-seeded-questions": ["skills/researching-codebases/**", "skills/finding-files/**"],
    "team-structure-seeded-design": ["skills/slicing-work/**"],
    "team-plan-seeded-structure": ["skills/planning-implementation/**"],
    "eng-design-doc-review-planted-missing-alternatives": ["skills/documenting-decisions/**", "skills/technical-design-doc/**"],
  };

  const FIXTURE_INPUTS: Record<string, string> = {
    "team-question-neutral-questions": "evals/fixtures/team-question/neutral-questions/input.md",
    "team-design-seeded-research-and-task": "evals/fixtures/team-design/seeded-research-and-task/input.md",
    "team-research-answers-seeded-questions": "evals/fixtures/team-research/answers-seeded-questions/input.md",
    "team-structure-seeded-design": "evals/fixtures/team-structure/seeded-design/input.md",
    "team-plan-seeded-structure": "evals/fixtures/team-plan/seeded-structure/input.md",
    "eng-design-doc-review-planted-missing-alternatives": "evals/fixtures/eng-design-doc-review/planted-missing-alternatives/input.md",
  };

  for (const [evalName, globs] of Object.entries(TOUCHFILE_ADDITIONS)) {
    test(`E2E_TOUCHFILES[${evalName}] lists the new skill globs`, () => {
      const entry = E2E_TOUCHFILES[evalName] ?? [];
      for (const glob of globs) {
        expect(entry).toContain(glob);
      }
    });

    test(`fixture deps for ${evalName} mirror the new skill globs`, () => {
      const fixturePath = FIXTURE_INPUTS[evalName] ?? "";
      const fm = frontmatter(readOrEmpty(join(REPO_ROOT, fixturePath)));
      for (const glob of globs) {
        expect(fm).toContain(glob);
      }
    });
  }
});
