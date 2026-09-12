import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, closeSync, constants, cpSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, symlinkSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { expectStatus, fixture, load, REPO, run, skill, state, write, type Fixture, type Result } from "./helpers/opencode";
import { loadInstructionContext } from "./helpers/fixtures";
import { createHash } from "node:crypto";

setDefaultTimeout(20_000);

const fixtures: Fixture[] = [];
function make(name = "checkout") { const f = fixture(name); fixtures.push(f); return f; }
afterEach(() => { for (const f of fixtures.splice(0)) f.dispose(); });

describe("Installed resource delivery: OpenCode", () => {
  function readOutside(installedRoot: string, path: string, cwd: string) {
    return spawnSync(process.execPath, [
      "-e", 'const { loadInstructionContext } = require(process.argv[1]); process.stdout.write(loadInstructionContext([process.argv[3]], process.argv[2]));',
      join(import.meta.dir, "helpers/fixtures.ts"), installedRoot, path,
    ], { cwd, env: { PATH: "", HOME: cwd, TMPDIR: cwd, LANG: "C", TZ: "UTC" }, encoding: "utf8", timeout: 10_000 });
  }

  function copiedInstallation() {
    const f = make("resource source");
    cpSync(join(REPO, "skills/team"), join(f.checkout, "skills/team"), { recursive: true });
    const installed = { ...f, checkout: join(f.root, "installed snapshot") };
    cpSync(f.checkout, installed.checkout, { recursive: true });
    expectStatus(run(installed, "install"), 0);
    return { f, installed };
  }

  test.each(["artifacts.md", "external-data.md"])("%s retains its digest through the adapter after source removal", async (name) => {
    const { f, installed } = copiedInstallation();
    const path = join("skills/team/references", name);
    expect(existsSync(join(f.checkout, path)), path).toBe(true);
    const expected = createHash("sha256").update(loadInstructionContext([path], f.checkout)).digest("hex");
    const config = await load(installed, {}, installed.target);
    expect(config.command?.team?.template).toContain(join(installed.checkout, "skills/team/SKILL.md"));

    rmSync(f.checkout, { recursive: true });

    expect(existsSync(f.checkout)).toBe(false);
    const result = readOutside(installed.checkout, path, f.root);
    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
    expect(createHash("sha256").update(result.stdout).digest("hex")).toBe(expected);
  });

  test.each(["artifacts.md", "external-data.md"])("missing installed %s reports its path while source remains readable", (name) => {
    const { f, installed } = copiedInstallation();
    const path = join("skills/team/references", name);
    expect(existsSync(join(f.checkout, path)), path).toBe(true);
    expect(loadInstructionContext([path], installed.checkout)).toBe(loadInstructionContext([path], f.checkout));
    const missing = join(installed.checkout, path);

    rmSync(missing);

    expect(loadInstructionContext([path], f.checkout).length).toBeGreaterThan(0);
    const result = readOutside(installed.checkout, path, f.root);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(missing);
  });
});
function targetAt(root: string) { return join(root, "plugins/team.js"); }
function owned(f: Fixture, path = f.target) { expect(state(path)).toEqual({ kind: "link", value: join(f.checkout, "opencode/team.js") }); }
function failed(result: Result, diagnostic: RegExp) { expect(result.status, result.output).not.toBe(0); expect(result.output).toMatch(diagnostic); }
function seedTarget(f: Fixture, kind: string) {
  mkdirSync(dirname(f.target), { recursive: true });
  if (kind === "foreign link") symlinkSync(join(f.root, "foreign/opencode/team.js"), f.target);
  else if (kind === "regular file") write(f.target, "User-owned plugin\n");
  else mkdirSync(f.target);
}
function preload(f: Fixture, contents: string) { const path = join(f.root, "instrument.cjs"); write(path, contents); return { NODE_OPTIONS: `--require=${path}` }; }
function denyWrites(f: Fixture) {
  return preload(f, `const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const denied = () => Object.assign(new Error('EACCES: fixture write refusal'), { code: 'EACCES' });
fs.symlinkSync = () => { throw denied(); };
fs.symlink = (...args) => args.at(-1)(denied());
fs.promises.symlink = async () => { throw denied(); };
syncBuiltinESMExports();\n`);
}
function protectConfigReads(f: Fixture, paths: string[]) {
  const env = preload(f, `const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const paths = new Set(${JSON.stringify(paths)});
const deny = value => { if (paths.has(String(value))) { fs.writeFileSync(${JSON.stringify(join(f.root, 'config-read-attempt'))}, String(value)); throw new Error('Forbidden native config read: ' + value); } };
for (const name of ['readFileSync', 'openSync']) { const original = fs[name]; fs[name] = function(path, ...args) { deny(path); return original.call(this, path, ...args); }; }
for (const name of ['readFile', 'open']) { const original = fs[name]; fs[name] = function(path, ...args) { deny(path); return original.call(this, path, ...args); }; }
for (const name of ['readFile', 'open']) { const original = fs.promises[name]; fs.promises[name] = async function(path, ...args) { deny(path); return original.call(this, path, ...args); }; }
syncBuiltinESMExports();\n`);
  const read = spawnSync(join(f.root, "bin/node"), ["-e", "require('node:fs').readFileSync(process.argv[1])", paths[0]!], { env: { ...f.env, ...env }, encoding: "utf8" });
  expect(read.status).not.toBe(0);
  expect(read.stderr).toContain("Forbidden native config read");
  expect(state(join(f.root, "config-read-attempt"))).toEqual({ kind: "file", value: paths[0] });
  rmSync(join(f.root, "config-read-attempt"));
  const host = spawnSync(join(f.root, "bin/opencode"), [], { env: f.env, encoding: "utf8" });
  expect(host.status).toBe(99);
  expect(state(join(f.home, "host-invoked"))).toEqual({ kind: "file", value: "invoked" });
  rmSync(join(f.home, "host-invoked"));
  return env;
}
function killProcessGroup(child: ChildProcess) {
  if (!child.pid) return;
  try { process.kill(-child.pid, "SIGKILL"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}
function releaseBarrier(fifo: string) {
  const fd = openSync(fifo, constants.O_WRONLY | constants.O_NONBLOCK);
  try { writeSync(fd, "x"); } finally { closeSync(fd); }
}
async function concurrent(f: Fixture, operation: "install" | "uninstall", env: Record<string, string> = {}): Promise<Result> {
  const child = spawn("/bin/bash", [join(f.checkout, "script", `dev-${operation}-opencode`)], { cwd: f.root, env: { ...f.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const deadline = setTimeout(() => killProcessGroup(child), 10_000);
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
  try {
    return await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (status) => resolve({ status: status ?? -1, output })); });
  } finally { clearTimeout(deadline); killProcessGroup(child); }
}
async function lockedUninstall(f: Fixture, competitorEnv: Record<string, string> = {}) {
  const fifo = join(f.root, "release-unlink");
  expect(spawnSync("/usr/bin/mkfifo", [fifo]).status).toBe(0);
  const env = preload(f, `const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const target = ${JSON.stringify(f.target)};
const pause = path => { if (String(path) !== target) return; const fd = fs.openSync(${JSON.stringify(fifo)}, 'r+'); fs.writeSync(1, 'TEST_UNLINK_READY\\n'); fs.readSync(fd, Buffer.alloc(1), 0, 1, null); fs.closeSync(fd); };
const unlinkSync = fs.unlinkSync; fs.unlinkSync = function(path) { pause(path); return unlinkSync(path); };
const unlink = fs.unlink; fs.unlink = function(path, callback) { pause(path); return unlink(path, callback); };
const asyncUnlink = fs.promises.unlink; fs.promises.unlink = async function(path) { pause(path); return asyncUnlink.call(this, path); };
syncBuiltinESMExports();\n`);
  const child = spawn("/bin/bash", [join(f.checkout, "script/dev-uninstall-opencode")], { cwd: f.root, env: { ...f.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const deadline = setTimeout(() => killProcessGroup(child), 10_000);
  let output = "";
  const completed = new Promise<Result>((resolve, reject) => { child.once("error", reject); child.once("close", (status) => resolve({ status: status ?? -1, output })); });
  const ready = new Promise<boolean>((resolve) => {
    child.stdout.on("data", (chunk) => { output += chunk; if (output.includes("TEST_UNLINK_READY\n")) resolve(true); });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("close", () => resolve(false));
  });
  try {
    expect(await ready, `Uninstall must reach unlink barrier: ${output}`).toBe(true);
    expect(state(`${f.target}.lock`)).toEqual({ kind: "directory" });
    owned(f);
    const competitor = run(f, "install", competitorEnv);
    failed(competitor, /lock|busy/i);
    expect(competitor.output).toContain(`${f.target}.lock`);
    owned(f);
    releaseBarrier(fifo);
    expectStatus(await completed, 0);
    expect(state(f.target)).toEqual({ kind: "absent" });
    expect(state(`${f.target}.lock`)).toEqual({ kind: "absent" });
  } finally { clearTimeout(deadline); killProcessGroup(child); await completed; }
}
function dispatcher(f: Fixture, operation: "install" | "uninstall", args: string[], fail = "") {
  const calls = join(f.root, "calls");
  for (const host of ["claude", "codex", "antigravity", "opencode"]) {
    const path = join(f.checkout, "script", `dev-${operation}-${host}`);
    write(path, `#!/bin/sh\nprintf '%s\\n' '${host}' >> '${calls}'\nexit ${host === fail ? 7 : 0}\n`);
    chmodSync(path, 0o755);
  }
  const hook = join(f.checkout, "script/dev-install-pull-hook");
  write(hook, `#!/bin/sh\nprintf 'hook\\n' >> '${calls}'\n`); chmodSync(hook, 0o755);
  const result = spawnSync("/bin/bash", [join(f.checkout, "script", `dev-${operation}`), ...args], { cwd: f.checkout, env: f.env, encoding: "utf8" });
  return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}`, calls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [] };
}

describe("Owned lifecycle converges without changing unrelated configuration.", () => {
  test.each(["install", "uninstall"] as const)("%s entry script is executable strict Bash", (operation) => {
    const f = make();
    const script = join(f.checkout, "script", `dev-${operation}-opencode`);
    const source = readFileSync(script, "utf8");
    expect(lstatSync(script).mode & 0o111).toBeGreaterThan(0);
    expect(source.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(source).toContain("set -euo pipefail");
  });

  test.each(["default", "empty explicit", "XDG", "explicit", "relative explicit", "relative XDG"])("uses the %s configuration root", (choice) => {
    const f = make();
    const selections: Record<string, { env: Record<string, string>; root: string }> = {
      default: { env: {}, root: f.config }, "empty explicit": { env: { OPENCODE_CONFIG_DIR: "" }, root: f.config },
      XDG: { env: { XDG_CONFIG_HOME: join(f.root, "xdg") }, root: join(f.root, "xdg/opencode") },
      explicit: { env: { XDG_CONFIG_HOME: join(f.root, "unused"), OPENCODE_CONFIG_DIR: join(f.root, "explicit") }, root: join(f.root, "explicit") },
      "relative explicit": { env: { OPENCODE_CONFIG_DIR: "relative config" }, root: join(f.root, "relative config") },
      "relative XDG": { env: { XDG_CONFIG_HOME: "relative xdg" }, root: join(f.root, "relative xdg/opencode") },
    };
    const selection = selections[choice]!;
    expectStatus(run(f, "install", selection.env), 0);
    owned(f, targetAt(selection.root));
    expectStatus(run(f, "uninstall", selection.env), 0);
    expect(state(targetAt(selection.root))).toEqual({ kind: "absent" });
    expect(state(join(selection.root, "plugins"))).toEqual({ kind: "directory" });
  });

  test.each(["checkout with spaces", "équipe 日本語"])("installs and removes %s", (name) => {
    const f = make(name);
    expectStatus(run(f, "install"), 0);
    owned(f);
    expectStatus(run(f, "uninstall"), 0);
    expect(state(f.target)).toEqual({ kind: "absent" });
  });

  test("canonical checkout and config aliases converge to the same registration", () => {
    const f = make();
    mkdirSync(f.config, { recursive: true });
    const configAlias = join(f.root, "config-alias");
    symlinkSync(f.config, configAlias);
    const checkoutAlias = join(f.root, "checkout-alias");
    symlinkSync(f.checkout, checkoutAlias);
    expectStatus(run({ ...f, checkout: checkoutAlias }, "install", { OPENCODE_CONFIG_DIR: configAlias }), 0);
    owned(f);
    expectStatus(run(f, "install"), 0);
    expectStatus(run({ ...f, checkout: checkoutAlias }, "uninstall", { OPENCODE_CONFIG_DIR: configAlias }), 0);
    expect(state(f.target)).toEqual({ kind: "absent" });
  });

  test("a real linked worktree registers its own runtime path", () => {
    const f = make();
    const origin = join(f.root, "origin");
    mkdirSync(origin);
    expect(spawnSync("git", ["init", "-q", origin], { env: { ...f.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } }).status).toBe(0);
    const result = spawnSync("git", ["-C", origin, "worktree", "add", "--orphan", "-b", "fixture", join(f.root, "linked-worktree")], { env: { ...f.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" }, encoding: "utf8" });
    expect({ status: result.status, output: result.stderr }).toMatchObject({ status: 0 });
    cpSync(f.checkout, join(f.root, "linked-worktree"), { recursive: true });
    const worktree = { ...f, checkout: join(f.root, "linked-worktree") };
    expectStatus(run(worktree, "install"), 0);
    owned(worktree);
    expectStatus(run(worktree, "uninstall"), 0);
  });

  test("repeated install and removal converge and preserve plugin parents", () => {
    const f = make();
    expectStatus(run(f, "install"), 0);
    expectStatus(run(f, "install"), 0);
    owned(f);
    expect(state(`${f.target}.lock`)).toEqual({ kind: "absent" });
    expectStatus(run(f, "uninstall"), 0);
    expectStatus(run(f, "uninstall"), 0);
    expect(state(f.target)).toEqual({ kind: "absent" });
    expect(state(dirname(f.target))).toEqual({ kind: "directory" });
    expect(state(`${f.target}.lock`)).toEqual({ kind: "absent" });
  });

  test("a new initialization reads live edits through the installed link", async () => {
    const f = make();
    expectStatus(run(f, "install"), 0);
    const before = await load(f, {}, f.target);
    skill(f, "sample", "name: sample\ndescription: Updated description", "# Updated canonical body\n");
    skill(f, "new-skill");
    const after = await load(f, {}, f.target);
    expect(before.command?.sample?.description).toBe("A fixture skill");
    expect(after.command?.sample?.description).toBe("Updated description");
    expect(after.command?.["new-skill"]?.template).toContain(join(f.checkout, "skills/new-skill/SKILL.md"));
    expect(readFileSync(join(f.checkout, "skills/sample/SKILL.md"), "utf8")).toContain("# Updated canonical body");
    owned(f);
  });

  test("uninstall removes its dangling link after the entire runtime directory disappears", () => {
    const f = make();
    expectStatus(run(f, "install"), 0);
    rmSync(join(f.checkout, "opencode"), { recursive: true });
    owned(f);
    expectStatus(run(f, "uninstall"), 0);
    expect(state(f.target)).toEqual({ kind: "absent" });
  });

  test.each(["opencode/team.js", "opencode/catalog.mjs", "skills", "skills/sample/SKILL.md"])("missing checkout path %s prevents registration", (path) => {
    const f = make();
    rmSync(join(f.checkout, path), { recursive: true });
    failed(run(f, "install"), /missing|not found|ENOENT|invalid|require/i);
    expect(state(f.config)).toEqual({ kind: "absent" });
  });

  test.each(["install", "uninstall"] as const)("%s without Node reports the prerequisite", (operation) => {
    const f = make();
    const bin = join(f.root, "without-node");
    mkdirSync(bin);
    symlinkSync("/bin/bash", join(bin, "bash"));
    symlinkSync("/usr/bin/dirname", join(bin, "dirname"));
    failed(run(f, operation, { PATH: bin }), /node/i);
    expect(state(f.config)).toEqual({ kind: "absent" });
  });

  test.each(["foreign link", "regular file", "directory"])("install refuses a %s unchanged and releases its lock", (kind) => {
    const f = make();
    seedTarget(f, kind);
    const before = state(f.target);
    const result = run(f, "install");
    failed(result, /exist|own|conflict|refus|another|foreign/i);
    expect(result.output).toContain(f.target);
    expect(state(f.target)).toEqual(before);
    expect(state(`${f.target}.lock`)).toEqual({ kind: "absent" });
  });

  test.each(["foreign link", "regular file", "directory"])("uninstall refuses a %s unchanged and releases its lock", (kind) => {
    const f = make();
    seedTarget(f, kind);
    const before = state(f.target);
    const result = run(f, "uninstall");
    failed(result, /exist|own|conflict|refus|another|foreign/i);
    expect(result.output).toContain(f.target);
    expect(state(f.target)).toEqual(before);
    expect(state(`${f.target}.lock`)).toEqual({ kind: "absent" });
  });

  test("write refusal fails registration, releases its lock, and permits recovery", () => {
    const f = make();
    failed(run(f, "install", denyWrites(f)), /EACCES|permission|write/i);
    expect(state(f.target)).toEqual({ kind: "absent" });
    expect(state(`${f.target}.lock`)).toEqual({ kind: "absent" });
    expectStatus(run(f, "install"), 0);
    owned(f);
  });

  test("absent-parent uninstall succeeds without creating directories", () => {
    const f = make();
    expectStatus(run(f, "uninstall"), 0);
    expect(readdirSync(f.home)).toEqual([]);
  });

  test.each(["install", "uninstall"] as const)("%s diagnoses a non-directory parent", (operation) => {
    const f = make();
    write(dirname(f.target), "User-owned file\n");
    const before = state(dirname(f.target));
    failed(run(f, operation), /directory|ENOTDIR|EEXIST/i);
    expect(state(dirname(f.target))).toEqual(before);
  });

  test.each(["opencode.json", "opencode.jsonc", "malformed opencode.json"])("preserves %s and unrelated data without reading config or invoking the host", (kind) => {
    const f = make();
    const configFile = join(f.config, kind.includes("jsonc") ? "opencode.jsonc" : "opencode.json");
    const contents: string = kind.startsWith("malformed") ? "{ invalid json" : kind.endsWith("jsonc") ? '// retained comment\n{"model":"user/model",}\n' : '{"model":"user/model"}\n';
    const credentials = join(f.home, ".local/share/opencode/auth.json");
    const unrelated = join(f.config, "plugins/unrelated.js");
    write(configFile, contents);
    write(credentials, '{"synthetic":"fixture-only"}\n');
    write(unrelated, "export default async () => ({});\n");
    const env = protectConfigReads(f, [configFile, credentials]);
    const installed = run(f, "install", env);
    expectStatus(installed, 0);
    expect(installed.output).toMatch(/register/i);
    expect(installed.output).toMatch(/restart/i);
    expect(installed.output).not.toMatch(/(?:loaded|validated) successfully|configuration (?:is )?valid/i);
    expectStatus(run(f, "install", env), 0);
    expectStatus(run(f, "uninstall", env), 0);
    expect(readFileSync(configFile, "utf8")).toBe(contents);
    expect(readFileSync(credentials, "utf8")).toBe('{"synthetic":"fixture-only"}\n');
    expect(readFileSync(unrelated, "utf8")).toBe("export default async () => ({});\n");
    expect(state(f.config)).toEqual({ kind: "directory" });
    expect(state(join(f.home, "host-invoked"))).toEqual({ kind: "absent" });
    expect(state(join(f.root, "config-read-attempt"))).toEqual({ kind: "absent" });
  });

  test("concurrent creation never replaces another checkout's registration", async () => {
    const f = make();
    const second = { ...f, checkout: join(f.root, "second-checkout") };
    cpSync(f.checkout, second.checkout, { recursive: true });
    const results = await Promise.all([concurrent(f, "install"), concurrent(second, "install")]);
    expect(results.map((r) => r.status).filter((status) => status === 0)).toHaveLength(1);
    expect([join(f.checkout, "opencode/team.js"), join(second.checkout, "opencode/team.js")]).toContain(state(f.target).value ?? "");
    expect(state(`${f.target}.lock`)).toEqual({ kind: "absent" });
  });

  test.each(["canonical", "alias"])("uninstall holds its lock against a competing %s install", async (kind) => {
    const f = make();
    expectStatus(run(f, "install"), 0);
    const alias = join(f.root, "config-alias");
    symlinkSync(f.config, alias);
    await lockedUninstall(f, kind === "alias" ? { OPENCODE_CONFIG_DIR: alias } : {});
  });

  test.each(["install", "uninstall"] as const)("%s refuses a stale lock until deliberate recovery", (operation) => {
    const f = make();
    mkdirSync(`${f.target}.lock`, { recursive: true });
    const result = run(f, operation);
    failed(result, /lock|busy/i);
    expect(result.output).toContain(`${f.target}.lock`);
    expect(state(`${f.target}.lock`)).toEqual({ kind: "directory" });
    expect(state(f.target)).toEqual({ kind: "absent" });
    rmSync(`${f.target}.lock`, { recursive: true });
    expectStatus(run(f, operation), 0);
    expect(state(`${f.target}.lock`)).toEqual({ kind: "absent" });
  });

  test.each(["install", "uninstall"] as const)("targeted %s dispatch selects only OpenCode", (operation) => {
    const f = make();
    const result = dispatcher(f, operation, ["opencode"]);
    expectStatus(result, 0);
    expect(result.calls).toEqual(["opencode"]);
  });

  test.each(["install", "uninstall"] as const)("aggregate %s attempts all hosts despite sibling failure", (operation) => {
    const f = make();
    const result = dispatcher(f, operation, [], "codex");
    expect(result.status).not.toBe(0);
    expect(result.calls.filter((name) => name !== "hook").sort()).toEqual(["antigravity", "claude", "codex", "opencode"]);
    expect(result.calls.filter((name) => name === "hook")).toEqual([]);
  });

  test.each(["install", "uninstall"] as const)("developer command routes OpenCode %s through its dispatcher", (operation) => {
    const f = make();
    const dev = readFileSync(join(REPO, "dev.yml"), "utf8");
    expect(dev).toContain(`script/dev-${operation} opencode`);
    const dispatcherSource = readFileSync(join(f.checkout, "script", `dev-${operation}`), "utf8");
    expect(dispatcherSource.match(/^HARNESSES=\(([^)]*)\)/m)?.[1]?.split(/\s+/)).toContain("opencode");
  });
});
