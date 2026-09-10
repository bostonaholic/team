// tests/helpers/claude-plugin-fixture.ts
//
// A throwaway copy of the plugin root for the Claude Code dev-install tests.
//
// `script/dev-install-claude` stamps a cachebuster into
// `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, then
// restores both on the way out. Running it against the real checkout would
// mutate tracked files carrying three of Team's six pinned version strings,
// and a crashed test would leave them stamped. Every test therefore drives a
// copy: same layout, same script, disposable manifests.
//
// `skills/` here is two stub skills rather than the real tree, because the fake
// `claude` copies it on every install and the real one is a few megabytes. What
// these tests assert about skills is that the served copy is a snapshot, which
// two files show as well as ninety directories do.

import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");

export type ClaudePluginFixture = {
  /** The plugin root the scripts resolve from. */
  root: string;
  install: string;
  uninstall: string;
  pluginManifest: string;
  marketplaceManifest: string;
  skills: string;
};

/** Build a disposable plugin root. The caller removes `root` when done. */
export function makeClaudePluginFixture(): ClaudePluginFixture {
  const root = mkdtempSync(join(tmpdir(), `team-claude-plugin-${process.pid}-`));

  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  for (const name of ["plugin.json", "marketplace.json"]) {
    copyFileSync(
      join(REPO_ROOT, ".claude-plugin", name),
      join(root, ".claude-plugin", name),
    );
  }

  for (const name of ["team", "shipit"]) {
    mkdirSync(join(root, "skills", name), { recursive: true });
    writeFileSync(
      join(root, "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: fixture skill\n---\n\nfixture\n`,
    );
  }

  mkdirSync(join(root, "script"), { recursive: true });
  for (const name of ["dev-install-claude", "dev-uninstall-claude"]) {
    const destination = join(root, "script", name);
    copyFileSync(join(REPO_ROOT, "script", name), destination);
    chmodSync(destination, 0o755);
  }

  return {
    root,
    install: join(root, "script", "dev-install-claude"),
    uninstall: join(root, "script", "dev-uninstall-claude"),
    pluginManifest: join(root, ".claude-plugin", "plugin.json"),
    marketplaceManifest: join(root, ".claude-plugin", "marketplace.json"),
    skills: join(root, "skills"),
  };
}

/** The base version the fixture's manifest carries, before any cachebuster. */
export function fixtureBaseVersion(fixture: ClaudePluginFixture): string {
  const manifest = JSON.parse(readFileSync(fixture.pluginManifest, "utf8"));
  const [base = ""] = String(manifest.version).split("+");
  return base;
}
