import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";
import {
  MAX_RECORDS,
  MAX_TOTAL_BYTES,
  PER_SPAN_BYTE_CAP,
  isUserTurn,
  normalizeTranscript,
  resolveTranscript,
} from "../skills/reflect/resources/resolve-transcript.mjs";
import {
  hasPluginMarker,
  isInsideRepo,
  isValidSkillName,
  parseFocus,
  preferredEditRoot,
} from "../skills/reflect/resources/write-target.mjs";

const ROOT = process.cwd();
const PATH = join(ROOT, "skills", "reflect", "SKILL.md");
const LENSES = join(ROOT, "skills", "reflect", "references", "lenses.md");
const APPLY = join(ROOT, "skills", "reflect", "references", "apply-plan.md");
const WRITE_TARGET = join(ROOT, "skills", "reflect", "resources", "write-target.mjs");
const body = () => (existsSync(PATH) ? read(PATH) : "");
const scratch: string[] = [];

function temp(files: Record<string, string> = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "reflect-test-")));
  scratch.push(root);
  for (const [path, value] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, value);
  }
  return root;
}

afterAll(() => {
  for (const path of scratch) rmSync(path, { recursive: true, force: true });
});

const jsonl = (...records: unknown[]) => `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
const user = (content: string) => ({ type: "user", message: { role: "user", content } });
const assistant = (text: string) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
const toolResult = (text: string) => ({ type: "user", toolUseResult: { stdout: text }, message: { role: "user", content: [{ type: "tool_result", content: text }] } });

describe("reflect executable helpers", () => {
  test("validates focus from stdin without executing it", () => {
    expect(parseFocus("")).toEqual({ focus: null });
    expect(parseFocus("test-style")).toEqual({ focus: "test-style" });
    for (const invalid of ["-hidden", "Test", "test style", "test;touch", "test\n"]) {
      expect(() => parseFocus(invalid)).toThrow();
    }

    const directory = temp();
    const marker = join(directory, "injected");
    const injected = spawnSync(process.execPath, [WRITE_TARGET, "focus"], {
      input: `test; touch ${marker}`,
      encoding: "utf8",
    });
    expect(injected.status).toBe(2);
    expect(existsSync(marker)).toBe(false);
  });

  test("resolves exactly one transcript by fixed marker and refuses ambiguity", () => {
    const marker = "/tmp/reflect.unique";
    const one = temp({ "project/a.jsonl": jsonl(user("reflect"), toolResult(marker)) });
    expect(resolveTranscript({ marker, projectsRoot: one })).toMatchObject({ ok: true, path: join(one, "project", "a.jsonl") });

    const many = temp({
      "a/one.jsonl": jsonl(toolResult(marker)),
      "b/two.jsonl": jsonl(toolResult(marker)),
    });
    expect(resolveTranscript({ marker, projectsRoot: many, retryDelayMs: 0 })).toMatchObject({ ok: false, failure: "multiple-matches" });
    expect(resolveTranscript({ marker: "missing", projectsRoot: many, retryDelayMs: 0 })).toMatchObject({ ok: false, failure: "no-match" });
  });

  test("normalizes only user/assistant spans and enforces both ceilings", () => {
    expect(PER_SPAN_BYTE_CAP).toBe(4000);
    expect(MAX_RECORDS).toBe(2000);
    expect(MAX_TOTAL_BYTES).toBe(4 * 1024 * 1024);
    expect(isUserTurn(user("prompt"))).toBe(true);
    expect(isUserTurn(toolResult("output"))).toBe(false);
    const normalized = normalizeTranscript(jsonl(user("prompt"), toolResult("secret"), assistant("x".repeat(5000)), { type: "control" }));
    expect(normalized.records).toHaveLength(3);
    expect(normalized.records[1]?.isUserTurn).toBe(false);
    expect(normalized.records[2]?.text.length).toBe(PER_SPAN_BYTE_CAP);
    expect(normalized.truncatedSpans).toBe(1);
    expect(normalized.droppedByType).toMatchObject({ control: 1 });
  });

  test("write target helper validates names, containment, and loaded root", () => {
    const repo = temp({ "plugin.json": "{}", "skills/demo/SKILL.md": "---\n---\n" });
    expect(isValidSkillName("good-skill")).toBe(true);
    for (const value of ["Bad", ".hidden", "../escape", "$(touch x)"]) expect(isValidSkillName(value)).toBe(false);
    expect(hasPluginMarker(repo)).toBe(true);
    expect(preferredEditRoot({ repoRoot: repo, hasPluginMarker: true })).toBe(join(repo, "skills"));
    expect(preferredEditRoot({ repoRoot: repo, hasPluginMarker: false })).toBe(join(repo, ".claude", "skills"));
    expect(isInsideRepo({ repoRoot: repo, candidatePath: join(repo, "skills", "new", "SKILL.md") })).toBe(true);
    expect(isInsideRepo({ repoRoot: repo, candidatePath: join(dirname(repo), "escape.md") })).toBe(false);
  });
});

describe("reflect public contract", () => {
  test("is explicit-only and preserves focus argument and triggers", () => {
    const fm = frontmatter(body());
    expect(fm).toMatch(/^name:\s*reflect$/m);
    expect(fm).toMatch(/^effort:\s*high$/m);
    expect(fm).toMatch(/^argument-hint:.*skill-name/m);
    expect(fm).toMatch(/^disable-model-invocation:\s*true$/m);
    for (const trigger of ["reflect on this session", "capture what we learned", "/reflect"]) expect(fm).toContain(trigger);
    expect(fm).toMatch(/Invoke ONLY on explicit reflection/i);
  });

  test("validates focus before creating the cache or reading transcripts", () => {
    const text = body();
    const validate = text.indexOf('write-target.mjs" focus');
    const cache = text.indexOf("mktemp -d");
    const resolve = text.indexOf("resolve-transcript.mjs");
    expect(validate).toBeGreaterThan(-1);
    expect(cache).toBeGreaterThan(validate);
    expect(resolve).toBeGreaterThan(cache);
    expect(text).toMatch(/near matches.*stop/i);
    expect(text).not.toContain('FOCUS="$ARGUMENTS"');
  });

  test("keeps transcript data bounded, paraphrased, and auditable", () => {
    const text = body();
    expect(text).toMatch(/untrusted data/i);
    expect(text).toMatch(/paraphrase findings, never quote/i);
    expect(text).toMatch(/file path or\s+turn index/i);
    expect(text).toMatch(/Never delete it/i);
    expect(text).toContain("transcript.jsonl");
  });

  test("runs three read-only lenses with bounded fallback", () => {
    const text = `${body()}\n${read(LENSES)}`;
    expect(existsSync(LENSES)).toBe(true);
    for (const lens of ["judgment", "tooling", "divergent"]) expect(text).toContain(lens);
    expect(text).toContain("team:file-finder");
    expect(text).toMatch(/at most 30 reply lines/i);
    expect(text).toContain("reduced-assurance mode");
    expect(text).toContain("disqualified");
    expect(text).toContain("unrun");
  });

  test("synthesizes once and writes plan before approval", () => {
    const text = body();
    const synthesis = text.indexOf("## 4. Synthesize and plan");
    const plan = text.indexOf("plan.md", synthesis);
    const ask = text.indexOf("AskUserQuestion", plan);
    expect(synthesis).toBeGreaterThan(-1);
    expect(plan).toBeGreaterThan(synthesis);
    expect(ask).toBeGreaterThan(plan);
    for (const category of ["Accepted", "Rejected", "Backlog", "no durable learning found"]) expect(text).toContain(category);
    expect(text).toMatch(/Nothing outside the run cache changes before approval/i);
  });

  test("applies only approved plans with pre-image or absence guards", () => {
    const text = `${body()}\n${read(APPLY)}`;
    expect(existsSync(APPLY)).toBe(true);
    expect(text).toMatch(/accept only a .*plan\.md.*path printed in this conversation/is);
    expect(text).toContain("git ls-files --error-unmatch");
    expect(text).toContain("git status --porcelain");
    expect(text).toContain('test ! -e "$TARGET"');
    expect(text).toContain("write-target.mjs");
    for (const forbidden of ["home cache", "sibling repo", "agents/*.md"]) expect(text).toContain(forbidden);
    expect(loadsSkill(body(), "running-quality-checks")).toBe(true);
  });

  test("requires one approval per public issue and passes prose by file", () => {
    const text = body();
    expect(text).toMatch(/separate `AskUserQuestion` for each issue/i);
    expect(text).toContain("gh issue create");
    expect(text).toContain('--repo "${REPO:?}"');
    expect(text).toContain("--body-file");
    expect(text).toContain("Priority");
    expect(text).toContain("P0");
    expect(text).toMatch(/filing failure does not\s+stop/i);
  });
});
