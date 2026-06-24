// tests/static-gate.test.ts
//
// Gate tier: structural validation of every fixture and rubric on disk.
// Free, deterministic, no model calls. Replaces the bash gate from the
// previous harness iteration.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { loadFixture } from "./helpers/fixtures";
import { E2E_TOUCHFILES } from "./helpers/touchfiles";

const FIXTURE_ROOT = join(process.cwd(), "evals", "fixtures");
const RUBRIC_ROOT = join(process.cwd(), "evals", "rubrics");
const TESTS_ROOT = join(process.cwd(), "tests");
const PACKAGE_JSON = join(process.cwd(), "package.json");
const EVALS_WORKFLOW = join(
  process.cwd(),
  ".github",
  "workflows",
  "behavioral-evals.yml",
);
const HARNESS_WORKFLOW = join(
  process.cwd(),
  ".github",
  "workflows",
  "harness-checks.yml",
);
const PR_EVALS_WORKFLOW = join(
  process.cwd(),
  ".github",
  "workflows",
  "evals.yml",
);
const FIXTURE_SIZE_CAP = 50 * 1024;

// Canonical trust expression — the cross-workflow contract from
// docs/plans/2026-06-09-gate-llm-ci-jobs-on-pr-author/structure.md.
// Every job/step that consumes a secret or spawns `claude` on a
// pull_request event applies this expression VERBATIM, which is what lets
// the tripwires below match it as a plain substring.
const TRUST_EXPR = `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.pull_request.author_association)`;

function enumerate(): { agent: string; caseName: string }[] {
  if (!existsSync(FIXTURE_ROOT)) return [];
  const out: { agent: string; caseName: string }[] = [];
  for (const agentEnt of readdirSync(FIXTURE_ROOT, { withFileTypes: true })) {
    if (!agentEnt.isDirectory()) continue;
    const agentDir = join(FIXTURE_ROOT, agentEnt.name);
    for (const caseEnt of readdirSync(agentDir, { withFileTypes: true })) {
      if (!caseEnt.isDirectory()) continue;
      out.push({ agent: agentEnt.name, caseName: caseEnt.name });
    }
  }
  return out;
}

describe("static gate: fixtures", () => {
  const cases = enumerate();

  test("at least one fixture exists", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const { agent, caseName } of cases) {
    test(`${agent}/${caseName}: frontmatter + ground-truth load`, () => {
      const fx = loadFixture(agent, caseName, FIXTURE_ROOT);
      expect(fx.frontmatter.agent).toBe(agent);
      expect(["gate", "periodic"]).toContain(fx.frontmatter.tier);
      expect(Array.isArray(fx.frontmatter.deps)).toBe(true);
      expect(fx.groundTruth.bugs.length).toBeGreaterThan(0);
      expect(typeof fx.groundTruth.minimum_detection).toBe("number");
    });

    test(`${agent}/${caseName}: fixture size <= 50 KB`, () => {
      const inputPath = join(FIXTURE_ROOT, agent, caseName, "input.md");
      const size = statSync(inputPath).size;
      expect(size).toBeLessThanOrEqual(FIXTURE_SIZE_CAP);
    });
  }

  test("every fixture has a matching rubric", () => {
    const agents = new Set(cases.map((c) => c.agent));
    for (const agent of agents) {
      const rubric = join(RUBRIC_ROOT, `${agent}.md`);
      expect(existsSync(rubric)).toBe(true);
    }
  });

  test("every fixture/rubric pair is listed in E2E_TOUCHFILES", () => {
    const globs = Object.values(E2E_TOUCHFILES).flat();
    for (const { agent, caseName } of cases) {
      expect(globs).toContain(`evals/fixtures/${agent}/${caseName}/**`);
      expect(globs).toContain(`evals/rubrics/${agent}.md`);
      expect(globs).toContain(`tests/${agent}.evals.ts`);
    }
  });
});

// The behavioral-evals workflow spawns the `claude` CLI live
// (tests/helpers/session-runner.ts). A scheduled run is the only place this
// fires, so a missing CLI install or missing agent credentials surfaces only
// once a week, in CI, with no PR signal. These guards keep that contract
// visible in the free gate that runs on every PR.
describe("static gate: behavioral-evals workflow", () => {
  const workflow = existsSync(EVALS_WORKFLOW)
    ? readFileSync(EVALS_WORKFLOW, "utf8")
    : "";

  test("workflow file exists", () => {
    expect(existsSync(EVALS_WORKFLOW)).toBe(true);
  });

  test("installs the Claude Code CLI before spawning the agent", () => {
    // The live suite calls spawn("claude", ...); without this install the
    // step dies with `ENOENT: claude not in $PATH`.
    expect(workflow).toContain("@anthropic-ai/claude-code");
  });

  test("exposes ANTHROPIC_API_KEY so the spawned agent can authenticate", () => {
    // EVALS_ANTHROPIC_API_KEY is namespaced for the judge only; the agent
    // under test needs its own credential or it fails auth on every run.
    // Anchor to the bare key at line start so the existing namespaced
    // EVALS_ANTHROPIC_API_KEY: entry does not satisfy this on its own.
    expect(/^\s*ANTHROPIC_API_KEY:/m.test(workflow)).toBe(true);
  });

  test("scheduled workflow includes every eval file", () => {
    const evalFiles = readdirSync(TESTS_ROOT)
      .filter((name) => name.endsWith(".evals.ts"))
      .sort();
    for (const file of evalFiles) {
      expect(workflow).toContain(`./tests/${file}`);
    }
  });
});

describe("static gate: package eval commands", () => {
  const pkg = existsSync(PACKAGE_JSON)
    ? JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
        scripts?: Record<string, string>;
      }
    : {};
  const scripts = pkg.scripts ?? {};

  test("default paid eval command stays diff-selected", () => {
    expect(scripts["test:evals"]).toContain("./tests/*.evals.ts");
    expect(scripts["test:evals"]).not.toContain("EVALS_ALL=1");
  });

  test("full paid eval command is explicit", () => {
    expect(scripts["test:evals:all"]).toContain("EVALS_ALL=1");
    expect(scripts["test:evals:all"]).toContain("./tests/*.evals.ts");
  });
});

// Token-consuming CI must never run for an untrusted PR author (issue #51):
// a fork PR from CONTRIBUTOR / FIRST_TIME_CONTRIBUTOR / NONE (Dependabot is
// CONTRIBUTOR) must skip every job/step that consumes a secret or spawns
// `claude`. Scheduled and workflow_dispatch runs carry no pull_request
// context, so the gate is applied event-aware and leaves them unaffected.
describe("static gate: author gate", () => {
  const harnessWorkflow = existsSync(HARNESS_WORKFLOW)
    ? readFileSync(HARNESS_WORKFLOW, "utf8")
    : "";
  const evalsWorkflow = existsSync(EVALS_WORKFLOW)
    ? readFileSync(EVALS_WORKFLOW, "utf8")
    : "";

  test("trust expression documented as the contract at the future paid seam in harness-checks.yml", () => {
    // harness-checks.yml is the PR-triggered workflow where paid execution
    // attaches next (#32's mocked gate-eval step). Today the canonical trust
    // expression lives ONLY inside the contract comment block on the
    // harness-checks job — NOT as a live `if:`. The free `bun test` job stays
    // ungated by design (fork authors keep free CI). When a paid step attaches
    // here it inherits this documented contract as its live `if:`. This
    // tripwire pins the contract text so the comment can't be deleted.
    expect(harnessWorkflow).toContain(TRUST_EXPR);
  });

  // Pull the actual allowlist literal out of a workflow file (not this test's
  // own constant) so drift in a live `if:` or contract comment trips the gate.
  const allowlistRe =
    /fromJSON\('(\[[^\]]+\])'\), github\.event\.pull_request\.author_association/;
  function extractAllowlist(workflow: string): string[] | null {
    const m = workflow.match(allowlistRe);
    if (m === null) return null;
    return JSON.parse(m[1] ?? "[]") as string[];
  }

  test("untrusted authors excluded", () => {
    // Assert each workflow's allowlist independently — no loop, so a failure
    // names exactly which workflow drifted.
    const harnessAllowlist = extractAllowlist(harnessWorkflow);
    expect(harnessAllowlist).not.toBeNull();
    expect(harnessAllowlist).not.toContain("CONTRIBUTOR");
    expect(harnessAllowlist).not.toContain("FIRST_TIME_CONTRIBUTOR");
    expect(harnessAllowlist).not.toContain("NONE");

    const evalsAllowlist = extractAllowlist(evalsWorkflow);
    expect(evalsAllowlist).not.toBeNull();
    expect(evalsAllowlist).not.toContain("CONTRIBUTOR");
    expect(evalsAllowlist).not.toContain("FIRST_TIME_CONTRIBUTOR");
    expect(evalsAllowlist).not.toContain("NONE");
  });

  test("canonical trust expression present in behavioral-evals.yml", () => {
    // behavioral-evals.yml is the only workflow that consumes
    // EVALS_ANTHROPIC_API_KEY today; the canonical trust expression must
    // appear verbatim so the gate reads identically across token jobs.
    // Asserts on substring presence, not job/matrix shape, so it tolerates
    // either #47's static matrix or #32's dynamic discover matrix.
    expect(evalsWorkflow).toContain(TRUST_EXPR);
  });

  test("trust expression wired as a live `if:` on behavioral-evals.yml's token job", () => {
    // Unlike harness-checks.yml's documented-only contract, behavioral-evals'
    // secret-consuming job carries the trust expression as a live `if:`
    // condition (not just a comment), so a future pull_request trigger cannot
    // spend tokens for untrusted authors.
    expect(/^\s*if:.*author_association/m.test(evalsWorkflow)).toBe(true);
  });
});

// Backstop layer: even if a YAML gate is bypassed, the secret itself is
// scoped to the protected `evals` GitHub environment, and the
// `pull_request_target` exfiltration vector is hard-banned (design
// Decisions 1 and 5).
describe("static gate: evals environment backstop", () => {
  const harnessWorkflow = existsSync(HARNESS_WORKFLOW)
    ? readFileSync(HARNESS_WORKFLOW, "utf8")
    : "";
  const evalsWorkflow = existsSync(EVALS_WORKFLOW)
    ? readFileSync(EVALS_WORKFLOW, "utf8")
    : "";

  test("evals environment declared on the token job", () => {
    // The token job must declare `environment: evals` so the secret is
    // reachable only inside the protected environment — fails closed
    // (secret simply unavailable) if the environment is missing.
    expect(/^\s*environment:\s*evals\s*$/m.test(evalsWorkflow)).toBe(true);
  });

  test("pull_request_target ban stated as a workflow comment", () => {
    // The hard ban must be stated in the workflow: token/secret-consuming
    // jobs MUST NOT trigger on pull_request_target (base-repo context with
    // secrets — exfiltration vector). Anchor on the ban phrasing plus a
    // comment line so an incidental mention can't satisfy this.
    expect(evalsWorkflow).toContain("MUST NOT trigger on");
    expect(/^\s*#.*pull_request_target/m.test(evalsWorkflow)).toBe(true);
  });

  test("no pull_request_target token trigger", () => {
    // The forbidden form is a live trigger key under `on:`; a comment
    // mention (the ban itself) is allowed. Forbidden-pattern tripwire:
    // already satisfied today, exists to fail the build if the trigger
    // ever appears.
    expect(/^\s*pull_request_target:/m.test(evalsWorkflow)).toBe(false);
    expect(/^\s*pull_request_target:/m.test(harnessWorkflow)).toBe(false);
  });

  test("behavioral-evals stays off pull_request triggers until the gate is deliberately activated", () => {
    // The author gate's `if:` is dormant today: behavioral-evals.yml triggers
    // only on schedule + workflow_dispatch, so no untrusted author can reach
    // the token job. Adding a live `pull_request:` trigger would activate that
    // gate — and its sufficiency (does the allowlist cover every author state
    // we care about? is checkout safe?) must be reviewed deliberately, not
    // slipped in. This forbidden-key tripwire fails the free gate the moment a
    // live `pull_request:` trigger appears, forcing that review. A comment
    // mention (which is indented under `#`) does not match the bare-key regex.
    expect(/^\s*pull_request:/m.test(evalsWorkflow)).toBe(false);
  });
});

// The PR evals workflow (evals.yml) runs diff-selected evals on pull requests
// and upserts a `## PR Evals` comment. These guards lock the contracts that, if
// broken, would silently stop evals running or stop the comment posting — and
// would otherwise only surface live in CI on a real PR.
describe("static gate: PR evals workflow", () => {
  const workflow = existsSync(PR_EVALS_WORKFLOW)
    ? readFileSync(PR_EVALS_WORKFLOW, "utf8")
    : "";
  const reportScript = existsSync(join(process.cwd(), "scripts", "eval-report.ts"))
    ? readFileSync(join(process.cwd(), "scripts", "eval-report.ts"), "utf8")
    : "";

  test("workflow file exists", () => {
    expect(existsSync(PR_EVALS_WORKFLOW)).toBe(true);
  });

  test("triggers on pull_request", () => {
    expect(/^on:\s*$/m.test(workflow)).toBe(true);
    expect(workflow).toContain("pull_request:");
  });

  test("installs the Claude Code CLI before spawning the agent", () => {
    expect(workflow).toContain("@anthropic-ai/claude-code");
  });

  test("exposes ANTHROPIC_API_KEY so the spawned agent can authenticate", () => {
    expect(/^\s*ANTHROPIC_API_KEY:/m.test(workflow)).toBe(true);
  });

  test("lets the diff drive selection: no EVALS_ALL, no EVALS_TIER", () => {
    // Setting either as an env key would override diff selection (run
    // everything / filter to one tier), defeating cost-scales-with-the-diff.
    // Match assignments only, so the explanatory comment doesn't trip this.
    expect(/^\s*EVALS_ALL:/m.test(workflow)).toBe(false);
    expect(/^\s*EVALS_TIER:/m.test(workflow)).toBe(false);
  });

  test("report job can post PR comments (issues + pull-requests write)", () => {
    // PR comments are issue comments: the gh api issues/comments endpoints need
    // `issues: write`; without it the upsert 401s on every PR with results.
    expect(/^\s*issues:\s*write\s*$/m.test(workflow)).toBe(true);
    expect(/^\s*pull-requests:\s*write\s*$/m.test(workflow)).toBe(true);
  });

  test("comment marker stays in sync between workflow and formatter", () => {
    // The workflow greps for this exact prefix to decide update-vs-create; the
    // formatter emits it. If they drift, the upsert silently duplicates.
    expect(workflow).toContain('startswith("## PR Evals")');
    expect(reportScript).toContain('"## PR Evals"');
  });

  test("declares environment: evals on the secret-consuming job", () => {
    // Without `environment: evals` the env-scoped EVALS_ANTHROPIC_API_KEY
    // resolves empty and the harness fails loud — every diff-selected PR eval
    // goes red with a credential error instead of a real signal.
    expect(/^\s*environment:\s*evals\s*$/m.test(workflow)).toBe(true);
  });

  test("carries the verbatim trust expression", () => {
    // The author-gate must use the canonical TRUST_EXPR byte-for-byte; a
    // one-byte drift breaks the cross-workflow contract the gate relies on.
    expect(workflow).toContain(TRUST_EXPR);
  });

  test("author gate wired as a live if:", () => {
    // The author allowlist must be a live `if:` condition, not a comment, so
    // an untrusted same-repo author cannot spend the production key.
    expect(/^\s*if:.*author_association/m.test(workflow)).toBe(true);
  });

  test("retains the same-repo head.repo guard", () => {
    // The fork exclusion must survive the author-gate edit: forks fail this
    // guard and never reach the secret.
    expect(workflow).toContain("head.repo.full_name == github.repository");
  });
});

describe("static gate: rubrics", () => {
  if (!existsSync(RUBRIC_ROOT)) return;

  for (const entry of readdirSync(RUBRIC_ROOT, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = join(RUBRIC_ROOT, entry.name);
    test(`${entry.name}: declares at least one numbered criterion`, () => {
      const text = readFileSync(path, "utf8");
      expect(/^\s*\d+\.\s+/m.test(text)).toBe(true);
    });
  }
});
