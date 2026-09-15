import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fixture, type Fixture } from "./helpers/opencode";

const fixtures: Fixture[] = [];
function make(checkoutName = "hooks-checkout", catalog: "one" | "empty" | "full" = "one") {
  const f = fixture(checkoutName, catalog);
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures.splice(0)) f.dispose();
});

// Mount one plugin instance so its per-session cache lives for the test body.
async function mount(f: Fixture) {
  const module = await import(pathToFileURL(join(f.checkout, "opencode/team.js")).href);
  const plugin = Object.values(module).find((value): value is (input: object) => Promise<Record<string, unknown>> => typeof value === "function");
  if (!plugin) throw new Error("team.js exported no plugin function");
  return plugin({ directory: f.root, worktree: f.root });
}

function seed(f: Fixture, id = "GH-1-hooks") {
  const dir = join(f.root, "docs", "plans", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "1-task.md"), "---\ntopic: x\ndate: 2026-01-01\nphase: task\n---\n");
  writeFileSync(join(dir, "2-questions.md"), "---\ntopic: x\ndate: 2026-01-01\nphase: question\n---\n");
  return dir;
}

describe("opencode recovery and compaction adapters", () => {
  test("registers the recovery and compaction adapters", async () => {
    const hooks = await mount(make());
    expect(typeof hooks["experimental.chat.system.transform"]).toBe("function");
    expect(typeof hooks["experimental.session.compacting"]).toBe("function");
  });

  test("system transform appends recovered context", async () => {
    const f = make();
    seed(f);
    const hooks = await mount(f);
    const output = { system: [] as string[] };
    await (hooks["experimental.chat.system.transform"] as Function)({ sessionID: "s1" }, output);
    expect(output.system.length).toBe(1);
    expect(output.system[0]).toContain("[Team Pipeline Recovery]");
    expect(output.system[0]).toContain("Phase: RESEARCH | Id: GH-1-hooks");
  });

  test("system transform caches recovered context per session", async () => {
    const f = make();
    const dir = seed(f);
    const hooks = await mount(f);
    const first = { system: [] as string[] };
    await (hooks["experimental.chat.system.transform"] as Function)({ sessionID: "s1" }, first);
    const recovered = first.system[0];
    expect(recovered).toContain("[Team Pipeline Recovery]");
    rmSync(dir, { recursive: true, force: true });

    const second = { system: ["existing"] };
    await (hooks["experimental.chat.system.transform"] as Function)({ sessionID: "s1" }, second);
    expect(second.system).toEqual(["existing", recovered]);

    const other = { system: ["existing"] };
    await (hooks["experimental.chat.system.transform"] as Function)({ sessionID: "s2" }, other);
    expect(other.system).toEqual(["existing"]);
  });

  test("system transform appends nothing when the child emits no context", async () => {
    const f = make();
    const hooks = await mount(f);
    const output = { system: ["base"] };
    await (hooks["experimental.chat.system.transform"] as Function)({ sessionID: "s1" }, output);
    expect(output.system).toEqual(["base"]);
  });

  test("system transform appends nothing and never throws when the child fails", async () => {
    const f = make();
    seed(f);
    rmSync(join(f.checkout, "hooks", "session-start-recover.mjs"));
    const hooks = await mount(f);
    const output = { system: [] as string[] };
    await (hooks["experimental.chat.system.transform"] as Function)({ sessionID: "s1" }, output);
    expect(output.system).toEqual([]);
  });

  test("session compacting mutates output.context in place", async () => {
    const f = make();
    seed(f);
    const hooks = await mount(f);
    const context: string[] = [];
    const output = { context };
    await (hooks["experimental.session.compacting"] as Function)({ sessionID: "s1" }, output);
    expect(output.context).toBe(context);
    expect(context.length).toBe(1);
    expect(context[0]).toContain("Anchor before compaction");
  });

  test("session compacting appends nothing when the child emits no context", async () => {
    const f = make();
    const hooks = await mount(f);
    const output = { context: ["base"] };
    await (hooks["experimental.session.compacting"] as Function)({ sessionID: "s1" }, output);
    expect(output.context).toEqual(["base"]);
  });
});

describe("opencode write validation adapter", () => {
  test("registers the write-validation adapter", async () => {
    const hooks = await mount(make());
    expect(typeof hooks["tool.execute.after"]).toBe("function");
  });

  test("throws on a malformed plugin file", async () => {
    const f = make();
    const file = join(f.root, "skills", "broken", "SKILL.md");
    mkdirSync(join(f.root, "skills", "broken"), { recursive: true });
    writeFileSync(file, "# no frontmatter\n");
    const hooks = await mount(f);
    await expect(
      (hooks["tool.execute.after"] as Function)({ tool: "write", args: { filePath: file } }, {}),
    ).rejects.toThrow(/SKILL\.md/);
  });

  test("skips a path outside the project", async () => {
    const f = make();
    const outside = join(f.root, "..", "outside-project", "SKILL.md");
    mkdirSync(join(f.root, "..", "outside-project"), { recursive: true });
    writeFileSync(outside, "# no frontmatter\n");
    const hooks = await mount(f);
    await (hooks["tool.execute.after"] as Function)({ tool: "write", args: { filePath: outside } }, {});
  });

  test("ignores non-plugin writes and non-write tools", async () => {
    const f = make();
    const hooks = await mount(f);
    await (hooks["tool.execute.after"] as Function)({ tool: "write", args: { filePath: join(f.root, "notes.txt") } }, {});
    await (hooks["tool.execute.after"] as Function)({ tool: "read", args: { filePath: join(f.root, "skills", "x", "SKILL.md") } }, {});
  });
});
