import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";
import { loadsSkill, SUBSTITUTION_CLAUSE } from "./helpers/skill-refs";

const REPO_ROOT = process.cwd();

// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}

describe("runtime skill inventory", () => {
  const CLAUDE_MD = join(REPO_ROOT, "CLAUDE.md");

  test("skills/agent-open-questions/ is deleted (agents self-answer)", () => {
    // The openQuestions envelope protocol is removed: subagents resolve
    // their own open questions and record each as an auditable assumption.
    expect(existsSync(join(REPO_ROOT, "skills", "agent-open-questions", "SKILL.md"))).toBe(false);
  });

  test("CLAUDE.md has '## Skills' heading with no count", () => {
    // The heading carries no skill count: a count would go stale on every
    // skill addition or removal.
    expect(/^## Skills$/m.test(read(CLAUDE_MD))).toBe(true);
  });

  test("skills/shipit/SKILL.md exists as a runtime skill", () => {
    // shipit is a distributed runtime land utility — it lives under skills/,
    // not .claude/. (docs/plans/2026-06-15-version-at-land-time)
    expect(existsSync(join(REPO_ROOT, "skills", "shipit", "SKILL.md"))).toBe(true);
  });

  test("AGENTS.md and CLAUDE.md carry byte-identical router content", () => {
    // Two host-specific names, one router. Today CLAUDE.md is a symlink to
    // AGENTS.md, which makes this trivially true; the pin exists so replacing
    // the link with a diverging copy splits what agents read by host and
    // fails here instead of silently.
    const agents = read(join(REPO_ROOT, "AGENTS.md"));
    // Guard: an empty file must fail, not vacuously equal another empty file.
    expect(agents.length).toBeGreaterThan(0);
    expect(read(join(REPO_ROOT, "CLAUDE.md"))).toBe(agents);
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

  test("design-author body carries no envelope protocol references", () => {
    // Inverse set: the design author resolves its own open
    // questions — the envelope protocol must not reappear.
    const text = read(DESIGN_AUTHOR);
    expect(text).not.toContain("openQuestions");
    expect(text).not.toContain("agent-open-questions");
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

  test("team SKILL never prompts mid-run — no envelope or prompt-tool references", () => {
    // Inverse set: the phase loop has no mid-run pause of any kind,
    // so the orchestrator skill must reference neither the prompt tool nor
    // the retired envelope protocol.
    const text = read(TEAM_SKILL);
    expect(text).not.toContain("AskUserQuestion");
    expect(text).not.toContain("openQuestions");
    expect(text).not.toContain("agent-open-questions");
    expect(text).not.toContain("SendMessage");
  });

  test("questioner tools frontmatter excludes AskUserQuestion", () => {
    const fm = frontmatter(read(QUESTIONER));
    expect(/^tools:.*\bAskUserQuestion\b/m.test(fm)).toBe(false);
  });

  test("questioner body carries no envelope protocol references", () => {
    // Inverse set: multi-repo detection resolves autonomously —
    // the envelope protocol must not reappear.
    const text = read(QUESTIONER);
    expect(text).not.toContain("openQuestions");
    expect(text).not.toContain("agent-open-questions");
  });
});

describe("reporting agents can reach the orchestrator", () => {
  // A reporting agent's whole output is its report. Dispatched in the
  // background, its plain text never reaches the orchestrator, so without
  // SendMessage the report is unrecoverable — the agent goes idle and the
  // review silently loses a gate.
  const REPORTING_AGENTS = [
    "code-reviewer",
    "security-reviewer",
    "technical-writer",
    "ux-reviewer",
    "verifier",
  ];

  for (const agent of REPORTING_AGENTS) {
    test(`${agent} tools frontmatter includes SendMessage`, () => {
      const fm = frontmatter(read(join(REPO_ROOT, "agents", `${agent}.md`)));
      expect(/^tools:.*\bSendMessage\b/m.test(fm)).toBe(true);
    });
  }
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

  test("artifact-frontmatter carries the 4-repos.md schema; qrspi-workflow keeps the pointer", () => {
    const schema = read(join(REPO_ROOT, "skills", "artifact-frontmatter", "SKILL.md"));
    expect(schema).toContain("4-repos.md");
    expect(schema).toContain("phase: repos");
    const text = read(QRSPI);
    expect(text).toContain("4-repos.md");
    expect(text).toContain("artifact-frontmatter/SKILL.md");
  });

  test("worktree-isolation documents multi-repo topology", () => {
    const text = read(WORKTREE_ISO);
    expect(text).toContain("Multi-repo");
    expect(text).toContain("one worktree per listed repo");
  });

  test("team-worktree reads 4-repos.md and runs per-repo worktree add", () => {
    const text = read(TEAM_WT);
    expect(text).toContain("4-repos.md");
    expect(/git -C .* worktree add/.test(text)).toBe(true);
  });

  test("team-worktree records ## Worktrees section in 4-repos.md", () => {
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

  test("questioner excludes AskUserQuestion + detects multi-repo scope autonomously", () => {
    const text = read(QUESTIONER);
    const fm = frontmatter(text);
    expect(/^tools:.*\bAskUserQuestion\b/m.test(fm)).toBe(false);
    expect(text).toContain("Multi-repo detection");
    // Candidate repos resolve through sibling directories of the home repo
    // root; when in doubt the questioner stays single-repo and records the
    // assumption — it never pauses to ask.
    expect(/sibling/i.test(text)).toBe(true);
    expect(text).toContain("single-repo");
  });

  test("design-author confirms repo scope before drafting", () => {
    expect(read(DESIGN_AUTHOR)).toContain("Confirm repo scope");
  });

  test("design-author resolves repo scope via sibling directories with a loud single-repo fallback", () => {
    const text = flat(read(DESIGN_AUTHOR));
    expect(/sibling/i.test(text)).toBe(true);
    expect(text).toContain("single-repo");
  });

  test("researcher allowed to read 4-repos.md (scope, not intent)", () => {
    const text = read(RESEARCHER);
    expect(text).toContain("4-repos.md");
    expect(text).toContain("scope, not intent");
  });

  test("file-finder references 4-repos.md", () => {
    expect(read(FILE_FINDER)).toContain("4-repos.md");
  });

  test("file-finder forbids reading 1-task.md and enumerating docs/plans/", () => {
    const text = flat(read(FILE_FINDER));
    // Hard isolation: must never read the user's original description.
    expect(/MUST NOT.*1-task\.md/i.test(text)).toBe(true);
    // Must never glob/list/enumerate the plan directory to discover the task,
    // closing the wide-net search-strategy hole. Order-independent: the verb
    // may precede or follow the `docs/plans/` reference.
    expect(/\b(enumerate|glob|list)\b.{0,40}docs\/plans\/|docs\/plans\/.{0,40}\b(enumerate|glob|list)\b/i.test(text)).toBe(true);
  });

  test("team-research includes 4-repos.md path in dispatch", () => {
    expect(read(TEAM_RES)).toContain("4-repos.md");
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
    expect(text).toContain("4-repos.md");
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
});

describe("conditional PRD artifact", () => {
  const QRSPI = join(REPO_ROOT, "skills", "qrspi-workflow", "SKILL.md");
  const DECOMPOSING_INTENT = join(REPO_ROOT, "skills", "decomposing-intent", "SKILL.md");
  const QUESTIONER = join(REPO_ROOT, "agents", "questioner.md");

  test("artifact-frontmatter carries the 3-prd.md schema; qrspi-workflow keeps the pointer", () => {
    const schema = read(join(REPO_ROOT, "skills", "artifact-frontmatter", "SKILL.md"));
    expect(schema).toContain("3-prd.md");
    expect(schema).toContain("phase: prd");
    const text = read(QRSPI);
    expect(text).toContain("3-prd.md");
    expect(text).toContain("artifact-frontmatter/SKILL.md");
  });

  test("decomposing-intent carries the 3-prd.md frontmatter contract", () => {
    const text = read(DECOMPOSING_INTENT);
    expect(text).toContain("3-prd.md");
    expect(text).toContain("phase: prd");
  });

  test("questioner return payload includes prdPath", () => {
    expect(read(QUESTIONER)).toContain("prdPath");
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
    expect(loadsSkill(text, "team-pr")).toBe(true);
  });

  test("team-implement still suggests /team-pr in standalone mode", () => {
    expect(/\*\*Standalone\*\*.{0,200}\/team-pr/.test(flat(read(TEAM_IMPLEMENT)))).toBe(true);
  });

  test("architecture.md no longer presents shipping options", () => {
    const text = read(ARCHITECTURE);
    expect(text).not.toContain("present shipping options");
    expect(text).toContain("gh pr create");
  });
});

// Regression guard for issue #68: qrspi-workflow's SOFT-gate examples must not
// contradict the severity model in review-severity-tiers/SKILL.md. PR #23 made
// code-reviewer REQUEST CHANGES Blocking (auto-fix) and ux-reviewer REQUEST
// CHANGES Major (auto-fix), so neither can be a SOFT example. The severity
// model lives in exactly one place — qrspi-workflow must cross-reference it,
// never restate it.
describe("qrspi-workflow SOFT gate aligns with severity tiers (issue #68)", () => {
  const QRSPI = join(REPO_ROOT, "skills", "qrspi-workflow", "SKILL.md");

  // The SOFT subsection: from "### SOFT" up to the next "### " heading.
  function softSection(text: string): string {
    const lines = text.split("\n");
    const start = lines.findIndex((l) => /^### SOFT\b/.test(l));
    if (start === -1) return "";
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^### /.test(lines[i] ?? "")) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join("\n");
  }

  test("no longer lists code-review or ux-reviewer feedback as SOFT examples", () => {
    const soft = softSection(read(QRSPI));
    // Fail loud if the SOFT subsection vanished, so the absence assertions
    // below cannot pass vacuously against an empty string.
    expect(soft.length).toBeGreaterThan(0);
    expect(/code review suggestions/i.test(soft)).toBe(false);
    expect(/UX review feedback/i.test(soft)).toBe(false);
  });

  test("SOFT section cross-references the review-severity-tiers table", () => {
    const soft = softSection(read(QRSPI));
    expect(soft.length).toBeGreaterThan(0);
    expect(soft).toContain("review-severity-tiers/SKILL.md");
    expect(squash(soft)).toContain("Severity Tiers and the Auto-Fix Boundary");
  });

  // Drift guard: the SOFT section points at a heading by name. If that heading
  // is renamed in review-severity-tiers/SKILL.md, the cross-reference silently
  // rots — fail the build here so the rename and the reference stay in sync.
  test("the cross-referenced heading still exists in review-severity-tiers/SKILL.md", () => {
    const severityTiers = read(
      join(REPO_ROOT, "skills", "review-severity-tiers", "SKILL.md"),
    );
    expect(
      /^#{1,4} Severity Tiers and the Auto-Fix Boundary$/m.test(severityTiers),
    ).toBe(true);
  });
});

// L2-demoted (heavy prior state): team, team-worktree, team-pr, team-implement
//
// These four pipeline skills have no cheap self-contained behavioral property
// to drive at L5 — each needs heavy multi-phase prior state (the orchestrator
// walks every phase and owns no single artifact; team-worktree produces git
// side effects with no findings artifact; team-pr needs a fully implemented
// branch plus a git remote; team-implement needs a structure + plan
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

  test("team: no mid-run human gates — an adversarial design review gates DESIGN", () => {
    const text = read(TEAM);
    // The run has no mid-run human pause; the one human checkpoint is the
    // PR review after the run completes.
    expect(text).toContain("no mid-run human gates");
    // DESIGN is gated by the adversarial design-review loop.
    expect(/^### Design Review Gate \(design\)$/m.test(text)).toBe(true);
    // The old human-gate sections must be gone — inverse set of the
    // retired approval flow.
    expect(/### Human Gate \(design approval\)/.test(text)).toBe(false);
    expect(/### Human Gate \(structure approval\)/.test(text)).toBe(false);
    // No approval frontmatter marker remains anywhere in the skill.
    expect(/^approved:/m.test(text)).toBe(false);
    // Structure still advances autonomously.
    expect(/### Structure \(no gate — autonomous\)/.test(text)).toBe(true);
  });

  test("team-worktree: reads 4-repos.md and runs per-repo git worktree add", () => {
    const text = read(TEAM_WT);
    expect(text).toContain("4-repos.md");
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

  test("team-implement: requires a structure + plan + worktree", () => {
    const text = read(TEAM_IMPL);
    expect(text).toContain("7-structure.md");
    expect(text).toContain("8-plan.md");
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

// Regression: a picked-up ticket must be moved to the tracker's in-progress
// state as the first action of a run. The board-move was documented only as a
// manual dev step, so the orchestrator never did it (issue surfaced on
// `/team <issue-url>`). The generic, best-effort runtime contract is now
// canonical in skills/tracking-tickets/SKILL.md (content pins there); the
// full pipeline and the bug-fix pipeline keep short pointer steps (pointer
// pins), plus a concrete dev binding in the project-tracking doc.
describe("ticket pickup → in-progress", () => {
  const TEAM_SKILL = join(REPO_ROOT, "skills", "team", "SKILL.md");
  const TEAM_FIX = join(REPO_ROOT, "skills", "team-fix", "SKILL.md");
  const TRACKING_TICKETS = join(REPO_ROOT, "skills", "tracking-tickets", "SKILL.md");
  const PROJECT_TRACKING = join(REPO_ROOT, "docs", "project-tracking.md");

  // The generic runtime contract: tracker-agnostic, best-effort, skip-silently,
  // never blocking. Matched as flattened prose so wording can wrap across lines.
  function assertInProgressContract(path: string) {
    const text = flat(read(path));
    // Names the move to an in-progress state.
    expect(/in-progress/i.test(text)).toBe(true);
    // Stays generic — best-effort and skips when no mechanism exists.
    expect(/best-effort/i.test(text)).toBe(true);
    expect(/skip/i.test(text)).toBe(true);
    // Never block the pipeline on a tracker update.
    expect(/never block/i.test(text)).toBe(true);
    // Does not hardcode this repo's board into the distributed runtime.
    expect(text).not.toContain("project-set-status");
    expect(text).not.toContain("projects/5");
  }

  // Pointer pin: the host names the pickup move and defers the rules to
  // tracking-tickets rather than restating the full contract. The deferral is
  // encoded as a Skill-tool load, so the bare name is the reference.
  function assertInProgressPointer(path: string) {
    const text = flat(read(path));
    expect(/move the ticket to in-progress/i.test(text)).toBe(true);
    expect(loadsSkill(text, "tracking-tickets")).toBe(true);
    // Does not hardcode this repo's board into the distributed runtime.
    expect(text).not.toContain("project-set-status");
    expect(text).not.toContain("projects/5");
  }

  test("tracking-tickets: carries the canonical in-progress contract", () => {
    assertInProgressContract(TRACKING_TICKETS);
  });

  test("team: Setup moves a picked-up ticket to in-progress (pointer to tracking-tickets)", () => {
    assertInProgressPointer(TEAM_SKILL);
  });

  test("team-fix: Setup moves a picked-up ticket to in-progress (pointer to tracking-tickets)", () => {
    assertInProgressPointer(TEAM_FIX);
  });

  test("project-tracking: binds the concrete in-progress mechanism for this repo", () => {
    const text = flat(read(PROJECT_TRACKING));
    // The dev binding wires the actual board scripts to the in-progress move.
    expect(text).toContain("project-set-status.sh");
    expect(/"In progress"/i.test(text)).toBe(true);
    // States the move is automatic on pickup, not a manual pre-step.
    expect(/automatic/i.test(text)).toBe(true);
  });
});

// Regression: when the PR phase opens a pull request, the PR must be linked to
// the ticket so the tracker closes it (and any board automation moves it to its
// done state) on merge, and the ticket must move to the tracker's in-review
// state — but only once the PR is marked ready for review. The pipeline opens
// draft PRs, and a draft is not under review: the skills previously moved the
// ticket to in-review immediately after the draft opened (observed as a Linear
// issue reading "In Review" against a draft PR — #159). The generic,
// best-effort runtime contract — including its timing — is now canonical in
// skills/tracking-tickets/SKILL.md (content pins there); every skill that
// opens a PR keeps a short pointer step (pointer pins), while the merge skill
// (shipit) stays board-agnostic.
describe("PR open (link) → ready for review (in-review) → (merge) done", () => {
  const TEAM_SKILL = join(REPO_ROOT, "skills", "team", "SKILL.md");
  const TEAM_FIX = join(REPO_ROOT, "skills", "team-fix", "SKILL.md");
  const TEAM_PR = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");
  const TRACKING_TICKETS = join(REPO_ROOT, "skills", "tracking-tickets", "SKILL.md");
  const SHIPIT = join(REPO_ROOT, "skills", "shipit", "SKILL.md");
  const PROJECT_TRACKING = join(REPO_ROOT, "docs", "project-tracking.md");

  // The generic runtime contract for the PR phase: link the PR at open so it
  // auto-closes on merge, move the ticket to in-review only once the PR is
  // ready for review (never while it is a draft), best-effort, never blocking,
  // and no board hardcoded into the distributed runtime.
  function assertInReviewContract(path: string) {
    const text = flat(read(path));
    // Names the move to an in-review state.
    expect(/in-review/i.test(text)).toBe(true);
    // Links the PR to the ticket so it auto-closes on merge (drives "done").
    expect(/closes #/i.test(text)).toBe(true);
    // Stays generic — best-effort and never blocks the pipeline.
    expect(/best-effort/i.test(text)).toBe(true);
    expect(/never block/i.test(text)).toBe(true);
    // Does not hardcode this repo's board into the distributed runtime.
    expect(text).not.toContain("project-set-status");
    expect(text).not.toContain("projects/5");
  }

  // Pointer pin: the host names the link + in-review moments and defers the
  // rules (interpretation, timing, multi-repo closing) to tracking-tickets.
  function assertInReviewPointer(path: string) {
    const text = flat(read(path));
    expect(loadsSkill(text, "tracking-tickets")).toBe(true);
    // Still names the tracker moment so the pointer step is discoverable.
    expect(/in-review/i.test(text)).toBe(true);
    // Does not hardcode this repo's board into the distributed runtime.
    expect(text).not.toContain("project-set-status");
    expect(text).not.toContain("projects/5");
  }

  test("tracking-tickets: carries the canonical link → in-review → done contract", () => {
    assertInReviewContract(TRACKING_TICKETS);
  });

  test("team-pr: points at tracking-tickets for the ticket link + in-review timing", () => {
    assertInReviewPointer(TEAM_PR);
  });

  test("team: PR gate points at tracking-tickets for the ticket link + in-review timing", () => {
    assertInReviewPointer(TEAM_SKILL);
  });

  test("team-fix: Ship points at tracking-tickets for the ticket link + in-review timing", () => {
    assertInReviewPointer(TEAM_FIX);
  });

  test("shipit: stays board-agnostic — done flows from the close-on-merge link", () => {
    const text = flat(read(SHIPIT));
    // shipit is generic: it must not hardcode this repo's board.
    expect(text).not.toContain("project-set-status");
    expect(text).not.toContain("projects/5");
    // It documents that done happens through the tracker close-on-merge link,
    // not through any board action shipit takes.
    expect(/closes #/i.test(text)).toBe(true);
  });

  test("project-tracking: binds in-review and done transitions for this repo", () => {
    const text = flat(read(PROJECT_TRACKING));
    // In-review binding: the board script with the "In review" column.
    expect(/"In review"/i.test(text)).toBe(true);
    // Done is automated by the board's close-on-merge automation, driven by
    // the PR's Closes-link — not a manual move.
    expect(/closes #/i.test(text)).toBe(true);
    expect(/\bDone\b/.test(text)).toBe(true);
    expect(/automatic/i.test(text)).toBe(true);
  });

  // Issue #158: the ticket closing line must land in a deterministic position
  // — the final line of the authored PR body — with ticketId interpretation
  // codified at the consumption site and multi-repo runs closing the ticket
  // exactly once (home PR only). The closing-footer rules are canonical in
  // skills/tracking-tickets/SKILL.md (content pins there); team-pr keeps the
  // WHERE — the PR Body Template that ends with the footer — as host glue.

  // The PR Body Template: the first fenced code block after the
  // "## PR Body Template" heading in team-pr.
  function prBodyTemplate(text: string): string {
    const afterHeading = text.split("## PR Body Template")[1] ?? "";
    return afterHeading.match(/```\n([\s\S]*?)```/)?.[1] ?? "";
  }

  // Canonical placement phrase — pinned on tracking-tickets (the rule owner)
  // and on team-pr (whose PR Body Template renders the footer in place).
  function assertClosingFooterPlacement(path: string) {
    const text = flat(read(path));
    expect(/as the final line of the PR body/i.test(text)).toBe(true);
  }

  test("team-pr: PR Body Template ends with the Closes footer", () => {
    const template = prBodyTemplate(read(TEAM_PR));
    // Fail loud if the template block vanished, so the position assertions
    // below cannot pass vacuously against an empty string.
    expect(template.length).toBeGreaterThan(0);
    // The closing line sits after the ## References bullets — the footer of
    // the authored body.
    expect(template).toContain("Closes");
    // Guard the ordering comparison: without this, removing ## References
    // would make indexOf return -1 and the check below pass vacuously.
    expect(template).toContain("## References");
    expect(template.indexOf("Closes")).toBeGreaterThan(
      template.indexOf("## References"),
    );
    // And it is the FINAL line of the template — nothing may follow it.
    // Without this, appending a section after the closing line would still
    // pass the ordering check above.
    expect(template.trimEnd().endsWith("Closes #<n>")).toBe(true);
  });

  test("tracking-tickets: footer is ticketId-conditional — omitted when null, no placeholder", () => {
    const text = flat(read(TRACKING_TICKETS));
    expect(/no placeholder/i.test(text)).toBe(true);
  });

  test("team-pr: placement rationale is documented alongside the template", () => {
    expect(/placement rationale/i.test(flat(read(TEAM_PR)))).toBe(true);
  });

  test("team-pr: body refresh re-emits exactly one closing line", () => {
    const text = squash(read(TEAM_PR));
    // Step 9 lists the closing line among the refresh-surviving sections:
    // every `gh pr edit --body` re-emits exactly one, never duplicated,
    // never dropped.
    expect(/never duplicated/i.test(text)).toBe(true);
    expect(/never dropped/i.test(text)).toBe(true);
  });

  test("tracking-tickets: states the Closes footer placement (final line of the PR body)", () => {
    assertClosingFooterPlacement(TRACKING_TICKETS);
  });

  test("team-pr: states the Closes footer placement (final line of the PR body)", () => {
    assertClosingFooterPlacement(TEAM_PR);
  });

  // Multi-repo home-only closing rule — canonical in tracking-tickets; the
  // PR-opening hosts keep a one-clause gist plus the pointer.
  function assertHomeOnlyClosingRule(path: string) {
    const text = flat(read(path));
    // (b) companion PRs reference the issue without a closing keyword, in the
    // unambiguous qualified form (a bare #<n> is repo-scoped and would name a
    // different issue in a companion repo).
    expect(/non-closing/i.test(text)).toBe(true);
    expect(text).toContain("owner/repo#");
  }

  function assertHomeOnlyClosingPointer(path: string) {
    const text = flat(read(path));
    // Names the home-only rule and defers its detail to tracking-tickets.
    expect(/home[^.]{0,250}closing/i.test(text)).toBe(true);
    expect(loadsSkill(text, "tracking-tickets")).toBe(true);
  }

  test("tracking-tickets: multi-repo — only the home PR carries a closing keyword; companions use a non-closing qualified reference", () => {
    assertHomeOnlyClosingRule(TRACKING_TICKETS);
  });

  test("team-pr: points at tracking-tickets for the multi-repo home-only closing rule", () => {
    assertHomeOnlyClosingPointer(TEAM_PR);
  });

  test("team: PR gate points at tracking-tickets for the multi-repo home-only closing rule", () => {
    assertHomeOnlyClosingPointer(TEAM_SKILL);
  });
});

// ---------------------------------------------------------------------------
// The design-review brief lives in the `reviewing-designs` methodology skill
// rather than in the `eng-design-doc-review` entry point, so no skill is both
// a methodology and a slash command. Three callers load the same brief:
// skills/team/SKILL.md, skills/team-design/SKILL.md, and the entry point
// itself. Each dispatches it with the artifact directory substituted for
// `$ARGUMENTS`, which is the contract a subagent depends on.
// ---------------------------------------------------------------------------

describe("the design-review brief lives in reviewing-designs", () => {
  const REVIEWING_DESIGNS = join(REPO_ROOT, "skills", "reviewing-designs", "SKILL.md");

  // Missing-file reads return "" so a not-yet-created skill fails as an
  // assertion, never as an ENOENT crash.
  const readOrMissing = (path: string): string => (existsSync(path) ? read(path) : "");

  const CALLERS: [string, string][] = [
    ["team", join(REPO_ROOT, "skills", "team", "SKILL.md")],
    ["team-design", join(REPO_ROOT, "skills", "team-design", "SKILL.md")],
    ["eng-design-doc-review", join(REPO_ROOT, "skills", "eng-design-doc-review", "SKILL.md")],
  ];

  test("reviewing-designs carries the ## Review brief heading verbatim", () => {
    expect(existsSync(REVIEWING_DESIGNS)).toBe(true);
    expect(/^## Review brief$/m.test(readOrMissing(REVIEWING_DESIGNS))).toBe(true);
  });

  test("reviewing-designs pins the APPROVE / REQUEST CHANGES / COMMENT verdict set", () => {
    const text = readOrMissing(REVIEWING_DESIGNS);
    expect(/^- \*\*APPROVE\*\*/m.test(text)).toBe(true);
    expect(/^- \*\*REQUEST CHANGES\*\*/m.test(text)).toBe(true);
    expect(/^- \*\*COMMENT\*\*/m.test(text)).toBe(true);
  });

  test("every caller of the design review loads the reviewing-designs brief", () => {
    // The load form (`call the Skill tool with \`<name>\``) is the machine-read
    // half of the reference; PHRASE in tests/helpers/skill-refs.ts owns it.
    const offenders = CALLERS.filter(([, path]) => !loadsSkill(readOrMissing(path), "reviewing-designs")).map(
      ([name]) => name,
    );
    expect(offenders).toEqual([]);
  });

  test("every caller dispatches the brief with the artifact directory substituted", () => {
    // Matched over squash() because this repo hard-wraps prose and the phrase
    // splits across lines. The contract words own the check, never the
    // `substitut` stem, which passes on a sentence naming the wrong direction.
    const offenders = CALLERS.filter(
      ([, path]) => !squash(readOrMissing(path)).includes(SUBSTITUTION_CLAUSE),
    ).map(([name]) => name);
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The no-consult rule — free L2 content tripwire (docs/testing.md §2). While a
// Blocking or Major finding is open the review loop runs automatically: it
// never stops mid-run to hand the finding to the user. The rule is owned by
// skills/review-severity-tiers/SKILL.md and restated by both copies of the
// aggregate loop, so all three files must stay clear of escalation wording.
// ---------------------------------------------------------------------------

describe("the no-consult rule (L2 tripwire)", () => {
  for (const name of ["team", "team-implement", "review-severity-tiers"]) {
    test(`${name} SKILL never escalates an open finding to the user mid-run`, () => {
      const text = read(join(REPO_ROOT, "skills", name, "SKILL.md"));
      // Guard: an empty or moved file must fail, not vacuously pass the
      // absence check below.
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain("escalate to the user");
    });
  }
});

// ---------------------------------------------------------------------------
// Minor-deferral — free L2 content tripwire (docs/testing.md §2). Once
// Blocking/Major are clean, Minor-and-below findings (plus design-review
// COMMENT findings, tagged by source) land in the PR body's `## Review notes`
// section for the human's PR review — they are never presented mid-run, and
// the section is omitted entirely when empty.
// ---------------------------------------------------------------------------

describe("Minor findings defer to the PR body (L2 tripwire)", () => {
  const TEAM_PR = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");
  const TEAM_IMPL = join(REPO_ROOT, "skills", "team-implement", "SKILL.md");

  // The PR Body Template: the first fenced code block after the
  // "## PR Body Template" heading (pattern: the closing-footer describe).
  function prBodyTemplate(text: string): string {
    const afterHeading = text.split("## PR Body Template")[1] ?? "";
    return afterHeading.match(/```\n([\s\S]*?)```/)?.[1] ?? "";
  }

  test("team-pr template carries ## Review notes between How to Verify and References", () => {
    const template = prBodyTemplate(read(TEAM_PR));
    // Fail loud if the template block vanished, so the position assertions
    // below cannot pass vacuously against an empty string.
    expect(template.length).toBeGreaterThan(0);
    expect(template).toContain("## Review notes");
    expect(template).toContain("## How to Verify");
    expect(template).toContain("## References");
    expect(template.indexOf("## Review notes")).toBeGreaterThan(
      template.indexOf("## How to Verify"),
    );
    expect(template.indexOf("## Review notes")).toBeLessThan(
      template.indexOf("## References"),
    );
  });

  test("team-pr omits the section when empty and tags design-review findings by source", () => {
    const text = flat(read(TEAM_PR));
    expect(/omit the section entirely when empty/i.test(text)).toBe(true);
    expect(/never emit a bare heading/i.test(text)).toBe(true);
    // Design-review COMMENT findings are tagged with their source artifact.
    expect(text).toContain("design-review-");
  });

  test("team-implement records Minors for the PR body instead of presenting them", () => {
    expect(read(TEAM_IMPL)).not.toContain("present them to the user");
  });
});

// ---------------------------------------------------------------------------
// No mid-run human-gate claims — free L2 forbidden-pattern sweep
// (docs/testing.md §2, forbidden-pattern form). The pipeline has no mid-run
// human gates; no doc, skill, or agent prompt may claim one exists. Allowlist:
// docs/ethos.md keeps its deliberate human-gate counterweight line, and the
// negation phrase "no mid-run human gates" is the one sanctioned wording that
// contains the forbidden substring. CHANGELOG history is append-only and not
// scanned.
// ---------------------------------------------------------------------------

describe("no mid-run human-gate claims (L2 forbidden-pattern sweep)", () => {
  // Also catches the phrasing variants that survived earlier sweeps:
  // "human approval gate", "human design gate", "human contract", and the
  // retired "design gate"/"design-gate" (the sanctioned wordings —
  // "design review", "design-review gate", "Design Review Gate" — do not
  // match the pattern, so they need no allowlist).
  const FORBIDDEN = /human[ -]gate|human (approval|design) gate|human contract|design[ -]gate/i;
  const NEGATION = /no mid-run human gates/i;

  // All .md files under `dir` (relative to REPO_ROOT), recursively, skipping
  // docs/plans/ — pipeline state is never scanned.
  function mdFilesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "plans") continue;
        out.push(...mdFilesUnder(rel));
      } else if (entry.name.endsWith(".md")) {
        out.push(rel);
      }
    }
    return out;
  }

  test("'human gate' appears nowhere in docs, README, AGENTS, skills, or agents", () => {
    const files = [
      ...mdFilesUnder("docs"),
      ...mdFilesUnder("skills"),
      ...mdFilesUnder("agents"),
      "README.md",
      "AGENTS.md",
    ];
    const offenders: string[] = [];
    for (const rel of files) {
      const lines = read(join(REPO_ROOT, rel)).split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (FORBIDDEN.test(line) && !NEGATION.test(line)) {
          offenders.push(`${rel}:${i + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Exception vocabulary is how a rule quietly stops applying: a clause names one
// case, the rule reads false everywhere else, and nothing fails. This sweep
// makes the class fail the build. It is the extension-list widening of the
// stated-cap sweep above, over every file that carries Team's own rule prose.
//
// Normalize in two ordered steps, both load-bearing:
//   1. `.mjs` only — strip a leading comment prefix from each line, so a rule
//      stated across two `//` lines is one string.
//   2. every file — squash() whitespace, so a hard-wrapped phrase still
//      matches (docs/testing.md, "The pattern cannot match the file's own line
//      breaks").
// The squash costs the line number, which is why an offender reports the
// matched phrase instead.
//
// Negation is tested per match by span containment, never per file: a
// file-scoped negation would exempt five whole files and silently drop six
// gated loci, including every multi-locus row this sweep makes atomic.
//
// A red names a file and a phrase. Restate that sentence — never add an
// allowlist entry. The allowlist takes domain nouns only, and its five entries
// are fixed.
// ---------------------------------------------------------------------------

describe("exception vocabulary appears in no rule prose", () => {
  const FAMILIES: Record<string, RegExp> = {
    // An exception claim: a state verb before "the exception", or a counted or
    // labeled one. The counter list runs to ten so a future "four exceptions"
    // is gated too, and the optional `[\w-]+` token admits a hyphenated word
    // ("the only working-tree exception").
    exception:
      /\b(?:is|are|was|were|become|becomes|stays|remains)\s+the\s+exceptions?\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+|only|sole|single|named|stated|deliberate)\s+(?:[\w-]+\s+)?exceptions?\b/gi,
    exempt: /\bexempt\w*\b/gi,
    "carve-out": /\bcarve-?outs?\b/gi,
    "stated deviation": /\bstated deviations?\b/gi,
  };

  // A phrase earns a place here only by containing the forbidden text it
  // neutralizes, which the last test in this describe asserts.
  const NEGATIONS = ["does not become the exception", "no exemption"];

  // Keyed by `<family>|<file>`: the word is a domain noun there, not a rule
  // narrowing. Every file stays swept for every family it is not keyed for.
  const ALLOWLIST = new Set([
    "carve-out|skills/pr-open-comments/SKILL.md",
    "carve-out|skills/pr-watch-as-author/SKILL.md",
    "carve-out|skills/pr-watch-as-reviewer/SKILL.md",
    "carve-out|skills/principle-plan-present-wait/SKILL.md",
    "exempt|skills/nested-agents/SKILL.md",
  ]);

  // All files under `dir` (relative to REPO_ROOT) ending in one of `exts`,
  // recursively, skipping docs/plans/ — pipeline state is never scanned.
  function filesUnder(dir: string, exts: string[]): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "plans") continue;
        out.push(...filesUnder(rel, exts));
      } else if (exts.some((ext) => entry.name.endsWith(ext))) {
        out.push(rel);
      }
    }
    return out;
  }

  const MARKDOWN_ROOTS = ["docs", "skills", "agents", ".claude/skills"];
  const SCRIPT_ROOTS = ["hooks", ".claude/hooks", "skills"];
  // In for what they will host, not for today's hit count: all four state a
  // Team rule and all four carry zero hits.
  const NAMED_FILES = ["README.md", "AGENTS.md", "CONTRIBUTING.md", "evals/README.md"];

  const sweptFiles = [
    ...MARKDOWN_ROOTS.flatMap((root) => filesUnder(root, [".md"])),
    ...NAMED_FILES,
    ...SCRIPT_ROOTS.flatMap((root) => filesUnder(root, [".mjs"])),
  ];

  function normalize(text: string, isScript: boolean): string {
    const stripped = isScript
      ? text
          .split("\n")
          .map((line) => line.replace(/^[ \t]*(\/\/|\*)[ \t]?/, ""))
          .join("\n")
      : text;
    return squash(stripped);
  }

  type Match = { family: string; phrase: string; start: number; end: number };

  /** Every family match in `text`, with its `[start, end)` offsets. */
  function familyMatchesIn(text: string, allowedFamily: (family: string) => boolean = () => false): Match[] {
    return Object.entries(FAMILIES)
      .filter(([family]) => !allowedFamily(family))
      .flatMap(([family, pattern]) =>
        [...text.matchAll(pattern)].map((hit) => ({
          family,
          phrase: hit[0],
          start: hit.index ?? 0,
          end: (hit.index ?? 0) + hit[0].length,
        })),
      );
  }

  /** The `[start, end)` offsets of every sanctioned negation phrase in `text`. */
  function negationSpansIn(text: string): [number, number][] {
    return NEGATIONS.flatMap((negation) =>
      [...text.matchAll(new RegExp(negation, "gi"))].map(
        (hit) => [hit.index ?? 0, (hit.index ?? 0) + hit[0].length] as [number, number],
      ),
    );
  }

  // Every forbidden phrase in `text`, minus the ones a negation phrase wraps.
  // The unit is the match, not the file and not the line: the squash destroyed
  // the line, and a file-scoped negation would exempt whole files.
  function forbiddenIn(text: string, allowedFamily: (family: string) => boolean = () => false): Match[] {
    const negations = negationSpansIn(text);
    return familyMatchesIn(text, allowedFamily).filter(
      (match) => !negations.some(([from, to]) => match.start >= from && match.end <= to),
    );
  }

  test("no swept file states a rule exception", () => {
    const offenders = sweptFiles.flatMap((rel) =>
      forbiddenIn(normalize(read(join(REPO_ROOT, rel)), rel.endsWith(".mjs")), (family) =>
        ALLOWLIST.has(`${family}|${rel}`),
      ).map((match) => `${rel}: "${match.phrase}"`),
    );
    expect(offenders).toEqual([]);
  });

  // Guard (a): a mis-scoped walk would turn every check above into a no-op, and
  // nothing would announce it. Every root and every named file must contribute.
  test("the sweep reaches every root and every named file", () => {
    expect(sweptFiles.length).toBeGreaterThan(50);
    const missing = [
      ...MARKDOWN_ROOTS.filter((root) => !sweptFiles.some((f) => f.startsWith(`${root}/`) && f.endsWith(".md"))),
      ...SCRIPT_ROOTS.filter((root) => !sweptFiles.some((f) => f.startsWith(`${root}/`) && f.endsWith(".mjs"))),
      ...NAMED_FILES.filter((named) => !sweptFiles.includes(named)),
    ];
    expect(missing).toEqual([]);
    expect(sweptFiles.filter((f) => f.includes("/plans/"))).toEqual([]);
  });

  // Guard (b), the teeth: a check that fires on one family says nothing about
  // the other three. Count matches, not files, so a typo in any single pattern
  // drops the count and reds here rather than going quietly blind.
  test("the matcher finds every planted family, and neither negation phrase", () => {
    const fixture = [
      "// A planted fixture, one phrase per forbidden family.",
      "// The step-4 usefulness reaction is the one exception, and it is deliberate.",
      "// Doc comments on public interfaces are exempt.",
      "// Generated files are the one carve-out: a lockfile, a compiled schema.",
      "// code-reviewer preloads cross-model-review beyond the soft limit — a stated deviation.",
      "// The never-expanded residue below is",
      "// the exception, and it is the same on both paths.",
      "// Sanctioned: a preloaded skill does not become the exception, and no exemption applies.",
    ].join("\n");

    const matches = forbiddenIn(normalize(fixture, true));
    expect(matches.map((m) => m.phrase.toLowerCase())).toEqual([
      "one exception",
      "is the exception",
      "exempt",
      "carve-out",
      "stated deviation",
    ]);
    expect(matches.map((m) => m.family).sort()).toEqual([
      "carve-out",
      "exception",
      "exception",
      "exempt",
      "stated deviation",
    ]);
    // The two sanctioned negations, on their own, yield nothing: containment
    // suppresses only the match a negation wraps, so the planted phrases beside
    // them need no spacing rule.
    const sanctioned = "a preloaded skill does not become the exception, and no exemption applies.";
    expect(forbiddenIn(squash(sanctioned))).toEqual([]);
  });

  // Guard (c): a negation entry that suppresses nothing is a hole waiting for a
  // future family to fall through, so each must wrap a real family match.
  test("every negation phrase wraps at least one forbidden match", () => {
    const offenders = NEGATIONS.filter((negation) => familyMatchesIn(negation).length === 0);
    expect(offenders).toEqual([]);
  });
});

describe("checks and balances", () => {
  // Separation of powers is enforced by frontmatter, not by prose: a reviewer
  // that could edit could fix what it found and then approve its own fix,
  // which collapses generator and evaluator into one role. A producer holds
  // Write but casts no verdict. Neither role can close a review cycle alone.
  const REVIEWERS = [
    "code-reviewer",
    "security-reviewer",
    "technical-writer",
    "ux-reviewer",
    "verifier",
  ];

  const PRODUCERS = [
    "questioner",
    "design-author",
    "structure-planner",
    "planner",
    "test-architect",
    "implementer",
  ];

  for (const agent of REVIEWERS) {
    test(`${agent} holds no write tool`, () => {
      const fm = frontmatter(read(join(REPO_ROOT, "agents", `${agent}.md`)));
      const tools = /^tools:(.*)$/m.exec(fm)?.[1] ?? "";
      expect(/\bWrite\b/.test(tools)).toBe(false);
      expect(/\bEdit\b/.test(tools)).toBe(false);
      expect(/\bNotebookEdit\b/.test(tools)).toBe(false);
    });

    test(`${agent} runs in plan permission mode`, () => {
      const fm = frontmatter(read(join(REPO_ROOT, "agents", `${agent}.md`)));
      expect(/^permissionMode:\s*plan\s*$/m.test(fm)).toBe(true);
    });
  }

  for (const agent of PRODUCERS) {
    test(`${agent} holds a write tool and is not a reviewer`, () => {
      const fm = frontmatter(read(join(REPO_ROOT, "agents", `${agent}.md`)));
      const tools = /^tools:(.*)$/m.exec(fm)?.[1] ?? "";
      expect(/\bWrite\b/.test(tools)).toBe(true);
      expect(REVIEWERS).not.toContain(agent);
    });
  }

  test("both copies of the aggregate loop load the severity-tier authority", () => {
    // Nothing bounds the review loop by a count, so its exit condition is the
    // aggregate — and one skill owns it. Both loop copies must instruct a load
    // of that skill, or a reader of either one alone learns no exit condition.
    // A load is the bare name through the Skill tool, never a path
    // (tests/helpers/skill-refs.ts).
    const team = read(join(REPO_ROOT, "skills", "team", "SKILL.md"));
    const implement = read(join(REPO_ROOT, "skills", "team-implement", "SKILL.md"));
    expect(loadsSkill(team, "review-severity-tiers")).toBe(true);
    expect(loadsSkill(implement, "review-severity-tiers")).toBe(true);
  });

  test("the severity-tier authority still carries the ## Aggregating Verdicts section", () => {
    // The load above is only worth having while its target section exists: a
    // load of a skill whose aggregate section was deleted is a dangling
    // reference that the two `loadsSkill` checks above cannot see.
    const tiers = read(join(REPO_ROOT, "skills", "review-severity-tiers", "SKILL.md"));
    expect(/^## Aggregating Verdicts$/m.test(tiers)).toBe(true);
  });

  test("both copies of the design loop speak the APPROVE and COMMENT verdict vocabulary", () => {
    // The DESIGN loop exits on the verdict token, so both copies must still
    // carry the two values that end it (skills/artifact-frontmatter/SKILL.md).
    // Residual: both files also use the tokens away from their exit branch —
    // in resume detection, in the phase-loop sketch, in the stop condition,
    // and in the `verdict:` frontmatter enum — so a whole-file check stays
    // green if someone deletes the exit branch itself. This pins the verdict
    // vocabulary, not the branch; whether the branch still acts on the token
    // is a meaning question, deferred to the L5/L6 tiers.
    const design = read(join(REPO_ROOT, "skills", "team-design", "SKILL.md"));
    const team = read(join(REPO_ROOT, "skills", "team", "SKILL.md"));
    expect(design).toContain("APPROVE");
    expect(design).toContain("COMMENT");
    expect(team).toContain("APPROVE");
    expect(team).toContain("COMMENT");
  });

  // Every auto-fix tier costs a full re-review: implementer, then all five
  // reviewers again. A finding whose own label says non-blocking must not
  // carry that price, or the loop only ends when five reviewers return zero
  // non-blocking findings — not a reachable state on prose.
  const TIER_ROW = (tier: string): string => {
    const tiers = read(join(REPO_ROOT, "skills", "review-severity-tiers", "SKILL.md"));
    return (
      tiers.split("\n").find((line) => line.startsWith(`| **${tier}**`)) ?? ""
    );
  };

  for (const token of ["suggestion (non-blocking)", "security MEDIUM"]) {
    test(`${token} is priced as Minor, not as an auto-fixed round`, () => {
      const major = TIER_ROW("Major");
      const minor = TIER_ROW("Minor and below");
      // Guard: a missing or renamed row must fail, not vacuously pass below.
      expect(major.length).toBeGreaterThan(0);
      expect(minor.length).toBeGreaterThan(0);
      expect(minor).toContain(token);
      expect(major).not.toContain(token);
    });
  }

  test("security-reviewer and reviewing-code agree MEDIUM does not block", () => {
    // Three files describe this one boundary. When the tier table auto-fixed
    // MEDIUM while these two called it non-blocking, the reviewer reported
    // MEDIUMs candidly and each one silently bought a round.
    const agent = read(join(REPO_ROOT, "agents", "security-reviewer.md"));
    const review = read(join(REPO_ROOT, "skills", "reviewing-code", "SKILL.md"));
    expect(agent.length).toBeGreaterThan(0);
    expect(review.length).toBeGreaterThan(0);
    expect(/MEDIUM and LOW do not block/.test(agent)).toBe(true);
    expect(/MEDIUM\/LOW findings are reported but\s+do not block/.test(review)).toBe(true);
    // And the tier table must not contradict them.
    expect(TIER_ROW("Major")).not.toContain("MEDIUM");
  });
});

describe("code-review direct invocation preserves separation", () => {
  // `code-review` is the front door over the `reviewing-code` methodology.
  // The main session holds the history that methodology forbids, so the
  // standalone path must hand off rather than review in place. Without this,
  // the separation that the frontmatter enforces for the pipeline has no
  // counterpart on the path a natural-language phrase reaches.
  const CODE_REVIEW = read(join(REPO_ROOT, "skills", "code-review", "SKILL.md"));

  test("the skill states the direct-invocation path", () => {
    expect(CODE_REVIEW).toContain("## When Invoked Directly");
  });

  test("the direct path dispatches instead of reviewing inline", () => {
    const text = flat(CODE_REVIEW);
    expect(text).toContain("Do not review inline");
    expect(/Dispatch the\s+`code-reviewer` agent/.test(text)).toBe(true);
  });
});

// The orchestrator persists what a return-only agent returns, so a lost
// result costs a full re-dispatch for those and nothing for the agents that
// write their own artifacts. The asymmetry decides how a dispatch must be
// shaped, and it was undocumented — the two kinds are named nowhere else.
describe("phase agents split into self-writing and return-only", () => {
  const TEAM = read(join(REPO_ROOT, "skills", "team", "SKILL.md"));

  test("the orchestrator states where each kind's output lives", () => {
    // Guard: a missing file must fail, not vacuously pass the checks below.
    expect(TEAM.length).toBeGreaterThan(0);
    expect(TEAM).toContain("## Where a phase agent's output lives");
    for (const agent of ["questioner", "researcher", "file-finder"]) {
      expect(TEAM).toContain(agent);
    }
  });

  test("return-only agents genuinely hold no write tool", () => {
    // The doc claims researcher and file-finder cannot persist their own
    // output. If that ever stops being true the guidance is wrong, not stale.
    for (const agent of ["researcher", "file-finder"]) {
      const fm = frontmatter(read(join(REPO_ROOT, "agents", `${agent}.md`)));
      expect(fm.length).toBeGreaterThan(0);
      const tools = /^tools:(.*)$/m.exec(fm)?.[1] ?? "";
      expect(tools.length).toBeGreaterThan(0);
      expect(/\bWrite\b/.test(tools)).toBe(false);
      expect(/\bEdit\b/.test(tools)).toBe(false);
    }
  });

  test("self-writing agents genuinely hold a write tool", () => {
    for (const agent of ["questioner", "design-author", "structure-planner", "planner"]) {
      const fm = frontmatter(read(join(REPO_ROOT, "agents", `${agent}.md`)));
      expect(fm.length).toBeGreaterThan(0);
      const tools = /^tools:(.*)$/m.exec(fm)?.[1] ?? "";
      expect(/\bWrite\b/.test(tools)).toBe(true);
    }
  });
});

// An unreachable ssh-agent breaks the push at the PR phase and stalls every
// scratch-repo test while global commit.gpgsign is true. Read once at the
// start, it names a cause; discovered later, it looks like a regression in
// the branch. The checks are read-only and never block the run.
describe("the worktree phase preflights the environment", () => {
  const TEAM = read(join(REPO_ROOT, "skills", "team", "SKILL.md"));

  test("it reads the three signals that predict a later failure", () => {
    // Guard: a missing file must fail, not vacuously pass the checks below.
    expect(TEAM.length).toBeGreaterThan(0);
    for (const probe of ["ssh-add -l", "gh auth status", "commit.gpgsign"]) {
      expect(TEAM).toContain(probe);
    }
  });

  test("the preflight is explicitly non-blocking", () => {
    // A preflight that can halt a run is a gate, and this one must not be:
    // a cold credential is worth naming, never worth stopping for.
    expect(/blocks the run/i.test(squash(TEAM))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No stated round or revision cap — free L2 forbidden-pattern sweep
// (docs/testing.md §2, forbidden-pattern form). Neither review loop stops on a
// count: DESIGN ends on the verdict, IMPLEMENT ends when no Blocking and no
// Major finding remains. So no doc, skill, or agent prompt may state a round
// or revision limit, or describe a halt caused by reaching one. Seven
// patterns, one test each, over every .md file under docs/, skills/, and
// agents/, plus README.md and AGENTS.md. docs/plans/ is pipeline state and
// CHANGELOG.md is append-only history naming a cap that really did exist;
// neither is scanned.
//
// Each test fires its pattern at a planted positive before trusting a clean
// offender list (the planted-positive discipline in docs/testing.md §2): a
// sweep whose pattern can no longer see the text it was written against
// reports clean for the wrong reason. Each planted sample is the real text
// from the site that motivated the pattern, its line wrap included; the
// at-or-under-cap sample straddles that wrap, so one planted positive also
// proves flat() feeds the matcher.
// ---------------------------------------------------------------------------

describe("no stated round or revision cap (L2 forbidden-pattern sweep)", () => {
  // All .md files under `dir` (relative to REPO_ROOT), recursively, skipping
  // docs/plans/ — pipeline state is never scanned.
  function mdFilesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "plans") continue;
        out.push(...mdFilesUnder(rel));
      } else if (entry.name.endsWith(".md")) {
        out.push(rel);
      }
    }
    return out;
  }

  const SWEPT_FILES = [
    ...mdFilesUnder("docs"),
    ...mdFilesUnder("skills"),
    ...mdFilesUnder("agents"),
    "README.md",
    "AGENTS.md",
  ];

  // Any count a multi-round bound could name, so it starts at 2. The residue
  // it leaves is `1`/`one`: "at the cost of one round" is the loop paying for
  // a re-review, not a bound on it.
  const COUNT = String.raw`(?:[2-9]|[1-9]\d+|two|three|four|five|six|seven|eight|nine|ten)`;
  // The same set without multi-digit numerals, for the pattern that reads a
  // bare cap value with no round or revision noun to scope it. A legitimate
  // cap on something else ("capped at 30 reply lines") must stay unswept.
  const SMALL_COUNT = String.raw`(?:[2-9]|two|three|four|five|six|seven|eight|nine|ten)`;

  // Each entry plants two positives: the historical five-valued text that
  // motivated the pattern, and the same claim at a different count. A pattern
  // pinned to the old number bans the old wording, not the rule — a run that
  // announced a cap of six is what put the second sample here.
  const CAP_PATTERNS = [
    {
      label: "a numbered round review bound",
      pattern: new RegExp(String.raw`\b${COUNT}[-\s]rounds?\b`, "i"),
      planted: [
        "- **Bounded veto.** The review loop is capped at five rounds, then halts to a\n  human.",
        "- **Bounded veto.** The review loop is capped at six rounds, then halts\n  loudly to a human.",
      ],
    },
    {
      label: "a numbered revision design bound",
      pattern: new RegExp(String.raw`\b${COUNT}[-\s]revisions?\b`, "i"),
      planted: [
        "runs. Cap at 5 revisions. At cap, the run halts terminally and reports\nthe unresolved findings — no consultation, no PR.",
        "runs. Cap at 6 revisions. At cap, the run halts terminally and reports\nthe unresolved findings — no consultation, no PR.",
      ],
    },
    {
      label: "a terminal numbered `revision:`",
      // `revision: 0` and `revision: 1` are the first-draft values the schema
      // really uses, so the terminal-cap pattern starts at 2.
      pattern: /revision:\s*[2-9]\d*\b/,
      planted: [
        "   frontmatter, then a fresh review round runs. Cap at `revision: 5`. At\n   cap, halt terminally and report the unresolved findings — no PR.",
        "   frontmatter, then a fresh review round runs. Cap at `revision: 6`. At\n   cap, halt terminally and report the unresolved findings — no PR.",
      ],
    },
    {
      label: "a numbered cap value",
      pattern: new RegExp(String.raw`\bcap(?:ped)?\s+(?:at\s+|is\s+)?${SMALL_COUNT}\b`, "i"),
      planted: [
        "`revision: <n+1>` in the new draft's frontmatter. The cap is 5. At the\ncap, the run halts terminally.",
        "`revision: <n+1>` in the new draft's frontmatter. The cap is 6. At the\ncap, the run halts terminally.",
      ],
    },
    {
      label: "a numbered round-count comparison",
      pattern: new RegExp(String.raw`\bround count\s*[<>≥≤]=?\s*${COUNT}\b`, "i"),
      planted: [
        "   - If round count ≥ 5: **halt** with a full unresolved-findings\n     summary — terminal; no PR is opened.",
        "   - If round count ≥ 6: **halt** with a full unresolved-findings\n     summary — terminal; no PR is opened.",
      ],
    },
    {
      label: "a branch taken at or under a cap",
      // The planted sample is the line-wrapped instance on purpose: "At the"
      // and "cap" sit on different lines, so this pattern matches only once
      // flat() has joined them.
      pattern: /\b(?:at|under)\s+(?:the\s+)?cap\b/i,
      planted: [
        "`revision: <n+1>` in the new draft's frontmatter. The cap is 5. At the\ncap, the run halts terminally.",
      ],
    },
    {
      label: "a revision cap or revision budget",
      pattern: /\brevision\s+(?:cap|budget)\b/i,
      planted: [
        "(machine policy). The pass runs on **every design-review round**, up to\nthe revision cap. Relative to the code-review pass, the payload is a\ndesign document rather than a diff.",
      ],
    },
  ];

  for (const { label, pattern, planted } of CAP_PATTERNS) {
    test(`no file states ${label}`, () => {
      // Planted positives: prove the pattern still sees the text it bans.
      for (const sample of planted) {
        expect(pattern.test(flat(sample))).toBe(true);
      }
      // Guard: an empty corpus must fail, not vacuously pass the sweep.
      expect(SWEPT_FILES.length).toBeGreaterThan(0);
      const offenders = SWEPT_FILES.filter((rel) =>
        pattern.test(flat(read(join(REPO_ROOT, rel)))),
      );
      expect(offenders).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// The IMPLEMENT round item names the open finding count — free L2 drift
// tripwire (docs/testing.md §2, template-string form). With no round cap, a
// round number alone does not tell the operator whether the loop is
// converging, so every round item from round 2 on carries the open Blocking
// and Major count. Three files restate that item and must carry one literal.
// The round-1 TodoWrite seed keeps the bare label: it is written before the
// implementer runs, so no aggregate has sorted anything and no count exists.
// ---------------------------------------------------------------------------

const ROUND_ITEM = "Review round <n+1> (<b> Blocking, <m> Major open)";

describe("the IMPLEMENT round item carries the open finding count (L2 tripwire)", () => {
  test("all three restating files carry the round-item template byte-identically", () => {
    expect(read(join(REPO_ROOT, "skills", "team", "SKILL.md"))).toContain(ROUND_ITEM);
    expect(read(join(REPO_ROOT, "skills", "team-implement", "SKILL.md"))).toContain(ROUND_ITEM);
    expect(read(join(REPO_ROOT, "docs", "architecture.md"))).toContain(ROUND_ITEM);
  });

  test("the round-1 TodoWrite seed keeps the bare label and carries no count", () => {
    const seed = read(join(REPO_ROOT, "skills", "team-implement", "SKILL.md"))
      .split("\n")
      .filter((line) => line.includes("Review round 1"))
      .join("\n");
    // Guard: a renamed or deleted seed line must fail, not vacuously pass the
    // absence check below.
    expect(seed.length).toBeGreaterThan(0);
    expect(seed).not.toContain(ROUND_ITEM);
  });
});

// ---------------------------------------------------------------------------
// No ceiling-hugging foreground sleep — free L2 forbidden-pattern sweep
// (docs/testing.md §2, forbidden-pattern form). A wait on anything outside the
// session is one backgrounded call
// (skills/principle-non-blocking-waits/SKILL.md). A foreground wait is killed
// at the harness ceiling (600s in Claude Code), so a procedure that sizes a
// sleep to sit at or just under that ceiling has chunked a wait it should have
// backgrounded: it pays a turn per fragment and still dies at the cap when the
// host suspends. The 540-600s band is that signature; no in-script poll
// interval lands there by coincidence.
//
// skills/principle-non-blocking-waits/ is exempt: it names the banned values as
// the counter-examples that motivate the rule, the same way CHANGELOG.md is
// exempt from the round-cap sweep as history.
// ---------------------------------------------------------------------------

describe("no ceiling-hugging foreground sleep (L2 forbidden-pattern sweep)", () => {
  const EXEMPT = "skills/principle-non-blocking-waits/";

  function mdFilesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "plans") continue;
        out.push(...mdFilesUnder(rel));
      } else if (entry.name.endsWith(".md")) {
        out.push(rel);
      }
    }
    return out;
  }

  const SWEPT_FILES = [...mdFilesUnder("docs"), ...mdFilesUnder("skills"), ...mdFilesUnder("agents")]
    .filter((rel) => !rel.startsWith(EXEMPT));

  // 540-600 inclusive: the band a author reaches for when sizing a sleep to
  // just miss a 600s kill.
  const CEILING_SLEEP = /\bsleep\s+(?:5[4-9]\d|600)\b/;

  const PLANTED = [
    // The historical cycle body this change removed, its line wrap included.
    "- Each later cycle is up to three `sleep 600` Bash calls plus one short\n  poll call (~31 minutes per cycle).",
    // The same chunking at the value a run drifted to after the first kill.
    "(Sleep call hit the 10-minute cap due to timing jitter. Shortening sleeps to `sleep 570` to stay under the cap.)",
  ];

  test("the pattern still sees the text it bans", () => {
    for (const sample of PLANTED) {
      expect(CEILING_SLEEP.test(flat(sample))).toBe(true);
    }
    // A value outside the band is not the signature and must stay unswept.
    expect(CEILING_SLEEP.test("sleep 1860; run the poll")).toBe(false);
    expect(CEILING_SLEEP.test("sleep 30")).toBe(false);
  });

  test("no runtime doc, skill, or agent prompt sizes a sleep to the ceiling", () => {
    // Guard: an empty corpus must fail, not vacuously pass the sweep.
    expect(SWEPT_FILES.length).toBeGreaterThan(0);
    const offenders = SWEPT_FILES.filter((rel) => CEILING_SLEEP.test(flat(read(join(REPO_ROOT, rel)))));
    expect(offenders).toEqual([]);
  });

  test("the exemption is real: the principle names the counter-examples it bans", () => {
    // Without this, the exemption could silently cover an empty file and the
    // sweep would look principled while protecting nothing.
    const principle = read(join(REPO_ROOT, "skills", "principle-non-blocking-waits", "SKILL.md"));
    expect(CEILING_SLEEP.test(flat(principle))).toBe(true);
  });
});
