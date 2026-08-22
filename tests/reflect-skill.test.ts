// tests/reflect-skill.test.ts
//
// Acceptance tests for the `reflect` RUNTIME skill, skills/reflect/. Two
// layers, one file, grouped by slice so a single slice runs in isolation:
//
//     bun test tests/reflect-skill.test.ts -t "Slice 1"
//
// L1 (pure unit, hermetic): the two bundled scripts,
// skills/reflect/resolve-transcript.mjs and skills/reflect/write-target.mjs.
// Resolution, record classification, the byte/record bounds, the untrusted
// name pattern, <repo> containment, and the two-root tie-break are all
// `f(input) -> output`, so docs/testing.md ("L1: Pure unit") puts them here
// rather than in prose. Every fixture is synthetic JSONL written into a temp
// dir keyed by pid+timestamp and removed afterwards — no test ever reads a real
// ~/.claude/projects/.
//
// L2 (static-invariant tripwires): the load-bearing rules of
// skills/reflect/SKILL.md. These assert CONTRACTS — frontmatter keys and
// values, commands and flags the skill tells the model to emit, section
// placement, file cross-references, and the ABSENCE of a forbidden identifier.
// A prose rewrite that keeps the contracts intact stays green.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures. Absence assertions are preceded by a length
// guard so a missing file or renamed heading cannot pass them vacuously
// (docs/testing.md, "Prove a negative check can find a positive").

import { afterAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import {
  MAX_RECORDS,
  MAX_TOTAL_BYTES,
  PER_SPAN_BYTE_CAP,
  isUserTurn,
  normalizeTranscript,
  resolveTranscript,
} from "../skills/reflect/resolve-transcript.mjs";
import {
  hasPluginMarker,
  isInsideRepo,
  isValidSkillName,
  preferredEditRoot,
} from "../skills/reflect/write-target.mjs";

const REPO_ROOT = process.cwd();
// reflect is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "reflect", "SKILL.md");

// ---------------------------------------------------------------------------
// Temp-dir plumbing. Every L1 test builds its own tree, so the suite passes in
// any order and on any host, and afterAll removes every tree it created.
// ---------------------------------------------------------------------------

const scratchDirs: string[] = [];

function scratch(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `reflect-${label}-${process.pid}-${Date.now()}-`));
  scratchDirs.push(dir);
  // Realpath so macOS's /var -> /private/var symlink cannot masquerade as an
  // escape in the containment assertions below.
  return realpathSync(dir);
}

// Write a whole fixture tree in one call: relative path -> file contents.
function tree(label: string, files: Record<string, string>): string {
  const root = scratch(label);
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = join(root, relative);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, "utf8");
  }
  return root;
}

afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Synthetic transcript records. Every shape here was measured from real
// transcript files under ~/.claude/projects/.
// ---------------------------------------------------------------------------

const jsonl = (...records: unknown[]): string =>
  `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;

const userPrompt = (content: string) => ({
  type: "user",
  message: { role: "user", content },
});

const toolResult = (stdout: string) => ({
  type: "user",
  toolUseResult: { stdout },
  message: { role: "user", content: [{ type: "tool_result", content: stdout }] },
});

const assistantText = (text: string) => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "text", text }] },
});

// A tool call: the block shape that carries `name` and `input` and neither
// `text` nor `content`.
const assistantToolUse = (name: string, input: unknown) => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "tool_use", name, input }] },
});

// The last line of a real transcript is a control record carrying no
// `timestamp` key.
const controlTail = {
  type: "last-prompt",
  leafUuid: "6f1c9d84-0000-4000-8000-000000000001",
  sessionId: "9aec38dc-0000-4000-8000-000000000002",
};

// A stream of `count` distinct user prompts, oldest first. Built here rather
// than in a test body so no test carries a loop.
function promptStream(count: number): string {
  const records = Array.from({ length: count }, (_, index) =>
    userPrompt(`turn-${String(index).padStart(4, "0")}`),
  );
  return jsonl(...records);
}

// A stream of `count` assistant records whose spans are each exactly
// `spanBytes` ASCII bytes — so the aggregate byte ceiling, not the record
// ceiling, is what bounds it.
function assistantStream(count: number, spanBytes: number): string {
  const records = Array.from({ length: count }, () => assistantText("x".repeat(spanBytes)));
  return jsonl(...records);
}

// Total bytes of normalized span text — what the lenses actually receive.
function totalSpanBytes(records: { text?: string }[]): number {
  return records.reduce((sum, record) => sum + (record.text ?? "").length, 0);
}

// ---------------------------------------------------------------------------
// L2 readers. A missing file reads as "" so content assertions FAIL, never
// throw.
// ---------------------------------------------------------------------------

function body(): string {
  return existsSync(SKILL) ? read(SKILL) : "";
}

function fm(): string {
  return existsSync(SKILL) ? frontmatter(read(SKILL)) : "";
}

// The body with its frontmatter stripped. The description restates several
// rules for the trigger cue, so an assertion that must land in the method
// itself reads this instead of the whole file.
function prose(): string {
  const text = body();
  const front = frontmatter(text);
  if (!front) return "";
  return text.slice(text.indexOf(front) + front.length);
}

// Collapse every whitespace run so a phrase a line wrap split across two lines
// still matches (docs/testing.md, "Prove a negative check can find a positive").
const flat = (text: string): string => text.replace(/\s+/g, " ");

// The `## ` section whose heading matches `heading`, up to the next `## `.
// No match → "" so dependent assertions fail rather than pass vacuously.
function section(heading: RegExp): string {
  const lines = prose().split("\n");
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return "";
  const next = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  return lines.slice(start, next === -1 ? undefined : next).join("\n");
}

const LENSES = /^##\s+.*\blenses\b/i;
const SYNTHESIS = /^##\s+.*\bsynthesis\b/i;
const APPLY = /^##\s+.*\bapply\b/i;
const BACKLOG = /^##\s+.*\bbacklog\b/i;

// The two `### ` subsections of `## The lenses` that exist so a rule has a
// stable place to live. Exact headings, which docs/testing.md lists among the
// things a tripwire may assert.
const REJECTED_TARGETS = /^###\s+Rejected lens targets\s*$/;
const DISQUALIFIED = /^###\s+A disqualified lens reply\s*$/;

// A `### ` subsection inside `## The lenses`, up to the next heading of the
// same or a shallower level. No match → "" so dependent assertions fail rather
// than pass vacuously.
function lensSubsection(heading: RegExp): string {
  const lines = section(LENSES).split("\n");
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return "";
  const next = lines.findIndex((line, index) => index > start && /^#{1,3}\s/.test(line));
  return lines.slice(start, next === -1 ? undefined : next).join("\n");
}

// Agent types that hold `Bash`, so a lens pointed at one gives an imperative
// embedded in a transcript span a command sink. `Explore` holds every tool but
// the write and dispatch ones; `general-purpose` holds every tool outright
// (skills/nested-agents/SKILL.md, "Read-only by default").
const SHELL_HOLDING_TYPES = ["Explore", "general-purpose"] as const;

// Everything in the skill EXCEPT the subsection whose whole job is to name a
// rejected target. That carve-out is the only place a type name is not a
// dispatch, so the sweep below runs over the rest of the file unchanged.
function dispatchProse(rejected: string): string {
  const text = body();
  return rejected ? text.replace(rejected, "") : text;
}

/** Every line inside a fenced code block — what the model is told to RUN. */
function fencedLines(): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const line of body().split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) out.push(line);
  }
  return out;
}

// ===========================================================================
// Slice 1 — L1: resolution
// ===========================================================================

describe("Slice 1 — L1: resolve-transcript finds the invoking session by its own marker", () => {
  test("a project file holding the marker resolves to that absolute path", () => {
    const marker = "/tmp/reflect-cache-a1b2c3";
    const projectsRoot = tree("resolve-hit", {
      "-Users-dev-team/session-one.jsonl": jsonl(
        userPrompt("reflect on this session"),
        toolResult(marker),
      ),
      "-Users-dev-other/session-two.jsonl": jsonl(userPrompt("unrelated work")),
    });

    const result = resolveTranscript({ marker, projectsRoot });

    expect(result.ok).toBe(true);
    expect(result.path).toBe(join(projectsRoot, "-Users-dev-team", "session-one.jsonl"));
  });

  test("no file holding the marker is a named no-match failure, not a pick", () => {
    const projectsRoot = tree("resolve-miss", {
      "-Users-dev-team/session-one.jsonl": jsonl(userPrompt("reflect on this session")),
    });

    const result = resolveTranscript({
      marker: "/tmp/reflect-cache-never-written",
      projectsRoot,
      retryDelayMs: 0,
    });

    expect(result.failure).toBe("no-match");
    expect(result.path).toBeUndefined();
  });

  test("two files holding the marker raise the invariant failure and pick neither", () => {
    const marker = "/tmp/reflect-cache-d4e5f6";
    const projectsRoot = tree("resolve-ambiguous", {
      "-Users-dev-team/session-one.jsonl": jsonl(toolResult(marker)),
      "-Users-dev-team-worktrees-x/session-two.jsonl": jsonl(toolResult(marker)),
    });

    const result = resolveTranscript({ marker, projectsRoot });

    expect(result.failure).toBe("multiple-matches");
    expect(result.path).toBeUndefined();
  });

  test("a marker holding regex metacharacters matches only the literal string", () => {
    // `/tmp/reflect.a+b[1]` read as a regex also matches "reflectXaab1", which
    // would turn one true match into an ambiguity failure. Fixed-string search
    // resolves the real file and ignores the decoy.
    const marker = "/tmp/reflect.a+b[1]";
    const projectsRoot = tree("resolve-metachars", {
      "-Users-dev-team/session-one.jsonl": jsonl(toolResult(marker)),
      "-Users-dev-other/session-two.jsonl": jsonl(toolResult("/tmp/reflectXaab1")),
    });

    const result = resolveTranscript({ marker, projectsRoot });

    expect(result.ok).toBe(true);
    expect(result.path).toBe(join(projectsRoot, "-Users-dev-team", "session-one.jsonl"));
  });

  test("a marker planted in a session's subagents/ file does not resolve", () => {
    // The search globs are top level by construction, so a subagent transcript
    // is out of reach. A recursive search would hand three lenses a file this
    // run never printed its marker into.
    const topLevelMarker = "/tmp/reflect-cache-top-level";
    const subagentMarker = "/tmp/reflect-cache-subagent";
    const projectsRoot = tree("resolve-subagents", {
      "-Users-dev-team/9aec38dc.jsonl": jsonl(toolResult(topLevelMarker)),
      "-Users-dev-team/9aec38dc/subagents/agent-explore.jsonl": jsonl(toolResult(subagentMarker)),
    });

    // Positive control: the same tree resolves a top-level marker, so a
    // resolver that finds nothing at all cannot pass the exclusion below.
    expect(resolveTranscript({ marker: topLevelMarker, projectsRoot }).path).toBe(
      join(projectsRoot, "-Users-dev-team", "9aec38dc.jsonl"),
    );

    expect(
      resolveTranscript({ marker: subagentMarker, projectsRoot, retryDelayMs: 0 }).failure,
    ).toBe("no-match");
  });

  test("a marker planted in a session's tool-results/ sidecar does not resolve", () => {
    // The sidecars hold the large command output, so they are the richest
    // source of session friction AND the likeliest to carry tokens, customer
    // data, and file contents. They are out of scope for exactly that reason:
    // the resolver never opens one.
    const topLevelMarker = "/tmp/reflect-cache-top-level";
    const sidecarMarker = "/tmp/reflect-cache-sidecar";
    const projectsRoot = tree("resolve-sidecars", {
      "-Users-dev-team/9aec38dc.jsonl": jsonl(toolResult(topLevelMarker)),
      "-Users-dev-team/9aec38dc/tool-results/bash-out.txt": `${sidecarMarker}\n`,
    });

    // Positive control, same tree.
    expect(resolveTranscript({ marker: topLevelMarker, projectsRoot }).path).toBe(
      join(projectsRoot, "-Users-dev-team", "9aec38dc.jsonl"),
    );

    expect(
      resolveTranscript({ marker: sidecarMarker, projectsRoot, retryDelayMs: 0 }).failure,
    ).toBe("no-match");
  });

  test("a missing projects root is a named failure that states the path tried", () => {
    // A non-Claude host has no ~/.claude/projects at all. Failing with
    // "no-match" there would send the user hunting for a session that was
    // never recorded, so the two failures are distinct and each names what it
    // looked for.
    const missingRoot = join(scratch("resolve-no-root"), "claude-projects-absent");

    const result = resolveTranscript({
      marker: "/tmp/reflect-cache-a1b2c3",
      projectsRoot: missingRoot,
      retryDelayMs: 0,
    });

    expect(result.failure).toBe("no-projects-root");
    expect((result.tried ?? []).join(" ")).toContain(missingRoot);
  });

  test("a transcript whose tail is a control record with no timestamp still resolves", () => {
    // Nothing in resolution may depend on a `timestamp` key: the last line of
    // a real transcript is a control record that carries none. This fixture
    // carries none on ANY record, so a timestamp-dependent resolver fails it.
    const marker = "/tmp/reflect-cache-987fed";
    const projectsRoot = tree("resolve-control-tail", {
      "-Users-dev-team/session-one.jsonl": jsonl(
        userPrompt("reflect on this session"),
        toolResult(marker),
        controlTail,
      ),
    });

    const result = resolveTranscript({ marker, projectsRoot });

    expect(result.ok).toBe(true);
    expect(result.path).toBe(join(projectsRoot, "-Users-dev-team", "session-one.jsonl"));
  });
});

// ===========================================================================
// Slice 1 — L1: normalization
// ===========================================================================

describe("Slice 1 — L1: normalizeTranscript classifies records and bounds the stream", () => {
  test("the bounds are the pinned values: 4,000 bytes per span, 2,000 records, 4 MB", () => {
    expect(PER_SPAN_BYTE_CAP).toBe(4000);
    expect(MAX_RECORDS).toBe(2000);
    expect(MAX_TOTAL_BYTES).toBe(4 * 1024 * 1024);
  });

  test("a plain prompt is a user turn and a tool-result record is not", () => {
    // 63 of 71 `type: "user"` records in a measured transcript carry
    // `toolUseResult`, so "the last user message" is not a prompt
    // classifier. The positive case is asserted
    // first, so a classifier that answers false to everything cannot pass.
    expect(isUserTurn(userPrompt("reflect on this session"))).toBe(true);
    expect(isUserTurn(toolResult("/var/folders/zz/T/out.txt"))).toBe(false);
  });

  test("a host-injected <local-command-stdout> record is not a user turn", () => {
    expect(
      isUserTurn(userPrompt("<local-command-stdout>/tmp/reflect-cache-a1b2c3</local-command-stdout>")),
    ).toBe(false);
  });

  test("an isMeta record is not a user turn", () => {
    expect(
      isUserTurn({
        type: "user",
        isMeta: true,
        message: {
          role: "user",
          content: "<local-command-caveat>Caveat: the messages below</local-command-caveat>",
        },
      }),
    ).toBe(false);
  });

  test("every record type outside the user/assistant allowlist is dropped and counted", () => {
    // A file-history-snapshot must never reach a lens, and a silent drop is
    // indistinguishable from a parser that never saw the record — hence the
    // per-type counts.
    const normalized = normalizeTranscript(
      jsonl(
        userPrompt("reflect on this session"),
        { type: "attachment", id: "att-1" },
        { type: "pr-link", url: "https://example.invalid/pull/1" },
        { type: "system", subtype: "init" },
        { type: "file-history-delta", path: "AGENTS.md" },
        { type: "file-history-snapshot", path: "AGENTS.md" },
      ),
    );

    expect(normalized.droppedByType).toEqual({
      attachment: 1,
      "pr-link": 1,
      system: 1,
      "file-history-delta": 1,
      "file-history-snapshot": 1,
    });
    expect(normalized.records.length).toBe(1);
    expect(normalized.records[0]?.type).toBe("user");
  });

  test("a tool_use block keeps the tool name and its invocation", () => {
    // The tooling lens's evidence IS the repeated invocation, and it reads only
    // the normalized file. A block carrying neither `text` nor `content` that
    // normalized to "" would erase exactly that evidence and still spend a
    // record of the stream budget on a blank line.
    const normalized = normalizeTranscript(
      jsonl(assistantToolUse("Bash", { command: "bun test" })),
    );

    const text = normalized.records[0]?.text ?? "";
    expect(text).toContain("Bash");
    expect(text).toContain("bun test");
  });

  test("a span over the per-span cap is truncated to 4,000 bytes and counted", () => {
    // Single lines in a real transcript pass 60,000 bytes, so the cap runs as
    // code before any lens sees the span. ASCII fixture: one char, one byte.
    const normalized = normalizeTranscript(jsonl(assistantText("y".repeat(10_000))));

    expect((normalized.records[0]?.text ?? "").length).toBe(4000);
    expect(normalized.truncatedSpans).toBe(1);
  });

  test("a stream past 2,000 records keeps the newest 2,000 and reports the drop", () => {
    const normalized = normalizeTranscript(promptStream(2001));

    expect(normalized.records.length).toBe(2000);
    expect(normalized.droppedForCeiling).toBe(1);
    expect(normalized.records[0]?.text ?? "").toContain("turn-0001");
  });

  test("a stream past 4 MB is bounded to the byte ceiling and reports the drop", () => {
    // 1,500 records is under the record ceiling, so the byte ceiling is the
    // only bound that can fire here.
    const normalized = normalizeTranscript(assistantStream(1500, 4000));

    expect(normalized.droppedForCeiling).toBeGreaterThan(0);
    expect(totalSpanBytes(normalized.records)).toBeLessThanOrEqual(4 * 1024 * 1024);
  });

  test("a malformed line is skipped and counted, and the valid records survive", () => {
    const normalized = normalizeTranscript(
      `${JSON.stringify(userPrompt("reflect on this session"))}\n{"type":"user",\n${JSON.stringify(assistantText("three lenses"))}\n`,
    );

    expect(normalized.malformedLines).toBe(1);
    expect(normalized.records.length).toBe(2);
  });
});

// ===========================================================================
// Slice 1 — L2: the reporting pass
// ===========================================================================

describe("Slice 1 — L2: reflect's frontmatter and invocation surface", () => {
  test("the skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: reflect", () => {
    expect(/^name:\s*reflect\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter sets disable-model-invocation: true (user-invocable only)", () => {
    // It writes SKILL.md files and creates public issues, so only a deliberate
    // invocation starts the run. This is also what puts reflect in the guarded
    // set that tests/guarded-skill-prose.test.ts sweeps.
    expect(/^disable-model-invocation:\s*true\s*$/m.test(fm())).toBe(true);
  });

  test("argument-hint declares the optional focus and effort is high", () => {
    // Class rule (tests/architecture.test.ts): argument-hint present
    // requires a valid effort and forbids model:.
    const front = fm();
    expect(front.length).toBeGreaterThan(0);
    expect(/^argument-hint:.*skill-name/m.test(front)).toBe(true);
    expect(/^effort:\s*high\s*$/m.test(front)).toBe(true);
    expect(/^model:/m.test(front)).toBe(false);
  });

  test("description carries a quoted trigger phrase and the slash name", () => {
    const front = flat(fm());
    expect(front.length).toBeGreaterThan(0);
    expect(/"[^"]+"/.test(front)).toBe(true);
    expect(front).toContain("/reflect");
  });

  test("an unknown focus argument stops before the transcript is read", () => {
    // Ordering tripwire. Validating the focus AFTER resolution reads a whole
    // session to serve an argument that was never going to match, and the
    // near-match list is what turns a typo into a one-line correction.
    const text = prose();
    expect(text.length).toBeGreaterThan(0);
    const nearMatches = text.search(/near match/i);
    const resolver = text.indexOf("resolve-transcript.mjs");
    expect(nearMatches).toBeGreaterThan(-1);
    expect(resolver).toBeGreaterThan(-1);
    expect(nearMatches).toBeLessThan(resolver);
  });
});

describe("Slice 1 — L2: reflect's three reporting lenses", () => {
  test("the body names all three lenses", () => {
    const lenses = section(LENSES);
    expect(lenses.length).toBeGreaterThan(0);
    expect(lenses).toContain("judgment");
    expect(lenses).toContain("tooling");
    expect(lenses).toContain("divergent");
  });

  test("the lenses report and never demote — demotion happens once, in synthesis", () => {
    // Placement, not wording: three lenses each applying the criterion classify
    // one finding three ways, so the criterion lives in exactly one section.
    const lenses = section(LENSES);
    const synthesis = section(SYNTHESIS);
    expect(lenses.length).toBeGreaterThan(0);
    expect(synthesis.length).toBeGreaterThan(0);
    expect(/demot/i.test(synthesis)).toBe(true);
    expect(/demot/i.test(lenses)).toBe(false);
  });

  test("each lens caps its own reply at 30 lines", () => {
    // The per-span byte cap bounds what a lens READS; this bounds what it
    // WRITES back. The cap stays advisory because no code reads a model's
    // draft, so the number itself is the only thing that can be pinned.
    const lenses = flat(section(LENSES));
    expect(lenses.length).toBeGreaterThan(0);
    expect(/\b30 (reply )?lines\b/.test(lenses)).toBe(true);
  });

  test("no lens dispatch names a shell-holding agent type", () => {
    // Each lens prompt carries the PATH to the normalized transcript and the
    // lens opens that file itself, so an imperative embedded in a transcript
    // span cannot be fenced inside the prompt — the target's toolset is the
    // only thing left to bound it. A Bash-holding target gives that imperative
    // a command sink, which is why pr-verify moved its own dispatch to
    // team:file-finder.
    //
    // What is asserted is the absence of the DISPATCH, not of the word. Naming
    // a type in order to reject it is the one place a type name is not a
    // dispatch, so that rationale lives under its own heading and the sweep
    // runs over the whole file minus that one carve-out — a proximity span
    // would be a wording pin (docs/testing.md, "That two words appear near
    // each other"). Coverage is unchanged everywhere else: a dispatch aimed at
    // a shell-holding type, in any phrasing, still fires, and a
    // meaning-preserving rewrite cannot reintroduce a type this skill never
    // dispatches to.
    const rejected = lensSubsection(REJECTED_TARGETS);
    // Guard: a renamed or deleted heading must fail here rather than silently
    // widen the carve-out to the whole file.
    expect(rejected.length).toBeGreaterThan(0);
    // The carve-out earns itself only by naming what it rejects. An unnamed
    // rejection is what the whole-file ban forced, and it left the one asserted
    // fact a reader would check unstated.
    for (const type of SHELL_HOLDING_TYPES) expect(rejected).toContain(type);

    const dispatch = dispatchProse(rejected);
    expect(dispatch.length).toBeGreaterThan(0);
    expect(dispatch).toContain("team:file-finder");
    for (const type of SHELL_HOLDING_TYPES) expect(dispatch).not.toContain(type);
  });

  test("the dispatch target's own frontmatter grants neither Bash nor Write", () => {
    // The assertion above pins reflect's CHOICE of target; this pins the fact
    // that choice rests on. `agents/file-finder.md` is a separate file with its
    // own reasons to change, and granting it `Bash` for any of them would
    // remove reflect's only barrier between an imperative inside a transcript
    // span and a command sink — with this suite green. Same shape as the
    // researcher's tools-line assertion in tests/nested-agents.test.ts.
    const front = frontmatter(read(join(REPO_ROOT, "agents", "file-finder.md")));
    expect(front.length).toBeGreaterThan(0);
    // Guard: no `tools:` line at all would pass both absences vacuously.
    expect(/^tools:/m.test(front)).toBe(true);
    expect(/^tools:.*\bBash\b/m.test(front)).toBe(false);
    expect(/^tools:.*\bWrite\b/m.test(front)).toBe(false);
  });

  test("the inline fallback is a named reduced-assurance mode on every surface", () => {
    // The toolset guarantee belongs to the dispatch path alone: the fallback
    // runs in a session holding Bash and Write, so it cannot inherit it. On
    // Codex and Antigravity, which install the skill but cannot dispatch Claude
    // Code agents, the fallback is the only path — so the degradation is named
    // where the model meets it, in the run's own report, and in the skill
    // catalog a reader consults. Drift tripwire: all three surfaces or none.
    const lenses = flat(section(LENSES));
    const completion = flat(section(/^##\s+Completion/i));
    const catalog = flat(read(join(REPO_ROOT, "docs", "skills.md")));
    expect(lenses.length).toBeGreaterThan(0);
    expect(completion.length).toBeGreaterThan(0);
    expect(catalog.length).toBeGreaterThan(0);
    expect(/reduced-assurance mode/i.test(lenses)).toBe(true);
    expect(/reduced-assurance mode/i.test(completion)).toBe(true);
    expect(/reduced-assurance mode/i.test(catalog)).toBe(true);
  });

  test("the dispatch sweep can see a positive", () => {
    // docs/testing.md, "Prove a negative check can find a positive": a clean
    // sweep has not distinguished absent from blind. Point the same matcher at
    // a body carrying one added dispatch line and watch it fire. The mutation
    // adds prose rather than editing any, so no phrasing on disk is pinned.
    const rejected = lensSubsection(REJECTED_TARGETS);
    expect(rejected.length).toBeGreaterThan(0);
    const mutated = `${dispatchProse(rejected)}\nEach lens runs as one \`Explore\` subagent.\n`;

    expect(SHELL_HOLDING_TYPES.filter((type) => mutated.includes(type))).toEqual(["Explore"]);
  });

  test("a disqualified lens reply is a named failure on every surface", () => {
    // The dispatch path's OTHER degradation mode is named on three surfaces and
    // pinned above, and this one needs the same treatment: a prompt cannot bind
    // an agent body, so a lens can follow `agents/file-finder.md` instead and
    // reply with a file list or nothing. Unnamed, that reply is a zero — a run
    // where all three lenses ignored the errand reports as a clean session, and
    // no surface distinguishes it from a session that genuinely taught nothing.
    // Drift tripwire: all three surfaces or none.
    const lenses = flat(section(LENSES));
    const completion = flat(section(/^##\s+Completion/i));
    const catalog = flat(read(join(REPO_ROOT, "docs", "skills.md")));
    expect(lenses.length).toBeGreaterThan(0);
    expect(completion.length).toBeGreaterThan(0);
    expect(catalog.length).toBeGreaterThan(0);
    expect(/disqualified/i.test(lenses)).toBe(true);
    expect(/disqualified/i.test(completion)).toBe(true);
    expect(/disqualified/i.test(catalog)).toBe(true);
  });

  test("a disqualified reply re-runs inline and is never reported as a zero", () => {
    // The mode needs three things to be a failure rather than a silent zero:
    // what disqualifies a reply (the shape the prompt asked for, absent), what
    // then happens to it (the reduced-assurance path already there, not a
    // fourth mode), and a terminal state for a pass that fails twice. The
    // zero-findings sentence is where the confusion would land, so the
    // qualification is pinned there too.
    const rule = flat(lensSubsection(DISQUALIFIED));
    expect(rule.length).toBeGreaterThan(0);
    expect(rule).toContain("30");
    expect(rule).toContain("Found Files");
    expect(/reduced-assurance mode/i.test(rule)).toBe(true);
    expect(/\bunrun\b/i.test(rule)).toBe(true);

    const synthesis = flat(section(SYNTHESIS));
    expect(synthesis.length).toBeGreaterThan(0);
    expect(synthesis).toContain("no durable learning found");
    expect(/disqualified/i.test(synthesis)).toBe(true);
  });

  test("transcript spans are untrusted content, described and never quoted", () => {
    const text = flat(prose());
    expect(text.length).toBeGreaterThan(0);
    expect(/^##\s+.*\buntrusted\b/im.test(prose())).toBe(true);
    expect(/paraphrase/i.test(text)).toBe(true);
  });

  test("the plan file lands in the printed mktemp run cache", () => {
    const text = flat(prose());
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("mktemp -d");
    expect(/run cache/i.test(text)).toBe(true);
    expect(/plan file/i.test(text)).toBe(true);
  });

  test("no fenced command deletes the run cache — the report stays auditable", () => {
    const fenced = fencedLines();
    // Guard: an empty corpus would make the sweep pass vacuously.
    expect(fenced.length).toBeGreaterThan(0);
    expect(fenced.filter((line) => /\brm\s+-[rRf]/.test(line))).toEqual([]);
  });

  test("nothing in the skill depends on the frog binary the plugin does not install", () => {
    const text = body();
    // Guard: a missing file reads as "" and would vacuously pass the absence.
    expect(text.length).toBeGreaterThan(0);
    expect(/frog/i.test(text)).toBe(false);
  });
});

// ===========================================================================
// Slice 2 — L1: write targets
// ===========================================================================

describe("Slice 2 — L1: write-target rejects an untrusted skill name", () => {
  test("a lowercase hyphenated name is accepted", () => {
    // The positive control: every skill on disk matches this shape, so a
    // validator that rejects everything cannot pass the rejections below.
    expect(isValidSkillName("reflect")).toBe(true);
    expect(isValidSkillName("pr-watch-as-reviewer")).toBe(true);
  });

  test("a dotfile name is rejected", () => {
    expect(isValidSkillName(".hidden")).toBe(false);
  });

  test("a name carrying a dot is rejected", () => {
    expect(isValidSkillName("foo.bar")).toBe(false);
  });

  test("the current and parent directory names are rejected", () => {
    expect(isValidSkillName(".")).toBe(false);
    expect(isValidSkillName("..")).toBe(false);
  });

  test("an uppercase name is rejected", () => {
    expect(isValidSkillName("Reflect")).toBe(false);
  });
});

describe("Slice 2 — L1: write-target refuses a target outside <repo>", () => {
  test("a path under a symlinked directory that leaves <repo> is rejected", () => {
    const outside = tree("escape-outside", { "stolen/keep.txt": "outside the repo\n" });
    const repoRoot = tree("escape-repo", { ".claude/skills/real/SKILL.md": "---\nname: real\n---\n" });
    symlinkSync(join(outside, "stolen"), join(repoRoot, ".claude", "skills", "escapee"));

    // Positive control first: a real path inside the repo is accepted, so a
    // containment check that refuses everything cannot pass this test.
    expect(
      isInsideRepo({
        candidatePath: join(repoRoot, ".claude", "skills", "real", "SKILL.md"),
        repoRoot,
      }),
    ).toBe(true);

    // The write target's final component does not exist yet, which is the
    // normal create case — containment must resolve the real parent anyway.
    expect(
      isInsideRepo({
        candidatePath: join(repoRoot, ".claude", "skills", "escapee", "SKILL.md"),
        repoRoot,
      }),
    ).toBe(false);
  });
});

describe("Slice 2 — L1: write-target's two-root tie-break follows the plugin marker", () => {
  test("a repo carrying a plugin marker resolves edits to <repo>/skills", () => {
    const repoRoot = tree("tiebreak-plugin", {
      ".claude-plugin/plugin.json": '{"name":"team"}\n',
      "skills/reflect/SKILL.md": "---\nname: reflect\n---\n",
      ".claude/skills/reflect/SKILL.md": "---\nname: reflect\n---\n",
    });

    expect(
      preferredEditRoot({ repoRoot, hasPluginMarker: hasPluginMarker(repoRoot) }),
    ).toBe(join(repoRoot, "skills"));
  });

  test("a repo carrying no plugin marker resolves edits to <repo>/.claude/skills", () => {
    const repoRoot = tree("tiebreak-plain", {
      "skills/reflect/SKILL.md": "---\nname: reflect\n---\n",
      ".claude/skills/reflect/SKILL.md": "---\nname: reflect\n---\n",
    });

    expect(
      preferredEditRoot({ repoRoot, hasPluginMarker: hasPluginMarker(repoRoot) }),
    ).toBe(join(repoRoot, ".claude", "skills"));
  });
});

// ===========================================================================
// Slice 2 — L2: the apply turn
// ===========================================================================

describe("Slice 2 — L2: reflect's apply turn is fenced by a clean-and-tracked precondition", () => {
  test("both git preconditions are the commands the apply turn runs", () => {
    // These two are the premise that makes `git restore` a true undo: an
    // untracked or already-dirty target cannot be restored to a known state.
    const apply = section(APPLY);
    expect(apply.length).toBeGreaterThan(0);
    expect(apply).toContain("git ls-files --error-unmatch");
    expect(apply).toContain("git status --porcelain");
    expect(apply).toContain("git restore");
  });

  test("the untrusted proposed name travels by file and reaches the guard expanded", () => {
    // The name is transcript text. Pasted into a command as a literal, a name
    // carrying $(…), a backtick, or ${…} runs as shell before the guard's own
    // allowlist can see it — one process too late. A command substitution's
    // output is not re-parsed, so reading the name back from a file and
    // referencing only the variable is what keeps the allowlist first.
    const apply = section(APPLY);
    expect(apply.length).toBeGreaterThan(0);
    expect(apply).toContain('NAME="$(cat');
    expect(apply).toContain('"${NAME:?}"');
  });

  test("a creation is fenced on the absence of its target", () => {
    // The tracked-and-clean fence cannot hold a creation — the path does not
    // exist yet, so it is untracked by definition and has no pre-image, and
    // that fence would skip every creation ever proposed. Absence is the
    // precondition that makes "delete the named path" a true undo.
    const apply = flat(section(APPLY));
    expect(apply.length).toBeGreaterThan(0);
    expect(apply).toContain("must not exist");
    expect(/skips? that item/i.test(apply)).toBe(true);
  });

  test("creation only ever targets .claude/skills/<name>/SKILL.md", () => {
    const apply = section(APPLY);
    expect(apply.length).toBeGreaterThan(0);
    expect(apply).toContain(".claude/skills/<name>/SKILL.md");
  });

  test("the never-write list names the three forbidden destinations", () => {
    const apply = flat(section(APPLY));
    expect(apply.length).toBeGreaterThan(0);
    expect(apply).toContain("~/.claude/");
    expect(apply).toContain("agents/*.md");
    expect(apply).toContain("sibling repo");
  });

  test("the authoring route probes three tiers and falls back to a fixed contract", () => {
    // A miss at every tier is not an error, so the fallback contract must be
    // stated in reflect's own body — .claude/skills/create-team-skill/ does
    // not ship to a consumer repo.
    const apply = section(APPLY);
    expect(apply.length).toBeGreaterThan(0);
    expect(apply).toContain(".claude/skills/create-team-skill/");
    expect(apply).toContain("create-*skill*");
    expect(apply).toContain("skill-creator");
  });

  test("the fallback frontmatter contract names every field it fixes", () => {
    const apply = section(APPLY);
    expect(apply.length).toBeGreaterThan(0);
    expect(apply).toContain("argument-hint");
    expect(apply).toContain("effort");
    expect(apply).toContain("user-invocable: false");
    expect(apply).toContain("/<name>");
  });

  test("a plan path this conversation did not print is refused", () => {
    // Approval is not idempotent and two reflect runs can sit on one repo, so
    // reading a plan file from a directory this conversation never printed
    // applies a stranger run's edits. With no printed path the turn stops and
    // asks for one rather than guessing.
    const apply = section(APPLY);
    expect(apply.length).toBeGreaterThan(0);
    expect(/printed/i.test(apply)).toBe(true);
    expect(apply).toContain("AskUserQuestion");
    expect(flat(apply)).toContain("absolute plan path");
  });

  test("each target is re-read and compared against the plan's pre-image", () => {
    // The gap between approval and application is a window in which the target
    // can change — including by already carrying the edit. A difference skips
    // that item instead of overwriting whatever landed there.
    const apply = flat(section(APPLY));
    expect(apply.length).toBeGreaterThan(0);
    expect(apply).toContain("pre-image");
    expect(/skip/i.test(apply)).toBe(true);
  });

  test("the apply turn runs the repo's own check after the writes", () => {
    // A pinned-prose test elsewhere in the repo can go red from one edit, and
    // the user should learn that here rather than in CI. Reflect reports the
    // verdict and neither fixes nor reverts.
    const apply = section(APPLY);
    expect(apply.length).toBeGreaterThan(0);
    expect(apply).toContain("skills/running-quality-checks/SKILL.md");
  });
});

// ===========================================================================
// Slice 3 — L2: backlog routing
// ===========================================================================

describe("Slice 3 — L2: reflect files demoted findings to whatever tracker the repo names", () => {
  test("tracker resolution runs three tiers, the repo router first", () => {
    // Ordering tripwire: probing `gh` before the router fixes every repo to
    // GitHub issues even when its router names another tracker.
    const backlog = section(BACKLOG);
    expect(backlog.length).toBeGreaterThan(0);
    const router = backlog.indexOf("AGENTS.md");
    const authenticated = backlog.indexOf("hasIssuesEnabled");
    const printOnly = backlog.indexOf("print-only");
    expect(router).toBeGreaterThan(-1);
    expect(authenticated).toBeGreaterThan(router);
    expect(printOnly).toBeGreaterThan(authenticated);
  });

  test("every gh issue call names its repository explicitly", () => {
    // A bare `gh` reads the current directory's remote, and a set GH_REPO
    // answers from anywhere — so the repo is resolved and passed, never
    // inferred. Scoped to `gh issue`: `gh api` carries the repository in its
    // path and `gh project` takes --owner, so neither accepts --repo.
    const ghIssueLines = fencedLines().filter((line) => /\bgh\s+issue\b/.test(line));
    expect(ghIssueLines.length).toBeGreaterThan(0);
    expect(ghIssueLines.filter((line) => !line.includes("--repo"))).toEqual([]);
    expect(body()).toContain("git remote get-url origin");
  });

  test("both prose values travel by file — the title as well as the body", () => {
    // The title is a paraphrase of transcript text, and filing is the run's
    // one irreversible public write. Pasted into the command as a literal it
    // runs its own $(…), backticks, and ${…} as shell before gh starts; read
    // back from a file it reaches gh only as an expanded variable, whose
    // output the shell does not re-parse. `:?` aborts on an empty read rather
    // than filing a titleless issue.
    const backlog = section(BACKLOG);
    expect(backlog.length).toBeGreaterThan(0);
    expect(backlog).toContain('TITLE="$(cat');
    expect(backlog).toContain('--title "${TITLE:?}"');
    expect(backlog).toContain("--body-file");
  });

  test("each proposed issue takes its own approval question", () => {
    // Creation is public and irreversible, so the granularity is per issue,
    // not per class.
    const backlog = flat(section(BACKLOG));
    expect(backlog.length).toBeGreaterThan(0);
    expect(backlog).toContain("AskUserQuestion");
    expect(backlog).toContain("one question per issue");
  });

  test("a filed issue carries the board fields the repo's router states", () => {
    const backlog = section(BACKLOG);
    expect(backlog.length).toBeGreaterThan(0);
    expect(backlog).toContain("docs/project-tracking.md");
    expect(backlog).toContain("Priority");
    expect(backlog).toContain("P0");
    expect(backlog).toContain("bug");
  });

  test("the summary names filed and unfiled items separately", () => {
    // An unauthenticated tracker must be visible in the summary rather than
    // silently leaving the backlog undurable.
    const text = flat(prose());
    expect(text.length).toBeGreaterThan(0);
    expect(/\bfiled\b/i.test(text)).toBe(true);
    expect(/\bunfiled\b/i.test(text)).toBe(true);
  });
});
