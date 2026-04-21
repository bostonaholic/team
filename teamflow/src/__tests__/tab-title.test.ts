/**
 * Acceptance tests for Teamflow Tab Title Bug Fix.
 *
 * These tests verify that the dashboard displays human-readable titles
 * (from feature.requested data.topic, kebab-to-sentence-case) instead of raw kebab-case slugs,
 * with appropriate fallbacks and truncation.
 *
 * - Structural tests (TT-1, TT-4 through TT-13) use readSource from ./helpers.js
 * - Behavioral tests (TT-2, TT-3, TT-14) use applyEvent from ../state.js
 *
 * Plan: docs/plans/2026-04-05-teamflow-tab-title-bug-plan.md
 * Tests: TT-1 through TT-14
 */

import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { readSource } from "./helpers.js";
import { applyEvent } from "../state.js";
import type { RunState } from "../state.js";

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const TEAMFLOW_ROOT = join(import.meta.dirname, "..", "..");
const PROJECT_ROOT = join(TEAMFLOW_ROOT, "..");

const TYPES_TS = join(TEAMFLOW_ROOT, "src", "types.ts");
const TAB_BAR_SVELTE = join(TEAMFLOW_ROOT, "src", "client", "components", "TabBar.svelte");
const HEADER_SVELTE = join(TEAMFLOW_ROOT, "src", "client", "components", "Header.svelte");
const APP_SVELTE = join(TEAMFLOW_ROOT, "src", "client", "App.svelte");
const STATE_TEST_TS = join(TEAMFLOW_ROOT, "src", "__tests__", "state.test.ts");
const DEMO_MJS = join(TEAMFLOW_ROOT, "bin", "demo.mjs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal event record for applyEvent */
function makeEvent(
  seq: number,
  event: string,
  producer = "orchestrator",
  data: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    seq,
    event,
    producer,
    ts: new Date(Date.now() + seq * 1000).toISOString(),
    data,
  };
}

/**
 * Create a fresh RunState matching the current (pre-implementation) shape.
 * Does NOT include `title` -- the tests verify that the implementation adds it.
 */
function createFreshState(): RunState {
  return {
    phase: null,
    topic: null,
    title: null,
    startedAt: null,
    agents: {},
    gates: {},
    events: [],
    errors: [],
    progress: { step: null, total: null },
    duration: null,
    lastSeq: 0,
  } as RunState;
}

/** Apply a sequence of events to a fresh state, returning the final state */
function applySequence(events: Array<{ event: string; producer?: string; data?: Record<string, unknown> }>): RunState {
  let state = createFreshState();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const record = makeEvent(i + 1, e.event, e.producer ?? "orchestrator", e.data ?? {});
    state = applyEvent(state, record);
  }
  return state;
}

/**
 * Safely extract the title field from RunState.
 * Returns undefined if the field does not exist, so the test fails
 * with an assertion error rather than a runtime crash.
 */
function getTitle(state: RunState): string | null | undefined {
  return (state as unknown as { title?: string | null }).title;
}

// ---------------------------------------------------------------------------
// TT-1: title_field_exists_on_RunState
// Verifies: types.ts declares `title: string | null` on RunState
// Step: 1.1
// ---------------------------------------------------------------------------
describe("TT-1: title_field_exists_on_RunState", () => {
  it("types.ts RunState interface contains title: string | null", () => {
    const source = readSource(TYPES_TS);
    // Should contain a title field declaration within the RunState interface
    expect(source).toMatch(/title\s*:\s*string\s*\|\s*null/);
  });
});

// ---------------------------------------------------------------------------
// TT-2: applyEvent_extracts_title_from_topic
// Verifies: applyEvent with feature.requested converts data.topic from
// kebab-case to sentence case and sets state.title
// Step: 1.1, 1.2
// ---------------------------------------------------------------------------
describe("TT-2: applyEvent_extracts_title_from_topic", () => {
  it("state.title is sentence-cased topic after feature.requested", () => {
    const state = applySequence([
      {
        event: "feature.requested",
        producer: "orchestrator",
        data: {
          topic: "add-sse-reconnection",
          description: "Add SSE reconnection with exponential backoff",
        },
      },
    ]);
    expect(getTitle(state)).toBe("Add sse reconnection");
  });
});

// ---------------------------------------------------------------------------
// TT-3: applyEvent_title_from_topic_when_no_description
// Verifies: applyEvent with feature.requested missing data.description
// derives state.title from data.topic (kebab-to-sentence-case)
// Step: 1.1, 1.3
// ---------------------------------------------------------------------------
describe("TT-3: applyEvent_title_from_topic_when_no_description", () => {
  it("state.title is sentence-cased topic when description is absent", () => {
    const state = applySequence([
      {
        event: "feature.requested",
        producer: "orchestrator",
        data: { topic: "some-topic" },
      },
    ]);
    expect(getTitle(state)).toBe("Some topic");
  });
});

// ---------------------------------------------------------------------------
// TT-4: tab_bar_uses_full_fallback_chain
// Verifies: TabBar.svelte template contains the expression pattern
// state.title ?? state.topic ?? sessionId (full three-level fallback)
// Step: 2.1
// ---------------------------------------------------------------------------
describe("TT-4: tab_bar_uses_full_fallback_chain", () => {
  it("TabBar.svelte template contains state.title ?? state.topic ?? sessionId", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    // The full fallback chain must be visible in the template markup
    expect(svelte).toMatch(/state\.title\s*\?\?\s*state\.topic\s*\?\?\s*sessionId/);
  });

  it("TabBar.svelte still references state.topic (MS-T2 compatibility)", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    expect(svelte).toMatch(/\.topic/);
  });
});

// ---------------------------------------------------------------------------
// TT-5: tab_bar_truncates_long_labels
// Verifies: TabBar.svelte source contains truncation logic (40 char limit)
// Step: 2.1
// ---------------------------------------------------------------------------
describe("TT-5: tab_bar_truncates_long_labels", () => {
  it("TabBar.svelte contains truncation logic with 40 character limit", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    // Should contain a reference to 40 as the truncation threshold
    expect(svelte).toMatch(/40/);
  });

  it("TabBar.svelte contains ellipsis for truncated labels", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    // Should contain a truncation pattern: slice/substring with ellipsis character
    // or a conditional that appends "..." based on length
    expect(svelte).toMatch(/\u2026/);
  });
});

// ---------------------------------------------------------------------------
// TT-6: header_accepts_title_prop
// Verifies: Header.svelte Props interface includes title as optional (title?)
// Step: 2.2
// ---------------------------------------------------------------------------
describe("TT-6: header_accepts_title_prop", () => {
  it("Header.svelte Props interface includes optional title prop", () => {
    const svelte = readSource(HEADER_SVELTE);
    // Should contain title?: string | null or title? in the Props interface
    expect(svelte).toMatch(/title\s*\?\s*:/);
  });
});

// ---------------------------------------------------------------------------
// TT-7: header_renders_title_with_fallback
// Verifies: Header.svelte template uses title ?? topic in the breadcrumb
// Step: 2.2
// ---------------------------------------------------------------------------
describe("TT-7: header_renders_title_with_fallback", () => {
  it("Header.svelte template renders title ?? topic in breadcrumb content", () => {
    const svelte = readSource(HEADER_SVELTE);
    // The breadcrumb span should render {title ?? topic} instead of {topic}
    expect(svelte).toMatch(/\{title\s*\?\?\s*topic\}/);
  });
});

// ---------------------------------------------------------------------------
// TT-8: header_guard_uses_title_fallback
// Verifies: Header.svelte template {#if} guard uses title ?? topic
// (not just topic) so title renders when topic is null
// Step: 2.2
// ---------------------------------------------------------------------------
describe("TT-8: header_guard_uses_title_fallback", () => {
  it("Header.svelte {#if} guard uses title ?? topic", () => {
    const svelte = readSource(HEADER_SVELTE);
    // The guard should be {#if title ?? topic} not just {#if topic}
    expect(svelte).toMatch(/\{#if\s+title\s*\?\?\s*topic\}/);
  });
});

// ---------------------------------------------------------------------------
// TT-9: app_passes_title_to_header
// Verifies: App.svelte <Header> element includes title={activeState.title}
// Step: 2.3
// ---------------------------------------------------------------------------
describe("TT-9: app_passes_title_to_header", () => {
  it("App.svelte passes title prop to Header component", () => {
    const svelte = readSource(APP_SVELTE);
    expect(svelte).toMatch(/title\s*=\s*\{activeState\.title\}/);
  });
});

// ---------------------------------------------------------------------------
// TT-10: demo_session1_has_description_and_kebab_topic
// Verifies: demo.mjs session 1 feature.requested data includes description
// field and topic is a kebab-case slug (contains hyphens, no spaces)
// Step: 3.1
// ---------------------------------------------------------------------------
describe("TT-10: demo_session1_has_description_and_kebab_topic", () => {
  it("demo.mjs session 1 feature.requested has a description field", () => {
    const source = readSource(DEMO_MJS);
    // Find the first feature.requested event in timeline and check for description
    const firstFeatureBlock = source.match(/feature\.requested[\s\S]*?\{[\s\S]*?topic[\s\S]*?\}/);
    expect(firstFeatureBlock).not.toBeNull();
    expect(firstFeatureBlock![0]).toMatch(/description\s*:/);
  });

  it("demo.mjs session 1 topic is a kebab-case slug (hyphens, no spaces)", () => {
    const source = readSource(DEMO_MJS);
    // Extract the first timeline's feature.requested topic value
    // The topic should be a kebab-case slug like "add-sse-reconnection-exponential-backoff"
    const topicMatch = source.match(/const timeline\s*=[\s\S]*?topic\s*:\s*"([^"]+)"/);
    expect(topicMatch).not.toBeNull();
    const topic = topicMatch![1];
    // Kebab-case: lowercase letters and hyphens, no spaces
    expect(topic).not.toMatch(/\s/);
    expect(topic).toMatch(/-/);
  });
});

// ---------------------------------------------------------------------------
// TT-11: demo_session2_has_description_and_kebab_topic
// Verifies: demo.mjs session 2 feature.requested data includes description
// field and topic is a kebab-case slug (contains hyphens, no spaces)
// Step: 3.1
// ---------------------------------------------------------------------------
describe("TT-11: demo_session2_has_description_and_kebab_topic", () => {
  it("demo.mjs session 2 entry event has a description field", () => {
    const source = readSource(DEMO_MJS);
    // Either feature.requested (full pipeline) or bug.reported (team-fix path).
    const timeline2Block = source.match(/const timeline2\s*=[\s\S]*?(?:feature\.requested|bug\.reported)[\s\S]*?\{[\s\S]*?topic[\s\S]*?\}/);
    expect(timeline2Block).not.toBeNull();
    expect(timeline2Block![0]).toMatch(/description\s*:/);
  });

  it("demo.mjs session 2 topic is a kebab-case slug (hyphens, no spaces)", () => {
    const source = readSource(DEMO_MJS);
    // Extract session 2 topic from timeline2
    const timeline2Match = source.match(/const timeline2\s*=[\s\S]*?topic\s*:\s*"([^"]+)"/);
    expect(timeline2Match).not.toBeNull();
    const topic = timeline2Match![1];
    // Kebab-case: no spaces, has hyphens
    expect(topic).not.toMatch(/\s/);
    expect(topic).toMatch(/-/);
  });
});

// ---------------------------------------------------------------------------
// TT-12: empty_state_has_null_title
// Verifies: App.svelte emptyRunState includes title: null
// Step: 1.3
// ---------------------------------------------------------------------------
describe("TT-12: empty_state_has_null_title", () => {
  it("App.svelte emptyRunState includes title: null", () => {
    const svelte = readSource(APP_SVELTE);
    // Find the emptyRunState object and verify it contains title: null
    const emptyStateBlock = svelte.match(/emptyRunState[\s\S]*?\{[\s\S]*?\}/);
    expect(emptyStateBlock).not.toBeNull();
    expect(emptyStateBlock![0]).toMatch(/title\s*:\s*null/);
  });
});

// ---------------------------------------------------------------------------
// TT-13: createFreshState_has_null_title
// Verifies: state.test.ts createFreshState() helper includes title: null
// Step: 1.4
// ---------------------------------------------------------------------------
describe("TT-13: createFreshState_has_null_title", () => {
  it("state.test.ts createFreshState includes title: null", () => {
    const source = readSource(STATE_TEST_TS);
    // Find the createFreshState function and verify it contains title: null
    const freshStateBlock = source.match(/createFreshState[\s\S]*?\{[\s\S]*?\}/);
    expect(freshStateBlock).not.toBeNull();
    expect(freshStateBlock![0]).toMatch(/title\s*:\s*null/);
  });
});

// ---------------------------------------------------------------------------
// TT-14: applyEvent_title_from_topic_ignores_empty_description
// Verifies: applyEvent with feature.requested containing data.description: ""
// (empty string) derives state.title from data.topic (kebab-to-sentence-case)
// Step: 1.1, 1.4
// ---------------------------------------------------------------------------
describe("TT-14: applyEvent_title_from_topic_ignores_empty_description", () => {
  it("state.title is sentence-cased topic when description is empty string", () => {
    const state = applySequence([
      {
        event: "feature.requested",
        producer: "orchestrator",
        data: { topic: "some-topic", description: "" },
      },
    ]);
    expect(getTitle(state)).toBe("Some topic");
  });
});
