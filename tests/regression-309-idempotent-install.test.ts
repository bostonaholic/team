import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const INSTALL = join(REPO_ROOT, "script", "dev-install-claude");
const VERSION = JSON.parse(
  readFileSync(join(REPO_ROOT, ".claude-plugin", "plugin.json"), "utf8"),
).version;

const tempDirs: string[] = [];

function newHome(): string {
  const home = mkdtempSync(join(tmpdir(), `team-install-${process.pid}-`));
  const binDir = join(home, "bin");
  mkdirSync(binDir);
  tempDirs.push(home);

  const stub = join(binDir, "claude");
  writeFileSync(
    stub,
    `#!/usr/bin/env bash
set -euo pipefail

STATE="$HOME/state"
mkdir -p "$STATE"
printf '%s\n' "$*" >> "$STATE/calls"

case "$1 $2 $3" in
  "plugin marketplace list")
    if [ -f "$STATE/marketplace-path" ]; then
      path=$(<"$STATE/marketplace-path")
      printf '[{"name":"team-dev","source":"directory","path":"%s"}]\n' "$path"
    else
      printf '[]\n'
    fi
    ;;
  "plugin marketplace add")
    if [ -f "$STATE/marketplace-path" ]; then
      echo "Marketplace 'team-dev' is already installed" >&2
      exit 1
    fi
    printf '%s' "$4" > "$STATE/marketplace-path"
    ;;
  "plugin marketplace update")
    ;;
  "plugin install team@team-dev")
    if [ -f "$STATE/installed-version" ]; then
      echo "Plugin 'team@team-dev' is already installed" >&2
      exit 1
    fi
    printf '%s' "$PLUGIN_VERSION" > "$STATE/installed-version"
    mkdir -p "$HOME/.claude/plugins/cache/team-dev/team/$PLUGIN_VERSION"
    ;;
  "plugin update team@team-dev")
    printf '%s' "$PLUGIN_VERSION" > "$STATE/installed-version"
    mkdir -p "$HOME/.claude/plugins/cache/team-dev/team/$PLUGIN_VERSION"
    ;;
  "plugin list --json")
    if [ -f "$STATE/installed-version" ]; then
      version=$(<"$STATE/installed-version")
      printf '[{"id":"team@team-dev","version":"%s","scope":"user","installPath":"%s/.claude/plugins/cache/team-dev/team/%s"}]\n' "$version" "$HOME" "$version"
    else
      printf '[]\n'
    fi
    ;;
  *)
    echo "Unexpected claude call: $*" >&2
    exit 64
    ;;
esac
`,
  );
  chmodSync(stub, 0o755);
  return home;
}

function run(home: string) {
  const result = spawnSync("bash", [INSTALL], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      PATH: `${join(home, "bin")}:${process.env.PATH ?? ""}`,
      PLUGIN_VERSION: VERSION,
    },
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

const cachePath = (home: string) =>
  join(home, ".claude", "plugins", "cache", "team-dev", "team", VERSION);
const statePath = (home: string, name: string) => join(home, "state", name);

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
});

describe("regression #309: Claude dev installation is idempotent", () => {
  test("a repeated install restores a cache directory to the checkout symlink", () => {
    const home = newHome();
    expect(run(home).status).toBe(0);

    rmSync(cachePath(home));
    mkdirSync(cachePath(home));
    writeFileSync(join(cachePath(home), "copied-cache"), "owned by Claude\n");
    writeFileSync(statePath(home, "calls"), "");

    const second = run(home);

    expect(second.status).toBe(0);
    expect(lstatSync(cachePath(home)).isSymbolicLink()).toBe(true);
    expect(readlinkSync(cachePath(home))).toBe(REPO_ROOT);
    expect(existsSync(join(cachePath(home), "copied-cache"))).toBe(false);
    expect(readFileSync(statePath(home, "calls"), "utf8")).not.toMatch(
      /marketplace (add|update)|plugin (install|update)/,
    );

    const third = run(home);
    expect(third.status).toBe(0);
    expect(third.output).toContain("already installed");
    expect(readlinkSync(cachePath(home))).toBe(REPO_ROOT);
  });

  test("a repeated install updates an older installed version", () => {
    const home = newHome();
    mkdirSync(join(home, "state"));
    writeFileSync(statePath(home, "marketplace-path"), REPO_ROOT);
    writeFileSync(statePath(home, "installed-version"), "0.0.1");
    mkdirSync(join(home, ".claude/plugins/cache/team-dev/team/0.0.1"), {
      recursive: true,
    });

    const result = run(home);

    expect(result.status).toBe(0);
    expect(readFileSync(statePath(home, "installed-version"), "utf8")).toBe(
      VERSION,
    );
    expect(lstatSync(cachePath(home)).isSymbolicLink()).toBe(true);
    expect(readlinkSync(cachePath(home))).toBe(REPO_ROOT);
    const calls = readFileSync(statePath(home, "calls"), "utf8");
    expect(calls.indexOf("plugin marketplace update team-dev")).toBeLessThan(
      calls.indexOf("plugin update team@team-dev"),
    );
  });

  test("an existing marketplace for another checkout is refused", () => {
    const home = newHome();
    const foreign = join(home, "other-team-checkout");
    mkdirSync(join(home, "state"));
    writeFileSync(statePath(home, "marketplace-path"), foreign);

    const result = run(home);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("different checkout");
    expect(readFileSync(statePath(home, "marketplace-path"), "utf8")).toBe(
      foreign,
    );
    expect(existsSync(cachePath(home))).toBe(false);
  });
});
