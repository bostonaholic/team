// Runs .claude/scripts/check-agents.mjs and .claude/hooks/check-registry-sync.mjs against synthetic agent trees.
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const CHECKER = resolve(".claude/scripts/check-agents.mjs");
const HOOK = resolve(".claude/hooks/check-registry-sync.mjs");
const REGISTRY = "skills/team/registry.json";
const RECOVERY =
  "Fix agents/*.md, skills/team/registry.json, and the reviewer table in .claude/scripts/check-agents.mjs together, then rerun: node .claude/scripts/check-agents.mjs";
const OK_FIVE = /^OK: 5 agents match skills\/team\/registry\.json, 5 reviewers hold only allowlisted tools\n?$/;
const COUNT_LAST = /(?:^|\n)check-agents: \d+ violation\(s\)\n?$/;

// The five reviewers of the design's reviewer table, each with its table phase and a model.
const REVIEWERS = [
  ["code-reviewer", "CODE REVIEW", "sonnet"],
  ["technical-writer", "CODE REVIEW", "sonnet"],
  ["ux-reviewer", "CODE REVIEW", "sonnet"],
  ["verifier", "CODE REVIEW", "haiku"],
  ["security-reviewer", "SECURITY REVIEW", "opus"],
];
const REVIEWER_ENTRIES = REVIEWERS.map(([name, phase]) => ({ name, phase }));

// The real seven-key frontmatter shape, one `key: value` line per key.
const BASE_LINES = Object.fromEntries(
  REVIEWERS.map(([name, , model]) => [
    name,
    {
      name: `name: ${name}`,
      description: `description: Reviews the change as ${name}.`,
      color: "color: yellow",
      model: `model: ${model}`,
      effort: "effort: high",
      tools: "tools: Read, Grep, Glob, Bash, TodoWrite, Agent, SendMessage",
      permissionMode: "permissionMode: plan",
    },
  ]),
);

const frontmatter = (lines, tail = "\n\nBody.\n") => `---\n${lines.join("\n")}\n---${tail}`;

// A base reviewer file with some lines replaced; a null drops the line, a new key appends one.
function reviewer(name, changes = {}, tail) {
  const lines = Object.values({ ...BASE_LINES[name], ...changes }).filter((line) => line !== null);
  return frontmatter(lines, tail);
}

const registry = (agents) => JSON.stringify({ agents }, null, 2);

function write(dir, rel, text) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
}

function remove(dir, rel) {
  rmSync(join(dir, rel), { recursive: true, force: true });
}

function writeConformingTree(dir) {
  write(dir, REGISTRY, registry(REVIEWER_ENTRIES));
  for (const [name] of REVIEWERS) write(dir, `agents/${name}.md`, reviewer(name));
}

function baseTree(t) {
  const dir = mkdtempSync(join(tmpdir(), "check-agents-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeConformingTree(dir);
  return dir;
}

const check = (args) => spawnSync(process.execPath, [CHECKER, ...args], { encoding: "utf8" });

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const anyDetail = (rule, path) => new RegExp(`^check-agents: ${rule}: ${escape(path)}: .+$`, "m");
const exactLine = (rule, path, detail) => new RegExp(`^check-agents: ${rule}: ${escape(path)}: ${escape(detail)}$`, "m");

// --- checker: conforming trees ------------------------------------------------

const CONFORMING = [
  { row: "five table reviewers", change: () => {} },
  {
    row: 'model: "opus"',
    change: (dir) => write(dir, "agents/security-reviewer.md", reviewer("security-reviewer", { model: 'model: "opus"' })),
  },
  {
    row: "model: 'opus'",
    change: (dir) => write(dir, "agents/security-reviewer.md", reviewer("security-reviewer", { model: "model: 'opus'" })),
  },
  {
    row: "CRLF line endings",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier").replaceAll("\n", "\r\n")),
  },
  {
    row: "closing --- on the last line with no trailing newline",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", {}, "")),
  },
  {
    row: "violating agents/.draft.md outside the glob",
    change: (dir) => write(dir, "agents/.draft.md", reviewer("verifier", { name: "name: draft", tools: "tools: Write" })),
  },
  {
    row: "violating agents/notes.txt outside the glob",
    change: (dir) => write(dir, "agents/notes.txt", "no frontmatter here\n"),
  },
  {
    row: "violating agents/sub/x.md outside the glob",
    change: (dir) => write(dir, "agents/sub/x.md", reviewer("verifier", { name: "name: y", tools: "tools: Write" })),
  },
];

for (const { row, change } of CONFORMING) {
  test(`check-agents passes a conforming agent tree: ${row}`, (t) => {
    const dir = baseTree(t);
    change(dir);
    const run = check(["--root", dir]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, OK_FIVE);
  });
}

// --- checker: violating trees -------------------------------------------------

const WRITE_VERIFIER = (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { tools: "tools: Read, Grep, Write" }));
const RETAG_VERIFIER = (dir) =>
  write(dir, REGISTRY, registry([...REVIEWER_ENTRIES.slice(0, 3), { name: "verifier", phase: "IMPLEMENT" }, REVIEWER_ENTRIES[4]]));
const SIXTH_REVIEWER = (dir, tools) => {
  write(dir, REGISTRY, registry([...REVIEWER_ENTRIES, { name: "summarizer", phase: "CODE REVIEW" }]));
  write(dir, "agents/summarizer.md", frontmatter(["name: summarizer", "description: Summarizes.", `tools: ${tools}`, "permissionMode: plan"]));
};
const PLAIN_AGENT = (name) => frontmatter([`name: ${name}`, "description: Does a producer job.", "model: opus", "tools: Read, Write"]);

const INVALID_TOOLS = [
  "Read, Write # report",
  '["Read", "Grep"]',
  "[Read, Grep]",
  '"Read, Grep"',
  ">-\n  Read, Grep",
  "null",
  "read",
  "Write(x)",
  "*",
  "Read, Grep,",
];

const VIOLATING = [
  // registry-json
  { row: "registry-json absent registry", change: (dir) => remove(dir, REGISTRY), line: anyDetail("registry-json", REGISTRY) },
  { row: "registry-json not JSON", change: (dir) => write(dir, REGISTRY, "{ not json"), line: anyDetail("registry-json", REGISTRY) },
  {
    row: "registry-json no agents array",
    change: (dir) => write(dir, REGISTRY, JSON.stringify({ phases: [] })),
    line: anyDetail("registry-json", REGISTRY),
  },
  {
    row: 'registry-json entry {"name": 5}',
    change: (dir) => write(dir, REGISTRY, registry([...REVIEWER_ENTRIES, { name: 5, phase: "PLAN" }])),
    line: anyDetail("registry-json", REGISTRY),
  },
  {
    row: "registry-json empty name",
    change: (dir) => write(dir, REGISTRY, registry([...REVIEWER_ENTRIES, { name: "", phase: "PLAN" }])),
    line: anyDetail("registry-json", REGISTRY),
  },
  {
    row: "registry-json repeated name",
    change: (dir) => write(dir, REGISTRY, registry([...REVIEWER_ENTRIES, { name: "verifier", phase: "CODE REVIEW" }])),
    line: anyDetail("registry-json", REGISTRY),
  },

  // agent-frontmatter
  {
    row: "agent-frontmatter byte-order mark",
    change: (dir) => write(dir, "agents/verifier.md", `\uFEFF${reviewer("verifier")}`),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter no closing ---",
    change: (dir) => write(dir, "agents/verifier.md", "---\nname: verifier\ntools: Read, Grep\npermissionMode: plan\n\nBody.\n"),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter blank line",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { color: "color: yellow\n" })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter comment line",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { color: "color: yellow\n# a comment" })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter indented line",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { color: "  color: yellow" })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter block-list tools:",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { tools: "tools:\n  - Read\n  - Grep" })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter plain-scalar continuation line",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { description: "description: Verifies the build\n  and the tests." })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter quoted key",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { color: '"color": yellow' })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter key : value",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { color: "color : yellow" })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter U+0085 in a value",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { description: "description: Verifies.\u0085tools: Write" })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter U+2028 in a value",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { description: "description: Verifies.\u2028tools: Write" })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter U+2029 in a value",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { description: "description: Verifies.\u2029tools: Write" })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter duplicate tools:",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { tools: "tools: Read, Grep\ntools: Read, Write" })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter lone \\r in tools: Read, Grep\\rWrite",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { tools: "tools: Read, Grep\rWrite" })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter absent name",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { name: null })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter name differs from the file stem",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { name: "name: checker" })),
    line: anyDetail("agent-frontmatter", "agents/verifier.md"),
  },
  {
    row: "agent-frontmatter unreadable file",
    change: (dir) => {
      write(dir, REGISTRY, registry([...REVIEWER_ENTRIES, { name: "x", phase: "PLAN" }]));
      mkdirSync(join(dir, "agents/x.md"));
    },
    line: anyDetail("agent-frontmatter", "agents/x.md"),
  },
  {
    row: "agent-frontmatter reserved scalar name: null",
    change: (dir) => {
      write(dir, REGISTRY, registry([...REVIEWER_ENTRIES, { name: "null", phase: "PLAN" }]));
      write(dir, "agents/null.md", PLAIN_AGENT("null"));
    },
    line: anyDetail("agent-frontmatter", "agents/null.md"),
  },
  {
    row: "agent-frontmatter name not kebab-case: Summarizer",
    change: (dir) => {
      write(dir, REGISTRY, registry([...REVIEWER_ENTRIES, { name: "Summarizer", phase: "PLAN" }]));
      write(dir, "agents/Summarizer.md", PLAIN_AGENT("Summarizer"));
    },
    line: anyDetail("agent-frontmatter", "agents/Summarizer.md"),
  },

  // registry-sync
  {
    row: "registry-sync agent file absent from the registry",
    change: (dir) => write(dir, "agents/planner.md", PLAIN_AGENT("planner")),
    line: anyDetail("registry-sync", "agents/planner.md"),
  },
  {
    row: "registry-sync registry name with no file",
    change: (dir) => write(dir, REGISTRY, registry([...REVIEWER_ENTRIES, { name: "planner", phase: "PLAN" }])),
    line: anyDetail("registry-sync", REGISTRY),
  },
  {
    row: "registry-sync no agents/ directory",
    change: (dir) => remove(dir, "agents"),
    line: anyDetail("registry-sync", REGISTRY),
  },

  // reviewer-set
  {
    row: "reviewer-set verifier retagged IMPLEMENT",
    change: RETAG_VERIFIER,
    line: exactLine(
      "reviewer-set",
      REGISTRY,
      "verifier has phase IMPLEMENT, but the reviewer table pins it to CODE REVIEW (skills/team-code-review/references/02-execution.md step 3)",
    ),
  },
  {
    row: "reviewer-set sixth agent tagged CODE REVIEW",
    change: (dir) => SIXTH_REVIEWER(dir, "Read, Grep"),
    line: anyDetail("reviewer-set", REGISTRY),
  },
  {
    row: "reviewer-set table reviewer with no registry entry",
    change: (dir) => {
      write(dir, REGISTRY, registry(REVIEWER_ENTRIES.filter((entry) => entry.name !== "verifier")));
      remove(dir, "agents/verifier.md");
    },
    line: anyDetail("reviewer-set", REGISTRY),
  },

  // reviewer-tools
  ...INVALID_TOOLS.map((value) => ({
    row: `reviewer-tools ${JSON.stringify(value)}`,
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { tools: `tools: ${value}` })),
    line: anyDetail("reviewer-tools", "agents/verifier.md"),
  })),
  {
    row: 'reviewer-tools "Read, WebFetch"',
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { tools: "tools: Read, WebFetch" })),
    line: exactLine(
      "reviewer-tools",
      "agents/verifier.md",
      'tools entry "WebFetch" is outside the reviewer allowlist Read, Grep, Glob, Bash, TodoWrite, Agent, SendMessage (AGENTS.md, checks and balances)',
    ),
  },
  {
    row: "reviewer-tools absent tools",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { tools: null })),
    line: anyDetail("reviewer-tools", "agents/verifier.md"),
  },
  {
    row: "reviewer-tools empty tools:",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { tools: "tools:" })),
    line: anyDetail("reviewer-tools", "agents/verifier.md"),
  },

  // reviewer-permission-mode
  {
    row: "reviewer-permission-mode absent permissionMode",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { permissionMode: null })),
    line: anyDetail("reviewer-permission-mode", "agents/verifier.md"),
  },
  {
    row: "reviewer-permission-mode permissionMode: acceptEdits",
    change: (dir) => write(dir, "agents/verifier.md", reviewer("verifier", { permissionMode: "permissionMode: acceptEdits" })),
    line: anyDetail("reviewer-permission-mode", "agents/verifier.md"),
  },

  // security-reviewer-model
  {
    row: "security-reviewer-model model: opus # pinned",
    change: (dir) => write(dir, "agents/security-reviewer.md", reviewer("security-reviewer", { model: "model: opus # pinned" })),
    line: anyDetail("security-reviewer-model", "agents/security-reviewer.md"),
  },
  {
    row: "security-reviewer-model model: !!str opus",
    change: (dir) => write(dir, "agents/security-reviewer.md", reviewer("security-reviewer", { model: "model: !!str opus" })),
    line: anyDetail("security-reviewer-model", "agents/security-reviewer.md"),
  },
  {
    row: "security-reviewer-model model: fable",
    change: (dir) => write(dir, "agents/security-reviewer.md", reviewer("security-reviewer", { model: "model: fable" })),
    line: exactLine(
      "security-reviewer-model",
      "agents/security-reviewer.md",
      "model is fable, but security-reviewer stays on opus (AGENTS.md, Agents (13))",
    ),
  },
  {
    row: "security-reviewer-model no model",
    change: (dir) => write(dir, "agents/security-reviewer.md", reviewer("security-reviewer", { model: null })),
    line: anyDetail("security-reviewer-model", "agents/security-reviewer.md"),
  },

  // rule unions: each named rule is its own row
  {
    row: "union retagged verifier with Write names reviewer-set",
    change: (dir) => {
      RETAG_VERIFIER(dir);
      WRITE_VERIFIER(dir);
    },
    line: anyDetail("reviewer-set", REGISTRY),
  },
  {
    row: "union retagged verifier with Write names reviewer-tools",
    change: (dir) => {
      RETAG_VERIFIER(dir);
      WRITE_VERIFIER(dir);
    },
    line: anyDetail("reviewer-tools", "agents/verifier.md"),
  },
  {
    row: "union sixth CODE REVIEW agent with Write names reviewer-set",
    change: (dir) => SIXTH_REVIEWER(dir, "Read, Write"),
    line: anyDetail("reviewer-set", REGISTRY),
  },
  {
    row: "union sixth CODE REVIEW agent with Write names reviewer-tools",
    change: (dir) => SIXTH_REVIEWER(dir, "Read, Write"),
    line: anyDetail("reviewer-tools", "agents/summarizer.md"),
  },
  {
    row: "union invalid registry plus Write on verifier names registry-json",
    change: (dir) => {
      write(dir, REGISTRY, "{ not json");
      WRITE_VERIFIER(dir);
    },
    line: anyDetail("registry-json", REGISTRY),
  },
  {
    row: "union invalid registry plus Write on verifier names reviewer-tools",
    change: (dir) => {
      write(dir, REGISTRY, "{ not json");
      WRITE_VERIFIER(dir);
    },
    line: anyDetail("reviewer-tools", "agents/verifier.md"),
  },
];

for (const { row, change, line } of VIOLATING) {
  test(`check-agents fails each violating tree with its rule and file: ${row}`, (t) => {
    const dir = baseTree(t);
    change(dir);
    const run = check(["--root", dir]);
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, line);
    assert.match(run.stderr, COUNT_LAST);
  });
}

test("check-agents fails each violating tree with its rule and file: reviewer-set empty tree prints five lines and no OK", (t) => {
  const dir = baseTree(t);
  write(dir, REGISTRY, registry([]));
  remove(dir, "agents");
  mkdirSync(join(dir, "agents"));
  const run = check(["--root", dir]);
  assert.equal(run.status, 1, run.stderr);
  assert.equal(run.stdout, "");
  assert.match(
    run.stderr,
    /^check-agents: reviewer-set: skills\/team\/registry\.json: .+\ncheck-agents: reviewer-set: skills\/team\/registry\.json: .+\ncheck-agents: reviewer-set: skills\/team\/registry\.json: .+\ncheck-agents: reviewer-set: skills\/team\/registry\.json: .+\ncheck-agents: reviewer-set: skills\/team\/registry\.json: .+\ncheck-agents: 5 violation\(s\)\n?$/,
  );
});

test("check-agents fails each violating tree with its rule and file: order is registry, then files by name, then rules by table", (t) => {
  const dir = baseTree(t);
  write(dir, REGISTRY, registry([...REVIEWER_ENTRIES, { name: "ghost", phase: "PLAN" }]));
  write(dir, "agents/verifier.md", reviewer("verifier", { tools: "tools: Read, Write", permissionMode: "permissionMode: acceptEdits" }));
  write(dir, "agents/security-reviewer.md", reviewer("security-reviewer", { model: "model: fable", tools: "tools: Read, Edit" }));
  const run = check(["--root", dir]);
  assert.equal(run.status, 1, run.stderr);
  assert.match(
    run.stderr,
    /^check-agents: registry-sync: skills\/team\/registry\.json: .+\ncheck-agents: reviewer-tools: agents\/security-reviewer\.md: .+\ncheck-agents: security-reviewer-model: agents\/security-reviewer\.md: .+\ncheck-agents: reviewer-tools: agents\/verifier\.md: .+\ncheck-agents: reviewer-permission-mode: agents\/verifier\.md: .+\ncheck-agents: 5 violation\(s\)\n?$/,
  );
});

// --- checker: bad command lines ---------------------------------------------

const BAD_ARGS = [
  { row: "unknown argument", args: () => ["--bogus"] },
  { row: "--root with no value", args: () => ["--root"] },
  { row: "--root given twice", args: (dir) => ["--root", dir, "--root", dir] },
  { row: "--root that is not a directory", args: (dir) => ["--root", join(dir, REGISTRY)] },
];

for (const { row, args } of BAD_ARGS) {
  test(`check-agents rejects a bad command line: ${row}`, (t) => {
    const dir = baseTree(t);
    const run = check(args(dir));
    assert.equal(run.status, 2, run.stderr);
    assert.equal(run.stdout, "");
    assert.match(run.stderr, /^check-agents: .+$/m);
    assert.match(run.stderr, /^usage: check-agents\.mjs \[--root <dir>\]$/m);
  });
}

// --- hook ---------------------------------------------------------------------

const VERIFIER_WITH_WRITE = reviewer("verifier", { tools: "tools: Read, Grep, Write" });
const edit = (filePath, toolName = "Edit") => JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath } });

// A committed scratch repository holding a conforming tree plus copies of the real hook and checker.
function hookRepo(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "check-registry-sync-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const gitconfig = join(root, "gitconfig");
  writeFileSync(gitconfig, "[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n");
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: "1",
    XDG_CONFIG_HOME: root,
    GIT_CEILING_DIRECTORIES: root, // keeps a parent repository from adopting a path outside the scratch repos
  };
  delete env.CLAUDE_PROJECT_DIR;
  const repo = join(root, "repo");
  mkdirSync(repo);
  const git = (...args) => {
    const run = spawnSync("git", args, { cwd: repo, env, encoding: "utf8" });
    assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
    return run.stdout.trim();
  };
  git("init", "-q");
  mkdirSync(join(repo, ".claude/hooks"), { recursive: true });
  copyFileSync(HOOK, join(repo, ".claude/hooks/check-registry-sync.mjs"));
  mkdirSync(join(repo, ".claude/scripts"), { recursive: true });
  copyFileSync(CHECKER, join(repo, ".claude/scripts/check-agents.mjs"));
  write(repo, "README.md", "# scratch\n");
  writeConformingTree(repo);
  git("add", ".");
  git("commit", "-q", "-m", "init");
  const hook = (input, extraEnv = {}) =>
    spawnSync(process.execPath, [join(repo, ".claude/hooks/check-registry-sync.mjs")], {
      input,
      env: { ...env, ...extraEnv },
      cwd: root,
      encoding: "utf8",
      timeout: 20000,
    });
  const stubGit = (script) => {
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "git"), script);
    chmodSync(join(bin, "git"), 0o755);
    return { PATH: `${bin}:${env.PATH}` };
  };
  return { root, repo, git, hook, stubGit };
}

const VIOLATING_EDITS = [
  {
    row: "Edit of agents/verifier.md holding Write",
    run: (r) => {
      write(r.repo, "agents/verifier.md", VERIFIER_WITH_WRITE);
      return r.hook(edit(join(r.repo, "agents/verifier.md")));
    },
  },
  {
    row: "file_path under a symlinked directory",
    run: (r) => {
      write(r.repo, "agents/verifier.md", VERIFIER_WITH_WRITE);
      symlinkSync(r.repo, join(r.root, "link"));
      return r.hook(edit(join(r.root, "link/agents/verifier.md")));
    },
  },
  {
    row: "Edit of skills/team/registry.json in the violating tree",
    run: (r) => {
      write(r.repo, "agents/verifier.md", VERIFIER_WITH_WRITE);
      return r.hook(edit(join(r.repo, REGISTRY)));
    },
  },
  {
    row: "linked worktree outside the repository, run by the main checkout's hook",
    run: (r) => {
      const wt = join(r.root, "wt");
      r.git("worktree", "add", "-q", "-b", "feat", wt);
      write(wt, "agents/verifier.md", VERIFIER_WITH_WRITE);
      write(wt, ".claude/scripts/check-agents.mjs", "process.exit(0);\n");
      return r.hook(edit(join(wt, "agents/verifier.md")));
    },
  },
];

for (const { row, run: act } of VIOLATING_EDITS) {
  test(`check-registry-sync exits 2 on a violating edit in this repository: ${row}`, (t) => {
    const run = act(hookRepo(t));
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^check-agents: reviewer-tools: agents\/verifier\.md: .+$/m);
    assert.match(run.stderr, new RegExp(`^${escape(RECOVERY)}$`, "m"));
  });
}

const OUTSIDE_JURISDICTION = [
  {
    row: "conforming tree",
    run: (r) => r.hook(edit(join(r.repo, "agents/verifier.md"))),
  },
  {
    row: "README.md in a violating tree",
    run: (r) => {
      write(r.repo, "agents/verifier.md", VERIFIER_WITH_WRITE);
      return r.hook(edit(join(r.repo, "README.md")));
    },
  },
  {
    row: "agents/sub/x.md in a violating tree",
    run: (r) => {
      write(r.repo, "agents/verifier.md", VERIFIER_WITH_WRITE);
      write(r.repo, "agents/sub/x.md", VERIFIER_WITH_WRITE);
      return r.hook(edit(join(r.repo, "agents/sub/x.md")));
    },
  },
  {
    row: "docs/agents/x.md in a violating tree",
    run: (r) => {
      write(r.repo, "agents/verifier.md", VERIFIER_WITH_WRITE);
      write(r.repo, "docs/agents/x.md", VERIFIER_WITH_WRITE);
      return r.hook(edit(join(r.repo, "docs/agents/x.md")));
    },
  },
  {
    row: "tool_name other than Write or Edit",
    run: (r) => {
      write(r.repo, "agents/verifier.md", VERIFIER_WITH_WRITE);
      return r.hook(edit(join(r.repo, "agents/verifier.md"), "Read"));
    },
  },
  {
    row: "unrelated repository whose agents/verifier.md holds Write, with no registry",
    run: (r) => {
      const other = join(r.root, "other");
      r.git("init", "-q", other);
      write(other, "agents/verifier.md", VERIFIER_WITH_WRITE);
      return r.hook(edit(join(other, "agents/verifier.md")));
    },
  },
  {
    row: "agent-shaped path outside any repository",
    run: (r) => {
      write(r.root, "loose/agents/verifier.md", VERIFIER_WITH_WRITE);
      return r.hook(edit(join(r.root, "loose/agents/verifier.md")));
    },
  },
  {
    row: "stdin that is not JSON",
    run: (r) => {
      write(r.repo, "agents/verifier.md", VERIFIER_WITH_WRITE);
      return r.hook("not json");
    },
  },
  {
    row: "PATH that holds no git",
    run: (r) => {
      write(r.repo, "agents/verifier.md", VERIFIER_WITH_WRITE);
      mkdirSync(join(r.root, "empty-bin"));
      return r.hook(edit(join(r.repo, "agents/verifier.md")), { PATH: join(r.root, "empty-bin") });
    },
  },
];

for (const { row, run: act } of OUTSIDE_JURISDICTION) {
  test(`check-registry-sync exits 0 silently outside its jurisdiction: ${row}`, (t) => {
    const run = act(hookRepo(t));
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "");
    assert.equal(run.stderr, "");
  });
}

const HOOK_FAULTS = [
  {
    row: "stub checker that exits 3",
    run: (r) => {
      write(r.repo, ".claude/scripts/check-agents.mjs", "process.exit(3);\n");
      return r.hook(edit(join(r.repo, "agents/verifier.md")));
    },
    message: /^check-registry-sync: check-agents did not run: .+$/m,
  },
  {
    row: "no checker beside the hook",
    run: (r) => {
      remove(r.repo, ".claude/scripts/check-agents.mjs");
      return r.hook(edit(join(r.repo, "agents/verifier.md")));
    },
    message: /^check-registry-sync: check-agents did not run: .+$/m,
  },
  {
    row: "stub git that sleeps past the timeout",
    run: (r) => r.hook(edit(join(r.repo, "agents/verifier.md")), r.stubGit("#!/bin/sh\nexec sleep 30\n")),
    message: /^check-registry-sync: git did not finish: .+$/m,
  },
  {
    row: "stub git that prints three lines",
    run: (r) => r.hook(edit(join(r.repo, "agents/verifier.md")), r.stubGit("#!/bin/sh\nprintf 'a\\nb\\nc\\n'\n")),
    message: /^check-registry-sync: git gave unexpected output$/m,
  },
];

for (const { row, run: act, message } of HOOK_FAULTS) {
  test(`check-registry-sync exits 2 when the checker or git fails: ${row}`, (t) => {
    const run = act(hookRepo(t));
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, message);
  });
}
