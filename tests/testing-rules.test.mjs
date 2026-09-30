// Guards the cross-file contracts of the test value bar in skills/team/references/testing.md:
// - the standalone /team-implement dispatch and the code-reviewer agree on the locked-test key;
// - every test-touching workflow keeps an anchored link to testing.md, and each anchor names a
//   testing.md heading, so a heading rename cannot orphan a citation.
// Link paths resolve from the file's directory or, under skills/, its skill root, the same bases
// as skill-path-references.test.mjs. Anchors use GitHub heading slugs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import test from "node:test";

const TESTING_RULES = join("skills", "team", "references", "testing.md");
const LOCK_KEY = "Locked acceptance tests:";

const WORKFLOWS = [
  "skills/code-review/references/code-reviewer.md",
  "agents/code-reviewer.md",
  "skills/team/references/structure-template.md",
  "skills/team/playbooks/structure.md",
  "skills/team/playbooks/plan.md",
  "agents/test-architect.md",
  "skills/team/playbooks/implement.md",
  "skills/team-fix/playbooks/bug-fix.md",
  "skills/prove/references/04-evidence.md",
  "skills/pr-open-comments/references/02-hard-rules.md",
  "skills/team-pr/references/03-pr-body-template.md",
  "skills/team/playbooks/verify.md",
  "skills/shipit/references/02-land-sequence.md",
];

function slug(heading) {
  return heading.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
}

function testingRuleAnchors() {
  return readFileSync(TESTING_RULES, "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^#{1,6}\s+(.+?)\s*$/))
    .filter(Boolean)
    .map(([, heading]) => slug(heading));
}

function anchorsCitedIn(file) {
  const [tree, skill] = normalize(file).split(sep);
  const bases = tree === "skills" ? [dirname(file), join(tree, skill)] : [dirname(file)];
  return [...readFileSync(file, "utf8").matchAll(/\]\(([^)\s]+)\)/g)]
    .map(([, target]) => target.split("#"))
    .filter(([path, fragment]) => fragment && bases.some((base) => normalize(join(base, path)) === TESTING_RULES))
    .map(([, fragment]) => fragment);
}

test("standalone dispatch and code-reviewer name the same locked-test line", () => {
  const dispatcher = readFileSync("skills/team-implement/references/03-execution.md", "utf8");
  const reader = readFileSync("agents/code-reviewer.md", "utf8");

  assert.ok(dispatcher.includes(LOCK_KEY), `skills/team-implement/references/03-execution.md does not send "${LOCK_KEY}"`);
  assert.ok(reader.includes(LOCK_KEY), `agents/code-reviewer.md does not read "${LOCK_KEY}"`);
});

for (const file of WORKFLOWS) {
  test(`each test-touching workflow cites testing-rule sections that exist: ${file}`, () => {
    const cited = anchorsCitedIn(file);
    const headings = testingRuleAnchors();

    assert.ok(cited.length > 0, `${file} has no anchored link to ${TESTING_RULES}`);
    assert.deepEqual(
      cited.filter((anchor) => !headings.includes(anchor)),
      [],
      `${file} cites anchors with no matching heading in ${TESTING_RULES}`,
    );
  });
}
