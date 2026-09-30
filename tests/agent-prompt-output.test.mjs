// Guards the user-visible output contract of /agent-prompt: the host renders a reply as markdown,
// so the prompt must arrive inside a fenced `markdown` block to stay raw and copyable.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function outputSection() {
  const source = readFileSync("skills/agent-prompt/SKILL.md", "utf8");
  const match = source.match(/^## Output\n([\s\S]*?)(?=^## )/m);
  assert.ok(match, "skills/agent-prompt/SKILL.md has no ## Output section");
  return match[1].replace(/\s+/g, " ");
}

test("agent-prompt emits the prompt as raw markdown in a fenced markdown block", () => {
  const output = outputSection();

  assert.match(output, /fenced code block tagged `markdown`/, "## Output must fence the printed prompt as `markdown`");
  assert.match(output, /longer than any backtick run/, "## Output must size the fence past the prompt's own backtick runs");
});
