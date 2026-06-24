import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();

// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}

describe("agent-open-questions protocol", () => {
  const AOQ_SKILL = join(REPO_ROOT, "skills", "agent-open-questions", "SKILL.md");
  const TEAM_SKILL = join(REPO_ROOT, "skills", "team", "SKILL.md");
  const QRSPI_SKILL = join(REPO_ROOT, "skills", "qrspi-workflow", "SKILL.md");
  const CLAUDE_MD = join(REPO_ROOT, "CLAUDE.md");

  test("skills/agent-open-questions/SKILL.md exists", () => {
    expect(existsSync(AOQ_SKILL)).toBe(true);
  });

  test("agent-open-questions frontmatter declares name: agent-open-questions", () => {
    const fm = frontmatter(read(AOQ_SKILL));
    expect(/^name:\s*agent-open-questions\s*$/m.test(fm)).toBe(true);
  });

  test("agent-open-questions frontmatter has a non-empty description", () => {
    const fm = frontmatter(read(AOQ_SKILL));
    expect(/^description:\s*\S/m.test(fm)).toBe(true);
  });

  test("agent-open-questions body references openQuestions", () => {
    expect(read(AOQ_SKILL)).toContain("openQuestions");
  });

  test("agent-open-questions body references SendMessage", () => {
    expect(read(AOQ_SKILL)).toContain("SendMessage");
  });

  test("agent-open-questions states first-block-wins near openQuestions", () => {
    // Any-occurrence ±5-line window: "first" appears in some openQuestions
    // window AND "block" appears in some window — not necessarily the same
    // window. Two independent passes.
    const lines = read(AOQ_SKILL).split("\n");
    const matchIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line !== undefined && /openQuestions/.test(line)) matchIndices.push(i);
    }
    const capped = matchIndices.slice(0, 50);
    let windows = "";
    for (const i of capped) {
      const start = Math.max(0, i - 5);
      const end = i + 5;
      windows += lines.slice(start, end + 1).join("\n") + "\n";
    }
    expect(/first/i.test(windows)).toBe(true);
    expect(/block/i.test(windows)).toBe(true);
  });

  test("skills/team/SKILL.md cross-links agent-open-questions", () => {
    expect(read(TEAM_SKILL)).toContain("agent-open-questions");
  });

  test("skills/team/SKILL.md scopes AskUserQuestion 'from the orchestrator'", () => {
    expect(read(TEAM_SKILL)).toContain("from the orchestrator");
  });

  test("skills/qrspi-workflow/SKILL.md cross-links agent-open-questions", () => {
    expect(read(QRSPI_SKILL)).toContain("agent-open-questions");
  });

  test("CLAUDE.md has '## Skills (31)' heading", () => {
    expect(/^## Skills \(31\)/m.test(read(CLAUDE_MD))).toBe(true);
  });

  test("skills/shipit/SKILL.md exists as a runtime skill", () => {
    // shipit is a distributed runtime land utility — it lives under skills/,
    // not .claude/. (docs/plans/2026-06-15-version-at-land-time)
    expect(existsSync(join(REPO_ROOT, "skills", "shipit", "SKILL.md"))).toBe(true);
  });
});

describe("ask-user-question contract", () => {
  const DESIGN_AUTHOR = join(REPO_ROOT, "agents", "design-author.md");
  const QUESTIONER = join(REPO_ROOT, "agents", "questioner.md");
  const TEAM_DESIGN = join(REPO_ROOT, "skills", "team-design", "SKILL.md");
  const TEAM_STRUCTURE = join(REPO_ROOT, "skills", "team-structure", "SKILL.md");
  const TEAM_IMPLEMENT = join(REPO_ROOT, "skills", "team-implement", "SKILL.md");
  const TEAM_PR = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");
  const TEAM_SKILL = join(REPO_ROOT, "skills", "team", "SKILL.md");

  test("design-author tools frontmatter excludes AskUserQuestion", () => {
    const fm = frontmatter(read(DESIGN_AUTHOR));
    expect(/^tools:.*\bAskUserQuestion\b/m.test(fm)).toBe(false);
  });

  test("design-author body references openQuestions + agent-open-questions", () => {
    const text = read(DESIGN_AUTHOR);
    expect(text).toContain("openQuestions");
    expect(text).toContain("agent-open-questions");
  });

  test("team-design SKILL references AskUserQuestion", () => {
    expect(read(TEAM_DESIGN)).toContain("AskUserQuestion");
  });

  test("team-design SKILL replaced free-text approve prompt", () => {
    expect(/"Do you\s+approve/.test(read(TEAM_DESIGN))).toBe(false);
  });

  test("team-structure SKILL references AskUserQuestion", () => {
    expect(read(TEAM_STRUCTURE)).toContain("AskUserQuestion");
  });

  test("team-structure SKILL replaced free-text approve prompt", () => {
    expect(/"Do you\s+approve/.test(read(TEAM_STRUCTURE))).toBe(false);
  });

  test("team-implement SKILL references AskUserQuestion", () => {
    expect(read(TEAM_IMPLEMENT)).toContain("AskUserQuestion");
  });

  test("team-pr opens a draft PR automatically without a shipping prompt", () => {
    const text = read(TEAM_PR);
    expect(text).toContain("gh pr create --draft");
    expect(text).toContain("do not stop to ask");
    expect(text).not.toContain("Keep commits locally");
  });

  test("team SKILL references AskUserQuestion at human gates", () => {
    expect(read(TEAM_SKILL)).toContain("AskUserQuestion");
  });

  test("questioner tools frontmatter excludes AskUserQuestion", () => {
    const fm = frontmatter(read(QUESTIONER));
    expect(/^tools:.*\bAskUserQuestion\b/m.test(fm)).toBe(false);
  });

  test("questioner body references openQuestions + agent-open-questions", () => {
    const text = read(QUESTIONER);
    expect(text).toContain("openQuestions");
    expect(text).toContain("agent-open-questions");
  });
});

describe("multi-repo support", () => {
  const QRSPI = join(REPO_ROOT, "skills", "qrspi-workflow", "SKILL.md");
  const WORKTREE_ISO = join(REPO_ROOT, "skills", "worktree-isolation", "SKILL.md");
  const TEAM_WT = join(REPO_ROOT, "skills", "team-worktree", "SKILL.md");
  const TEAM_IMPL = join(REPO_ROOT, "skills", "team-implement", "SKILL.md");
  const TEAM_PR = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");
  const TEAM_RES = join(REPO_ROOT, "skills", "team-research", "SKILL.md");
  const TEAM = join(REPO_ROOT, "skills", "team", "SKILL.md");
  const QUESTIONER = join(REPO_ROOT, "agents", "questioner.md");
  const DESIGN_AUTHOR = join(REPO_ROOT, "agents", "design-author.md");
  const RESEARCHER = join(REPO_ROOT, "agents", "researcher.md");
  const FILE_FINDER = join(REPO_ROOT, "agents", "file-finder.md");
  const STRUCTURE_PLANNER = join(REPO_ROOT, "agents", "structure-planner.md");
  const PLANNER = join(REPO_ROOT, "agents", "planner.md");
  const IMPLEMENTER = join(REPO_ROOT, "agents", "implementer.md");

  test("qrspi-workflow documents repos.md artifact + schema", () => {
    const text = read(QRSPI);
    expect(text).toContain("repos.md");
    expect(text).toContain("phase: repos");
  });

  test("worktree-isolation documents multi-repo topology", () => {
    const text = read(WORKTREE_ISO);
    expect(text).toContain("Multi-repo");
    expect(text).toContain("one worktree per listed repo");
  });

  test("team-worktree reads repos.md and runs per-repo worktree add", () => {
    const text = read(TEAM_WT);
    expect(text).toContain("repos.md");
    expect(/git -C .* worktree add/.test(text)).toBe(true);
  });

  test("team-worktree records ## Worktrees section in repos.md", () => {
    expect(read(TEAM_WT)).toContain("## Worktrees");
  });

  test("team-worktree skips creation when already in a non-default-branch worktree", () => {
    const text = read(TEAM_WT);
    // Linked-worktree detection must be layout-independent: git dir vs common git dir.
    expect(text).toContain("--git-common-dir");
    expect(text).toContain("skip worktree creation for this repo");
    expect(text).toContain("Non-default branch");
    // Default-branch worktrees still refuse — never implement on main/master.
    expect(text).toContain("Default branch** → report and stop");
  });

  test("worktree-isolation documents worktree reuse", () => {
    const text = read(WORKTREE_ISO);
    expect(text).toContain("Reusing an existing worktree");
    expect(text).toContain("non-default branch");
  });

  test("questioner excludes AskUserQuestion + multi-repo detection uses openQuestions envelope", () => {
    const text = read(QUESTIONER);
    const fm = frontmatter(text);
    expect(/^tools:.*\bAskUserQuestion\b/m.test(fm)).toBe(false);
    expect(text).toContain("Multi-repo detection");
    expect(text).toContain("openQuestions");
    expect(text).toContain("agent-open-questions");
    expect(text).toContain("Repos");
  });

  test("design-author confirms repo scope before drafting", () => {
    expect(read(DESIGN_AUTHOR)).toContain("Confirm repo scope");
  });

  test("researcher allowed to read repos.md (scope, not intent)", () => {
    const text = read(RESEARCHER);
    expect(text).toContain("repos.md");
    expect(text).toContain("scope, not intent");
  });

  test("file-finder references repos.md", () => {
    expect(read(FILE_FINDER)).toContain("repos.md");
  });

  test("file-finder forbids reading task.md and enumerating docs/plans/", () => {
    const text = flat(read(FILE_FINDER));
    // Hard isolation: must never read the user's original description.
    expect(/MUST NOT.*task\.md/i.test(text)).toBe(true);
    // Must never glob/list/enumerate the plan directory to discover the task,
    // closing the wide-net search-strategy hole. Order-independent: the verb
    // may precede or follow the `docs/plans/` reference.
    expect(/\b(enumerate|glob|list)\b.{0,40}docs\/plans\/|docs\/plans\/.{0,40}\b(enumerate|glob|list)\b/i.test(text)).toBe(true);
  });

  test("team-research includes repos.md path in dispatch", () => {
    expect(read(TEAM_RES)).toContain("repos.md");
  });

  test("structure-planner supports per-slice Repos: field", () => {
    expect(read(STRUCTURE_PLANNER)).toContain("Repos:");
  });

  test("planner uses [repo: <slug>] step prefix", () => {
    expect(/\[repo: <slug>\]|\[repo: /.test(read(PLANNER))).toBe(true);
  });

  test("implementer cd's into per-repo worktrees per step", () => {
    const text = read(IMPLEMENTER);
    expect(/\[repo: <slug>\]|\[repo: /.test(text)).toBe(true);
    expect(text).toContain("cd ");
  });

  test("team-implement detects multi-repo and refuses in-place", () => {
    const text = read(TEAM_IMPL);
    expect(text).toContain("repos.md");
    expect(text).toContain("multi-repo work requires worktrees");
  });

  test("team-pr opens cross-linked PRs in multi-repo mode", () => {
    const text = read(TEAM_PR);
    expect(text).toContain("Companion PRs");
    expect(text).toContain("one draft PR per repo");
  });

  test("team SKILL describes multi-repo flow", () => {
    const text = read(TEAM);
    expect(text).toContain("Multi-repo topics");
    expect(text).toContain("multi-repo mode");
  });

  // Worktree-first: secondary worktrees are created AFTER the design gate
  // (the home worktree is born at the leading WORKTREE phase). Assert the
  // post-design-gate phrasing is co-located with the `## Worktrees` /
  // `repos.md` back-recording prose.
  test("team SKILL creates secondary worktrees after the design gate", () => {
    const text = flat(read(TEAM));
    // A post-design-gate phrase appears within reach of the `## Worktrees`
    // back-recording of `repos.md`.
    expect(
      /(after the design gate|post-design-gate)[^|]{0,400}(## Worktrees|repos\.md)|(## Worktrees|repos\.md)[^|]{0,400}(after the design gate|post-design-gate)/i.test(
        text,
      ),
    ).toBe(true);
  });

  test("team SKILL back-records the home worktree path in repos.md", () => {
    const text = flat(read(TEAM));
    expect(
      /(back-record|record)[^.]{0,200}home worktree[^.]{0,200}(path|`## Worktrees`|repos\.md)/i.test(text),
    ).toBe(true);
  });
});

describe("implement-to-pr continuation", () => {
  const TEAM_IMPLEMENT = join(REPO_ROOT, "skills", "team-implement", "SKILL.md");
  const TEAM_SKILL = join(REPO_ROOT, "skills", "team", "SKILL.md");
  const ARCHITECTURE = join(REPO_ROOT, "docs", "architecture.md");

  test("team-implement full-pipeline mode continues into the PR phase in the same turn", () => {
    const text = read(TEAM_IMPLEMENT);
    expect(text).toContain("do **not** end the turn");
    expect(text).toContain("same turn");
    expect(text).toContain("team-pr/SKILL.md");
  });

  test("team-implement still suggests /team-pr in standalone mode", () => {
    expect(/\*\*Standalone\*\*.{0,200}\/team-pr/.test(flat(read(TEAM_IMPLEMENT)))).toBe(true);
  });

  test("team-implement completion calls turn-end without a draft PR a defect", () => {
    expect(
      /Ending the turn with verdicts but\s+no draft PR is a defect/.test(read(TEAM_IMPLEMENT)),
    ).toBe(true);
  });

  test("team SKILL advances IMPLEMENT to PR in the same turn", () => {
    const text = flat(read(TEAM_SKILL));
    expect(/advance\s+to PR \*\*in the same turn\*\*/.test(text)).toBe(true);
    expect(
      /turn that ends with review\s+verdicts but no draft PR URL is\s+a defect/.test(
        read(TEAM_SKILL),
      ),
    ).toBe(true);
  });

  test("architecture.md no longer presents shipping options", () => {
    const text = read(ARCHITECTURE);
    expect(text).not.toContain("present shipping options");
    expect(text).toContain("gh pr create");
  });
});

describe("topic consistency", () => {
  const QUESTIONER = join(REPO_ROOT, "agents", "questioner.md");
  const RESEARCHER = join(REPO_ROOT, "agents", "researcher.md");
  const DESIGN_AUTHOR = join(REPO_ROOT, "agents", "design-author.md");
  const STRUCTURE_PLANNER = join(REPO_ROOT, "agents", "structure-planner.md");
  const PLANNER = join(REPO_ROOT, "agents", "planner.md");
  const TEAM_RESEARCH = join(REPO_ROOT, "skills", "team-research", "SKILL.md");
  const TEAM_FIX = join(REPO_ROOT, "skills", "team-fix", "SKILL.md");
  const QRSPI = join(REPO_ROOT, "skills", "qrspi-workflow", "SKILL.md");

  test("questioner requires identical topic across task.md and questions.md", () => {
    const text = flat(read(QUESTIONER));
    expect(
      /topic[^.]{0,200}(identical|same|match)[^.]{0,200}(task\.md|questions\.md|both)/i.test(text),
    ).toBe(true);
  });

  test("questioner ties topic to the kebab portion of <id>", () => {
    const text = flat(read(QUESTIONER));
    expect(
      /topic.{0,250}(kebab portion of `?<id>|slug portion of `?<id>|<id>.{0,40}minus the.{0,40}(ticket|date)|without the (ticket|date) prefix)/i.test(
        text,
      ),
    ).toBe(true);
  });

  test("research.md frontmatter must reuse the topic from questions.md", () => {
    const a = /topic[^.]{0,200}(from|copy|read|same as|match)[^.]{0,200}questions\.md/i.test(
      flat(read(RESEARCHER)),
    );
    const b = /topic[^.]{0,200}(from|copy|read|same as|match)[^.]{0,200}questions\.md/i.test(
      flat(read(TEAM_RESEARCH)),
    );
    expect(a || b).toBe(true);
  });

  test("qrspi-workflow states topic-consistency invariant", () => {
    const text = flat(read(QRSPI));
    expect(
      /topic[^.]{0,200}(must|should)[^.]{0,200}(identical|same|match)[^.]{0,200}(across|every|all)[^.]{0,200}artifact/i.test(
        text,
      ),
    ).toBe(true);
  });

  test("qrspi-workflow documents why ticketId lives only on task.md", () => {
    const text = flat(read(QRSPI));
    expect(
      /ticketId[^.]{0,200}(only|just)[^.]{0,200}task\.md|task\.md[^.]{0,200}(canonical|sole|only)[^.]{0,200}ticketId|<id>[^.]{0,200}already[^.]{0,200}(encode|carry|contain)[^.]{0,200}ticket/i.test(
        text,
      ),
    ).toBe(true);
  });

  test("design-author copies topic verbatim from the predecessor artifact", () => {
    const text = flat(read(DESIGN_AUTHOR));
    expect(
      /topic.{0,250}(copy|verbatim|reuse|read|same as|inherit|carry|preserve).{0,100}(research\.md|task\.md|predecessor|upstream|questions\.md)/i.test(
        text,
      ),
    ).toBe(true);
  });

  test("structure-planner copies topic verbatim from the predecessor artifact", () => {
    const text = flat(read(STRUCTURE_PLANNER));
    expect(
      /topic.{0,250}(copy|verbatim|reuse|read|same as|inherit|carry|preserve).{0,100}(design\.md|predecessor|upstream)/i.test(
        text,
      ),
    ).toBe(true);
  });

  test("planner copies topic verbatim from the predecessor artifact", () => {
    const text = flat(read(PLANNER));
    expect(
      /topic.{0,250}(copy|verbatim|reuse|read|same as|inherit|carry|preserve).{0,100}(structure\.md|predecessor|upstream)/i.test(
        text,
      ),
    ).toBe(true);
  });

  test("team-fix specifies topic = kebab portion of <id>", () => {
    const text = flat(read(TEAM_FIX));
    expect(
      /topic.{0,250}(kebab portion of `?<id>|slug portion of `?<id>|<id>.{0,40}minus the.{0,40}(ticket|date)|without the (ticket|date) prefix)/i.test(
        text,
      ),
    ).toBe(true);
  });
});

// L2-demoted (heavy prior state): team, team-worktree, team-pr, team-implement
//
// These four pipeline skills have no cheap self-contained behavioral property
// to drive at L5 — each needs heavy multi-phase prior state (the orchestrator
// walks every phase and owns no single artifact; team-worktree produces git
// side effects with no findings artifact; team-pr needs a fully implemented
// branch plus a git remote; team-implement needs an approved structure + plan
// + worktree + failing tests). Honestly seeding that state is too costly for a
// behavioral guardrail, so they are demoted to free L2 wiring/content
// tripwires (design option (b), Risk #2). The assertions below pin each one's
// load-bearing contract that stands in for the absent L5 — no fixture, no
// rubric, no eval, no E2E_TOUCHFILES/E2E_TIERS entry for these four (enforced
// by tests/skill-eval-coverage.test.ts).
describe("L2-demoted heavy-prior-state pipeline skills", () => {
  const TEAM = join(REPO_ROOT, "skills", "team", "SKILL.md");
  const TEAM_WT = join(REPO_ROOT, "skills", "team-worktree", "SKILL.md");
  const TEAM_PR = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");
  const TEAM_IMPL = join(REPO_ROOT, "skills", "team-implement", "SKILL.md");

  test("team: orchestrator walks the QRSPI phase table in order", () => {
    const text = read(TEAM);
    // The phase loop walks a linear phase table.
    expect(/phase table/i.test(text)).toBe(true);
    // The QRSPI sequence appears in order, with WORKTREE leading.
    expect(text).toContain(
      "Worktree → Question → Research → Design → Structure → Plan → Implement → PR",
    );
  });

  test("team: design approval is the only human gate (structure is autonomous)", () => {
    const text = read(TEAM);
    // Design is the sole human gate as of the structure-autonomy change.
    expect(text).toContain("design is the only human gate");
    expect(/### Human Gate \(design approval\)/.test(text)).toBe(true);
    // Structure no longer gates — it advances autonomously.
    expect(/### Structure \(no gate — autonomous\)/.test(text)).toBe(true);
    // And the old structure human-gate section must be gone.
    expect(/### Human Gate \(structure approval\)/.test(text)).toBe(false);
  });

  test("team-worktree: reads repos.md and runs per-repo git worktree add", () => {
    const text = read(TEAM_WT);
    expect(text).toContain("repos.md");
    expect(/git -C .* worktree add/.test(text)).toBe(true);
    // Single-repo worktree-creation contract (load-bearing default mode).
    expect(text).toContain("single-repo mode");
    expect(text).toContain("worktree add .claude/worktrees/<branch>");
  });

  test("team-worktree: records the ## Worktrees section", () => {
    expect(read(TEAM_WT)).toContain("## Worktrees");
  });

  test("team-pr: opens a draft PR automatically without stopping to ask", () => {
    const text = read(TEAM_PR);
    expect(text).toContain("gh pr create --draft");
    expect(text).toContain("do not stop to ask");
  });

  test("team-pr: commit/changelog precedes opening the PR", () => {
    const text = read(TEAM_PR);
    const changelogIdx = text.indexOf("Update CHANGELOG.md");
    const prIdx = text.indexOf("Open a draft PR automatically");
    expect(changelogIdx).toBeGreaterThan(-1);
    expect(prIdx).toBeGreaterThan(-1);
    // The changelog/commit step is listed before the open-PR step.
    expect(changelogIdx).toBeLessThan(prIdx);
  });

  test("team-implement: requires an approved structure + plan + worktree", () => {
    const text = read(TEAM_IMPL);
    expect(text).toContain("structure.md");
    expect(text).toContain("plan.md");
    expect(/worktree/i.test(text)).toBe(true);
  });

  test("team-implement: drives the test-first → slice → 5-reviewer sub-pipeline", () => {
    const text = read(TEAM_IMPL);
    expect(/test-first/i.test(text)).toBe(true);
    expect(text).toContain("Slice execution");
    expect(/5 parallel reviewers/i.test(text)).toBe(true);
    expect(/hard-gate retry loop/i.test(text)).toBe(true);
  });
});
