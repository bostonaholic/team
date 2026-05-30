// tests/helpers/llm-judge.test.ts
//
// Tests for the deterministic-first paths and the JSON extractor. No real
// SDK calls — judges-that-call-LLMs aren't exercised here. Run free.

import { afterEach, describe, expect, test } from "bun:test";

import type { GroundTruth } from "./fixtures";
import {
  _setClientForTests,
  extractJson,
  judgeReviewerOutput,
  matchesHint,
  outcomeJudge,
  wrapUntrusted,
} from "./llm-judge";

afterEach(() => _setClientForTests(null));

describe("wrapUntrusted", () => {
  test("wraps content in delimiters", () => {
    const out = wrapUntrusted("malicious content");
    expect(out).toContain("<<<UNTRUSTED_OUTPUT>>>");
    expect(out).toContain("<<<END_UNTRUSTED_OUTPUT>>>");
    expect(out).toContain("malicious content");
  });
});

describe("extractJson", () => {
  test("pulls JSON from the middle of free prose", () => {
    const text = 'Here is my response. {"score": 4, "reason": "ok"} thanks!';
    const parsed = extractJson(text) as Record<string, unknown>;
    expect(parsed.score).toBe(4);
    expect(parsed.reason).toBe("ok");
  });

  test("throws on missing JSON", () => {
    expect(() => extractJson("no json here")).toThrow(/JSON object/);
  });
});

describe("matchesHint", () => {
  // The planted-null-deref fixture's hint: order-independent — the null
  // concept AND a dereference-locus term must both appear, anywhere.
  const hint =
    "(?=[\\s\\S]*(?:null|undefined))" +
    "(?=[\\s\\S]*(?:deref|user|email|cache|render|profile|access|check))";

  test("matches varied real phrasings of the same bug", () => {
    expect(matchesHint("possible null dereference on user.email", hint)).toBe(true);
    expect(matchesHint("the user object could be null here", hint)).toBe(true);
    expect(matchesHint("missing a null check before reading email", hint)).toBe(true);
  });

  test("does not match bare 'null' or unrelated prose", () => {
    expect(matchesHint("this function returns null on success", hint)).toBe(false);
    expect(matchesHint("looks good, no issues found", hint)).toBe(false);
  });

  test("falls back to literal substring when the hint is invalid regex", () => {
    // An unbalanced group is invalid regex; matchesHint must not throw.
    expect(matchesHint("contains a (b literal", "a (b")).toBe(true);
    expect(matchesHint("nope", "a (b")).toBe(false);
  });
});

describe("outcomeJudge", () => {
  const groundTruth: GroundTruth = {
    bugs: [
      { id: "b1", description: "null deref", detection_hint: "null deref" },
      { id: "b2", description: "off by one", detection_hint: "off-by-one" },
    ],
    minimum_detection: 1.0,
  };

  test("counts detected via case-insensitive hint match", () => {
    const out = outcomeJudge(
      groundTruth,
      "I noticed a NULL DEREF on line 12 and an off-by-one in the loop.",
    );
    expect(out.detected).toEqual(["b1", "b2"]);
    expect(out.detection_rate).toBe(1.0);
    expect(out.passes_minimum).toBe(true);
  });

  test("flags partial detection as failing the minimum", () => {
    const out = outcomeJudge(groundTruth, "I noticed a null deref.");
    expect(out.detected).toEqual(["b1"]);
    expect(out.missed).toEqual(["b2"]);
    expect(out.detection_rate).toBe(0.5);
    expect(out.passes_minimum).toBe(false);
  });

  test("empty ground-truth -> detection_rate = 1", () => {
    const out = outcomeJudge(
      { bugs: [], minimum_detection: 1.0 },
      "anything",
    );
    expect(out.detection_rate).toBe(1);
  });
});

describe("judgeReviewerOutput deterministic gate", () => {
  test("returns score 1 without calling LLM if Conventional Comment label is absent", async () => {
    // _setClientForTests not set — would throw if the judge actually called the SDK.
    const out = await judgeReviewerOutput(
      "Just a generic review without any labels.",
    );
    expect(out.has_conventional_comment).toBe(false);
    expect(out.reason_substance).toBe(1);
    expect(out.reasoning).toContain("skipping LLM judge");
  });

  test("calls the LLM only when the structural gate passes", async () => {
    let called = 0;
    _setClientForTests({
      messages: {
        create: async () => {
          called += 1;
          return {
            content: [
              {
                type: "text",
                text: '{"reason_substance": 5, "reasoning": "named line + fix"}',
              },
            ],
          };
        },
      },
    });
    const out = await judgeReviewerOutput(
      "issue (blocking): null deref on line 42; add a null check before the access.",
    );
    expect(called).toBe(1);
    expect(out.has_conventional_comment).toBe(true);
    expect(out.identifies_line).toBe(true);
    expect(out.reason_substance).toBe(5);
  });

  test("clamps out-of-range LLM scores", async () => {
    _setClientForTests({
      messages: {
        create: async () => ({
          content: [
            { type: "text", text: '{"reason_substance": 11, "reasoning": "x"}' },
          ],
        }),
      },
    });
    const out = await judgeReviewerOutput(
      "suggestion (non-blocking): consider line 9.",
    );
    expect(out.reason_substance).toBe(5);
  });
});
