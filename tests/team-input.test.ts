import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { parseTeamInput } from "../skills/team/scripts/parse-input.mjs";

const SCRIPT = join(process.cwd(), "skills", "team", "scripts", "parse-input.mjs");

describe("Team command parser", () => {
  test("preserves start input as data", () => {
    expect(parseTeamInput("  ENG-42 add literal $(touch nope); support  ")).toEqual({
      mode: "start",
      request: "ENG-42 add literal $(touch nope); support",
    });
  });

  test("parses resume and one optional phase", () => {
    expect(parseTeamInput("resume ENG-42-topic-name")).toEqual({
      mode: "resume",
      id: "ENG-42-topic-name",
      only: null,
    });
    expect(parseTeamInput("resume 2026-09-03-topic-name --only implement")).toEqual({
      mode: "resume",
      id: "2026-09-03-topic-name",
      only: "implement",
    });
  });

  test("rejects missing, malformed, and extra resume arguments", () => {
    for (const input of [
      "",
      "resume",
      "resume ../topic",
      "resume ENG-42-topic --only",
      "resume ENG-42-topic --only unknown",
      "resume ENG-42-topic --only plan extra",
      "new feature --only plan",
    ]) {
      expect(() => parseTeamInput(input)).toThrow();
    }
  });

  test("CLI reads untrusted text from stdin and emits structured JSON", () => {
    const input = "build support for `$(touch should-not-run)`; then report";
    const result = spawnSync("node", [SCRIPT], { input, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ mode: "start", request: input });
  });
});
