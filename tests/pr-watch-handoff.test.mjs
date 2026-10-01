// Guards the user-visible hand-off line that pr-watch-as-author prints on approval and in its
// final report. The canonical copy is
// skills/pr-watch-as-author/references/11-7-on-approval-hand-off-never-land.md; the compaction
// stage repeats it, so both copies must keep the same bytes.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const HANDOFF = "Next: run /shipit when you want to land it.";

test("approval stage ends with the /shipit hand-off: skills/pr-watch-as-author/references/11-7-on-approval-hand-off-never-land.md", () => {
  const file = "skills/pr-watch-as-author/references/11-7-on-approval-hand-off-never-land.md";

  assert.ok(existsSync(file), `${file} does not exist`);
  assert.ok(readFileSync(file, "utf8").includes(HANDOFF), `${file} does not contain "${HANDOFF}"`);
});

test("compaction final report keeps the /shipit hand-off: skills/pr-watch-as-author/references/12-compaction-defense.md", () => {
  const file = "skills/pr-watch-as-author/references/12-compaction-defense.md";

  assert.ok(existsSync(file), `${file} does not exist`);
  assert.ok(readFileSync(file, "utf8").includes(HANDOFF), `${file} does not contain "${HANDOFF}"`);
});
