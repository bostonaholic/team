// Runs skills/team-update/scripts/update.sh against a fake HOME with Team
// installed in each harness, stubbed claude, codex, agy, and ps, and git remotes
// redirected to a local Team repository tagged with an old and a current
// release. The script runs under /bin/bash.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync,
  realpathSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const SCRIPTS = resolve("skills/team-update/scripts");
const FAKE_CLI = resolve("tests/fixtures/team-migrate-cli.mjs");
const RELEASE_ENTRIES = [".claude-plugin", ".codex-plugin", ".agents", "plugin.json", "README.md", "skills", "agents", "opencode", "script"];
const MANIFESTS = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", "plugin.json"];
const TEAM_VERSION = JSON.parse(readFileSync(".claude-plugin/plugin.json", "utf8")).version;
const OLD_VERSION = "0.100.0";
const TEAM_URL = "https://github.com/bostonaholic/team.git";

function sh(cwd, env, command, args) {
  const run = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  assert.equal(run.status, 0, `${command} ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// A machine with every harness present and no Team in any of them, plus a
// GitHub whose Team repository holds the old release and the current one.
// `install` puts Team into one harness at a version.
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "team-update-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const bin = join(root, "bin");
  const trees = join(root, "trees");
  for (const dir of [home, bin, join(root, "tmp")]) mkdirSync(dir);
  const gitconfig = join(root, "gitconfig");
  writeFileSync(gitconfig, [
    "[user]", "\tname = Test", "\temail = test@example.com",
    "[commit]", "\tgpgsign = false", "[tag]", "\tgpgsign = false", "[init]", "\tdefaultBranch = main",
    `[url "file://${root}/github/"]`, "\tinsteadOf = https://github.com/",
    "[protocol \"file\"]", "\tallow = always", "",
  ].join("\n"));
  const env = {
    HOME: home,
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: "1",
    TMPDIR: join(root, "tmp"),
    FAKE_STATE: join(root, "state.json"),
    FAKE_TREES: trees,
    FAKE_LOG: join(root, "calls.log"),
  };
  for (const tool of ["claude", "codex", "agy", "ps"]) {
    writeFileSync(join(bin, tool), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_CLI}" ${tool} "$@"\n`);
    chmodSync(join(bin, tool), 0o755);
  }
  writeFileSync(env.FAKE_LOG, "");
  const git = (cwd, ...args) => sh(cwd, env, "git", args);

  const tree = join(trees, "bostonaholic/team");
  for (const entry of RELEASE_ENTRIES) cpSync(entry, join(tree, entry), { recursive: true });
  const setVersion = (version) => {
    for (const manifest of MANIFESTS) {
      const path = join(tree, manifest);
      writeJson(path, { ...JSON.parse(readFileSync(path, "utf8")), version });
    }
  };
  git(tree, "init", "-q");
  for (const version of [OLD_VERSION, TEAM_VERSION]) {
    setVersion(version);
    git(tree, "add", ".");
    git(tree, "commit", "-q", "-m", `release ${version}`);
    git(tree, "tag", `v${version}`);
  }
  mkdirSync(join(root, "github/bostonaholic"), { recursive: true });
  git(root, "clone", "-q", "--bare", "--no-local", tree, join(root, "github/bostonaholic/team.git"));

  writeJson(env.FAKE_STATE, { claude: { markets: {}, plugins: [] }, codex: { markets: {}, plugins: [] } });
  mkdirSync(join(home, ".config/opencode"), { recursive: true });
  mkdirSync(join(home, ".cursor"), { recursive: true });

  const release = join(home, ".local/share/team-migrate/team");
  const dev = join(root, "dev/team");
  mkdirSync(join(dev, "opencode"), { recursive: true });
  const state = () => JSON.parse(readFileSync(env.FAKE_STATE, "utf8"));
  const setState = (change) => writeJson(env.FAKE_STATE, change(state()));
  const clone = (version) => {
    if (existsSync(release)) return;
    mkdirSync(dirname(release), { recursive: true });
    git(root, "-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", `v${version}`, TEAM_URL, release);
  };
  const agyTeam = join(home, ".gemini/config/plugins/team");
  const opencodeTeam = join(home, ".config/opencode/plugins/team.js");
  const cursorTeam = join(home, ".cursor/plugins/local/team");
  const install = {
    claude: (version) =>
      setState((s) => ({
        ...s,
        claude: {
          markets: { ...s.claude.markets, "team-dev": { source: "github", repo: "bostonaholic/team" } },
          plugins: [...s.claude.plugins, { id: "team@team-dev", version }],
        },
      })),
    codex: (version) =>
      setState((s) => ({
        ...s,
        codex: {
          markets: { ...s.codex.markets, "team-dev": { sourceType: "git", source: TEAM_URL, repo: "bostonaholic/team", root: join(home, ".codex/.tmp/marketplaces/team-dev") } },
          plugins: [...s.codex.plugins, { id: "team@team-dev", version }],
        },
      })),
    antigravity: (version) => writeJson(join(agyTeam, "plugin.json"), { name: "team", version }),
    opencode: (version) => {
      clone(version);
      mkdirSync(dirname(opencodeTeam), { recursive: true });
      symlinkSync(join(release, "opencode/team.js"), opencodeTeam);
    },
    cursor: (version) => {
      clone(version);
      writeJson(join(cursorTeam, ".cursor-plugin/plugin.json"), { name: "team", version });
      writeFileSync(join(cursorTeam, ".team-dev-install"), `${release}\n`);
    },
  };
  const installAll = (version) => {
    for (const harness of Object.keys(install)) install[harness](version);
    clone(version);
  };

  const run = (args = [], extra = {}) =>
    spawnSync("/bin/bash", [join(SCRIPTS, "update.sh"), ...args], { cwd: root, env: { ...env, ...extra }, encoding: "utf8" });
  const calls = () => readFileSync(env.FAKE_LOG, "utf8").trim().split("\n").filter(Boolean);
  const changes = () => calls().filter((call) => !/^ps /.test(call) && !/ list( |$)/.test(call));
  return { root, home, dev, env, git, run, state, setState, calls, changes, install, installAll, release, agyTeam, opencodeTeam, cursorTeam };
}

function planOf(fx) {
  const plan = fx.run(["plan"]);
  return { ...plan, id: /^Plan id: ([0-9a-f]{40})$/m.exec(plan.stdout)?.[1] };
}

const stepsOf = (plan) => (plan.stdout.match(/^ {5}\$ .*$/gm) ?? []).map((line) => line.slice(7));

function snapshot(...roots) {
  const lines = [];
  const walk = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) lines.push(`${path} -> ${readlinkSync(path)}`);
    else if (stat.isDirectory()) {
      lines.push(`${path}/`);
      for (const entry of readdirSync(path).sort()) walk(join(path, entry));
    } else lines.push(`${path} ${createHash("sha256").update(readFileSync(path)).digest("hex")}`);
  };
  for (const root of roots) if (existsSync(root)) walk(root);
  return lines.join("\n");
}

const machine = (fx) => snapshot(fx.home, fx.env.FAKE_STATE);
const versions = (fx, host) => fx.state()[host].plugins.map((plugin) => `${plugin.id} ${plugin.version}`);

test("a machine on the latest release plans nothing and changes nothing", (t) => {
  const fx = fixture(t);
  fx.installAll(TEAM_VERSION);
  const before = machine(fx);
  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  assert.match(plan.stdout, /Harnesses with Team from a release: claude codex antigravity opencode cursor/);
  assert.match(plan.stdout, /^Nothing to do\.$/m);
  assert.doesNotMatch(plan.stdout, /^Left as they are:/m);
  const apply = fx.run(["apply", plan.id]);
  assert.equal(apply.status, 0, apply.stderr);
  assert.match(apply.stdout, /^Nothing to do\.$/m);
  assert.deepEqual(fx.changes(), []);
  assert.equal(machine(fx), before);
});

test("Claude Code behind refreshes the marketplace, then updates the plugin", (t) => {
  const fx = fixture(t);
  fx.install.claude(OLD_VERSION);
  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  assert.match(plan.stdout, /Touched by this plan: claude$/m);
  assert.deepEqual(stepsOf(plan), ["claude plugin marketplace update team-dev", "claude plugin update team@team-dev --scope user"]);
  const apply = fx.run(["apply", plan.id]);
  assert.equal(apply.status, 0, apply.stdout + apply.stderr);
  assert.match(apply.stdout, /^\[1\/2\] \[claude\] Team's catalog is behind v/m);
  assert.deepEqual(versions(fx, "claude"), [`team@team-dev ${TEAM_VERSION}`]);
  assert.deepEqual(fx.changes(), ["claude plugin marketplace update team-dev", "claude plugin update team@team-dev --scope user"]);
  assert.match(planOf(fx).stdout, /^Nothing to do\.$/m);
});

test("Codex behind upgrades the marketplace, then adds the plugin", (t) => {
  const fx = fixture(t);
  fx.install.codex(OLD_VERSION);
  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  assert.deepEqual(stepsOf(plan), ["codex plugin marketplace upgrade team-dev", "codex plugin add team@team-dev"]);
  const apply = fx.run(["apply", plan.id]);
  assert.equal(apply.status, 0, apply.stdout + apply.stderr);
  assert.deepEqual(versions(fx, "codex"), [`team@team-dev ${TEAM_VERSION}`]);
  assert.match(planOf(fx).stdout, /^Nothing to do\.$/m);
});

test("a harness without Team gets a left line and no step", (t) => {
  const fx = fixture(t);
  fx.install.claude(OLD_VERSION);
  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  assert.match(plan.stdout, /Harnesses with Team from a release: claude$/m);
  for (const harness of ["codex", "antigravity", "cursor"]) {
    assert.match(plan.stdout, new RegExp(`^ {2}- ${harness}: Team is not installed; run /team-migrate or follow INSTALL\\.md`, "m"));
  }
  assert.match(plan.stdout, /^ {2}- opencode: Team is not installed/m, "the OpenCode config directory exists");
  assert.deepEqual(stepsOf(plan), ["claude plugin marketplace update team-dev", "claude plugin update team@team-dev --scope user"]);
  const apply = fx.run(["apply", plan.id]);
  assert.equal(apply.status, 0, apply.stdout + apply.stderr);
  assert.deepEqual(fx.state().codex, { markets: {}, plugins: [] });
  for (const path of [fx.agyTeam, fx.opencodeTeam, fx.cursorTeam, fx.release]) assert.ok(!existsSync(path), path);
  assert.ok(!fx.changes().some((call) => call.startsWith("codex") || call.startsWith("agy")), fx.changes().join("\n"));
});

test("Team installed with its marketplace missing gets a left line, not a marketplace add or install", (t) => {
  const fx = fixture(t);
  fx.setState((s) => ({
    claude: { markets: {}, plugins: [{ id: "team@team-dev", version: OLD_VERSION }] },
    codex: { markets: {}, plugins: [{ id: "team@team-dev", version: OLD_VERSION }] },
  }));
  const before = machine(fx);
  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  assert.deepEqual(stepsOf(plan), []);
  assert.match(plan.stdout, /^Nothing to do\.$/m);
  assert.match(plan.stdout, /^ {2}- claude: Team's 'team-dev' marketplace is missing; run \/team-migrate$/m);
  assert.match(plan.stdout, /^ {2}- codex: Team's 'team-dev' marketplace is missing; run \/team-migrate$/m);
  const apply = fx.run(["apply", plan.id]);
  assert.equal(apply.status, 0, apply.stdout + apply.stderr);
  assert.deepEqual(fx.changes(), []);
  assert.equal(machine(fx), before);
});

test("a current Antigravity copy with no release clone plans no clone", (t) => {
  const fx = fixture(t);
  fx.install.antigravity(TEAM_VERSION);
  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  assert.deepEqual(stepsOf(plan), []);
  assert.match(plan.stdout, /^Nothing to do\.$/m);
  assert.doesNotMatch(plan.stdout, /clone/);
  assert.ok(!existsSync(fx.release));
});

test("an Antigravity copy behind with no release clone clones, then installs", (t) => {
  const fx = fixture(t);
  fx.install.antigravity(OLD_VERSION);
  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  assert.match(stepsOf(plan)[1], /clone .* --branch v/);
  assert.equal(stepsOf(plan).at(-1), `agy plugin install ${fx.release}`);
});

test("Antigravity, OpenCode, and Cursor behind update the release clone, then reinstall", (t) => {
  const fx = fixture(t);
  for (const harness of ["antigravity", "opencode", "cursor"]) fx.install[harness](OLD_VERSION);
  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  assert.match(plan.stdout, /Touched by this plan: antigravity opencode cursor$/m);
  assert.deepEqual(stepsOf(plan), [
    `git -C ${fx.release} fetch --quiet --depth 1 origin tag v${TEAM_VERSION}`,
    `git -C ${fx.release} -c advice.detachedHead=false checkout --quiet --detach v${TEAM_VERSION}`,
    `agy plugin install ${fx.release}`,
    `${fx.release}/script/dev-install-cursor`,
  ]);
  const apply = fx.run(["apply", plan.id]);
  assert.equal(apply.status, 0, apply.stdout + apply.stderr);
  assert.equal(fx.git(fx.release, "describe", "--tags", "--exact-match", "HEAD"), `v${TEAM_VERSION}`);
  assert.equal(JSON.parse(readFileSync(join(fx.agyTeam, "plugin.json"), "utf8")).version, TEAM_VERSION);
  assert.equal(JSON.parse(readFileSync(join(fx.cursorTeam, ".cursor-plugin/plugin.json"), "utf8")).version, TEAM_VERSION);
  assert.equal(readlinkSync(fx.opencodeTeam), join(fx.release, "opencode/team.js"));
  assert.ok(existsSync(fx.opencodeTeam), "the link reaches the updated clone");
  assert.match(planOf(fx).stdout, /^Nothing to do\.$/m);
});

test("it never installs the collection, retires a copy, or runs a dev uninstall", (t) => {
  const fx = fixture(t);
  fx.installAll(OLD_VERSION);
  mkdirSync(join(fx.home, ".agents/skills/shipit"), { recursive: true });
  writeFileSync(join(fx.home, ".agents/skills/shipit/SKILL.md"), "---\nname: shipit\n---\n");
  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  const apply = fx.run(["apply", plan.id]);
  assert.equal(apply.status, 0, apply.stdout + apply.stderr);
  assert.ok(!fx.calls().some((call) => /bostonaholic\/skills|bostonaholic@skills|uninstall|marketplace (add|remove)/.test(call)), fx.calls().join("\n"));
  assert.ok(existsSync(join(fx.home, ".agents/skills/shipit/SKILL.md")));
  assert.ok(!existsSync(join(fx.home, ".agents/skills-retired")));
});

test("dev installs are left alone with their checkout named", (t) => {
  const fx = fixture(t);
  writeFileSync(join(fx.dev, "opencode/team.js"), "");
  fx.setState((s) => ({
    claude: { markets: { "team-dev": { source: "directory", path: fx.dev } }, plugins: [{ id: "team@team-dev", version: OLD_VERSION }] },
    codex: {
      markets: { "team-dev": { sourceType: "local", source: fx.dev, root: fx.dev } },
      plugins: [{ id: "team@team-dev", version: OLD_VERSION }],
    },
  }));
  mkdirSync(dirname(fx.agyTeam), { recursive: true });
  symlinkSync(fx.dev, fx.agyTeam);
  mkdirSync(dirname(fx.opencodeTeam), { recursive: true });
  symlinkSync(join(fx.dev, "opencode/team.js"), fx.opencodeTeam);
  writeJson(join(fx.cursorTeam, ".cursor-plugin/plugin.json"), { name: "team", version: OLD_VERSION });
  writeFileSync(join(fx.cursorTeam, ".team-dev-install"), `${fx.dev}\n`);
  const before = machine(fx);

  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  assert.match(plan.stdout, /Harnesses with Team from a release: none$/m);
  assert.match(plan.stdout, /^Nothing to do\.$/m);
  for (const harness of ["claude", "codex", "antigravity", "opencode", "cursor"]) {
    assert.match(plan.stdout, new RegExp(`^ {2}- ${harness}: dev install from ${fx.dev}; pull that checkout and rerun script/dev-install$`, "m"));
  }
  const apply = fx.run(["apply", plan.id]);
  assert.equal(apply.status, 0, apply.stdout + apply.stderr);
  assert.deepEqual(fx.changes(), []);
  assert.equal(machine(fx), before);
});

test("a path Team's install did not make is left, not a blocker", (t) => {
  const fx = fixture(t);
  mkdirSync(dirname(fx.opencodeTeam), { recursive: true });
  writeFileSync(fx.opencodeTeam, "// mine\n");
  writeJson(join(fx.cursorTeam, ".cursor-plugin/plugin.json"), { name: "team", version: OLD_VERSION });
  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  assert.match(plan.stdout, /^ {2}- opencode: .*\/plugins\/team\.js was not made by Team's install; leaving it$/m);
  assert.match(plan.stdout, /^ {2}- cursor: .*\/local\/team was not made by Team's install; leaving it$/m);
});

test("a marketplace from another source blocks the plan", (t) => {
  const fx = fixture(t);
  fx.install.claude(OLD_VERSION);
  fx.setState((s) => ({ ...s, claude: { ...s.claude, markets: { "team-dev": { source: "github", repo: "someone/team" } } } }));
  const before = machine(fx);
  const plan = planOf(fx);
  assert.equal(plan.status, 4, plan.stdout + plan.stderr);
  assert.match(plan.stdout, /claude: the 'team-dev' marketplace comes from github\/someone\/team, not bostonaholic\/team/);
  assert.equal(fx.run(["apply", plan.id]).status, 4);
  assert.equal(machine(fx), before);
});

test("apply refuses a plan id the machine no longer matches", (t) => {
  const fx = fixture(t);
  fx.install.claude(OLD_VERSION);
  const plan = planOf(fx);
  fx.install.codex(OLD_VERSION);
  const before = machine(fx);
  const apply = fx.run(["apply", plan.id]);
  assert.equal(apply.status, 3, apply.stdout + apply.stderr);
  assert.match(apply.stderr, /^team-update: the plan changed since it was confirmed/m);
  assert.equal(machine(fx), before);
});

test("a dry run prints every command and changes nothing", (t) => {
  const fx = fixture(t);
  for (const harness of ["claude", "codex", "antigravity", "opencode", "cursor"]) fx.install[harness](OLD_VERSION);
  const before = machine(fx);
  const plan = planOf(fx);
  const dry = fx.run(["apply", plan.id], { DRY_RUN: "true" });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^ {2}\[dry run\] claude plugin update team@team-dev --scope user$/m);
  assert.match(dry.stdout, /^ {2}\[dry run\] .*\/script\/dev-install-cursor$/m);
  assert.deepEqual(fx.changes(), []);
  assert.equal(machine(fx), before);
});

test("a failed step stops the run and names the steps not run", (t) => {
  const fx = fixture(t);
  fx.install.claude(OLD_VERSION);
  fx.install.codex(OLD_VERSION);
  fx.setState((s) => ({ ...s, failOn: "claude plugin update team@team-dev --scope user" }));
  const plan = planOf(fx);
  const apply = fx.run(["apply", plan.id]);
  assert.equal(apply.status, 1, apply.stdout + apply.stderr);
  assert.match(apply.stderr, /^team-update: step 2 failed: \[claude\] Team is behind v/m);
  assert.match(apply.stderr, /^ {2}not run: \[codex\] Team's catalog is behind v/m);
  assert.deepEqual(versions(fx, "codex"), [`team@team-dev ${OLD_VERSION}`]);
});

test("usage faults exit 2", (t) => {
  const fx = fixture(t);
  assert.equal(fx.run().status, 2);
  assert.equal(fx.run(["apply", "not-an-id"]).status, 2);
  assert.equal(fx.run(["plan", "extra"]).status, 2);
});
