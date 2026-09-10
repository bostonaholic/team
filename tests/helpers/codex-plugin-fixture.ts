// tests/helpers/codex-plugin-fixture.ts
//
// A throwaway copy of the plugin root for the Codex dev-install tests.
//
// `script/dev-install-codex` stamps a cachebuster into
// `.codex-plugin/plugin.json` and restores it on the way out. Running it
// against the real checkout would mutate a tracked file that carries one of
// Team's six pinned version strings, and a crashed test would leave it
// stamped. Every test therefore drives a copy: same layout, same scripts,
// disposable manifest.
//
// `skills/` is a symlink rather than a copy — it is a few megabytes and no
// test writes to it.

import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");

export type PluginFixture = {
  /** The plugin root the scripts resolve from. */
  root: string;
  install: string;
  uninstall: string;
  manifest: string;
};

/** Build a disposable plugin root. The caller removes `root` when done. */
export function makePluginFixture(): PluginFixture {
  const root = mkdtempSync(join(tmpdir(), `team-plugin-${process.pid}-`));

  mkdirSync(join(root, ".codex-plugin"), { recursive: true });
  copyFileSync(
    join(REPO_ROOT, ".codex-plugin", "plugin.json"),
    join(root, ".codex-plugin", "plugin.json"),
  );

  mkdirSync(join(root, ".agents", "plugins"), { recursive: true });
  copyFileSync(
    join(REPO_ROOT, ".agents", "plugins", "marketplace.json"),
    join(root, ".agents", "plugins", "marketplace.json"),
  );

  symlinkSync(join(REPO_ROOT, "skills"), join(root, "skills"));

  mkdirSync(join(root, "script"), { recursive: true });
  for (const name of ["dev-install-codex", "dev-uninstall-codex"]) {
    const destination = join(root, "script", name);
    copyFileSync(join(REPO_ROOT, "script", name), destination);
    chmodSync(destination, 0o755);
  }

  return {
    root,
    install: join(root, "script", "dev-install-codex"),
    uninstall: join(root, "script", "dev-uninstall-codex"),
    manifest: join(root, ".codex-plugin", "plugin.json"),
  };
}

/** The base version the fixture's manifest carries, before any cachebuster. */
export function fixtureBaseVersion(fixture: PluginFixture): string {
  const manifest = JSON.parse(readFileSync(fixture.manifest, "utf8"));
  return String(manifest.version).split("+")[0];
}
