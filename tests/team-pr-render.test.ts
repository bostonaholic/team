import { describe, expect, test } from "bun:test";

import { renderBody } from "../skills/team-pr/scripts/render-body.mjs";

const required = {
  summary: ["Adds the requested behavior"],
  changes: ["Updates the runtime"],
  verification: ["bun test"],
  references: ["Design: docs/plans/id/6-design.md", "Plan: docs/plans/id/8-plan.md"],
};

const ticketFooters = [
  "Closes #42",
  "Closes owner/repo#42",
  "Closes https://github.com/owner/repo/issues/42",
  "Closes ENG-1234",
  "Part of owner/repo#42",
];

describe("team-pr body renderer", () => {
  test("omits empty conditional sections and puts the closing footer last", () => {
    const body = renderBody({ ...required, ticketFooter: "Closes #42" });
    expect(body).not.toContain("## Screenshots");
    expect(body).not.toContain("## Pre-merge");
    expect(body).not.toContain("## Review notes");
    expect(body.trimEnd().endsWith("Closes #42")).toBe(true);
  });

  test("orders conditional sections and appends companion PRs after creation-time footer", () => {
    const body = renderBody({
      ...required,
      screenshots: ["![Home](https://github.com/user-attachments/assets/id)"],
      preMerge: ["- [ ] Merge https://example.test/first because this PR depends on it"],
      reviewNotes: ["[code-reviewer] Minor naming issue"],
      ticketFooter: "Closes #42",
      companionPrs: ["[api] https://example.test/api"],
    });
    const headings = [
      "## Screenshots",
      "## How to Verify",
      "## Pre-merge",
      "## Review notes",
      "## References",
      "Closes #42",
      "## Companion PRs",
    ];
    for (let index = 1; index < headings.length; index += 1) {
      expect(body.indexOf(headings[index - 1] ?? "")).toBeLessThan(
        body.indexOf(headings[index] ?? ""),
      );
    }
  });

  test.each(ticketFooters)("accepts canonical ticket footer: %s", (ticketFooter) => {
    expect(renderBody({ ...required, ticketFooter }).trimEnd().endsWith(ticketFooter)).toBe(true);
  });

  test("renders standalone bodies without artifact references", () => {
    const { references: _references, ...standalone } = required;
    const body = renderBody(standalone);

    expect(body).not.toContain("## References");
  });

  test("preserves blockquoted cross-model notes without list wrapping", () => {
    const crossModelNotes = "> **Design round 1**\n>\n> Verified external finding";
    const body = renderBody({
      ...required,
      reviewNotes: ["[code-reviewer] Minor naming issue", crossModelNotes],
    });

    expect(body).toContain(`- [code-reviewer] Minor naming issue\n${crossModelNotes}`);
    expect(body).not.toContain("- > **Design round 1**");
  });

  test("rejects review notes that escape their declared Markdown form", () => {
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

  test("rejects incomplete input and multiline footer forms", () => {
    expect(() => renderBody({ ...required, summary: [] })).toThrow("summary must not be empty");
    expect(() =>
      renderBody({
        ...required,
        ticketFooter: ["Closes #1"] as unknown as string,
      }),
    ).toThrow("ticketFooter must be a string");
    expect(() => renderBody({ ...required, ticketFooter: "Closes #1\n## Injected" })).toThrow(
      "ticketFooter",
    );
  });
});
