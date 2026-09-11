import { expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const REPO = realpathSync(join(import.meta.dir, "../.."));
export const REQUIRED = ["opencode/team.js", "opencode/catalog.mjs", "script/dev-install-opencode", "script/dev-uninstall-opencode", "script/dev-opencode.mjs"];
export type Fixture = { root: string; checkout: string; home: string; config: string; target: string; env: Record<string, string>; dispose: () => void };
export type Config = { skills?: { paths?: string[]; [key: string]: unknown }; command?: Record<string, { template: string; description?: string; [key: string]: unknown }>; [key: string]: unknown };
export type Result = { status: number; output: string };

export function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
export function skill(f: Fixture, name: string, header = `name: ${name}\ndescription: A fixture skill`, body = "# Canonical fixture body\n") {
  const path = join(f.checkout, "skills", name, "SKILL.md");
  write(path, `---\n${header}\n---\n${body}`);
  return path;
}
export function fixture(checkoutName = "checkout", catalog: "one" | "empty" | "full" = "one"): Fixture {
  expect(REQUIRED.filter((p) => !existsSync(join(REPO, p))), "required OpenCode implementation files").toEqual([]);
  const root = realpathSync(mkdtempSync(join(tmpdir(), `team-opencode-${process.pid}-`)));
  const checkout = join(root, checkoutName);
  const home = join(root, "home");
  const config = join(home, ".config/opencode");
  const target = join(config, "plugins/team.js");
  mkdirSync(home, { recursive: true });
  mkdirSync(join(checkout, "skills"), { recursive: true });
  for (const dir of ["opencode", "script"]) cpSync(join(REPO, dir), join(checkout, dir), { recursive: true });
  write(join(checkout, "package.json"), '{"type":"module"}\n');
  const bin = join(root, "bin");
  mkdirSync(bin);
  const node = spawnSync("node", ["-p", "process.execPath"], { encoding: "utf8" });
  expect(node.status, "Node is required by the offline lifecycle harness").toBe(0);
  symlinkSync(node.stdout.trim(), join(bin, "node"));
  write(join(bin, "opencode"), '#!/bin/sh\nprintf invoked > "$HOME/host-invoked"\nprintf "unexpected host invocation\\n" >&2\nexit 99\n');
  chmodSync(join(bin, "opencode"), 0o755);
  const f = { root, checkout, home, config, target, env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, LANG: "C", TZ: "UTC", TMPDIR: root }, dispose: () => rmSync(root, { force: true, recursive: true }) };
  if (catalog === "one") skill(f, "sample");
  if (catalog === "full") cpSync(join(REPO, "skills"), join(checkout, "skills"), { recursive: true });
  return f;
}
export function run(f: Fixture, operation: "install" | "uninstall", env: Record<string, string> = {}, cwd = f.root): Result {
  const result = spawnSync("/bin/bash", [join(f.checkout, "script", `dev-${operation}-opencode`)], { cwd, env: { ...f.env, ...env }, encoding: "utf8", timeout: 10_000 });
  return { status: result.status ?? -1, output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}` };
}
export function expectStatus(result: Result, status: number) { expect(result).toMatchObject({ status }); }
export function state(path: string) {
  try { const st = lstatSync(path); return st.isSymbolicLink() ? { kind: "link", value: readlinkSync(path) } : st.isDirectory() ? { kind: "directory" } : { kind: "file", value: readFileSync(path, "utf8") }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "absent" }; throw error; }
}
export async function load(f: Fixture, config: Config = {}, entry = join(f.checkout, "opencode/team.js")) {
  const module = await import(pathToFileURL(entry).href);
  const plugins = Object.values(module).filter((value): value is (input: object) => Promise<{ config: (config: Config) => Promise<void> }> => typeof value === "function");
  expect(plugins.length, "native entry point must export exactly one plugin function").toBe(1);
  expect(Object.keys(module).length, "native entry point exports no catalog helpers").toBe(1);
  const hooks = await plugins[0]!({ directory: f.root, worktree: f.root });
  expect(Object.keys(hooks)).toEqual(["config"]);
  await hooks.config(config);
  return config;
}
export async function rejection(f: Fixture, config: Config = {}) {
  try { await load(f, config); return ""; } catch (error) { return String(error); }
}
