import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}: ${result.stderr}`);
  return result;
}

function releaseScript() {
  const workflow = readFileSync(".github/workflows/release-on-merge.yml", "utf8");
  const block = workflow.split("        run: |\n")[1];
  assert.ok(block, "release workflow has a shell step");
  return block.split("\n").map((line) => line.replace(/^          /, "")).join("\n");
}

test("release workflow pushes a verifiable signed tag", (t) => {
  const root = mkdtempSync(join(tmpdir(), "release-tag-signing-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  const key = join(root, "signing-key");
  const bin = join(root, "bin");

  run("git", ["init", "--bare", origin]);
  run("git", ["push", origin, "HEAD:refs/heads/main"]);
  run("git", ["clone", "--no-tags", "--branch", "main", origin, work]);
  run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key]);
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), "#!/bin/sh\n[ \"$1 $2\" = 'release view' ] && exit 1\n[ \"$1 $2\" = 'release create' ]\n");
  chmodSync(join(bin, "gh"), 0o755);

  const result = spawnSync("bash", ["-c", releaseScript()], {
    cwd: work,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_REPOSITORY: "bostonaholic/team",
      RUNNER_TEMP: root,
      RELEASE_TAG_SIGNING_KEY: readFileSync(key, "utf8"),
      RELEASE_TAG_SIGNER_EMAIL: "release@team",
    },
  });
  assert.equal(result.status, 0, result.stderr);

  const version = JSON.parse(readFileSync(join(work, ".claude-plugin/plugin.json"), "utf8")).version;
  const tag = `v${version}`;
  run("git", ["ls-remote", "--exit-code", "--tags", origin, `refs/tags/${tag}`]);
  const allowedSigners = join(root, "allowed-signers");
  writeFileSync(allowedSigners, `* ${readFileSync(`${key}.pub`, "utf8")}`);
  const verified = spawnSync("git", ["-c", "gpg.format=ssh", "-c", `gpg.ssh.allowedSignersFile=${allowedSigners}`, "tag", "-v", tag], {
    cwd: work,
    encoding: "utf8",
  });
  assert.equal(verified.status, 0, verified.stderr);
});
