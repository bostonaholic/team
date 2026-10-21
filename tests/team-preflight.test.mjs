// Runs skills/team/scripts/preflight.sh with stubbed `ssh-add`, `gh`, and signer.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = resolve("skills/team/scripts/preflight.sh");

function stub(bin, name, body) {
  writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(bin, name), 0o755);
}

// `agent` and `gh` set the stubs' exit codes; `gitconfig` is the global config text.
function run(t, { agent = 0, gh = 0, gitconfig = "", env = {} } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "team-preflight-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  stub(bin, "ssh-add", `exit ${agent}`);
  stub(bin, "gh", `exit ${gh}`);
  stub(bin, "hang-signer", "sleep 30");
  stub(bin, "fail-signer", "exit 1");
  const config = join(root, "gitconfig");
  writeFileSync(config, gitconfig.replaceAll("BIN", bin));
  return spawnSync(SCRIPT, [], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: "1", ...env },
  });
}

test("prints four healthy readings with signing off", (t) => {
  const result = run(t, { gitconfig: "[commit]\n\tgpgsign = false\n" });
  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    "ssh-agent: keys loaded\ngh auth: ok\nglobal commit.gpgsign: false\ncommit signing: ok\n",
  );
});

test("reports an unreachable agent, a missing gh login, and an unset gpgsign", (t) => {
  const result = run(t, { agent: 2, gh: 1 });
  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    "ssh-agent: UNREACHABLE\ngh auth: NOT LOGGED IN\nglobal commit.gpgsign: unset\ncommit signing: ok\n",
  );
});

test("reports a failing signer", (t) => {
  const result = run(t, { gitconfig: "[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = BIN/fail-signer\n" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\nglobal commit\.gpgsign: true\ncommit signing: FAILED OR HUNG\n$/);
});

test("kills a hung signer after the timeout", (t) => {
  const started = Date.now();
  const result = run(t, {
    gitconfig: "[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = BIN/hang-signer\n",
    env: { TEAM_PREFLIGHT_SIGN_TIMEOUT: "1" },
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\ncommit signing: FAILED OR HUNG\n$/);
  assert.ok(Date.now() - started < 15000, "the probe outlived its timeout");
});

test("rejects any argument", () => {
  const result = spawnSync(SCRIPT, ["extra"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^preflight\.sh: takes no arguments\nusage: preflight\.sh\n$/);
});

test("fails loud when git is not installed", (t) => {
  const empty = realpathSync(mkdtempSync(join(tmpdir(), "team-preflight-nogit-")));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  const result = spawnSync(SCRIPT, [], { encoding: "utf8", env: { PATH: empty } });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "preflight.sh: git is not installed\n");
});
