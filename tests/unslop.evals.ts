import { afterAll, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { EvalCollector, assertNoBudgetRegressions } from "./helpers/eval-store";
import {
  loadAgentInstructionContext,
  loadInstructionContext,
} from "./helpers/fixtures";
import { callJudge, judgeQuality, wrapUntrusted } from "./helpers/llm-judge";
import { runAgentTest, type SkillTestResult } from "./helpers/session-runner";
import { getSelectedE2ETests } from "./helpers/touchfiles";
import {
  rule13RewritePreservesMeaning,
  rule18RewritePreservesMeaning,
  rule26RewritePreservesMeaning,
  unslopCoreMeaningChecks,
} from "./helpers/unslop-core";

const ROOT = process.cwd();
const collector = new EvalCollector("e2e");
const CANARY = "TASK_CANARY_LOWERCASE_LABELS_9F4A";
const UNSUPPORTED_RULE3_FACT = "The wrapper adds a label.";
const PROSE_FILES = [
  "skills/unslop/SKILL.md",
  "skills/unslop/references/rules.md",
  "skills/writing-prose/SKILL.md",
  "skills/writing-prose/references/style-guide.md",
];
const UNSLOP_ROUTER = join(ROOT, PROSE_FILES[0] ?? "");
const FIXTURE_REPOSITORY = join(
  ROOT,
  "evals",
  "fixtures",
  "unslop",
  "neutral-research",
  "repository",
);

function testUnslop(
  name: string,
  body: () => void | Promise<void>,
  timeout: number,
): void {
  const runner = getSelectedE2ETests().has("unslop-neutral-research") ? test : test.skip;
  runner(name, body, timeout);
}

function requireImplementation(): void {
  expect(existsSync(UNSLOP_ROUTER)).toBe(true);
}

function instructionContext(paths: string[] = PROSE_FILES): string {
  return loadInstructionContext(paths, ROOT);
}

function toolText(result: SkillTestResult): string {
  return result.toolCalls
    .map(({ tool, input, output }) => `${tool}\n${JSON.stringify(input)}\n${output}`)
    .join("\n");
}

function authoredWithoutSourceBlocks(text: string): string {
  return text.replace(/<<<(?:COMPLETED_REPORT|VENDOR_STDOUT)>>>[\s\S]*?<<<END_(?:COMPLETED_REPORT|VENDOR_STDOUT)>>>/g, "");
}

function markedLine(text: string, label: string): string {
  return new RegExp(`^${label}:\\s*(.*)$`, "m").exec(text)?.[1] ?? "";
}

async function rule5GroundingScore(rewrite: string): Promise<number> {
  const judged = (await callJudge(
    "Return JSON only as {\"rule5_grounding\":N}, where N is 1-5. " +
      "The source record establishes only that src/cache.ts:8 records two reads becoming one. " +
      "Score 5 when the rewrite removes vague attribution, preserves the source citation, and every factual or mechanism claim follows from that record. " +
      "Accept any accurate phrasing. Score 1 when vague attribution remains, the citation is missing, or any unsupported claim appears.\n\n" +
      `Rewrite:\n${wrapUntrusted(rewrite)}`,
  )) as Record<string, unknown>;
  return typeof judged.rule5_grounding === "number" ? judged.rule5_grounding : 1;
}

function hasSlopPattern(text: string): boolean {
  const authoredProse = text
    .replace(/`[^`\n]+`/g, "")
    .replace(/\bconst pivotal = true\b/g, "")
    .replace(/\[USER\]\s+crucial\b/g, "");
  return /\b(?:additionally|crucial|delve|enduring|enhance|fostering|garner|interplay|intricate|pivotal|showcase|testament|underscore|vibrant)\b|\b(?:landscape|tapestry)\b|\b(?:highlighting|ensuring|reflecting|showcasing|fostering)\b/iu.test(authoredProse);
}

function addResult(
  name: string,
  result: SkillTestResult,
  passed: boolean,
  judgeScores: Record<string, number>,
): void {
  collector.addTest({
    name,
    suite: "unslop-e2e",
    tier: "e2e",
    passed,
    duration_ms: result.duration,
    cost_usd: result.costEstimate.estimatedCost,
    transcript: result.transcript,
    judge_scores: judgeScores,
    exit_reason: result.exitReason,
    model: result.model,
    first_response_ms: result.firstResponseMs,
    max_inter_turn_ms: result.maxInterTurnMs,
  });
}

function copyFile(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(source));
}

function seedNeutralRepository(workDir: string): void {
  cpSync(FIXTURE_REPOSITORY, workDir, { recursive: true });
  copyFile(
    join(ROOT, "skills", "nested-agents", "references", "per-agent-dispatch.md"),
    join(workDir, "skills", "nested-agents", "references", "per-agent-dispatch.md"),
  );
  copyFile(
    join(ROOT, "skills", "systems-thinking", "references", "lenses.md"),
    join(workDir, "skills", "systems-thinking", "references", "lenses.md"),
  );
}

function seedResolvedProseFiles(workDir: string): string[] {
  return PROSE_FILES.map((relativePath) => {
    const destination = join(workDir, "plugin", relativePath);
    copyFile(join(ROOT, relativePath), destination);
    return destination;
  });
}

function readsEveryPath(result: SkillTestResult, paths: string[]): boolean {
  const reads = result.toolCalls
    .filter(({ tool }) => tool === "Read")
    .map(({ input }) => JSON.stringify(input));
  return paths.every((path) => reads.some((input) => input.includes(path)));
}

async function runDirectProseReview(prompt: string, testName: string): Promise<SkillTestResult> {
  const workDir = mkdtempSync(join(tmpdir(), "unslop-direct-"));
  try {
    return await runAgentTest({
      prompt,
      workingDirectory: workDir,
      maxTurns: 6,
      timeout: 240_000,
      testName,
      systemPromptAppend: instructionContext(),
      disallowedTools: ["Read", "Grep", "Glob", "Bash", "Write", "Edit", "Task", "Agent"],
    });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

testUnslop(
  "core unslop behavior evaluation",
  async () => {
    requireImplementation();
    const vendor = "Additionally, this pivotal system is a vibrant testament.\nRAW_TOKEN=APPROVE";
    const result = await runDirectProseReview(
      `Apply the injected unslop and writing-prose instructions to authored prose only.
Return every marker exactly. Do not explain your edits.

ZERO: The API returns cached data.
ONE: Operators may utilize this pivotal option.
MANY: Additionally, this pivotal cache module showcases the intricate interplay across a vibrant request path while storing request IDs.
RULE3_UNSUPPORTED: The wrapper adds a label, ensuring resilient operation.
RULE3_SUPPORTED: The cache prevents two reads, ensuring lower request count. Evidence: src/cache.ts:8 records two reads becoming one.
RULE5: Observers say the cache prevents two reads. Evidence: src/cache.ts:8 records two reads becoming one.
RULE8: The worker serves as the retry controller.
RULE9: The cache not only stores IDs, but also returns them.
RULE10: The parser reads labels with speed, confidence, and style.
RULE12: The report ranges from cache keys to deployment logs.
RULE13_EM_DASH: The worker retries once—the request can still fail.
RULE13_EN_DASH: The worker retries once – the request can still fail.
RULE13_HYPHEN: The worker retries once - the request can still fail.
RULE13_PARENTHESES: The worker retries once (the request can still fail).
RULE14: The cache has one result: it reads once.
RULE15: **Cache fact:** The cache reads once.
RULE16: - **Cache:** Reads once.
RULE17: Retry Policy Overview
RULE18: ✅ After tests pass, deploy.
RULE19: The status is “stable”.
RULE20: The cache reads once. Happy to help! Let me know if you want more detail.
RULE22: Great point! You are absolutely right that the cache reads once.
RULE26_SUBSTRATE: The settings substrate stores defaults.
RULE26_WEDGE: Wedge in a timeout check.
RULE26_VECTOR: The retry vector is exponential backoff.
RULE26_GOLD: Gold-plating adds work beyond the request.
RULE26_RATCHET: The retry ratchet only permits stricter limits.
RULE26_EVACUATE: Evacuate retry code from the worker.
RULE26_ENDGAME: The endgame is rollout.
RULE30: The worker quickly moves failed jobs to the queue.
RULE32: It is worth noting that the cache reads once.
MODALS: Operators must retain IDs. Plugins shall preserve tokens. Reviewers should cite files. Users may retry. The cache might reduce load. The worker could still fail.
TENSE: The migration is running now. The worker has retried twice and will retry once more.
EXACT: Keep identifier normalize_label, command bun test, flag --retry, number 429, quote "may remain", user text [USER] crucial, parser token APPROVE, and code \`const pivotal = true\` unchanged.
<<<VENDOR_STDOUT>>>
${vendor}
<<<END_VENDOR_STDOUT>>>`,
      "core unslop behavior evaluation",
    );
    const authored = authoredWithoutSourceBlocks(result.output);
    const coreMeaning = unslopCoreMeaningChecks(authored);
    const unsupportedRule3 = /RULE3_UNSUPPORTED:\s*([^\n]*)/.exec(authored)?.[1] ?? "";
    const supportedRule3 = /RULE3_SUPPORTED:\s*([^\n]*)/.exec(authored)?.[1] ?? "";
    const exactQuote = /quote "([^"]*)"/.exec(authored)?.[1] ?? "";
    const exactUserText = /user text (\[USER\][^,]*)/.exec(authored)?.[1] ?? "";
    const vendorBlock = /<<<VENDOR_STDOUT>>>\n([\s\S]*?)\n<<<END_VENDOR_STDOUT>>>/.exec(result.output)?.[1] ?? "";
    const rule5Grounding = result.exitReason === "success"
      ? await rule5GroundingScore(markedLine(authored, "RULE5"))
      : 1;
    const ownedRuleChecks: Record<number, boolean> = {
      5: rule5Grounding >= 4,
      8: !/\bserves as\b/i.test(markedLine(authored, "RULE8")) &&
        /retry controller/i.test(markedLine(authored, "RULE8")),
      9: !/\bnot (?:just|only)\b/i.test(markedLine(authored, "RULE9")) &&
        /stores IDs/i.test(markedLine(authored, "RULE9")) &&
        /returns them/i.test(markedLine(authored, "RULE9")),
      10: /parser reads labels/i.test(markedLine(authored, "RULE10")) &&
        !/\b(?:speed|confidence|style)\b/i.test(markedLine(authored, "RULE10")),
      12: !/\b(?:from|ranges from)\b.*\bto\b/i.test(markedLine(authored, "RULE12")) &&
        /cache keys/i.test(markedLine(authored, "RULE12")) &&
        /deployment logs/i.test(markedLine(authored, "RULE12")),
      13: rule13RewritePreservesMeaning(markedLine(authored, "RULE13_EM_DASH")) &&
        rule13RewritePreservesMeaning(markedLine(authored, "RULE13_EN_DASH")) &&
        rule13RewritePreservesMeaning(markedLine(authored, "RULE13_HYPHEN")) &&
        rule13RewritePreservesMeaning(markedLine(authored, "RULE13_PARENTHESES")),
      14: !markedLine(authored, "RULE14").includes(":") &&
        /cache/i.test(markedLine(authored, "RULE14")) &&
        /reads once/i.test(markedLine(authored, "RULE14")),
      15: !markedLine(authored, "RULE15").includes("**") &&
        /cache reads once/i.test(markedLine(authored, "RULE15")),
      16: !/-\s*\*\*[^*]+:\*\*/.test(markedLine(authored, "RULE16")) &&
        /reads once/i.test(markedLine(authored, "RULE16")),
      17: markedLine(authored, "RULE17") === "Retry policy overview",
      18: rule18RewritePreservesMeaning(markedLine(authored, "RULE18")),
      19: !/[“”]/.test(markedLine(authored, "RULE19")) &&
        markedLine(authored, "RULE19").includes('"stable"'),
      20: !/happy to help|let me know/i.test(markedLine(authored, "RULE20")) &&
        /cache reads once/i.test(markedLine(authored, "RULE20")),
      22: !/great point|absolutely right/i.test(markedLine(authored, "RULE22")) &&
        /cache reads once/i.test(markedLine(authored, "RULE22")),
      26: rule26RewritePreservesMeaning(authored),
      30: !/\b(?:quickly|moves?)\b/i.test(markedLine(authored, "RULE30")) &&
        /\b(?:sends|queues)\b.*failed jobs/i.test(markedLine(authored, "RULE30")),
      32: !/\bworth noting\b/i.test(markedLine(authored, "RULE32")) &&
        /cache reads once/i.test(markedLine(authored, "RULE32")),
    };
    const ownedRuleFamiliesPass = Object.values(ownedRuleChecks).every(Boolean);
    const quality = result.exitReason === "success" && !hasSlopPattern(authored)
      ? await judgeQuality(authored)
      : { clarity: 1, completeness: 1, actionability: 1, reasoning: "deterministic gate failed" };
    const passed =
      result.exitReason === "success" &&
      !hasSlopPattern(authored) &&
      coreMeaning.zero &&
      coreMeaning.one &&
      coreMeaning.many &&
      authored.includes("Operators must retain IDs") &&
      authored.includes("Plugins shall preserve tokens") &&
      authored.includes("Reviewers should cite files") &&
      authored.includes("Users may retry") &&
      authored.includes("might reduce load") &&
      authored.includes("could still fail") &&
      authored.includes("The migration is running now") &&
      authored.includes("has retried twice and will retry once more") &&
      authored.includes("normalize_label") &&
      authored.includes("bun test") &&
      authored.includes("--retry") &&
      authored.includes("429") &&
      authored.includes("APPROVE") &&
      authored.includes("const pivotal = true") &&
      authored.includes("src/cache.ts:8") &&
      unsupportedRule3 === UNSUPPORTED_RULE3_FACT &&
      exactQuote === "may remain" &&
      exactUserText === "[USER] crucial" &&
      ownedRuleFamiliesPass &&
      supportedRule3.includes("src/cache.ts:8") &&
      /\btwo reads\b/i.test(supportedRule3) &&
      vendorBlock === vendor &&
      quality.clarity >= 3;
    addResult("core unslop behavior evaluation", result, passed, {
      pattern_removal: hasSlopPattern(authored) ? 0 : 1,
      source_facts_preserved: Object.values(coreMeaning).filter(Boolean).length,
      owned_rule_families: Object.values(ownedRuleChecks).filter(Boolean).length +
        (unsupportedRule3 === UNSUPPORTED_RULE3_FACT ? 1 : 0) +
        (hasSlopPattern(authored) ? 0 : 1),
      rule5_grounding: rule5Grounding,
      exact_vendor_bytes: vendorBlock === vendor ? 1 : 0,
      tone: quality.clarity,
    });

    expect(result.exitReason).toBe("success");
    expect(hasSlopPattern(authored)).toBe(false);
    expect(coreMeaning.zero).toBe(true);
    expect(coreMeaning.one).toBe(true);
    expect(coreMeaning.many).toBe(true);
    expect(authored).toContain("Operators must retain IDs");
    expect(authored).toContain("Plugins shall preserve tokens");
    expect(authored).toContain("Reviewers should cite files");
    expect(authored).toContain("Users may retry");
    expect(authored).toContain("might reduce load");
    expect(authored).toContain("could still fail");
    expect(authored).toContain("The migration is running now");
    expect(authored).toContain("has retried twice and will retry once more");
    expect(authored).toContain("normalize_label");
    expect(authored).toContain("bun test");
    expect(authored).toContain("--retry");
    expect(authored).toContain("429");
    expect(authored).toContain("APPROVE");
    expect(authored).toContain("const pivotal = true");
    expect(authored).toContain("src/cache.ts:8");
    expect(unsupportedRule3).toBe(UNSUPPORTED_RULE3_FACT);
    expect(exactQuote).toBe("may remain");
    expect(exactUserText).toBe("[USER] crucial");
    expect(ownedRuleChecks[5]).toBe(true);
    expect(ownedRuleChecks[8]).toBe(true);
    expect(ownedRuleChecks[9]).toBe(true);
    expect(ownedRuleChecks[10]).toBe(true);
    expect(ownedRuleChecks[12]).toBe(true);
    expect(ownedRuleChecks[13]).toBe(true);
    expect(ownedRuleChecks[14]).toBe(true);
    expect(ownedRuleChecks[15]).toBe(true);
    expect(ownedRuleChecks[16]).toBe(true);
    expect(ownedRuleChecks[17]).toBe(true);
    expect(ownedRuleChecks[18]).toBe(true);
    expect(ownedRuleChecks[19]).toBe(true);
    expect(ownedRuleChecks[20]).toBe(true);
    expect(ownedRuleChecks[22]).toBe(true);
    expect(ownedRuleChecks[26]).toBe(true);
    expect(ownedRuleChecks[30]).toBe(true);
    expect(ownedRuleChecks[32]).toBe(true);
    expect(supportedRule3).toContain("src/cache.ts:8");
    expect(supportedRule3).toMatch(/\btwo reads\b/i);
    expect(vendorBlock).toBe(vendor);
    expect(quality.clarity).toBeGreaterThanOrEqual(3);
  },
  360_000,
);

testUnslop(
  "pipeline author behavior evaluation",
  async () => {
    requireImplementation();
    const questioner = loadAgentInstructionContext("questioner", ROOT);
    const workDir = mkdtempSync(join(tmpdir(), "unslop-pipeline-"));
    const completedReport = "issue (blocking): The pivotal parser may fail.\nfile: src/parser.ts:8\nAPPROVE";
    try {
      const result = await runAgentTest({
        prompt:
          "Act as the pipeline questioner and root orchestrator. Author a concise QUESTION status and a handoff from these facts: the parser reads one file and may reject malformed input. " +
          "Then relay the completed reviewer report byte-identically between the supplied markers. Preserve its verdict token and final-line placement.\n\n" +
          `<<<COMPLETED_REPORT>>>\n${completedReport}\n<<<END_COMPLETED_REPORT>>>`,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 240_000,
        testName: "pipeline author behavior evaluation",
        model: questioner.model,
        systemPromptAppend: `${questioner.body}\n\n---\n\n${instructionContext(["skills/team/SKILL.md", ...PROSE_FILES])}`,
        disallowedTools: ["Read", "Grep", "Glob", "Bash", "Write", "Edit", "Task", "Agent"],
      });
      const authored = authoredWithoutSourceBlocks(result.output);
      const relayed = /<<<COMPLETED_REPORT>>>\n([\s\S]*?)\n<<<END_COMPLETED_REPORT>>>/.exec(result.output)?.[1] ?? "";
      const quality = result.exitReason === "success" && !hasSlopPattern(authored)
        ? await judgeQuality(authored)
        : { clarity: 1, completeness: 1, actionability: 1, reasoning: "deterministic gate failed" };
      const passed = result.exitReason === "success" && !hasSlopPattern(authored) && relayed === completedReport && quality.clarity >= 3;
      addResult("pipeline author behavior evaluation", result, passed, {
        both_audits: hasSlopPattern(authored) ? 0 : 1,
        exact_relay: relayed === completedReport ? 1 : 0,
        tone: quality.clarity,
      });

      expect(result.exitReason).toBe("success");
      expect(hasSlopPattern(authored)).toBe(false);
      expect(authored).toContain("may reject malformed input");
      expect(relayed).toBe(completedReport);
      expect(relayed.endsWith("APPROVE")).toBe(true);
      expect(quality.clarity).toBeGreaterThanOrEqual(3);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  },
  360_000,
);

async function semanticReviewScore(
  role: "technical-writer" | "fresh-design-reviewer",
  source: string,
  output: string,
): Promise<number> {
  const judged = (await callJudge(
    "Return JSON only as {\"semantic_guard\":N}, where N is 1-5. " +
      "Score 5 only when the review applies its role, does not recommend changing normative force, permission, uncertainty, or meaningful progressive/perfect tense, and does not mistake those forms for readability defects. " +
      "For the technical-writer, also require it to identify the unexplained RPC acronym as the actual readability issue. " +
      "For the fresh design reviewer, also require a valid terminal design-review verdict and findings based only on the supplied design.\n\n" +
      `Role: ${role}\nSource:\n${wrapUntrusted(source)}\n\nReview:\n${wrapUntrusted(output)}`,
  )) as Record<string, unknown>;
  return typeof judged.semantic_guard === "number" ? judged.semantic_guard : 1;
}

testUnslop(
  "technical-writer semantic veto evaluation",
  async () => {
    requireImplementation();
    const technicalWriter = loadAgentInstructionContext("technical-writer", ROOT);
    const source = `The worker must retain request IDs. Users may retry. The cache might reduce load. The worker could still fail. The migration is running now. The worker has retried twice. RPC carries the request.`;
    const workDir = mkdtempSync(join(tmpdir(), "unslop-technical-writer-"));
    try {
      const result = await runAgentTest({
        prompt: `Review this documentation excerpt for readability. The public behavior is documented completely. Do not rewrite it. Report only genuine documentation gaps or writing-prose violations.\n\n${source}`,
        workingDirectory: workDir,
        maxTurns: 6,
        timeout: 240_000,
        testName: "technical-writer semantic veto evaluation",
        model: technicalWriter.model,
        systemPromptAppend: `${technicalWriter.body}\n\n---\n\n${instructionContext([
          "skills/reviewing-code/SKILL.md",
          "skills/conventional-comments/SKILL.md",
          "skills/reviewing-documentation/SKILL.md",
          ...PROSE_FILES,
        ])}`,
        disallowedTools: ["Read", "Grep", "Glob", "Bash", "Write", "Edit", "Task", "Agent"],
      });
      const semanticGuard = result.exitReason === "success"
        ? await semanticReviewScore("technical-writer", source, result.output)
        : 1;
      const passed = result.exitReason === "success" && semanticGuard >= 4;
      addResult("technical-writer semantic veto evaluation", result, passed, {
        semantic_guard: semanticGuard,
      });

      expect(result.exitReason).toBe("success");
      expect(semanticGuard).toBeGreaterThanOrEqual(4);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  },
  360_000,
);

testUnslop(
  "fresh DESIGN reviewer prose evaluation",
  async () => {
    requireImplementation();
    const source = `# Design: request cache

## Current state
The worker has retried failed reads twice. Evidence: src/cache.pseudo:1.

## Desired end state
The worker must retain request IDs. Users may retry. The cache might reduce load, and the worker could still fail. The migration is running now.

## Patterns to follow
Keep the single cache module in src/cache.pseudo:1.

## Decisions made
Use the existing cache because it avoids a second store. Reject a new store because it adds an external dependency. The risk is stale data for one request. Callers of src/cache.pseudo:1 are affected.

## Out of scope
Cross-region storage and authorization changes.

## Edge cases
Empty keys are rejected. Concurrent reads share one result. Store failures return the original read error. The cache has a 100-entry limit.

## Open questions (deferred)
None.

## Rollout
Deploy to one worker, measure duplicate reads, then deploy to all workers. Rollback disables the cache flag.`;
    const workDir = mkdtempSync(join(tmpdir(), "unslop-design-reviewer-"));
    try {
      const designPath = join(workDir, "docs", "plans", "request-cache", "6-design.md");
      mkdirSync(dirname(designPath), { recursive: true });
      writeFileSync(designPath, source);
      mkdirSync(join(workDir, "src"), { recursive: true });
      writeFileSync(join(workDir, "src", "cache.pseudo"), "cache(request) returns one stored result\n", { flag: "w" });
      const result = await runAgentTest({
        prompt: "Review docs/plans/request-cache/6-design.md with fresh context. Return the review report and terminal verdict only.",
        workingDirectory: workDir,
        maxTurns: 8,
        timeout: 300_000,
        testName: "fresh DESIGN reviewer prose evaluation",
        systemPromptAppend: instructionContext([
          "skills/reviewing-designs/SKILL.md",
          "skills/reviewing-designs/references/review-brief.md",
          "skills/technical-design-doc/SKILL.md",
          "skills/reviewing-code/SKILL.md",
          "skills/engineering-standards/SKILL.md",
          "skills/documenting-decisions/SKILL.md",
          "skills/conventional-comments/SKILL.md",
          ...PROSE_FILES,
        ]),
        allowedTools: ["Read", "Grep", "Glob"],
        disallowedTools: ["Bash", "Write", "Edit", "Task", "Agent", "SendMessage"],
      });
      const semanticGuard = result.exitReason === "success"
        ? await semanticReviewScore("fresh-design-reviewer", source, result.output)
        : 1;
      const terminalVerdict = /(?:APPROVE|REQUEST CHANGES|COMMENT)$/.test(result.output.trim());
      const passed = result.exitReason === "success" && terminalVerdict && semanticGuard >= 4;
      addResult("fresh DESIGN reviewer prose evaluation", result, passed, {
        semantic_guard: semanticGuard,
        terminal_verdict: terminalVerdict ? 1 : 0,
      });

      expect(result.exitReason).toBe("success");
      expect(terminalVerdict).toBe(true);
      expect(semanticGuard).toBeGreaterThanOrEqual(4);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  },
  420_000,
);

afterAll(async () => {
  await collector.finalize();
  assertNoBudgetRegressions(collector);
});
