// Guards the size contracts shared across runtime files:
// - the researcher self-limit and the RESEARCH assembly count agree on one cap pair;
// - both RESEARCH assembly owners total 5-research.md from that cap;
// - the design author and the execution rules state the same design aim.
// Descriptive sites (docs/, README.md, AGENTS.md, feature.md) are guarded by structural greps.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const RESEARCHER_CAP_OWNERS = [
  "agents/researcher.md",
  "skills/team/playbooks/research.md",
  "skills/team/references/agent-dispatch.md",
  "skills/team-research/SKILL.md",
  "skills/team/references/03-the-phase-loop.md",
];

const RESEARCH_ASSEMBLY_OWNERS = [
  "skills/team-research/SKILL.md",
  "skills/team/references/03-the-phase-loop.md",
];

// Cap and multi-repo partner on one line, each bound to its unit, so the totals formulas cannot satisfy it.
const RESEARCHER_CAP_PAIR = /\b100[- ](?:physical )?lines?\b[^\n]*?\b140(?: in|-line) multi-repo\b/;

for (const file of RESEARCHER_CAP_OWNERS) {
  test(`researcher producers and the RESEARCH assembly agree on a 100-line cap, 140 multi-repo: ${file}`, () => {
    const text = readFileSync(file, "utf8");

    assert.match(text, RESEARCHER_CAP_PAIR, `${file} does not state the researcher cap as 100 lines, 140 multi-repo`);
  });
}

for (const file of RESEARCH_ASSEMBLY_OWNERS) {
  test(`both RESEARCH assembly owners total 5-research.md at 191 lines, 271 multi-repo: ${file}`, () => {
    const text = readFileSync(file, "utf8");

    assert.match(text, /\b80 \+ 100 \+ 11 = 191\b/, `${file} does not total one repo as 80 + 100 + 11 = 191`);
    assert.match(text, /\b120 \+ 140 \+ 11 = 271\b/, `${file} does not total multi-repo as 120 + 140 + 11 = 271`);
  });
}

test("design-author and the execution rules state the same ~300-line design aim", () => {
  const author = readFileSync("agents/design-author.md", "utf8");
  const rules = readFileSync("skills/team/references/execution.md", "utf8");

  assert.match(author, /~300\b/, "agents/design-author.md does not state the ~300-line design aim");
  assert.match(rules, /~300\b/, "skills/team/references/execution.md does not state the ~300-line design budget");
  assert.doesNotMatch(author, /~200\b|\b200[- ]lines?\b/, "agents/design-author.md still states a 200-line design aim");
  assert.doesNotMatch(rules, /~200\b|\b200[- ]lines?\b/, "skills/team/references/execution.md still states a 200-line design budget");
});
