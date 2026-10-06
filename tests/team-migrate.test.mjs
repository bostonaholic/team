// Runs skills/team-migrate/scripts against a fake HOME seeded with a pre-v0.147.0
// setup, stubbed claude, codex, agy, and ps, and git remotes redirected to local
// fixture repositories. Every script runs under /bin/bash.
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

const SCRIPTS = resolve("skills/team-migrate/scripts");
const FAKE_CLI = resolve("tests/fixtures/team-migrate-cli.mjs");
const RELEASE_ENTRIES = [".claude-plugin", ".codex-plugin", ".agents", "plugin.json", "README.md", "skills", "agents", "opencode", "script"];
const TEAM_VERSION = JSON.parse(readFileSync(".claude-plugin/plugin.json", "utf8")).version;
const NEW_NAMES = [...readFileSync("README.md", "utf8").matchAll(/^\| `\/[a-z0-9-]+` \| `\/([a-z0-9-]+)` \|$/gm)].map((m) => m[1]);
const COLLECTION = [...NEW_NAMES.map((name) => `skills/engineering/${name}`), "skills/productivity/writing-prose"];
const COLLECTION_NAMES = COLLECTION.map((path) => path.split("/").pop());
const HOOK_MARKER = "# Managed by Team dev install.";

function sh(cwd, env, command, args) {
  const run = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  assert.equal(run.status, 0, `${command} ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeSkill(dir, name) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: test\n---\n`);
}

// A machine as Team's dev install left it before v0.147.0, plus the GitHub
// sources the migration installs from.
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "team-migrate-")));
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

  // GitHub: Team's release and the collection, each a tree plus a tagged bare repo.
  const publish = (repo, tag) => {
    const tree = join(trees, repo);
    git(tree, "init", "-q");
    git(tree, "add", ".");
    git(tree, "commit", "-q", "-m", "release");
    git(tree, "tag", tag);
    mkdirSync(join(root, "github", dirname(repo)), { recursive: true });
    git(root, "clone", "-q", "--bare", "--no-local", tree, join(root, "github", `${repo}.git`));
    return tree;
  };
  const teamTree = join(trees, "bostonaholic/team");
  for (const entry of RELEASE_ENTRIES) cpSync(entry, join(teamTree, entry), { recursive: true });
  publish("bostonaholic/team", `v${TEAM_VERSION}`);
  const skillsTree = join(trees, "bostonaholic/skills");
  writeJson(join(skillsTree, ".claude-plugin/marketplace.json"), { name: "skills", plugins: [{ name: "bostonaholic" }] });
  writeJson(join(skillsTree, ".claude-plugin/plugin.json"), {
    name: "bostonaholic",
    version: "0.10.0",
    skills: COLLECTION.map((path) => `./${path}`),
  });
  for (const path of COLLECTION) writeSkill(join(skillsTree, dirname(path)), path.split("/").pop());
  publish("bostonaholic/skills", "v0.10.0");

  // The developer's checkout, at an old version with old skill names and the pull hooks.
  const dev = join(root, "dev/team");
  git(root, "clone", "-q", join(root, "github/bostonaholic/team.git"), dev);
  for (const manifest of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", "plugin.json"]) {
    const path = join(dev, manifest);
    writeJson(path, { ...JSON.parse(readFileSync(path, "utf8")), version: "0.146.0" });
  }
  for (const name of ["shipit", "how"]) writeSkill(join(dev, "skills"), name);
  git(dev, "add", ".");
  git(dev, "commit", "-q", "-m", "0.146.0");
  for (const hook of ["post-merge", "post-rewrite"]) {
    cpSync(join(dev, "script/dev-install-pull-hook"), join(dev, ".git/hooks", hook));
  }

  // What `script/dev-install` registered in each harness.
  writeJson(env.FAKE_STATE, {
    claude: {
      markets: {
        "team-dev": { source: "directory", path: dev },
        bostonaholic: { source: "directory", path: join(root, "deleted-collection") },
      },
      plugins: [{ id: "team@team-dev", version: "0.146.0" }, { id: "bostonaholic-skills@bostonaholic", version: "0.4.0" }],
    },
    codex: {
      markets: { "team-dev": { sourceType: "local", source: dev, root: dev, path: dev } },
      plugins: [{ id: "team@team-dev", version: "0.146.0" }],
    },
  });
  mkdirSync(join(home, ".gemini/config/plugins"), { recursive: true });
  symlinkSync(dev, join(home, ".gemini/config/plugins/team"));
  mkdirSync(join(home, ".config/opencode/plugins"), { recursive: true });
  symlinkSync(join(dev, "opencode/team.js"), join(home, ".config/opencode/plugins/team.js"));
  const cursorTeam = join(home, ".cursor/plugins/local/team");
  writeJson(join(cursorTeam, ".cursor-plugin/plugin.json"), { name: "team", version: "0.146.0" });
  writeFileSync(join(cursorTeam, ".team-dev-install"), `${dev}\n`);

  // Old copies wherever an agent loads bare skills, among entries that stay, and
  // one collection skill npx installed the default way: a copy in the shared
  // directory and a link to it in an agent's own.
  writeSkill(join(home, ".agents/skills"), "landing-prs");
  writeSkill(join(home, ".agents/skills"), "shipit");
  writeSkill(join(home, ".agents/skills"), "reviewing-code");
  writeSkill(join(home, ".agents/skills"), "humanizer");
  symlinkSync(join(dev, "skills"), join(home, ".agents/skills/team"));
  writeSkill(join(home, ".codex/skills"), "how");
  writeSkill(join(home, ".codex/skills"), "my-own");
  writeSkill(join(home, ".codex/skills/.system"), "builtin");
  writeSkill(join(home, ".claude/skills"), "why");
  mkdirSync(join(home, ".cursor/skills"), { recursive: true });
  symlinkSync(join(home, ".agents/skills/prove"), join(home, ".cursor/skills/prove"));
  symlinkSync(join(home, ".agents/skills/landing-prs"), join(home, ".cursor/skills/landing-prs"));
  writeSkill(join(home, ".cursor/skills"), "find-skills");

  const run = (script, args = [], extra = {}, scripts = SCRIPTS) =>
    spawnSync("/bin/bash", [join(scripts, script), ...args], { cwd: root, env: { ...env, ...extra }, encoding: "utf8" });
  const state = () => JSON.parse(readFileSync(env.FAKE_STATE, "utf8"));
  const setState = (change) => writeJson(env.FAKE_STATE, change(state()));
  const calls = () => readFileSync(env.FAKE_LOG, "utf8").trim().split("\n").filter(Boolean);
  const release = join(home, ".local/share/team-migrate/team");
  return { root, home, dev, env, git, run, state, setState, calls, release };
}

function planOf(fx, scripts) {
  const plan = fx.run("migrate.sh", ["plan"], {}, scripts);
  const id = /^Plan id: ([0-9a-f]{40})$/m.exec(plan.stdout)?.[1];
  return { ...plan, id };
}

function migrate(fx, scripts) {
  const plan = planOf(fx, scripts);
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
  const apply = fx.run("migrate.sh", ["apply", plan.id], {}, scripts);
  assert.equal(apply.status, 0, apply.stdout + apply.stderr);
  return { plan, apply };
}

// Every path under the given roots, with its type, link target, and content hash.
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

const machine = (fx) => snapshot(fx.home, join(fx.dev, ".git/hooks"), fx.env.FAKE_STATE);
const entries = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []);

test("one run moves every harness off the dev checkout and onto the releases", (t) => {
  const fx = fixture(t);
  const { plan } = migrate(fx);
  assert.match(plan.stdout, /Harnesses on this machine: claude codex antigravity opencode cursor/);

  const { claude, codex } = fx.state();
  assert.deepEqual(claude.markets["team-dev"], { source: "github", repo: "bostonaholic/team" });
  assert.deepEqual(claude.markets.skills, { source: "github", repo: "bostonaholic/skills" });
  assert.equal(claude.markets.bostonaholic, undefined);
  assert.deepEqual(claude.plugins.map((p) => `${p.id} ${p.version}`).sort(), [`bostonaholic@skills 0.10.0`, `team@team-dev ${TEAM_VERSION}`]);
  assert.equal(codex.markets["team-dev"].source, "https://github.com/bostonaholic/team.git");
  assert.equal(codex.markets.skills.source, "https://github.com/bostonaholic/skills.git");
  assert.deepEqual(codex.plugins.map((p) => `${p.id} ${p.version}`).sort(), [`bostonaholic@skills 0.10.0`, `team@team-dev ${TEAM_VERSION}`]);

  const agyTeam = join(fx.home, ".gemini/config/plugins/team");
  assert.ok(lstatSync(agyTeam).isDirectory(), "Antigravity holds a copy, not a link");
  assert.equal(JSON.parse(readFileSync(join(agyTeam, "plugin.json"), "utf8")).version, TEAM_VERSION);
  assert.equal(readlinkSync(join(fx.home, ".config/opencode/plugins/team.js")), join(realpathSync(fx.release), "opencode/team.js"));
  assert.equal(readFileSync(join(fx.home, ".cursor/plugins/local/team/.team-dev-install"), "utf8").trim(), fx.release);
  assert.equal(fx.git(fx.release, "describe", "--tags", "--exact-match", "HEAD"), `v${TEAM_VERSION}`);
  assert.equal(fx.git(fx.release, "status", "--porcelain"), "");
  for (const dir of [".gemini/antigravity-cli/skills", ".config/opencode/skills", ".cursor/skills"]) {
    for (const name of COLLECTION_NAMES) assert.ok(lstatSync(join(fx.home, dir, name)).isDirectory(), `${dir}/${name}`);
  }
  for (const dir of [".agents/skills", ".claude/skills", ".codex/skills"]) {
    assert.deepEqual(entries(join(fx.home, dir)).filter((name) => COLLECTION_NAMES.includes(name)), [], `no collection copy in ${dir}`);
  }

  const verify = fx.run("verify.sh");
  assert.equal(verify.status, 0, verify.stdout + verify.stderr);
  assert.doesNotMatch(verify.stdout, /^FAIL /m);
  assert.match(verify.stdout, /^left .*\/\.agents\/skills-retired: 4 retired copies/m);
});

test("the dev uninstall runs before Team's native install and removes the reinstall hooks", (t) => {
  const fx = fixture(t);
  migrate(fx);
  const calls = fx.calls();
  const devUninstall = calls.indexOf("claude plugin uninstall team@team-dev");
  const nativeAdd = calls.indexOf("claude plugin marketplace add bostonaholic/team");
  assert.ok(devUninstall >= 0 && nativeAdd > devUninstall, calls.join("\n"));
  assert.ok(calls.indexOf("claude plugin install bostonaholic@skills --scope user") < devUninstall, "moved skills install before Team leaves");
  for (const hook of ["post-merge", "post-rewrite"]) assert.ok(!existsSync(join(fx.dev, ".git/hooks", hook)), hook);
  for (const hook of ["post-merge", "post-rewrite"]) assert.ok(!existsSync(join(fx.release, ".git/hooks", hook)), `release ${hook}`);
  const hooks = fx.git(fx.dev, "rev-parse", "--git-common-dir");
  assert.ok(!readdirSync(join(fx.dev, hooks, "hooks")).some((name) => {
    const path = join(fx.dev, hooks, "hooks", name);
    return lstatSync(path).isFile() && readFileSync(path, "utf8").split("\n").includes(HOOK_MARKER);
  }));
});

test("an install the dev checkout is too old to remove goes through the release clone's uninstall", (t) => {
  const fx = fixture(t);
  rmSync(join(fx.dev, "script/dev-uninstall-cursor"));
  const script = join(fx.dev, "script/dev-uninstall");
  writeFileSync(script, readFileSync(script, "utf8").replace("HARNESSES=(claude codex antigravity cursor opencode)", "HARNESSES=(claude codex antigravity opencode)"));
  fx.git(fx.dev, "commit", "-q", "-am", "no cursor target yet");
  const { plan } = migrate(fx);
  assert.match(plan.stdout, /\/team-migrate\/team\/script\/dev-uninstall-cursor$/m);
  assert.equal(readFileSync(join(fx.home, ".cursor/plugins/local/team/.team-dev-install"), "utf8").trim(), fx.release);
});

test("stale registrations are removed and nothing else is planned on a migrated machine", (t) => {
  const fx = fixture(t);
  migrate(fx);
  const state = fx.state();
  state.claude.markets.bostonaholic = { source: "directory", path: join(fx.root, "deleted-collection") };
  state.claude.plugins.push({ id: "bostonaholic-skills@bostonaholic", version: "0.4.0" });
  writeJson(fx.env.FAKE_STATE, state);

  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stderr);
  const steps = plan.stdout.match(/^ {5}\$ .*$/gm);
  assert.deepEqual(steps, [
    "     $ claude plugin uninstall bostonaholic-skills@bostonaholic --scope user",
    "     $ claude plugin marketplace remove bostonaholic",
  ]);
  const apply = fx.run("migrate.sh", ["apply", plan.id]);
  assert.equal(apply.status, 0, apply.stderr);
  assert.equal(fx.state().claude.markets.bostonaholic, undefined);
  assert.ok(!fx.state().claude.plugins.some((p) => p.id.endsWith("@bostonaholic")));
});

test("old and doubled copies move to a -retired sibling in every skill directory, dangling links included", (t) => {
  const fx = fixture(t);
  migrate(fx);
  const home = fx.home;
  assert.deepEqual(entries(join(home, ".agents/skills")), ["humanizer"]);
  assert.deepEqual(entries(join(home, ".agents/skills-retired")), ["landing-prs", "reviewing-code", "shipit", "team"]);
  assert.ok(lstatSync(join(home, ".agents/skills-retired/team")).isSymbolicLink());
  assert.deepEqual(readdirSync(join(home, ".codex/skills")).sort(), [".system", "my-own"]);
  assert.deepEqual(entries(join(home, ".codex/skills-retired")), ["how"]);
  assert.deepEqual(entries(join(home, ".claude/skills-retired")), ["why"]);
  assert.deepEqual(entries(join(home, ".cursor/skills-retired")), ["landing-prs", "prove"]);
  assert.ok(lstatSync(join(home, ".cursor/skills-retired/prove")).isSymbolicLink(), "the dangling link moved as a link");
  assert.ok(existsSync(join(home, ".cursor/skills/find-skills")));
  assert.ok(lstatSync(join(home, ".cursor/skills/landing-prs")).isDirectory(), "a copy replaced the link to the shared directory");
});

test("an existing retired copy blocks the whole plan and is never overwritten", (t) => {
  const fx = fixture(t);
  writeSkill(join(fx.home, ".agents/skills-retired"), "shipit");
  const before = machine(fx);
  const plan = planOf(fx);
  assert.equal(plan.status, 4, plan.stdout);
  assert.match(plan.stdout, /skills-retired\/shipit already exists/);
  const apply = fx.run("migrate.sh", ["apply", plan.id]);
  assert.equal(apply.status, 4, apply.stdout);
  assert.equal(machine(fx), before);
});

test("a second run plans nothing and changes nothing", (t) => {
  const fx = fixture(t);
  migrate(fx);
  const before = machine(fx);
  const plan = planOf(fx);
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /^Nothing to do\.$/m);
  const apply = fx.run("migrate.sh", ["apply", plan.id]);
  assert.equal(apply.status, 0, apply.stderr);
  assert.match(apply.stdout, /^Nothing to do\.$/m);
  assert.equal(machine(fx), before);
});

test("a dry run prints every command and changes nothing", (t) => {
  const fx = fixture(t);
  const before = machine(fx);
  const plan = planOf(fx);
  const dry = fx.run("migrate.sh", ["apply", plan.id], { DRY_RUN: "true" });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /\[dry run\] .*\/script\/dev-uninstall$/m);
  assert.match(dry.stdout, /\[dry run\] mv .*\/\.agents\/skills\/shipit /m);
  assert.equal(machine(fx), before);
  assert.ok(!existsSync(fx.release));
});

test("apply refuses a plan id the machine no longer matches", (t) => {
  const fx = fixture(t);
  const plan = planOf(fx);
  writeSkill(join(fx.home, ".agents/skills"), "retro");
  const before = machine(fx);
  const apply = fx.run("migrate.sh", ["apply", plan.id]);
  assert.equal(apply.status, 3, apply.stdout + apply.stderr);
  assert.equal(machine(fx), before);
});

test("usage faults exit 2", (t) => {
  const fx = fixture(t);
  assert.equal(fx.run("migrate.sh").status, 2);
  assert.equal(fx.run("migrate.sh", ["apply", "not-an-id"]).status, 2);
  assert.equal(fx.run("verify.sh", ["extra"]).status, 2);
});

test("apply runs from its own copy, so verify survives a dev uninstall that removes the skill's plugin directory", (t) => {
  const fx = fixture(t);
  const cache = join(fx.home, ".claude/plugins/cache/team-dev/team/0.146.0");
  for (const entry of ["README.md", "skills"]) cpSync(entry, join(cache, entry), { recursive: true });
  const { apply } = migrate(fx, join(cache, "skills/team-migrate/scripts"));
  assert.ok(!existsSync(cache), "the dev uninstall removed the plugin directory the skill started from");
  const copy = join(fx.home, ".local/share/team-migrate/run/skills/team-migrate/scripts");
  assert.match(apply.stdout, new RegExp(`Verify with ${copy}/verify\\.sh`));
  const verify = fx.run("verify.sh", [], {}, copy);
  assert.equal(verify.status, 0, verify.stdout + verify.stderr);
});

test("verify fails when a harness lost a plugin or shows an unprefixed copy", (t) => {
  const fx = fixture(t);
  migrate(fx);
  fx.setState((state) => ({ ...state, claude: { ...state.claude, plugins: state.claude.plugins.filter((p) => p.id !== "team@team-dev") } }));
  writeSkill(join(fx.home, ".codex/skills"), "landing-prs");
  const verify = fx.run("verify.sh");
  assert.equal(verify.status, 1, verify.stdout);
  assert.match(verify.stdout, /^FAIL claude: team@team-dev installed \(missing\)$/m);
  assert.match(verify.stdout, /^FAIL codex: the model sees an unprefixed landing-prs$/m);
  assert.match(verify.stdout, /^FAIL .*still planned: copies show twice or under an old name: landing-prs/m);
});

test("a failed step stops the run, names the steps not run, and a later run plans only those", (t) => {
  const fx = fixture(t);
  fx.setState((state) => ({ ...state, failOn: "claude plugin marketplace add bostonaholic/team" }));
  const plan = planOf(fx);
  const apply = fx.run("migrate.sh", ["apply", plan.id]);
  assert.equal(apply.status, 1, apply.stdout + apply.stderr);
  assert.match(apply.stderr, /^team-migrate: step \d+ failed: \[claude\] no GitHub marketplace for Team$/m);
  assert.match(apply.stderr, /^ {2}not run: \[cursor\] Team is not installed from the release clone$/m);
  fx.setState((state) => ({ ...state, failOn: undefined }));
  const rest = planOf(fx);
  assert.match(rest.stdout, /Harnesses on this machine: claude codex antigravity opencode cursor/);
  assert.doesNotMatch(rest.stdout, /^ {5}\$ .*(dev-uninstall$|mv -n|bostonaholic\/skills)/m);
  assert.match(rest.stdout, /^ {5}\$ claude plugin marketplace add bostonaholic\/team$/m);
  migrate(fx);
  assert.equal(fx.run("verify.sh").status, 0);
});

test("each blocker stops the plan and names its remedy", (t) => {
  const fx = fixture(t);
  rmSync(join(fx.home, ".cursor/plugins/local/team/.team-dev-install"));
  mkdirSync(fx.release, { recursive: true });
  fx.setState((state) => ({
    ...state,
    claude: { ...state.claude, plugins: [...state.claude.plugins, { id: "old@bostonaholic", version: "0.1.0", scope: "project" }] },
    codex: { ...state.codex, markets: { ...state.codex.markets, gone: { sourceType: "local", source: "/nowhere", root: "/nowhere" } } },
  }));
  const before = machine(fx);
  const plan = planOf(fx);
  assert.equal(plan.status, 4, plan.stdout + plan.stderr);
  assert.match(plan.stdout, /local\/team was not made by Team's install; move it aside/);
  assert.match(plan.stdout, /team-migrate\/team is not a clean clone of https:\/\/github\.com\/bostonaholic\/team\.git/);
  assert.match(plan.stdout, /stale plugin old@bostonaholic is installed at project scope; run claude plugin uninstall/);
  assert.match(plan.stdout, /codex: cannot list plugins: .*codex plugin marketplace remove <name>/);
  assert.equal(fx.run("migrate.sh", ["apply", plan.id]).status, 4);
  assert.equal(machine(fx), before);
});

test("a native Antigravity copy is uninstalled before the dev uninstall and replaced from the release", (t) => {
  const fx = fixture(t);
  const agyTeam = join(fx.home, ".gemini/config/plugins/team");
  rmSync(agyTeam);
  cpSync(join(fx.dev, "plugin.json"), join(agyTeam, "plugin.json"));
  const { plan } = migrate(fx);
  const commands = plan.stdout.match(/^ {5}\$ .*$/gm);
  const agyUninstall = commands.findIndex((line) => line.endsWith("$ agy plugin uninstall team"));
  const devUninstall = commands.findIndex((line) => line.endsWith("/script/dev-uninstall"));
  assert.ok(agyUninstall >= 0 && agyUninstall < devUninstall, commands.join("\n"));
  assert.equal(JSON.parse(readFileSync(join(agyTeam, "plugin.json"), "utf8")).version, TEAM_VERSION);
});

test("an unreachable GitHub stops the plan with a message, not a silent exit", (t) => {
  const fx = fixture(t);
  rmSync(join(fx.root, "github"), { recursive: true });
  const plan = planOf(fx);
  assert.equal(plan.status, 1, plan.stdout + plan.stderr);
  assert.match(plan.stderr, /^team-migrate: cannot read Team's release tags from https:\/\/github\.com\/bostonaholic\/team\.git$/m);
});
