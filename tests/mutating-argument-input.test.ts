import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { read } from "./helpers/text";

const ROOT = process.cwd();
const skills = [
  "groom-backlog",
  "pr-cleanup",
  "pr-open-comments",
  "pr-rebase",
  "pr-watch-as-author",
  "pr-watch-as-reviewer",
  "reflect",
  "shipit",
];

const parsers = [
  ["skills/groom-backlog/scripts/parse-input.mjs", [], "scan 7"],
  ["skills/pr-cleanup/scripts/parse-input.mjs", [], "merged 7"],
  ["skills/pr-open-comments/scripts/triage.mjs", ["target"], "7"],
  ["skills/pr-rebase/scripts/context.mjs", ["target"], "7"],
  ["skills/pr-watch-as-author/scripts/poll-state.mjs", ["target"], "7"],
  ["skills/pr-watch-as-reviewer/scripts/evaluate-gate.mjs", ["target"], "7"],
  ["skills/reflect/resources/write-target.mjs", ["focus"], "skill-name"],
  ["skills/shipit/scripts/merge-state.mjs", ["target"], "7"],
] as const;

describe("mutating utility argument boundary", () => {
  test("raw arguments appear in prose only", () => {
    const planted = '```sh\nTARGET="$ARGUMENTS"\n```';
    expect(planted.match(/```[\s\S]*?\$ARGUMENTS[\s\S]*?```/)).not.toBeNull();
    for (const name of skills) {
      const text = read(join(ROOT, "skills", name, "SKILL.md"));
      for (const fence of text.match(/```[\s\S]*?```/g) ?? []) expect(fence).not.toContain("$ARGUMENTS");
      expect(text).not.toMatch(/^\s*[A-Za-z_][A-Za-z0-9_]*=.*\$ARGUMENTS/m);
    }
  });

  test("every parser consumes its raw argument from stdin", () => {
    for (const [path, args, input] of parsers) {
      const result = spawnSync(process.execPath, [join(ROOT, path), ...args], { input, encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    }
  });

  test("command-shaped targets fail as data", () => {
    for (const [path, args] of parsers.slice(1).filter(([path]) => !path.includes("reflect"))) {
      const result = spawnSync(process.execPath, [join(ROOT, path), ...args], {
        input: "7;touch injected",
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
    }
  });

  test("PR writers and merger bind a fork push URL separately from the base fetch URL", () => {
    const repo = mkdtempSync(join(tmpdir(), "team-pr-binding-"));
    try {
      expect(spawnSync("git", ["init", "-q", "-b", "feature"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["remote", "add", "origin", "https://github.com/acme/widgets.git"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["remote", "set-url", "--push", "origin", "git@github.com:contributor/widgets.git"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["config", "remote.pushDefault", "origin"], { cwd: repo }).status).toBe(0);
      const metadata = {
        url: "https://github.com/acme/widgets/pull/7",
        number: 7,
        state: "OPEN",
        baseRefName: "main",
        headRefName: "feature",
        headRepository: { nameWithOwner: "contributor/widgets" },
      };
      for (const [path, mode] of [
        ["skills/pr-open-comments/scripts/triage.mjs", "head"],
        ["skills/pr-watch-as-author/scripts/poll-state.mjs", "head"],
        ["skills/shipit/scripts/merge-state.mjs", "head"],
        ["skills/pr-rebase/scripts/context.mjs", "verify"],
      ] as const) {
        const result = spawnSync(process.execPath, [join(ROOT, path), mode], {
          cwd: repo,
          input: JSON.stringify(metadata),
          encoding: "utf8",
        });
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({
          branch: "feature",
          pushRemote: "origin",
          pushUrl: "git@github.com:contributor/widgets.git",
          baseRemote: "origin",
        });
      }

      expect(spawnSync("git", ["remote", "set-url", "--add", "--push", "origin", "https://github.com/contributor/widgets.git"], { cwd: repo }).status).toBe(0);
      for (const [path, mode] of [
        ["skills/pr-open-comments/scripts/triage.mjs", "head"],
        ["skills/pr-watch-as-author/scripts/poll-state.mjs", "head"],
        ["skills/shipit/scripts/merge-state.mjs", "head"],
        ["skills/pr-rebase/scripts/context.mjs", "verify"],
      ] as const) {
        const ambiguous = spawnSync(process.execPath, [join(ROOT, path), mode], {
          cwd: repo,
          input: JSON.stringify(metadata),
          encoding: "utf8",
        });
        expect(ambiguous.status).not.toBe(0);
        expect(ambiguous.stderr).toContain("exactly one URL");
      }

      expect(spawnSync("git", ["config", "--unset-all", "remote.origin.pushurl"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["remote", "set-url", "--push", "origin", "https://github.com/acme/widgets.git"], { cwd: repo }).status).toBe(0);
      const refused = spawnSync(process.execPath, [join(ROOT, "skills/pr-open-comments/scripts/triage.mjs"), "head"], {
        cwd: repo,
        input: JSON.stringify(metadata),
        encoding: "utf8",
      });
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain("push remote must have exactly one URL matching the PR head repository");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
