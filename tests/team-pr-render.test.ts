import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { renderBody } from "../skills/team-pr/scripts/render-body.mjs";

const required = {
  summary: ["Adds the requested behavior"],
  changes: ["Updates the runtime"],
  verification: ["bun test"],
  references: ["Design: docs/plans/id/6-design.md", "Plan: docs/plans/id/8-plan.md"],
};

describe("team-pr body renderer", () => {
  test("allows standalone bodies without artifact references", () => {
    const { references: _references, ...standalone } = required;
    const body = renderBody(standalone);
    expect(body).not.toContain("## References");
  });

  test("omits empty sections and puts the creation-time footer last", () => {
    const body = renderBody({ ...required, ticketFooter: "Closes #42" });
    expect(body).not.toContain("## Screenshots");
    expect(body).not.toContain("## Pre-merge");
    expect(body).not.toContain("## Review notes");
    expect(body.trimEnd().endsWith("Closes #42")).toBe(true);
  });

  test("orders conditional sections and companion links", () => {
    const body = renderBody({
      ...required,
      screenshots: ["![Home](https://github.com/user-attachments/assets/id)"],
      preMerge: ["- [ ] Merge https://example.test/first because this PR depends on it"],
      reviewNotes: ["[code-reviewer] Minor naming issue"],
      ticketFooter: "Closes #42",
      companionPrs: ["[api] https://example.test/api"],
    });
    const ordered = [
      "## Screenshots",
      "## How to Verify",
      "## Pre-merge",
      "## Review notes",
      "## References",
      "Closes #42",
      "## Companion PRs",
    ];
    for (let index = 1; index < ordered.length; index += 1) {
      expect(body.indexOf(ordered[index - 1] ?? "")).toBeLessThan(
        body.indexOf(ordered[index] ?? ""),
      );
    }
  });

  test("preserves cross-model blockquotes without bullet wrapping", () => {
    const note = "> **cross-model-notes**\n> Finding one\n> Finding two";
    const body = renderBody({ ...required, reviewNotes: [note] });
    expect(body).toContain(note);
    expect(body).not.toContain("- >");
  });

  test("accepts every canonical ticket footer shape", () => {
    for (const footer of [
      "Closes #42",
      "Closes owner/repo#42",
      "Closes https://github.com/owner/repo/issues/42",
      "Closes ENG-42",
      "Closes Tracker item 42",
      "Part of owner/repo#42",
    ]) {
      expect(renderBody({ ...required, ticketFooter: footer })).toContain(footer);
    }
  });

  test("rejects incomplete input and unsafe footer forms", () => {
    expect(() => renderBody({ ...required, summary: [] })).toThrow("summary must not be empty");
    expect(() => renderBody({ ...required, ticketFooter: "owner/repo#42" })).toThrow(
      "ticketFooter",
    );
    expect(() => renderBody({ ...required, ticketFooter: "Closes ENG-42\nInjected" })).toThrow(
      "ticketFooter",
    );
    expect(() =>
      renderBody({
        ...required,
        ticketFooter: ["Closes #1"] as unknown as string,
      }),
    ).toThrow("ticketFooter must be a string");
  });

  test("rejects every review-note line-ending escape", () => {
    for (const newline of ["\n", "\r\n", "\r"]) {
      expect(() =>
        renderBody({
          ...required,
          reviewNotes: [`> vendor note${newline}Closes #999`],
        }),
      ).toThrow("every line blockquoted");
      expect(() =>
        renderBody({
          ...required,
          reviewNotes: [`ordinary note${newline}## Injected`],
        }),
      ).toThrow("single-line");
    }
  });

  test("rejects multiline entries in every ordinary array field", () => {
    for (const field of [
      "summary",
      "designDecisions",
      "changes",
      "screenshots",
      "verification",
      "preMerge",
      "references",
      "companionPrs",
    ] as const) {
      for (const newline of ["\n", "\r\n", "\r"]) {
        expect(() =>
          renderBody({
            ...required,
            [field]: [`ordinary value${newline}## Injected`],
          }),
        ).toThrow(`${field} must be an array of non-empty strings`);
      }
    }
  });

  test("CLI reads JSON from stdin", () => {
    const script = join(process.cwd(), "skills", "team-pr", "scripts", "render-body.mjs");
    const result = spawnSync("node", [script], {
      input: JSON.stringify(required),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("## Summary");
  });
});
