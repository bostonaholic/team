import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, ".claude", "scripts", "skill-audit.mjs");

type Behavior = {
  inputs: { argument: string | null; artifacts: string[] };
  outputs: { artifacts: string[] };
  sideEffects: string[];
  gates: string[];
  artifacts: string[];
  loadedSkills: string[];
  readSkills: string[];
};

type Report = {
  summary: {
    skills: number;
    bodyWords: number;
    duplicateBlocks: number;
    categories: Record<string, { skills: number }>;
    cohorts: Record<string, { skills: number }>;
  };
  skills: Array<{
    name: string;
    category: string;
    resourceFiles: string[];
    bodyWords: number;
    conditionalReferenceWords: number;
    totalInstructionWords: number;
    bodyAndTransitiveLoadedWords: number;
    transitiveLoadedWords: number;
    transitiveLoadedSkills: string[];
    transitiveReadSkills: string[];
    transitiveInstructionSkills: string[];
    invocation: {
      name: string;
      description: string;
      userInvocable: boolean;
      modelInvocable: boolean;
      argumentHint: string | null;
      effort: string | null;
      ui: {
        displayName: string | null;
        shortDescription: string | null;
        defaultPrompt: string | null;
        allowImplicitInvocation: boolean | null;
      } | null;
    };
    inputs: { argument: string | null; artifacts: string[] };
    outputs: { artifacts: string[] };
    sideEffects: string[];
    gates: string[];
    artifacts: string[];
    loadedSkills: string[];
    readSkills: string[];
    citedSkills: string[];
    composedSkills: string[];
    directBehavior: Behavior;
    effectiveBehavior: Behavior;
  }>;
  duplicateBlocks: Array<{ owners: string[]; text: string }>;
  comparison?: {
    ref: string;
    summary: { publicInterfaceChanges: number; behaviorContractChanges: number };
    skills: Array<{
      name: string;
      status: "added" | "removed" | "present";
      publicInterfaceChanged: boolean;
      behaviorContractChanged: boolean;
      behaviorContractChanges: string[];
      baseBehaviorContract: Record<string, unknown> | null;
      currentBehaviorContract: Record<string, unknown> | null;
      metrics: Record<string, { base: number; current: number; delta: number }>;
    }>;
  };
};

function run(root = ROOT, base?: string): Report {
  const args = [SCRIPT, "--json", "--root", root];
  if (base) args.push("--base", base);
  return JSON.parse(execFileSync("node", args, { cwd: root, encoding: "utf8" })) as Report;
}

function runText(root = ROOT): string {
  return execFileSync("node", [SCRIPT, "--root", root], { cwd: root, encoding: "utf8" });
}

function skill(name: string, frontmatter: string, body: string): string {
  return `---\nname: ${name}\n${frontmatter}---\n\n# ${name}\n\n${body}\n`;
}

function usesSharedArtifactResolver(report: Report): boolean {
  return report.skills
    .find((entry) => entry.name === "artifact-frontmatter")
    ?.resourceFiles.some((path) => path.endsWith("/resolve-topic.mjs")) ?? false;
}

describe("skill audit", () => {
  test("accounts for every runtime skill and classifies each once", () => {
    const report = run();
    const migrated = usesSharedArtifactResolver(report);
    const directories = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => readdirSync(join(ROOT, "skills", entry.name)).includes("SKILL.md"));

    expect(report.summary.skills).toBe(directories.length);
    expect(report.skills.length).toBe(directories.length);
    expect(new Set(report.skills.map((entry) => entry.name)).size).toBe(directories.length);
    expect(
      Object.values(report.summary.categories).reduce((total, category) => total + category.skills, 0),
    ).toBe(directories.length);
    expect(report.summary.bodyWords).toBeGreaterThan(0);
    expect(report.summary.cohorts.principle?.skills).toBe(24);
    expect(report.summary.cohorts.methodology?.skills).toBe(37);
    expect(report.summary.cohorts.qrspi?.skills).toBe(10);
    expect(report.summary.cohorts["read-only-utility"]?.skills).toBe(5);
    expect(report.summary.cohorts["mutating-utility"]?.skills).toBe(8);
    expect(report.skills.find((entry) => entry.name === "team")?.invocation.ui?.displayName).toBe(
      "Team",
    );
    for (const entry of report.skills) {
      expect(entry.invocation.userInvocable).toBe(entry.category === "entry");
      expect(Array.isArray(entry.inputs.artifacts)).toBe(true);
      expect(Array.isArray(entry.outputs.artifacts)).toBe(true);
      expect(Array.isArray(entry.sideEffects)).toBe(true);
      expect(Array.isArray(entry.gates)).toBe(true);
      expect(Array.isArray(entry.loadedSkills)).toBe(true);
      expect(Array.isArray(entry.readSkills)).toBe(true);
      expect(entry.directBehavior.sideEffects).toEqual([...entry.sideEffects].sort());
    }

    const question = report.skills.find((entry) => entry.name === "team-question");
    if (question?.invocation.userInvocable) {
      expect(question.outputs.artifacts).toEqual(expect.arrayContaining(["3-prd.md", "2-questions.md", "4-repos.md"]));
    } else {
      expect(question?.outputs.artifacts).toEqual(["2-questions.md", "3-prd.md", "4-repos.md"]);
      expect(question?.outputs.artifacts).not.toContain("1-task.md");
    }
    expect(report.skills.find((entry) => entry.name === "team-research")?.outputs.artifacts).toContain(
      "5-research.md",
    );
    const rebase = report.skills.find((entry) => entry.name === "pr-rebase");
    expect(rebase?.artifacts).toContain(
      "docs/plans/<ID>/rebase-<n>.md",
    );
    expect(rebase?.outputs.artifacts).toContain("docs/plans/<ID>/rebase-<n>.md");

    const team = report.skills.find((entry) => entry.name === "team");
    if (migrated) {
      expect(team?.effectiveBehavior.sideEffects).toEqual(
        expect.arrayContaining(["create-worktree", "commit", "push", "create-pr", "mutate-project"]),
      );
      expect(team?.effectiveBehavior.sideEffects).not.toContain("delete-state");
      expect(team?.effectiveBehavior.outputs.artifacts).toContain("5-research.md");
    } else {
      expect(team?.effectiveBehavior.sideEffects).toEqual([
        "create-pr",
        "create-worktree",
        "delete-state",
        "dispatch-agent",
        "mutate-project",
        "push",
        "write-files",
      ]);
      expect(team?.effectiveBehavior.outputs.artifacts).toEqual([
        "4-repos.md",
        "docs/plans/<id>/5-research.md",
        "docs/plans/<id>/cross-model-notes.md",
        "docs/plans/<id>/cross-model-raw.md",
        "docs/plans/<id>/design-review-<n>.md",
      ]);
    }
  });

  test("reports direct and transitive loaded instruction words", () => {
    const report = run();
    const review = report.skills.find((entry) => entry.name === "reviewing-designs");
    expect(review).toBeDefined();
    expect(review?.loadedSkills.length).toBeGreaterThan(1);
    expect(review?.transitiveLoadedWords).toBeGreaterThan(0);
  });

  test("counts safe cross-skill reads and their conditional resources transitively", () => {
    const fixture = join(ROOT, ".tmp-skill-audit", `${process.pid}-${Date.now()}`);
    try {
      for (const name of ["reader", "sibling", "nested", "cited"]) {
        mkdirSync(join(fixture, "skills", name), { recursive: true });
      }
      writeFileSync(
        join(fixture, "skills", "reader", "SKILL.md"),
        skill(
          "reader",
          "",
          "Read all of `<skill-dir>/../sibling/SKILL.md`. " +
            "See `skills/cited/SKILL.md`. Do not read `<skill-dir>/../cited/SKILL.md`. " +
            "Read `<skill-dir>/../../outside/SKILL.md`.",
        ),
      );
      writeFileSync(
        join(fixture, "skills", "sibling", "SKILL.md"),
        skill(
          "sibling",
          "user-invocable: false\n",
          "Read `references/details.md`. Read all of `../nested/SKILL.md`.",
        ),
      );
      mkdirSync(join(fixture, "skills", "sibling", "references"), { recursive: true });
      writeFileSync(
        join(fixture, "skills", "sibling", "references", "details.md"),
        "shared conditional guidance\n",
      );
      writeFileSync(
        join(fixture, "skills", "nested", "SKILL.md"),
        skill("nested", "user-invocable: false\n", "Return the nested result."),
      );
      writeFileSync(
        join(fixture, "skills", "cited", "SKILL.md"),
        skill("cited", "user-invocable: false\n", "Citation only."),
      );

      const report = run(fixture);
      const reader = report.skills.find((entry) => entry.name === "reader");
      const sibling = report.skills.find((entry) => entry.name === "sibling");
      const nested = report.skills.find((entry) => entry.name === "nested");
      expect(reader?.loadedSkills).toEqual([]);
      expect(reader?.readSkills).toEqual(["sibling"]);
      expect(reader?.citedSkills).toEqual(["cited", "sibling"]);
      expect(reader?.transitiveReadSkills).toEqual(["nested", "sibling"]);
      expect(reader?.transitiveLoadedSkills).toEqual([]);
      expect(reader?.transitiveInstructionSkills).toEqual(["nested", "sibling"]);
      expect(sibling?.conditionalReferenceWords).toBe(3);
      expect(reader?.transitiveLoadedWords).toBe(
        (sibling?.totalInstructionWords ?? 0) + (nested?.totalInstructionWords ?? 0),
      );
      expect(reader?.effectiveBehavior.readSkills).toEqual(["nested", "sibling"]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("records exact artifact directions for design, structure, plan, and PR", () => {
    const report = run();
    const migrated = usesSharedArtifactResolver(report);
    const redesigned = report.skills.find((entry) => entry.name === "team-design")?.invocation
      .userInvocable === false;
    const contracts = !migrated
      ? {
          "team-design": {
            inputs: ["1-task.md", "2-questions.md", "5-research.md", "6-design.md"],
            outputs: ["5-research.md", "6-design.md", "cross-model-notes.md", "cross-model-raw.md", "design-review-<n>.md"],
          },
          "team-structure": {
            inputs: ["1-task.md", "5-research.md", "6-design.md", "design-review-<n>.md"],
            outputs: ["6-design.md", "7-structure.md", "design-review-<n>.md"],
          },
          "team-plan": {
            inputs: ["5-research.md", "6-design.md", "7-structure.md"],
            outputs: ["7-structure.md", "8-plan.md"],
          },
          "team-pr": {
            inputs: ["1-task.md", "4-repos.md", "6-design.md", "design-review-<n>.md", "docs/plans/<id>/cross-model-notes.md"],
            outputs: [],
          },
        }
      : redesigned
      ? {
          "team-design": {
            inputs: ["1-task.md", "2-questions.md", "3-prd.md", "4-repos.md", "5-research.md", "6-design.md", "design-review-<n>.md"],
            outputs: ["6-design.md", "cross-model-notes.md", "cross-model-raw.md", "design-review-<n>.md"],
          },
          "team-structure": {
            inputs: ["1-task.md", "4-repos.md", "5-research.md", "6-design.md", "7-structure.md", "design-review-<n>.md"],
            outputs: ["7-structure.md"],
          },
          "team-plan": {
            inputs: ["4-repos.md", "5-research.md", "6-design.md", "7-structure.md", "8-plan.md"],
            outputs: ["8-plan.md"],
          },
          "team-pr": {
            inputs: ["1-task.md", "10-pr.md", "4-repos.md", "6-design.md", "8-plan.md", "9-implementation.md"],
            outputs: ["10-pr.md"],
          },
        }
      : {
          "team-design": {
            inputs: ["1-task.md", "2-questions.md", "5-research.md", "6-design.md"],
            outputs: ["6-design.md", "cross-model-notes.md", "cross-model-raw.md", "design-review-<n>.md"],
          },
          "team-structure": {
            inputs: ["1-task.md", "5-research.md", "6-design.md", "design-review-<n>.md"],
            outputs: ["7-structure.md"],
          },
          "team-plan": {
            inputs: ["5-research.md", "6-design.md", "7-structure.md"],
            outputs: ["8-plan.md"],
          },
          "team-pr": {
            inputs: ["1-task.md", "4-repos.md", "6-design.md", "8-plan.md"],
            outputs: [],
          },
        };

    for (const [name, contract] of Object.entries(contracts)) {
      const entry = report.skills.find((candidate) => candidate.name === name);
      if (name === "team-design") {
        expect(entry?.inputs.artifacts).toEqual(expect.arrayContaining(contract.inputs));
      } else {
        expect(entry?.inputs.artifacts).toEqual(contract.inputs);
      }
      expect(entry?.outputs.artifacts).toEqual(contract.outputs);
    }
  });

  test("keeps corpus artifact contracts structural and context-specific", () => {
    const report = run();
    const migrated = usesSharedArtifactResolver(report);
    const contract = (name: string) => report.skills.find((entry) => entry.name === name);

    expect(contract("eng-design-doc-review")?.inputs.artifacts).toEqual(
      expect.arrayContaining([
        "1-task.md",
        "2-questions.md",
        "4-repos.md",
        "5-research.md",
        "6-design.md",
      ]),
    );
    const designReviewOutputs = migrated ? [] : ["6-design.md", "design-review-<n>.md"];
    expect(contract("eng-design-doc-review")?.outputs.artifacts).toEqual(designReviewOutputs);
    expect(contract("eng-design-doc-review")?.effectiveBehavior.outputs.artifacts).toEqual(designReviewOutputs);
    expect(contract("code-review")?.effectiveBehavior.outputs.artifacts).toEqual([]);

    expect(contract("researching-codebases")?.inputs.artifacts).toEqual(
      migrated ? ["2-questions.md", "4-repos.md"] : ["4-repos.md"],
    );
    expect(contract("researching-codebases")?.outputs.artifacts).toEqual([
      "docs/plans/<id>/5-research.md",
    ]);
    expect(contract("product-requirements-doc")?.inputs.artifacts).toEqual(["1-task.md"]);
    expect(contract("product-requirements-doc")?.outputs.artifacts).toEqual(
      migrated
        ? ["3-prd.md", "docs/plans/<id>/3-prd.md"]
        : ["1-task.md", "2-questions.md", "docs/plans/<id>/3-prd.md"],
    );

    const workflow = contract("qrspi-workflow");
    expect(workflow?.outputs.artifacts).not.toContain("8-plan.md");
    expect(workflow?.outputs.artifacts).not.toContain("7-structure.md");

    const rebase = contract("pr-rebase");
    expect(rebase?.effectiveBehavior.outputs.artifacts).toEqual(rebase?.outputs.artifacts);
  });

  test("finds a planted duplicate and ignores a unique block", () => {
    const fixture = join(ROOT, ".tmp-skill-audit", `${process.pid}-${Date.now()}`);
    const duplicate = "Keep this exact instruction block because it contains enough words to qualify for duplicate detection across two separate skills and proves that the negative repository report can detect a known positive example.";
    const duplicateCode = "```sh\nnode helper.mjs --input one --output two --mode verify --attempts three --format json --strict true --source fixture --target result --check behavior --report evidence --alpha four --beta five --gamma six\n```";
    const unique = "This separate instruction exists in one skill only. It also contains enough distinct words to qualify for analysis while remaining absent from every duplicate result emitted by the analyzer.";
    try {
      for (const name of ["first", "second", "principle-third"]) {
        mkdirSync(join(fixture, "skills", name), { recursive: true });
      }
      writeFileSync(
        join(fixture, "skills", "first", "SKILL.md"),
        skill(
          "first",
          "argument-hint: \"<input>\"\n",
          `${duplicate}\n\n${duplicateCode}\n\n${unique}\n\nCall the Skill tool with \`second\` and \`principle-third\`. Read docs/plans/<id>/1-task.md, docs/plans/<id>/3-prd.md, and docs/plans/<id>/4-repos.md. Write docs/plans/<id>/8-plan.md, docs/plans/<id>/9-implementation.md, and docs/plans/<id>/implementation-log.md. Append docs/plans/<ID>/rebase-<n>.md, run git commit, then require user approval.`,
        ),
      );
      writeFileSync(
        join(fixture, "skills", "second", "SKILL.md"),
        skill(
          "second",
          "user-invocable: false\n",
          `${duplicate.replace("enough words", "enough\nwords")}\n\nCall the Skill tool with \`first\`.`,
        ),
      );
      writeFileSync(
        join(fixture, "skills", "principle-third", "SKILL.md"),
        skill(
          "principle-third",
          "user-invocable: false\n",
          `Use a different rule with enough context for classification but no duplicate prose block in this fixture.\n\n${duplicateCode}`,
        ),
      );

      const report = run(fixture);
      expect(report.summary.skills).toBe(3);
      expect(report.summary.categories.entry?.skills).toBe(1);
      expect(report.summary.categories.methodology?.skills).toBe(1);
      expect(report.summary.categories.principle?.skills).toBe(1);
      expect(report.duplicateBlocks.some((block) => block.owners.join(",") === "first,second")).toBe(true);
      expect(
        report.duplicateBlocks.some(
          (block) => block.owners.join(",") === "first,principle-third" && block.text.startsWith("```sh"),
        ),
      ).toBe(true);
      expect(report.duplicateBlocks.some((block) => block.text.includes(unique))).toBe(false);
      const first = report.skills.find((entry) => entry.name === "first");
      expect(first?.inputs.artifacts).toContain("docs/plans/<id>/1-task.md");
      expect(first?.inputs.artifacts).toContain("docs/plans/<id>/3-prd.md");
      expect(first?.inputs.artifacts).toContain("docs/plans/<id>/4-repos.md");
      expect(first?.outputs.artifacts).toContain("docs/plans/<id>/8-plan.md");
      expect(first?.outputs.artifacts).toContain("docs/plans/<id>/9-implementation.md");
      expect(first?.outputs.artifacts).toContain("docs/plans/<id>/implementation-log.md");
      expect(first?.outputs.artifacts).toContain("docs/plans/<ID>/rebase-<n>.md");
      expect(first?.sideEffects).toContain("commit");
      expect(first?.gates).toContain("approval");
      expect(first?.loadedSkills).toEqual(["principle-third", "second"]);
      expect(first?.transitiveLoadedSkills).toEqual(["principle-third", "second"]);
      expect(first?.transitiveLoadedWords).toBeGreaterThan(0);

      const rendered = runText(fixture);
      expect(rendered).toContain("first\tcohort=methodology");
      expect(rendered).toContain("first,second\twords=");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("ignores negated actions and skill loads while detecting positive controls", () => {
    const fixture = join(ROOT, ".tmp-skill-audit", `${process.pid}-${Date.now()}`);
    try {
      for (const name of ["negative", "positive", "helper"]) {
        mkdirSync(join(fixture, "skills", name), { recursive: true });
      }
      writeFileSync(
        join(fixture, "skills", "negative", "SKILL.md"),
        skill(
          "negative",
          "",
          "Stage anchored files only; never `git add -A` or `git commit -a`. " +
            "Do not auto-revise or write `design-review-<n>.md`; only the pipeline DESIGN phase records verdicts. " +
            "No agent may create a worktree, push the branch, or open a PR. Tell the user to open a PR. " +
            "Do not write docs/plans/<id>/1-task.md, 2-questions.md, or 5-research.md. " +
            "Do not call the Skill tool with `helper`. Do not pass an item without direct evidence. " +
            "No PASS without direct evidence. See references/apply-plan.md.",
        ),
      );
      writeFileSync(
        join(fixture, "skills", "positive", "SKILL.md"),
        skill(
          "positive",
          "",
          "This skill opens a PR. Create a worktree. Run git commit. Push the branch. " +
            "Delete state. Write the artifact docs/plans/<id>/8-plan.md. Call the Skill tool with `helper`.",
        ),
      );
      writeFileSync(
        join(fixture, "skills", "helper", "SKILL.md"),
        skill("helper", "user-invocable: false\n", "Return a result."),
      );

      const report = run(fixture);
      const negative = report.skills.find((entry) => entry.name === "negative");
      const positive = report.skills.find((entry) => entry.name === "positive");
      expect(negative?.sideEffects).toEqual([]);
      expect(negative?.outputs.artifacts).toEqual([]);
      expect(negative?.artifacts).not.toContain("plan.md");
      expect(negative?.loadedSkills).toEqual([]);
      expect(negative?.gates).toContain("review-verdict");
      expect(positive?.sideEffects).toEqual([
        "write-files",
        "create-worktree",
        "commit",
        "push",
        "create-pr",
        "delete-state",
      ]);
      expect(positive?.outputs.artifacts).toEqual(["docs/plans/<id>/8-plan.md"]);
      expect(positive?.loadedSkills).toEqual(["helper"]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("distinguishes artifact inputs, outputs, rerun inputs, and pre-write checks", () => {
    const fixture = join(ROOT, ".tmp-skill-audit", `${process.pid}-${Date.now()}`);
    try {
      mkdirSync(join(fixture, "skills", "directions"), { recursive: true });
      writeFileSync(
        join(fixture, "skills", "directions", "SKILL.md"),
        skill(
          "directions",
          "description: Given a directory containing docs/plans/<id>/1-task.md, docs/plans/<id>/2-questions.md, and docs/plans/<id>/5-research.md, draft docs/plans/<id>/6-design.md.\n",
          "Dispatch the worker with optional docs/plans/<id>/3-prd.md and docs/plans/<id>/4-repos.md. " +
            "Write docs/plans/<id>/8-plan.md. Before any write, verify docs/plans/<id>/9-implementation.md has verdict PASS. " +
            "It writes slices to docs/plans/<id>/7-structure.md and records repo slugs when docs/plans/<id>/4-repos.md exists. " +
            "If docs/plans/<id>/10-pr.md lists the current HEAD, return it. Persist docs/plans/<id>/10-pr.md after completion. " +
            "Do not write docs/plans/<id>/verification.md.",
        ),
      );

      const directions = run(fixture).skills.find((entry) => entry.name === "directions");
      expect(directions?.inputs.artifacts).toEqual([
        "docs/plans/<id>/1-task.md",
        "docs/plans/<id>/10-pr.md",
        "docs/plans/<id>/2-questions.md",
        "docs/plans/<id>/3-prd.md",
        "docs/plans/<id>/4-repos.md",
        "docs/plans/<id>/5-research.md",
        "docs/plans/<id>/9-implementation.md",
      ]);
      expect(directions?.outputs.artifacts).toEqual([
        "docs/plans/<id>/10-pr.md",
        "docs/plans/<id>/6-design.md",
        "docs/plans/<id>/7-structure.md",
        "docs/plans/<id>/8-plan.md",
      ]);
      expect(directions?.artifacts).toContain("docs/plans/<id>/verification.md");
      expect(directions?.inputs.artifacts).not.toContain("docs/plans/<id>/verification.md");
      expect(directions?.outputs.artifacts).not.toContain("docs/plans/<id>/9-implementation.md");
      expect(directions?.outputs.artifacts).not.toContain("docs/plans/<id>/4-repos.md");
      expect(directions?.outputs.artifacts).not.toContain("docs/plans/<id>/verification.md");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("uses sentence, table-row, section, and ordinary-list boundaries", () => {
    const fixture = join(ROOT, ".tmp-skill-audit", `${process.pid}-${Date.now()}`);
    try {
      mkdirSync(join(fixture, "skills", "boundaries"), { recursive: true });
      writeFileSync(
        join(fixture, "skills", "boundaries", "SKILL.md"),
        skill(
          "boundaries",
          "",
          "Reads:\n" +
            "- docs/plans/<id>/1-task.md\n" +
            "- docs/plans/<id>/2-questions.md\n\n" +
            "Writes:\n" +
            "- docs/plans/<id>/8-plan.md\n" +
            "- docs/plans/<id>/9-implementation.md\n\n" +
            "| Phase | Output | Gate |\n" +
            "| --- | --- | --- |\n" +
            "| DESIGN | docs/plans/<id>/6-design.md | REQUEST CHANGES re-drafts |\n" +
            "| STRUCTURE | docs/plans/<id>/7-structure.md | none |\n" +
            "| PLAN | docs/plans/<id>/verification.md | none |\n\n" +
            "Do not write docs/plans/<id>/10-pr.md. Read docs/plans/<id>/4-repos.md. " +
            "Write docs/plans/<id>/5-research.md.",
        ),
      );

      const boundaries = run(fixture).skills.find((entry) => entry.name === "boundaries");
      expect(boundaries?.inputs.artifacts).toEqual([
        "docs/plans/<id>/1-task.md",
        "docs/plans/<id>/2-questions.md",
        "docs/plans/<id>/4-repos.md",
      ]);
      expect(boundaries?.outputs.artifacts).toEqual([
        "docs/plans/<id>/5-research.md",
        "docs/plans/<id>/8-plan.md",
        "docs/plans/<id>/9-implementation.md",
      ]);
      expect(boundaries?.artifacts).toEqual(
        expect.arrayContaining([
          "docs/plans/<id>/6-design.md",
          "docs/plans/<id>/7-structure.md",
          "docs/plans/<id>/verification.md",
          "docs/plans/<id>/10-pr.md",
        ]),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("separates a wrapper's direct behavior from delegated behavior", () => {
    const fixture = join(ROOT, ".tmp-skill-audit", `${process.pid}-${Date.now()}`);
    try {
      for (const name of ["wrapper", "child", "grandchild"]) {
        mkdirSync(join(fixture, "skills", name), { recursive: true });
      }
      writeFileSync(
        join(fixture, "skills", "wrapper", "SKILL.md"),
        skill(
          "wrapper",
          "",
          "Call the phase skill listed below.\n\n| Phase | Skill |\n| --- | --- |\n| RUN | `child` |",
        ),
      );
      writeFileSync(
        join(fixture, "skills", "child", "SKILL.md"),
        skill(
          "child",
          "user-invocable: false\n",
          "Create a worktree. Write 5-research.md. Call the Skill tool with `grandchild`.",
        ),
      );
      writeFileSync(
        join(fixture, "skills", "grandchild", "SKILL.md"),
        skill(
          "grandchild",
          "user-invocable: false\n",
          "Run git commit. Push the branch. Open a draft PR.",
        ),
      );

      const wrapper = run(fixture).skills.find((entry) => entry.name === "wrapper");
      expect(wrapper?.loadedSkills).toEqual(["child"]);
      expect(wrapper?.composedSkills).toEqual(["child"]);
      expect(wrapper?.directBehavior.sideEffects).toEqual([]);
      expect(wrapper?.directBehavior.outputs.artifacts).toEqual([]);
      expect(wrapper?.effectiveBehavior.sideEffects).toEqual([
        "create-worktree",
        "write-files",
      ]);
      expect(wrapper?.effectiveBehavior.outputs.artifacts).toEqual(["5-research.md"]);
      expect(wrapper?.effectiveBehavior.loadedSkills).toEqual(["child", "grandchild"]);
      expect(wrapper?.effectiveBehavior.sideEffects).not.toContain("commit");
      expect(wrapper?.effectiveBehavior.sideEffects).not.toContain("create-pr");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("compares metrics, public interfaces, and behavioral contracts with a git tree", () => {
    const fixture = join(ROOT, ".tmp-skill-audit", `${process.pid}-${Date.now()}`);
    try {
      execFileSync("git", ["init", "-q"], { cwd: (mkdirSync(fixture, { recursive: true }), fixture) });
      for (const name of ["behavior", "changed", "removed"]) {
        mkdirSync(join(fixture, "skills", name, "agents"), { recursive: true });
        writeFileSync(
          join(fixture, "skills", name, "SKILL.md"),
          skill(
            name,
            'argument-hint: "<old>"\neffort: low\n',
            name === "behavior"
              ? "Read docs/plans/<id>/1-task.md. Original behavior."
              : "Read notes.md. Original behavior.",
          ),
        );
        writeFileSync(join(fixture, "skills", name, "notes.md"), "base resource\n");
        writeFileSync(
          join(fixture, "skills", name, "agents", "openai.yaml"),
          `interface:\n  display_name: "${name}"\n  short_description: "Base"\n  default_prompt: "Base"\n`,
        );
      }
      execFileSync("git", ["add", "skills"], { cwd: fixture });
      const tree = execFileSync("git", ["write-tree"], { cwd: fixture, encoding: "utf8" }).trim();

      rmSync(join(fixture, "skills", "removed"), { recursive: true });
      mkdirSync(join(fixture, "skills", "added"), { recursive: true });
      writeFileSync(
        join(fixture, "skills", "added", "SKILL.md"),
        skill("added", "user-invocable: false\n", "Added behavior."),
      );
      writeFileSync(
        join(fixture, "skills", "changed", "SKILL.md"),
        skill("changed", 'argument-hint: "<new>"\neffort: high\n', "Read notes.md. Current behavior has more words."),
      );
      writeFileSync(join(fixture, "skills", "changed", "notes.md"), "larger current resource file\n");
      writeFileSync(
        join(fixture, "skills", "changed", "agents", "openai.yaml"),
        'interface:\n  display_name: "changed"\n  short_description: "Current"\n  default_prompt: "Current"\n',
      );
      writeFileSync(
        join(fixture, "skills", "behavior", "SKILL.md"),
        skill(
          "behavior",
          'argument-hint: "<old>"\neffort: low\n',
          "Read docs/plans/<id>/1-task.md. Write docs/plans/<id>/8-plan.md and run git commit. " +
            "Require user approval. Call the Skill tool with `helper`.",
        ),
      );

      const report = run(fixture, tree);
      expect(report.comparison?.ref).toBe(tree);
      expect(report.comparison?.summary.publicInterfaceChanges).toBe(3);
      expect(report.comparison?.summary.behaviorContractChanges).toBe(4);
      expect(report.comparison?.skills.find((entry) => entry.name === "added")?.status).toBe("added");
      expect(report.comparison?.skills.find((entry) => entry.name === "removed")?.status).toBe("removed");
      const changed = report.comparison?.skills.find((entry) => entry.name === "changed");
      expect(changed?.status).toBe("present");
      expect(changed?.publicInterfaceChanged).toBe(true);
      expect(changed?.metrics.bodyWords?.delta).toBe(3);
      expect(changed?.metrics.resourceWords?.delta).toBe(2);
      expect(changed?.metrics.conditionalReferenceWords?.delta).toBe(2);
      expect(changed?.behaviorContractChanged).toBe(true);
      expect(changed?.behaviorContractChanges).toEqual([
        "inputs",
        "directBehavior",
        "effectiveBehavior",
      ]);
      const behavior = report.comparison?.skills.find((entry) => entry.name === "behavior");
      expect(behavior?.publicInterfaceChanged).toBe(false);
      expect(behavior?.behaviorContractChanged).toBe(true);
      expect(behavior?.behaviorContractChanges).toEqual([
        "outputs",
        "sideEffects",
        "gates",
        "artifacts",
        "loadedSkills",
        "directBehavior",
        "effectiveBehavior",
      ]);
      expect(Object.keys(behavior?.currentBehaviorContract ?? {})).toEqual([
        "inputs",
        "outputs",
        "sideEffects",
        "gates",
        "artifacts",
        "loadedSkills",
        "readSkills",
        "directBehavior",
        "effectiveBehavior",
      ]);
      expect(behavior?.baseBehaviorContract?.outputs).toEqual({ artifacts: [] });
      expect(behavior?.currentBehaviorContract?.outputs).toEqual({
        artifacts: ["docs/plans/<id>/8-plan.md"],
      });
      expect(behavior?.currentBehaviorContract?.gates).toEqual(["approval"]);
      expect(behavior?.currentBehaviorContract?.loadedSkills).toEqual(["helper"]);

      const rendered = execFileSync(
        "node",
        [SCRIPT, "--root", fixture, "--base", tree],
        { cwd: fixture, encoding: "utf8" },
      );
      expect(rendered).toContain("Behavior contract changes: 4");
      expect(rendered).toContain(
        "behavior\tpresent\tinterface=false\tbehavior=true" +
          "\tbehavior-fields=outputs,sideEffects,gates,artifacts,loadedSkills,directBehavior,effectiveBehavior",
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
